import { describe, test, expect, vi } from "vitest";

// The real modules reach Postgres and Shopify. What is under test is the mapping.
vi.mock("../db.server.js", () => ({ default: {} }));
vi.mock("../shopify.server.js", () => ({ unauthenticated: {} }));

const { resolveSubscriptionRecord, planSelectionUrl } = await import("./billing.server");
const { planNameFromHandle, planNameFromSubscriptionName, getEffectivePlanName } = await import(
  "./plan-limits"
);

const subscription = (overrides = {}) => ({
  id: "gid://shopify/AppSubscription/1",
  name: "Basic",
  status: "ACTIVE",
  test: false,
  createdAt: "2026-09-21T11:21:09Z",
  currentPeriodEnd: "2026-10-21T11:21:24Z",
  trialDays: 0,
  ...overrides,
});

const resolve = (args) =>
  resolveSubscriptionRecord({ partner: null, planHandle: null, existing: null, acceptTest: false, ...args });

describe("plan name mapping", () => {
  test("handles", () => {
    expect(planNameFromHandle("basic")).toBe("Basic");
    expect(planNameFromHandle(" PRO ")).toBe("Pro");
    expect(planNameFromHandle("enterprise")).toBeNull();
  });

  test("subscription names", () => {
    expect(planNameFromSubscriptionName("Basic")).toBe("Basic");
    expect(planNameFromSubscriptionName("Preventify Pro")).toBe("Pro");
    expect(planNameFromSubscriptionName("Probation")).toBeNull();
  });

  test("inactive statuses fall back to Free, including Mantle's 'canceled'", () => {
    expect(getEffectivePlanName({ status: "canceled", planName: "Basic" })).toBe("Free");
    expect(getEffectivePlanName({ status: "frozen", planName: "Pro" })).toBe("Free");
    expect(getEffectivePlanName({ status: "active", planName: "Pro" })).toBe("Pro");
  });
});

describe("resolveSubscriptionRecord", () => {
  test("no subscription is Free", () => {
    expect(resolve({ subscriptions: [] })).toMatchObject({
      planName: "Free",
      status: "none",
      shopifySubscriptionId: null,
    });
  });

  test("a legacy Mantle subscription resolves by name", () => {
    expect(resolve({ subscriptions: [subscription()] })).toMatchObject({
      planName: "Basic",
      status: "active",
      shopifySubscriptionId: "gid://shopify/AppSubscription/1",
      currentPeriodEnd: new Date("2026-10-21T11:21:24Z"),
      cancelAtPeriodEnd: false,
    });
  });

  test("the Partner API handle wins over the redirect parameter and the name", () => {
    const record = resolve({
      subscriptions: [subscription({ name: "Basic" })],
      planHandle: "basic",
      partner: {
        items: [{ handle: "pro" }],
        cancelAtEndOfCycle: true,
        currentBillingCycle: { endTime: "2026-11-01T00:00:00Z" },
      },
    });
    expect(record).toMatchObject({
      planName: "Pro",
      planHandle: "pro",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    });
  });

  test("the redirect's plan_handle is used when the name is unknown", () => {
    const record = resolve({ subscriptions: [subscription({ name: "Growth" })], planHandle: "pro" });
    expect(record.planName).toBe("Pro");
  });

  test("an unrecognised plan keeps the previous one instead of dropping to Free", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const record = resolve({
      subscriptions: [subscription({ name: "Renamed Plan" })],
      existing: { planName: "Pro" },
    });
    expect(record.planName).toBe("Pro");
    error.mockRestore();
  });

  test("test subscriptions don't count unless accepted", () => {
    const subscriptions = [subscription({ test: true })];
    expect(resolve({ subscriptions }).planName).toBe("Free");
    expect(resolve({ subscriptions, acceptTest: true }).planName).toBe("Basic");
  });
});

describe("planSelectionUrl", () => {
  test("builds the hosted plan page from the store and app handles", () => {
    expect(planSelectionUrl("zainvault.myshopify.com")).toMatch(
      /^https:\/\/admin\.shopify\.com\/store\/zainvault\/charges\/[^/]+\/pricing_plans$/
    );
  });
});
