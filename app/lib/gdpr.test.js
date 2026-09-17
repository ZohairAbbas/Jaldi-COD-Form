import { describe, test, expect, vi, beforeEach } from "vitest";

const db = {
  shop: { findUnique: vi.fn() },
  order: { deleteMany: vi.fn(), findMany: vi.fn() },
  orderSession: { deleteMany: vi.fn(), findMany: vi.fn() },
  abandonedCart: { deleteMany: vi.fn(), findMany: vi.fn() },
  customerProfile: { deleteMany: vi.fn(), findMany: vi.fn() },
  blockedUser: { deleteMany: vi.fn(), findMany: vi.fn() },
  globalBuyer: { findUnique: vi.fn(), delete: vi.fn() },
  shopBuyerProfile: { deleteMany: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  deviceFingerprint: { deleteMany: vi.fn() },
};

vi.mock("../db.server.js", () => ({ default: db }));

const { redactCustomer, redactShop } = await import("./gdpr.server");

const SHOP = "store-a.myshopify.com";
const PHONE = "+923001234567";
const EMAIL = "buyer@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  db.shop.findUnique.mockResolvedValue({ id: "shop_a" });
  for (const model of [
    db.order,
    db.orderSession,
    db.abandonedCart,
    db.customerProfile,
    db.blockedUser,
    db.shopBuyerProfile,
    db.deviceFingerprint,
  ]) {
    model.deleteMany?.mockResolvedValue({ count: 0 });
    model.findMany?.mockResolvedValue([]);
  }
  db.globalBuyer.findUnique.mockResolvedValue(null);
  db.shopBuyerProfile.count.mockResolvedValue(0);
});

describe("redactCustomer — guards", () => {
  // Without this the match below is an empty OR, which matches every row in
  // the shop. A malformed payload must not wipe a merchant's data.
  test("refuses to act with no identifiers at all", async () => {
    const result = await redactCustomer({ shopDomain: SHOP });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no_identifiers");
    expect(db.order.deleteMany).not.toHaveBeenCalled();
  });

  test("an unknown shop is a no-op", async () => {
    db.shop.findUnique.mockResolvedValue(null);
    const result = await redactCustomer({ shopDomain: SHOP, phone: PHONE });
    expect(result.skipped).toBe(true);
    expect(db.order.deleteMany).not.toHaveBeenCalled();
  });

  test("order ids alone are enough to act", async () => {
    const result = await redactCustomer({ shopDomain: SHOP, orderIds: [123] });
    expect(result.skipped).toBe(false);
    expect(db.order.deleteMany).toHaveBeenCalled();
  });
});

describe("redactCustomer — scoping", () => {
  test("every deletion is scoped to the requesting shop", async () => {
    await redactCustomer({ shopDomain: SHOP, phone: PHONE, email: EMAIL });

    for (const model of [
      db.order,
      db.orderSession,
      db.abandonedCart,
      db.customerProfile,
      db.blockedUser,
    ]) {
      expect(model.deleteMany).toHaveBeenCalled();
      expect(model.deleteMany.mock.calls[0][0].where.shopId).toBe("shop_a");
    }
  });

  test("order ids are matched as strings", async () => {
    await redactCustomer({ shopDomain: SHOP, orderIds: [123, "456"] });
    const where = db.order.deleteMany.mock.calls[0][0].where;
    const idClause = where.OR.find((c) => c.shopifyOrderId);
    expect(idClause.shopifyOrderId.in).toEqual(["123", "456"]);
  });
});

describe("redactCustomer — the network record", () => {
  const buyerFound = () => {
    db.globalBuyer.findUnique.mockResolvedValue({ id: "buyer_1" });
  };

  // The case that matters: one shop redacting must not erase a buyer from the
  // network when other shops still know them.
  test("a buyer with other shop links keeps their record", async () => {
    buyerFound();
    db.shopBuyerProfile.count.mockResolvedValue(2);

    const result = await redactCustomer({ shopDomain: SHOP, phone: PHONE });

    expect(result.globalBuyerDeleted).toBe(false);
    expect(result.remainingShopLinks).toBe(2);
    expect(db.globalBuyer.delete).not.toHaveBeenCalled();
    expect(db.deviceFingerprint.deleteMany).not.toHaveBeenCalled();
  });

  test("only the requesting shop's link is removed", async () => {
    buyerFound();
    db.shopBuyerProfile.count.mockResolvedValue(1);

    await redactCustomer({ shopDomain: SHOP, phone: PHONE });

    expect(db.shopBuyerProfile.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_a", buyerId: "buyer_1" },
    });
  });

  test("a buyer with no remaining links is deleted along with their devices", async () => {
    buyerFound();
    db.shopBuyerProfile.count.mockResolvedValue(0);

    const result = await redactCustomer({ shopDomain: SHOP, phone: PHONE });

    expect(result.globalBuyerDeleted).toBe(true);
    expect(db.globalBuyer.delete).toHaveBeenCalledWith({ where: { id: "buyer_1" } });
    expect(db.deviceFingerprint.deleteMany).toHaveBeenCalledWith({
      where: { phone: PHONE },
    });
  });

  test("the phone is normalised before the network lookup", async () => {
    buyerFound();
    await redactCustomer({ shopDomain: SHOP, phone: "+92 300 123 4567" });
    expect(db.globalBuyer.findUnique).toHaveBeenCalledWith({
      where: { phone: PHONE },
      select: { id: true },
    });
  });

  test("an email-only request does not touch the network record", async () => {
    await redactCustomer({ shopDomain: SHOP, email: EMAIL });
    expect(db.globalBuyer.findUnique).not.toHaveBeenCalled();
    expect(db.globalBuyer.delete).not.toHaveBeenCalled();
  });
});

describe("redactShop", () => {
  test("an unknown shop is a no-op", async () => {
    db.shop.findUnique.mockResolvedValue(null);
    const result = await redactShop({ shopDomain: SHOP });
    expect(result.skipped).toBe(true);
  });

  // ShopBuyerProfile.shopId has no FK to Shop, so these would be orphaned
  // rather than cascaded.
  test("shop buyer profiles are deleted explicitly", async () => {
    await redactShop({ shopDomain: SHOP });
    expect(db.shopBuyerProfile.deleteMany).toHaveBeenCalledWith({
      where: { shopId: "shop_a" },
    });
  });

  test("a buyer who shops elsewhere survives the shop's departure", async () => {
    db.shopBuyerProfile.findMany.mockResolvedValue([{ buyerId: "buyer_1" }]);
    db.shopBuyerProfile.count.mockResolvedValue(1); // still linked elsewhere

    const result = await redactShop({ shopDomain: SHOP });

    expect(result.globalBuyersDeleted).toBe(0);
    expect(db.globalBuyer.delete).not.toHaveBeenCalled();
  });

  test("a buyer left with no links is deleted", async () => {
    db.shopBuyerProfile.findMany.mockResolvedValue([{ buyerId: "buyer_1" }]);
    db.shopBuyerProfile.count.mockResolvedValue(0);
    db.globalBuyer.findUnique.mockResolvedValue({ phone: PHONE });

    const result = await redactShop({ shopDomain: SHOP });

    expect(result.globalBuyersDeleted).toBe(1);
    expect(db.globalBuyer.delete).toHaveBeenCalledWith({ where: { id: "buyer_1" } });
    expect(db.deviceFingerprint.deleteMany).toHaveBeenCalledWith({
      where: { phone: PHONE },
    });
  });

  test("a mixed set deletes only the buyers with no links left", async () => {
    db.shopBuyerProfile.findMany.mockResolvedValue([
      { buyerId: "buyer_1" },
      { buyerId: "buyer_2" },
    ]);
    db.shopBuyerProfile.count
      .mockResolvedValueOnce(0) // buyer_1 has nothing left
      .mockResolvedValueOnce(3); // buyer_2 shops at three other stores
    db.globalBuyer.findUnique.mockResolvedValue({ phone: PHONE });

    const result = await redactShop({ shopDomain: SHOP });

    expect(result.globalBuyersDeleted).toBe(1);
    expect(db.globalBuyer.delete).toHaveBeenCalledTimes(1);
    expect(db.globalBuyer.delete).toHaveBeenCalledWith({ where: { id: "buyer_1" } });
  });

  test("shop-scoped rows are deleted in chunks", async () => {
    // Two full pages then a short one, to prove the loop terminates.
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: `o${i}` }));
    db.order.findMany
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce([{ id: "last" }]);
    db.order.deleteMany
      .mockResolvedValueOnce({ count: 1000 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await redactShop({ shopDomain: SHOP });

    expect(result.orders).toBe(1001);
    expect(db.order.findMany).toHaveBeenCalledTimes(2);
  });
});
