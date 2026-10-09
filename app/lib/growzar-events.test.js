import { describe, expect, test, vi } from "vitest";

vi.mock("../db.server", () => ({ default: {} }));
const { cleanSid, recordFraudEvent, recordOfferStat, upsellOfferType } = await import("./growzar-events.server");

describe("growzar events", () => {
  test("only a random-looking sid is kept", () => {
    expect(cleanSid("a1b2c3d4e5f6a7b8")).toBe("a1b2c3d4e5f6a7b8");
    expect(cleanSid("short")).toBeNull();
    expect(cleanSid("+923001234567")).toBeNull();
    expect(cleanSid(null)).toBeNull();
  });

  test("upsell types map to the order-line offer types", () => {
    expect(upsellOfferType("one-tick")).toBe("one_tick");
    expect(upsellOfferType("pre-purchase")).toBe("upsell");
    expect(upsellOfferType("post-purchase")).toBe("upsell");
  });

  test("an unverified proxy call writes no offer event", async () => {
    const db = { shop: { findUnique: vi.fn() }, offerEvent: { create: vi.fn() } };
    await recordOfferStat({ auth: { verified: false, shopDomain: "a.myshopify.com" }, offer: { id: "o", shopId: "s" }, offerType: "bundle", stat: "impressions", sid: "a1b2c3d4e5" }, { db });
    expect(db.offerEvent.create).not.toHaveBeenCalled();
  });

  test("never throws, whatever the database does", async () => {
    const db = { shop: { findUnique: vi.fn(async () => { throw new Error("down"); }) }, fraudEvent: { create: vi.fn(async () => { throw new Error("down"); }) }, offerEvent: { create: vi.fn() } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordFraudEvent({ shopId: "s", kind: "blocked" }, { db })).resolves.toBeUndefined();
    await expect(recordOfferStat({ auth: { verified: true, shopDomain: "a.myshopify.com" }, offer: { id: "o", shopId: "s" }, offerType: "bundle", stat: "impressions" }, { db })).resolves.toBeUndefined();
  });
});
