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

const A = 'gid://shopify/Product/A';
const B = 'gid://shopify/Product/B';
const C = 'gid://shopify/Product/C';

/** Config for a combo of two products, one unit each unless overridden. */
const combo = (
  items: {productId: string; quantity: number}[],
  discountType: string,
  discountValue: number,
  extra: Record<string, unknown> = {},
) => ({combos: [{id: 'c1', name: 'Combo', items, discountType, discountValue, ...extra}]});

const amountsById = (candidates: any[]) =>
  Object.fromEntries(
    candidates.map((c) => [c.targets[0].cartLine.id, c.value.fixedAmount.amount]),
  );

const totalOf = (candidates: any[]) =>
  candidates.reduce((s, c) => s + Number(c.value.fixedAmount.amount), 0);

describe('combo offers', () => {
  const pair = [
    {productId: A, quantity: 1},
    {productId: B, quantity: 1},
  ];

  test('both products present → percentage off each line', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'percentage', 10),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(amountsById(c)).toEqual({a: '10.00', b: '5.00'});
  });

  test('a missing component means NO discount at all', () => {
    // A partial combo must never be discounted, or "two products at 10% off"
    // silently becomes one product at 10% off.
    const res = cartLinesDiscountsGenerateRun(
      input([line('a', 100, 1, A)], combo(pair, 'percentage', 10)),
    );
    expect(res).toEqual({operations: []});
  });

  test('component short of its required quantity → no discount', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo([{productId: A, quantity: 2}, {productId: B, quantity: 1}], 'percentage', 10),
      ),
    );
    expect(res).toEqual({operations: []});
  });

  test('per-unit flat scales with the component quantity', () => {
    // 2xA + 1xB at 10 off each unit = 20 off A, 10 off B.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 2, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo([{productId: A, quantity: 2}, {productId: B, quantity: 1}], 'perUnitFlat', 10),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(amountsById(c)).toEqual({a: '20.00', b: '10.00'});
  });

  test('flat off the bundle splits across components and sums exactly', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'flat', 30),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(totalOf(c)).toBeCloseTo(30, 2);
    expect(amountsById(c)).toEqual({a: '20.00', b: '10.00'});
  });

  test('a flat discount never pushes a cheap component below zero', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 10, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 990, 1, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'flat', 100),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(totalOf(c)).toBeCloseTo(100, 2);
    expect(Number(amountsById(c).a)).toBeLessThanOrEqual(10);
  });

  test('several complete sets are all discounted', () => {
    // 2xA + 2xB with a 1+1 combo = two sets.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 2, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 2, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'percentage', 10),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(amountsById(c)).toEqual({a: '20.00', b: '10.00'});
    // Both units of each line are claimed by the two sets.
    expect(c.find((x: any) => x.targets[0].cartLine.id === 'a').targets[0].cartLine.quantity).toBe(2);
  });

  test('incomplete extra units are left alone', () => {
    // 3xA + 1xB with a 1+1 combo = one set; 2 A stay at full price.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 3, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'percentage', 10),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    // 10% of ONE A (100) + one B (50), not of all three A.
    expect(totalOf(c)).toBeCloseTo(15, 2);
    expect(c.find((x: any) => x.targets[0].cartLine.id === 'a').targets[0].cartLine.quantity).toBe(1);
  });

  test('a component spanning two variant lines is split across them', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [
          line('a1', 100, 1, A, 'gid://shopify/ProductVariant/a1'),
          line('a2', 100, 1, A, 'gid://shopify/ProductVariant/a2'),
          line('b', 50, 2, B, 'gid://shopify/ProductVariant/b'),
        ],
        combo(pair, 'percentage', 10),
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(amountsById(c)).toEqual({a1: '10.00', a2: '10.00', b: '10.00'});
  });

  test('a three-product combo needs all three', () => {
    const trio = [
      {productId: A, quantity: 1},
      {productId: B, quantity: 1},
      {productId: C, quantity: 1},
    ];
    const lines = [
      line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'),
      line('b', 50, 1, B, 'gid://shopify/ProductVariant/b'),
    ];
    expect(cartLinesDiscountsGenerateRun(input(lines, combo(trio, 'percentage', 10)))).toEqual({
      operations: [],
    });

    const withC = [...lines, line('c', 50, 1, C, 'gid://shopify/ProductVariant/c')];
    const res = cartLinesDiscountsGenerateRun(input(withC, combo(trio, 'percentage', 10)));
    expect(totalOf(res.operations[0].productDiscountsAdd!.candidates)).toBeCloseTo(20, 2);
  });

  test('discountType none is ignored', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        combo(pair, 'none', 0),
      ),
    );
    expect(res).toEqual({operations: []});
  });

  test('a combos-only config still runs (no quantity bundles configured)', () => {
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        {combos: combo(pair, 'percentage', 10).combos},
      ),
    );
    expect(res.operations).toHaveLength(1);
  });
});

describe('combo vs quantity-break precedence', () => {
  const pair = [
    {productId: A, quantity: 1},
    {productId: B, quantity: 1},
  ];

  test('units sold in a combo are not also discounted by a tier', () => {
    // 1xA + 1xB. Without the combo pass the 1-unit tier would fire on A too.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 1, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        {
          combos: combo(pair, 'percentage', 10).combos,
          bundles: [
            {
              applyOn: 'specific',
              productIds: [A],
              tiers: [{quantity: 1, discountType: 'percentage', discountValue: 50}],
            },
          ],
        },
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    // Only the combo's 10% — never the tier's 50% on the same unit.
    expect(totalOf(c)).toBeCloseTo(15, 2);
  });

  test('leftover units still qualify for a quantity break', () => {
    // 4xA + 1xB: the combo claims 1 A, leaving 3 A for the 3-unit tier.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 4, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        {
          combos: combo(pair, 'percentage', 10).combos,
          bundles: [
            {
              applyOn: 'specific',
              productIds: [A],
              tiers: [{quantity: 3, discountType: 'percentage', discountValue: 30}],
            },
          ],
        },
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    // Combo: 10% of (100 + 50) = 15. Tier: 30% of 3x100 = 90. Total 105.
    expect(totalOf(c)).toBeCloseTo(105, 2);

    // The tier candidate targets only the 3 unclaimed units.
    const tierCandidate = c.find((x: any) => x.value.fixedAmount.amount === '90.00');
    expect(tierCandidate.targets[0].cartLine.quantity).toBe(3);
  });

  test('a tier that no longer matches after the combo takes its units does not fire', () => {
    // 4xA + 1xB, tier needs exactly 4. The combo claims one, so 3 remain.
    const res = cartLinesDiscountsGenerateRun(
      input(
        [line('a', 100, 4, A, 'gid://shopify/ProductVariant/a'), line('b', 50, 1, B, 'gid://shopify/ProductVariant/b')],
        {
          combos: combo(pair, 'percentage', 10).combos,
          bundles: [
            {
              applyOn: 'specific',
              productIds: [A],
              tiers: [{quantity: 4, discountType: 'percentage', discountValue: 30}],
            },
          ],
        },
      ),
    );
    const c = res.operations[0].productDiscountsAdd!.candidates;
    expect(totalOf(c)).toBeCloseTo(15, 2);
  });
});
