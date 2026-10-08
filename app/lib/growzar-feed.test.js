import { describe, expect, test, vi } from "vitest";

vi.mock("../db.server", () => ({ default: {} }));

const { createRateLimiter, decodeCursor, encodeCursor, openFeed, pageWhere, paginate, parseFeedQuery } = await import("./growzar-feed.server");
const { resolveShopCountry } = await import("./growzar-shop-facts.server");

describe("query and cursor", () => {
  test("cursor round-trips (updatedAt, id)", () => {
    const at = new Date("2026-10-01T10:00:00.123Z");
    expect(decodeCursor(encodeCursor(at, "cm_1"))).toEqual({ updatedAt: at, id: "cm_1" });
    expect(decodeCursor("garbage")).toBeNull();
  });

  test("limit is 1–500, default 200; bad input is a 400", () => {
    expect(parseFeedQuery("https://x/f").limit).toBe(200);
    expect(parseFeedQuery("https://x/f?limit=500").limit).toBe(500);
    expect(parseFeedQuery("https://x/f?limit=501").response.status).toBe(400);
    expect(parseFeedQuery("https://x/f?limit=0").response.status).toBe(400);
    expect(parseFeedQuery("https://x/f?updatedSince=nope").response.status).toBe(400);
    expect(parseFeedQuery("https://x/f?cursor=nope").response.status).toBe(400);
  });

  test("the cursor takes precedence over updatedSince", () => {
    const cursor = { updatedAt: new Date("2026-10-02T00:00:00Z"), id: "b" };
    expect(pageWhere({ updatedSince: new Date("2026-10-01T00:00:00Z"), cursor })).toEqual({
      OR: [{ updatedAt: { gt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { gt: "b" } }],
    });
    expect(pageWhere({ updatedSince: null, cursor: null })).toEqual({});
  });

  test("paginate trims the probe row and points the cursor at the last row", () => {
    const at = new Date("2026-10-01T00:00:00Z");
    const { page, pagination } = paginate([{ id: "a", updatedAt: at }, { id: "b", updatedAt: at }, { id: "c", updatedAt: at }], 2);
    expect(page.map((r) => r.id)).toEqual(["a", "b"]);
    expect(pagination).toMatchObject({ limit: 2, count: 2, hasMore: true });
    expect(decodeCursor(pagination.nextCursor)).toEqual({ updatedAt: at, id: "b" });
  });
});

describe("rate limit", () => {
  test("600 a minute, then 429 with Retry-After, then a new window", () => {
    const take = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect([take(0).ok, take(1).ok, take(2).ok]).toEqual([true, true, true]);
    expect(take(3)).toEqual({ ok: false, retryAfterSeconds: 60 });
    expect(take(60_000).ok).toBe(true);
  });

  test("a limiter that throws is a 503, never a pass", async () => {
    const result = await openFeed(new Request("https://x/api/v1/growzar/form-orders"), {
      verify: async () => ({ ok: true, shop: "a.myshopify.com" }),
      limiter: () => {
        throw new Error("boom");
      },
    });
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
  });

  test("over the limit is a 429 with Retry-After", async () => {
    const result = await openFeed(new Request("https://x/api/v1/growzar/form-orders"), {
      verify: async () => ({ ok: true, shop: "a.myshopify.com" }),
      limiter: () => ({ ok: false, retryAfterSeconds: 7 }),
    });
    expect(result.response.status).toBe(429);
    expect(result.response.headers.get("Retry-After")).toBe("7");
  });
});

describe("shopCountry", () => {
  test("the primary location wins", () => {
    expect(resolveShopCountry({ shopCountryCode: "AE", country: "PAK" })).toEqual({ shopCountry: "AE", shopCountrySource: "location" });
  });
  test("without it, only the five settings countries are a fallback", () => {
    expect(resolveShopCountry({ shopCountryCode: null, country: "PAK" })).toEqual({ shopCountry: "PK", shopCountrySource: "app_setting" });
    expect(resolveShopCountry({ shopCountryCode: null, country: "KSA" })).toEqual({ shopCountry: "SA", shopCountrySource: "app_setting" });
  });
  test("a billing-derived code (GBR, USA) is null, never sent", () => {
    expect(resolveShopCountry({ shopCountryCode: null, country: "GBR" })).toEqual({ shopCountry: null, shopCountrySource: null });
    expect(resolveShopCountry({ shopCountryCode: null, country: "USA" }).shopCountry).toBeNull();
  });
});
