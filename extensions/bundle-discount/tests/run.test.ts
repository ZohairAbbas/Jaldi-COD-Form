import {describe, test, expect} from 'vitest';
import {cartLinesDiscountsGenerateRun} from '../src/cart_lines_discounts_generate_run';
import type {CartInput} from '../generated/api';

const PRODUCT = 'gid://shopify/Product/1';

// Build a ProductVariant cart line.
function line(
  id: string,
  unit: number,
  quantity: number,
  productId = PRODUCT,
  variantId = 'gid://shopify/ProductVariant/1',
) {
  return {
    id,
    quantity,
    cost: {amountPerQuantity: {amount: String(unit)}},
    merchandise: {
      __typename: 'ProductVariant' as const,
      id: variantId,
      product: {id: productId},
    },
  };
}

function input(
  lines: ReturnType<typeof line>[],
  config: unknown,
  discountClasses: string[] = ['PRODUCT'],
): CartInput {
  return {
    cart: {lines},
    discount: {
      discountClasses: discountClasses as any,
      metafield: config ? {jsonValue: config} : null,
    },
  } as unknown as CartInput;
}

const bundle = (tiers: any[], extra: Record<string, unknown> = {}) => ({
  bundles: [{applyOn: 'all', tiers, ...extra}],
});

describe('cartLinesDiscountsGenerateRun', () => {
  test('no lines → no operations', () => {
    expect(cartLinesDiscountsGenerateRun(input([], bundle([])))).toEqual({
      operations: [],
    });
  });

  test('no PRODUCT discount class → no operations', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 3)], bundle([{quantity: 3, discountType: 'percentage', discountValue: 30}]), ['ORDER']),
    );
    expect(res).toEqual({operations: []});
  });

  test('missing config → no operations', () => {
    expect(
      cartLinesDiscountsGenerateRun(input([line('l1', 100, 3)], null)),
    ).toEqual({operations: []});
  });

  test('quantity does not match any tier → no operations', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 2)], bundle([{quantity: 3, discountType: 'percentage', discountValue: 30}])),
    );
    expect(res).toEqual({operations: []});
  });

  test('percentage: 30% off 3 units @100 → 90 off single line', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 3)], bundle([{quantity: 3, discountType: 'percentage', discountValue: 30}])),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c).toHaveLength(1);
    expect(c[0].value).toEqual({fixedAmount: {amount: '90.00'}});
    expect(c[0].targets).toEqual([{cartLine: {id: 'l1'}}]);
  });

  test('flat: -50 off the bundle', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 3)], bundle([{quantity: 3, discountType: 'flat', discountValue: 50}])),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c[0].value).toEqual({fixedAmount: {amount: '50.00'}});
  });

  test('specific: 3-pack for 250 total → 50 off (full 300)', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 3)], bundle([{quantity: 3, discountType: 'specific', discountValue: 250}])),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c[0].value).toEqual({fixedAmount: {amount: '50.00'}});
  });

  test('bogo: buy 2 get 1 free (qty 3 @100) → pay for 2, 100 off', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('l1', 100, 3)],
        bundle([{quantity: 3, discountType: 'bogo', bogoBuyX: 2}]),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c[0].value).toEqual({fixedAmount: {amount: '100.00'}});
  });

  test('none → no discount', () => {
    const res = cartLinesDiscountsGenerateRun(
      input([line('l1', 100, 3)], bundle([{quantity: 3, discountType: 'none'}])),
    );
    expect(res).toEqual({operations: []});
  });

  test('variant-mix: 2 blue + 1 black, 30% off → split 60/30 across two lines', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [
          line('blue', 100, 2, PRODUCT, 'gid://shopify/ProductVariant/blue'),
          line('black', 100, 1, PRODUCT, 'gid://shopify/ProductVariant/black'),
        ],
        bundle([{quantity: 3, discountType: 'percentage', discountValue: 30}]),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c).toHaveLength(2);
    // total discount = 30% of 300 = 90; split proportional to line full price 2:1
    const byId = Object.fromEntries(
      c.map((cand) => [cand.targets[0].cartLine.id, cand.value.fixedAmount!.amount]),
    );
    expect(byId).toEqual({blue: '60.00', black: '30.00'});
  });

  test('variant-mix: last line absorbs rounding remainder (shares sum exactly)', () => {
    // 3 units, specific price 100 total → 200 off; odd split forces rounding.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [
          line('a', 100, 1, PRODUCT, 'gid://shopify/ProductVariant/a'),
          line('b', 100, 1, PRODUCT, 'gid://shopify/ProductVariant/b'),
          line('c', 100, 1, PRODUCT, 'gid://shopify/ProductVariant/c'),
        ],
        bundle([{quantity: 3, discountType: 'specific', discountValue: 100}]),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    const sum = c.reduce(
      (s, cand) => s + Number(cand.value.fixedAmount!.amount),
      0,
    );
    expect(sum).toBeCloseTo(200, 2);
  });

  test("applyOn specific: only matching product is discounted", () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [
          line('match', 100, 3, 'gid://shopify/Product/1'),
          line('other', 100, 3, 'gid://shopify/Product/999'),
        ],
        {
          bundles: [
            {
              applyOn: 'specific',
              productIds: ['gid://shopify/Product/1'],
              tiers: [{quantity: 3, discountType: 'percentage', discountValue: 30}],
            },
          ],
        },
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(c).toHaveLength(1);
    expect(c[0].targets[0].cartLine.id).toBe('match');
  });
});
