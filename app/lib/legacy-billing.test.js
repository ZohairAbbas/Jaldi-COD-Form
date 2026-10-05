import { describe, test, expect } from "vitest";
import { addMonth, isLegacyUsageSubscription, nextLegacyCharge } from "./legacy-billing";

/**
 * A Mantle-created subscription as Shopify returns it: one usage line capped
 * at $14.99, the plan fee posted monthly as a usage record. Shaped after the
 * real new-store-ksa / zainvault subscriptions.
 */
function mantleSubscription({
  name = "Basic",
  amount = "4.99",
  lastPeriod = ["2026-09-21", "2026-10-21"],
  balanceUsed = "0.0",
  cappedAmount = "14.99",
  status = "ACTIVE",
  test = false,
  extraRecords = [],
} = {}) {
  return {
    id: "gid://shopify/AppSubscription/120760762698",
    name,
    status,
    test,
    lineItems: [
      {
        id: "gid://shopify/AppSubscriptionLineItem/120760762698?v=1&index=0",
        plan: {
          pricingDetails: {
            __typename: "AppUsagePricing",
            balanceUsed: { amount: balanceUsed, currencyCode: "USD" },
            cappedAmount: { amount: cappedAmount, currencyCode: "USD" },
          },
        },
        usageRecords: {
          nodes: [
            ...extraRecords,
            {
              createdAt: `${lastPeriod[0]}T11:21:29Z`,
              description: `Subscription charge for period ${lastPeriod[0]} to ${lastPeriod[1]}`,
              price: { amount, currencyCode: "USD" },
            },
          ],
        },
      },
    ],
  };
}

const at = (iso) => new Date(iso);

describe("addMonth", () => {
  test("keeps the day of month", () => {
    expect(addMonth("2026-09-10")).toBe("2026-10-10");
    expect(addMonth("2026-12-24")).toBe("2027-01-24");
  });

  test("clamps to the end of a shorter month", () => {
    expect(addMonth("2026-01-31")).toBe("2026-02-28");
    expect(addMonth("2028-01-31")).toBe("2028-02-29");
  });
});

describe("isLegacyUsageSubscription", () => {
  test("matches a usage-only subscription", () => {
    expect(isLegacyUsageSubscription(mantleSubscription())).toBe(true);
  });

  test("ignores test subscriptions", () => {
    expect(isLegacyUsageSubscription(mantleSubscription({ test: true }))).toBe(false);
  });

  test("ignores a subscription with a recurring line (moved to App Pricing)", () => {
    const sub = mantleSubscription();
    sub.lineItems.push({ id: "x", plan: { pricingDetails: { __typename: "AppRecurringPricing" } } });
    expect(isLegacyUsageSubscription(sub)).toBe(false);
  });
});

describe("nextLegacyCharge", () => {
  test("not due while the charged period is still running", () => {
    const charge = nextLegacyCharge(mantleSubscription(), at("2026-10-20T23:00:00Z"));
    expect(charge).toEqual({ due: false, reason: "current period runs to 2026-10-21" });
  });

  test("charges the next period once the last one has ended", () => {
    const charge = nextLegacyCharge(mantleSubscription(), at("2026-10-21T12:00:00Z"));
    expect(charge).toMatchObject({
      due: true,
      lineItemId: "gid://shopify/AppSubscriptionLineItem/120760762698?v=1&index=0",
      amount: "4.99",
      currencyCode: "USD",
      description: "Subscription charge for period 2026-10-21 to 2026-11-21",
      idempotencyKey: "preventify-legacy-120760762698-2026-10-21",
      skippedPeriods: 0,
    });
  });

  test("charges what the merchant last paid, not the plan table", () => {
    const sub = mantleSubscription({ name: "Pro", amount: "14.99" });
    expect(nextLegacyCharge(sub, at("2026-10-22T00:00:00Z")).amount).toBe("14.99");
  });

  test("waits while Shopify's current cycle already holds a charge", () => {
    // Mantle's calendar month ended before Shopify's 30-day cycle rolled over.
    const sub = mantleSubscription({ balanceUsed: "4.99" });
    const charge = nextLegacyCharge(sub, at("2026-10-21T06:00:00Z"));
    expect(charge.due).toBe(false);
    expect(charge.reason).toMatch(/already billed/);
  });

  test("continues from the newest period record, ignoring other usage records", () => {
    const sub = mantleSubscription({
      lastPeriod: ["2026-08-21", "2026-09-21"],
      extraRecords: [
        { createdAt: "2026-09-21T11:21:29Z", description: "Subscription charge for period 2026-09-21 to 2026-10-21", price: { amount: "4.99", currencyCode: "USD" } },
        { createdAt: "2026-09-25T00:00:00Z", description: "Something else", price: { amount: "1.00", currencyCode: "USD" } },
      ],
    });
    expect(nextLegacyCharge(sub, at("2026-10-21T12:00:00Z")).description).toBe(
      "Subscription charge for period 2026-10-21 to 2026-11-21"
    );
  });

  test("charges only the current period after missed ones, never back-bills", () => {
    const charge = nextLegacyCharge(mantleSubscription(), at("2027-01-05T00:00:00Z"));
    expect(charge).toMatchObject({
      due: true,
      periodStart: "2026-12-21",
      periodEnd: "2027-01-21",
      skippedPeriods: 2,
    });
  });

  test("skips subscriptions it can't continue", () => {
    const noHistory = mantleSubscription();
    noHistory.lineItems[0].usageRecords.nodes = [];
    expect(nextLegacyCharge(noHistory, at("2026-10-22T00:00:00Z")).due).toBe(false);

    expect(nextLegacyCharge(mantleSubscription({ status: "FROZEN" }), at("2026-10-22T00:00:00Z")).due).toBe(false);
  });

  test("refuses a charge above the capped amount", () => {
    const sub = mantleSubscription({ amount: "19.99" });
    expect(nextLegacyCharge(sub, at("2026-10-22T00:00:00Z")).reason).toMatch(/exceeds capped amount/);
  });
});
