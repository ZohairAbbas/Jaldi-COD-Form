import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockOtpFindFirst = vi.fn();
const mockWaFindFirst = vi.fn();
const mockBuyerFindUnique = vi.fn();

vi.mock("../db.server.js", () => ({
  default: {
    oTPSession: { findFirst: (...a) => mockOtpFindFirst(...a) },
    whatsAppLoginSession: { findFirst: (...a) => mockWaFindFirst(...a) },
    globalBuyer: { findUnique: (...a) => mockBuyerFindUnique(...a) },
  },
}));

const {
  resolveVerificationMethod,
  resolveOrderVerification,
  resolveTrustedBypass,
  issueVerificationToken,
  verifyVerificationToken,
  issueOrderToken,
  verifyOrderToken,
  isGenuineVerification,
  VERIFICATION_TAGS,
} = await import("./verification.server");

const SHOP_ID = "shop_1";
const SHOP = "my-store.myshopify.com";
const PHONE = "+923001234567";

let warnSpy;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SHOPIFY_API_SECRET = "test_secret_value";
  mockOtpFindFirst.mockResolvedValue(null);
  mockWaFindFirst.mockResolvedValue(null);
  mockBuyerFindUnique.mockResolvedValue(null);
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => warnSpy.mockRestore());

describe("resolveVerificationMethod", () => {
  test("no verification record returns skipped", async () => {
    expect(await resolveVerificationMethod(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.SKIPPED
    );
  });

  test("a verified WhatsApp OTP session returns the WhatsApp OTP tag", async () => {
    mockOtpFindFirst.mockResolvedValue({ channel: "whatsapp" });
    expect(await resolveVerificationMethod(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.WHATSAPP_OTP
    );
  });

  test("an SMS-channel session returns the SMS tag", async () => {
    mockOtpFindFirst.mockResolvedValue({ channel: "sms" });
    expect(await resolveVerificationMethod(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.SMS_OTP
    );
  });

  test("WhatsApp login outranks an OTP session", async () => {
    mockOtpFindFirst.mockResolvedValue({ channel: "whatsapp" });
    mockWaFindFirst.mockResolvedValue({ id: "wa_1" });
    expect(await resolveVerificationMethod(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.WHATSAPP_LOGIN
    );
  });

  test("only verified sessions count", async () => {
    await resolveVerificationMethod(SHOP_ID, PHONE);
    expect(mockOtpFindFirst.mock.calls[0][0].where.verified).toBe(true);
    expect(mockWaFindFirst.mock.calls[0][0].where.status).toBe("verified");
  });

  test("the lookup is scoped to the shop and time-bounded", async () => {
    await resolveVerificationMethod(SHOP_ID, PHONE);
    const where = mockOtpFindFirst.mock.calls[0][0].where;
    expect(where.shopId).toBe(SHOP_ID);
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });

  test("an unparseable phone returns skipped without querying", async () => {
    expect(await resolveVerificationMethod(SHOP_ID, "")).toBe(
      VERIFICATION_TAGS.SKIPPED
    );
    expect(mockOtpFindFirst).not.toHaveBeenCalled();
  });
});

describe("resolveOrderVerification", () => {
  // The core of PRV-6.
  test("a client claiming verification without a session gets skipped", async () => {
    const result = await resolveOrderVerification(SHOP_ID, PHONE, {
      clientClaim: VERIFICATION_TAGS.WHATSAPP_OTP,
      allowTrustedBypass: false,
    });
    expect(result).toBe(VERIFICATION_TAGS.SKIPPED);
  });

  test("a mismatch is logged without the phone number", async () => {
    await resolveOrderVerification(SHOP_ID, PHONE, {
      clientClaim: VERIFICATION_TAGS.WHATSAPP_OTP,
      allowTrustedBypass: false,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0];
    expect(line).toContain("client_claim_mismatch");
    expect(line).not.toContain(PHONE);
  });

  test("an agreeing claim logs nothing", async () => {
    mockOtpFindFirst.mockResolvedValue({ channel: "whatsapp" });
    await resolveOrderVerification(SHOP_ID, PHONE, {
      clientClaim: VERIFICATION_TAGS.WHATSAPP_OTP,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("a trusted buyer with no fresh session gets the bypass tag", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 3,
      lastVerifiedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    expect(await resolveOrderVerification(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.TRUSTED_BUYER
    );
  });

  test("real verification outranks the bypass", async () => {
    mockOtpFindFirst.mockResolvedValue({ channel: "whatsapp" });
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 3,
      lastVerifiedAt: new Date(),
    });
    expect(await resolveOrderVerification(SHOP_ID, PHONE)).toBe(
      VERIFICATION_TAGS.WHATSAPP_OTP
    );
  });

  test("the bypass can be disabled per merchant", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 3,
      lastVerifiedAt: new Date(),
    });
    expect(
      await resolveOrderVerification(SHOP_ID, PHONE, { allowTrustedBypass: false })
    ).toBe(VERIFICATION_TAGS.SKIPPED);
  });
});

describe("resolveTrustedBypass", () => {
  test("a buyer with no orders is not trusted", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 0,
      lastVerifiedAt: new Date(),
    });
    expect(await resolveTrustedBypass(PHONE)).toBe(false);
  });

  test("a never-verified buyer is not trusted", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 5,
      lastVerifiedAt: null,
    });
    expect(await resolveTrustedBypass(PHONE)).toBe(false);
  });

  test("verification older than the window is not trusted", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 5,
      lastVerifiedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });
    expect(await resolveTrustedBypass(PHONE)).toBe(false);
  });

  test("a recent verification with orders is trusted", async () => {
    mockBuyerFindUnique.mockResolvedValue({
      totalOrdersGlobal: 5,
      lastVerifiedAt: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000),
    });
    expect(await resolveTrustedBypass(PHONE)).toBe(true);
  });
});

describe("verification tokens", () => {
  const issue = (overrides = {}) =>
    issueVerificationToken({
      phone: PHONE,
      shopDomain: SHOP,
      method: VERIFICATION_TAGS.WHATSAPP_OTP,
      ...overrides,
    });

  test("a freshly issued token verifies", () => {
    const result = verifyVerificationToken(issue(), { phone: PHONE, shopDomain: SHOP });
    expect(result).not.toBeNull();
    expect(result.phone).toBe(PHONE);
    expect(result.method).toBe(VERIFICATION_TAGS.WHATSAPP_OTP);
  });

  test("a token for one phone does not verify another", () => {
    expect(
      verifyVerificationToken(issue(), { phone: "+923009999999", shopDomain: SHOP })
    ).toBeNull();
  });

  test("a token for one shop does not verify another", () => {
    expect(
      verifyVerificationToken(issue(), { phone: PHONE, shopDomain: "other.myshopify.com" })
    ).toBeNull();
  });

  test("an expired token is rejected", () => {
    const token = issue({ now: Date.now() - 31 * 60 * 1000 });
    expect(verifyVerificationToken(token, { phone: PHONE, shopDomain: SHOP })).toBeNull();
  });

  test("a tampered payload is rejected", () => {
    const token = issue();
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ p: "+923009999999", s: SHOP, m: "x", exp: Date.now() + 10000 })
    ).toString("base64url");
    expect(verifyVerificationToken(`${forged}.${signature}`)).toBeNull();
  });

  test("a token signed with a different secret is rejected", () => {
    const token = issue();
    process.env.SHOPIFY_API_SECRET = "a_different_secret";
    expect(verifyVerificationToken(token, { phone: PHONE })).toBeNull();
  });

  test("malformed input is rejected rather than throwing", () => {
    for (const bad of [null, undefined, "", "no-separator", ".", "a.b.c", 42, {}]) {
      expect(verifyVerificationToken(bad)).toBeNull();
    }
  });

  test("phone matching survives formatting differences", () => {
    // The buyer may type the number differently than when they verified.
    const token = issueVerificationToken({
      phone: "+92 300 123 4567",
      shopDomain: SHOP,
      method: VERIFICATION_TAGS.WHATSAPP_OTP,
    });
    expect(
      verifyVerificationToken(token, { phone: "+923001234567", shopDomain: SHOP })
    ).not.toBeNull();
  });
});

describe("isGenuineVerification", () => {
  test("real verification channels count", () => {
    expect(isGenuineVerification(VERIFICATION_TAGS.WHATSAPP_LOGIN)).toBe(true);
    expect(isGenuineVerification(VERIFICATION_TAGS.WHATSAPP_OTP)).toBe(true);
    expect(isGenuineVerification(VERIFICATION_TAGS.SMS_OTP)).toBe(true);
  });

  // The trust window must not renew itself off its own output: if skipping
  // verification counted as verifying, one verification would keep a buyer
  // trusted forever and the 90-day bound would never expire.
  test("the trusted bypass does not count as a verification", () => {
    expect(isGenuineVerification(VERIFICATION_TAGS.TRUSTED_BUYER)).toBe(false);
  });

  test("skipped does not count", () => {
    expect(isGenuineVerification(VERIFICATION_TAGS.SKIPPED)).toBe(false);
  });

  test("unknown values do not count", () => {
    for (const bad of [null, undefined, "", "something_else"]) {
      expect(isGenuineVerification(bad)).toBe(false);
    }
  });
});

describe("order tokens", () => {
  const ORDER = "gid://shopify/Order/12345";
  const OTHER_ORDER = "gid://shopify/Order/99999";

  const issue = (overrides = {}) =>
    issueOrderToken({ shopifyOrderId: ORDER, shopDomain: SHOP, ...overrides });

  test("a freshly issued token authorises its own order", () => {
    expect(
      verifyOrderToken(issue(), { shopifyOrderId: ORDER, shopDomain: SHOP })
    ).toBe(true);
  });

  // The core of PRV-3: one buyer's token must not edit another buyer's order.
  test("a token for one order does not authorise another", () => {
    expect(
      verifyOrderToken(issue(), { shopifyOrderId: OTHER_ORDER, shopDomain: SHOP })
    ).toBe(false);
  });

  test("a token for one shop does not authorise another", () => {
    expect(
      verifyOrderToken(issue(), {
        shopifyOrderId: ORDER,
        shopDomain: "other.myshopify.com",
      })
    ).toBe(false);
  });

  test("no token means no authorisation", () => {
    expect(
      verifyOrderToken(null, { shopifyOrderId: ORDER, shopDomain: SHOP })
    ).toBe(false);
  });

  test("an expired token is rejected", () => {
    const token = issue({ now: Date.now() - 61 * 60 * 1000 });
    expect(
      verifyOrderToken(token, { shopifyOrderId: ORDER, shopDomain: SHOP })
    ).toBe(false);
  });

  test("numeric and string order ids are treated alike", () => {
    const token = issueOrderToken({ shopifyOrderId: 12345, shopDomain: SHOP });
    expect(
      verifyOrderToken(token, { shopifyOrderId: "12345", shopDomain: SHOP })
    ).toBe(true);
  });

  // The two token kinds share a signing key, so the `kind` field is what stops
  // a validly-signed verification token being replayed as an order token.
  test("a verification token cannot be used as an order token", () => {
    const verificationToken = issueVerificationToken({
      phone: PHONE,
      shopDomain: SHOP,
      method: VERIFICATION_TAGS.WHATSAPP_OTP,
    });
    expect(
      verifyOrderToken(verificationToken, { shopifyOrderId: ORDER, shopDomain: SHOP })
    ).toBe(false);
  });

  test("an order token cannot be used as a verification token", () => {
    expect(verifyVerificationToken(issue(), { shopDomain: SHOP })).toBeNull();
  });

  test("a tampered order id is rejected", () => {
    const [, signature] = issue().split(".");
    const forged = Buffer.from(
      JSON.stringify({ k: "order", o: OTHER_ORDER, s: SHOP, exp: Date.now() + 10000 })
    ).toString("base64url");
    expect(
      verifyOrderToken(`${forged}.${signature}`, {
        shopifyOrderId: OTHER_ORDER,
        shopDomain: SHOP,
      })
    ).toBe(false);
  });

  test("expectations are required", () => {
    expect(verifyOrderToken(issue(), {})).toBe(false);
    expect(verifyOrderToken(issue(), { shopifyOrderId: ORDER })).toBe(false);
  });
});
