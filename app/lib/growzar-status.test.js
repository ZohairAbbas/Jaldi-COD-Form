import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const findSession = vi.fn();
const findShop = vi.fn();

vi.mock("../db.server", () => ({
  default: {
    session: { findFirst: (...args) => findSession(...args) },
    shop: { findUnique: (...args) => findShop(...args) },
  },
}));

const { loader } = await import("../routes/api.v1.growzar.status");
const { sign, signingPayload } = await import("./growzar.server");

const SHOP = "acme.myshopify.com";
const PATH = `/api/v1/growzar/status?shop=${SHOP}`;
const KEY = "platform-key-for-tests";
const SECRET = "signing-secret-for-tests";

function request({ signed = true } = {}) {
  const timestamp = Date.now();
  const headers = new Headers({ Authorization: `Bearer ${KEY}`, "X-Growzar-Shop": SHOP });
  if (signed) {
    headers.set("X-Growzar-Timestamp", String(timestamp));
    headers.set("X-Growzar-Signature", sign(SECRET, signingPayload({ timestamp, method: "GET", pathWithQuery: PATH, body: "" })));
  }
  return new Request(`https://preventify.growzar.com${PATH}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("GROWZAR_URL", "https://growzar.example.com");
  vi.stubEnv("GROWZAR_PLATFORM_KEY", KEY);
  vi.stubEnv("GROWZAR_SIGNING_SECRET", SECRET);
  vi.stubEnv("APP_VERSION", "test-1");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  findSession.mockReset();
  findShop.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/v1/growzar/status", () => {
  test("returns the §11 shape for an installed shop", async () => {
    findSession.mockResolvedValue({ id: `offline_${SHOP}` });
    findShop.mockResolvedValue({ tokenInvalid: false });

    const response = await loader({ request: request() });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installed: true,
      appVersion: "test-1",
      shop: SHOP,
      capabilities: ["form_orders:read", "abandonments:read", "settings:read"],
      planRelevantFeatures: [],
    });
    expect(findSession).toHaveBeenCalledWith(expect.objectContaining({ where: { shop: SHOP, isOnline: false } }));
  });

  test("no offline session means not installed, even if the Shop row survives", async () => {
    findSession.mockResolvedValue(null);
    findShop.mockResolvedValue({ tokenInvalid: false });
    const body = await (await loader({ request: request() })).json();
    expect(body.installed).toBe(false);
  });

  test("a token Shopify has revoked means not installed", async () => {
    findSession.mockResolvedValue({ id: `offline_${SHOP}` });
    findShop.mockResolvedValue({ tokenInvalid: true });
    const body = await (await loader({ request: request() })).json();
    expect(body.installed).toBe(false);
  });

  test("an unsigned request with a valid bearer key is 401 and reads nothing", async () => {
    const response = await loader({ request: request({ signed: false }) });
    expect(response.status).toBe(401);
    expect((await response.json()).errorType).toBe("unauthorized");
    expect(findSession).not.toHaveBeenCalled();
  });
});
