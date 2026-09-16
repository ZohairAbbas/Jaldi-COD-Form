import { describe, test, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockFindUnique = vi.fn();
const mockAddressFindFirst = vi.fn();
const mockAddressCreate = vi.fn();
const mockAddressUpdate = vi.fn();
const mockAddressUpdateMany = vi.fn();
const mockProfileUpsert = vi.fn();

vi.mock("../db.server.js", () => ({
  default: {
    globalBuyer: {
      upsert: (...a) => mockUpsert(...a),
      findUnique: (...a) => mockFindUnique(...a),
    },
    buyerAddress: {
      findFirst: (...a) => mockAddressFindFirst(...a),
      create: (...a) => mockAddressCreate(...a),
      update: (...a) => mockAddressUpdate(...a),
      updateMany: (...a) => mockAddressUpdateMany(...a),
    },
    shopBuyerProfile: { upsert: (...a) => mockProfileUpsert(...a) },
  },
}));

const { upsertGlobalBuyer, markBuyerVerified, normalizePhone, lookupGlobalBuyer } =
  await import("./buyer.server");

const SHOP_ID = "shop_1";
const PHONE = "+923001234567";

const orderData = (overrides = {}) => ({
  phone: PHONE,
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsert.mockResolvedValue({ id: "buyer_1", phone: PHONE });
  mockAddressFindFirst.mockResolvedValue(null);
  mockFindUnique.mockResolvedValue(null);
});

describe("upsertGlobalBuyer — lastVerifiedAt", () => {
  // The PRV-2 core. lastVerifiedAt used to be stamped on every order, which
  // combined with `totalOrdersGlobal >= 1` made essentially every buyer who had
  // ever ordered "trusted" — so the trust gate was effectively no gate.
  test("an unverified order does not refresh the trust window", async () => {
    await upsertGlobalBuyer(SHOP_ID, orderData({ verified: false }));

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.lastVerifiedAt).toBeUndefined();
    expect(call.create.lastVerifiedAt).toBeNull();
  });

  test("an order with no verified flag at all does not refresh it", async () => {
    await upsertGlobalBuyer(SHOP_ID, orderData());

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.lastVerifiedAt).toBeUndefined();
    expect(call.create.lastVerifiedAt).toBeNull();
  });

  test("a verified order refreshes the trust window", async () => {
    await upsertGlobalBuyer(SHOP_ID, orderData({ verified: true }));

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.lastVerifiedAt).toBeInstanceOf(Date);
    expect(call.create.lastVerifiedAt).toBeInstanceOf(Date);
  });

  // Regression guard: leaving lastVerifiedAt out of `update` must not disturb
  // anything else the upsert writes.
  test("the order still counts and profile fields still update", async () => {
    await upsertGlobalBuyer(SHOP_ID, orderData({ verified: false, city: "Lahore" }));

    const call = mockUpsert.mock.calls[0][0];
    expect(call.update.totalOrdersGlobal).toEqual({ increment: 1 });
    expect(call.update.firstName).toBe("Ada");
    expect(call.update.lastCity).toBe("Lahore");
  });

  test("an unparseable phone is a no-op", async () => {
    expect(await upsertGlobalBuyer(SHOP_ID, orderData({ phone: "" }))).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("markBuyerVerified", () => {
  // Previously an update(), which threw P2025 for a buyer with no row and was
  // swallowed — discarding the verification. It went unnoticed because
  // upsertGlobalBuyer then stamped lastVerifiedAt on the order anyway. Now that
  // it only does so for verified orders, losing this write would mean a buyer
  // who verified never becomes trusted.
  test("creates the buyer when they have never ordered", async () => {
    await markBuyerVerified(PHONE);

    const call = mockUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ phone: PHONE });
    expect(call.create.phone).toBe(PHONE);
    expect(call.create.lastVerifiedAt).toBeInstanceOf(Date);
  });

  test("updates an existing buyer", async () => {
    await markBuyerVerified(PHONE);
    expect(mockUpsert.mock.calls[0][0].update.lastVerifiedAt).toBeInstanceOf(Date);
  });

  test("normalises the phone before writing", async () => {
    await markBuyerVerified("+92 300 123 4567");
    expect(mockUpsert.mock.calls[0][0].where).toEqual({ phone: PHONE });
  });

  test("an unparseable phone is a no-op", async () => {
    expect(await markBuyerVerified("")).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe("lookupGlobalBuyer trust levels", () => {
  const buyerRow = (overrides = {}) => ({
    phone: PHONE,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    totalOrdersGlobal: 3,
    lastVerifiedAt: new Date(),
    addresses: [
      {
        id: "addr_1",
        label: "Home",
        address: "1 Main St",
        city: "Lahore",
        province: "Punjab",
        isDefault: true,
      },
    ],
    ...overrides,
  });

  test("a recently verified buyer with orders is trusted and gets full data", async () => {
    mockFindUnique.mockResolvedValue(buyerRow());

    const result = await lookupGlobalBuyer(PHONE);
    expect(result.trustLevel).toBe("trusted");
    expect(result.email).toBe("ada@example.com");
    expect(result.addresses).toHaveLength(1);
  });

  // After the fix these are the buyers who never genuinely verified.
  test("a buyer with orders but no verification is only recognized", async () => {
    mockFindUnique.mockResolvedValue(buyerRow({ lastVerifiedAt: null }));

    const result = await lookupGlobalBuyer(PHONE);
    expect(result.trustLevel).toBe("recognized");
    expect(result.email).toBeUndefined();
    expect(result.addresses).toBeUndefined();
  });

  test("verification older than the 90-day window is only recognized", async () => {
    mockFindUnique.mockResolvedValue(
      buyerRow({ lastVerifiedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) })
    );

    expect((await lookupGlobalBuyer(PHONE)).trustLevel).toBe("recognized");
  });

  test("an unknown phone returns null", async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await lookupGlobalBuyer(PHONE)).toBeNull();
  });
});

describe("normalizePhone", () => {
  test("strips formatting but keeps the country code", () => {
    expect(normalizePhone("+92 300 123-4567")).toBe(PHONE);
    expect(normalizePhone("(+92) 3001234567")).toBe(PHONE);
  });

  test("converts a 00 prefix to +", () => {
    expect(normalizePhone("00923001234567")).toBe(PHONE);
  });

  test("strips the trunk zero after the country code", () => {
    expect(normalizePhone("+920300123456")).toBe("+92300123456");
  });

  test("empty input returns null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
