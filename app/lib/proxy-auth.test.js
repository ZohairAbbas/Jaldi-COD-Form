import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mocked because the real ones reach Shopify's session storage and Postgres.
// The behaviour under test is the decision logic around them, not either.
const mockAppProxy = vi.fn();
const mockGetShopByDomain = vi.fn();

vi.mock("../shopify.server", () => ({
  authenticate: {
    public: {
      get appProxy() {
        return mockAppProxy;
      },
    },
  },
}));

vi.mock("./db.server", () => ({
  getShopByDomain: (...args) => mockGetShopByDomain(...args),
}));

const { requireProxyShop, ProxyAuthError, withProxyAuth } = await import(
  "./proxy-auth.server"
);

const SHOP = "verified-shop.myshopify.com";
const ATTACKER_CLAIM = "victim-shop.myshopify.com";

const req = (url = `https://preventify.growzar.com/proxy/buyer-lookup`) =>
  new Request(url, { method: "POST" });

/** A valid signature for SHOP, with an active session. */
const signedAs = (shop = SHOP) => {
  mockAppProxy.mockResolvedValue({ session: { shop } });
};

/** Signature rejected — what the library does for an unsigned/forged request. */
const unsigned = () => {
  mockAppProxy.mockRejectedValue(new Response(undefined, { status: 400 }));
};

let warnSpy;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PROXY_AUTH_MODE;
  mockGetShopByDomain.mockResolvedValue({ id: 1, shopifyDomain: SHOP });
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("enforce mode", () => {
  beforeEach(() => {
    process.env.PROXY_AUTH_MODE = "enforce";
  });

  test("a validly signed request resolves the shop from the signature", async () => {
    signedAs();
    const auth = await requireProxyShop(req());
    expect(auth.shopDomain).toBe(SHOP);
    expect(auth.verified).toBe(true);
  });

  test("an unsigned request is rejected with 401", async () => {
    unsigned();
    await expect(requireProxyShop(req())).rejects.toBeInstanceOf(ProxyAuthError);

    try {
      await requireProxyShop(req());
    } catch (error) {
      expect(error.response.status).toBe(401);
    }
  });

  // The core of PRV-1: a caller naming a shop it hasn't proven it owns.
  test("a body-claimed shop is ignored when the signature is absent", async () => {
    unsigned();
    await expect(
      requireProxyShop(req(), { fallbackShopDomain: ATTACKER_CLAIM })
    ).rejects.toBeInstanceOf(ProxyAuthError);
  });

  // Signed as A, claiming to be B — the shop-B-acts-as-shop-A case.
  test("the signature wins over a conflicting claimed shop", async () => {
    signedAs(SHOP);
    const auth = await requireProxyShop(req(), {
      fallbackShopDomain: ATTACKER_CLAIM,
    });
    expect(auth.shopDomain).toBe(SHOP);
    expect(mockGetShopByDomain).toHaveBeenCalledWith(SHOP);
    expect(mockGetShopByDomain).not.toHaveBeenCalledWith(ATTACKER_CLAIM);
  });

  test("a valid signature for an uninstalled shop still 404s", async () => {
    mockAppProxy.mockResolvedValue({ session: undefined });
    mockGetShopByDomain.mockResolvedValue(null);

    try {
      await requireProxyShop(
        req(`https://preventify.growzar.com/proxy/config?shop=${SHOP}`)
      );
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyAuthError);
      expect(error.response.status).toBe(404);
    }
  });

  test("an unexpected error is not silently treated as authenticated", async () => {
    mockAppProxy.mockRejectedValue(new Error("session storage unreachable"));
    await expect(requireProxyShop(req())).rejects.toBeInstanceOf(ProxyAuthError);
  });
});

describe("log mode (the default)", () => {
  test("defaults to log when PROXY_AUTH_MODE is unset", async () => {
    unsigned();
    const auth = await requireProxyShop(req(), { fallbackShopDomain: SHOP });
    expect(auth.verified).toBe(false);
    expect(auth.shopDomain).toBe(SHOP);
  });

  test("an unknown value is treated as log, not enforce", async () => {
    process.env.PROXY_AUTH_MODE = "ENFORCE_TYPO";
    unsigned();
    const auth = await requireProxyShop(req(), { fallbackShopDomain: SHOP });
    expect(auth.verified).toBe(false);
  });

  test("a signed request is still marked verified", async () => {
    signedAs();
    const auth = await requireProxyShop(req());
    expect(auth.verified).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("a failure is logged with the path and reason", async () => {
    unsigned();
    await requireProxyShop(req(), { fallbackShopDomain: SHOP });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(warnSpy.mock.calls[0][0].replace("[proxy-auth] ", ""));
    expect(payload.event).toBe("verification_failed");
    expect(payload.path).toBe("/proxy/buyer-lookup");
    expect(payload.reason).toBe("signature_rejected_400");
    expect(payload.mode).toBe("log");
  });

  // This log is read in bulk during the soak, on routes carrying buyer PII.
  test("the log records no request body", async () => {
    unsigned();
    await requireProxyShop(req(), { fallbackShopDomain: SHOP });
    const line = warnSpy.mock.calls[0][0];
    expect(line).not.toMatch(/phone|email|address/i);
  });

  test("with no signature and no claimed shop, it fails closed with 400", async () => {
    unsigned();
    try {
      await requireProxyShop(req());
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyAuthError);
      expect(error.response.status).toBe(400);
    }
  });
});

describe("withProxyAuth", () => {
  test("passes the verified shop to the handler", async () => {
    process.env.PROXY_AUTH_MODE = "enforce";
    signedAs();

    const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const response = await withProxyAuth(handler)({ request: req() });

    expect(response.status).toBe(200);
    expect(handler.mock.calls[0][1].shopDomain).toBe(SHOP);
  });

  test("converts an auth failure into a response instead of throwing", async () => {
    process.env.PROXY_AUTH_MODE = "enforce";
    unsigned();

    const handler = vi.fn();
    const response = await withProxyAuth(handler)({ request: req() });

    expect(response.status).toBe(401);
    // The handler must not run — otherwise the route body executed unauthenticated.
    expect(handler).not.toHaveBeenCalled();
  });

  test("a genuine handler error still propagates", async () => {
    process.env.PROXY_AUTH_MODE = "enforce";
    signedAs();

    const handler = vi.fn().mockRejectedValue(new Error("db down"));
    await expect(withProxyAuth(handler)({ request: req() })).rejects.toThrow(
      "db down"
    );
  });
});
