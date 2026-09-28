import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { Buffer } from "node:buffer";

import {
  CLAIM_TOKEN_TTL_SECONDS,
  RETRY_SCHEDULE_MS,
  buildEnvelope,
  claimUrl,
  eventIdFor,
  mintClaimToken,
  nextRetryDelayMs,
  postEvent,
  sign,
  signingPayload,
  verifyPlatformRequest,
  verifySignature,
} from "./growzar.server";

const env = {
  GROWZAR_URL: "https://growzar.example.com/",
  GROWZAR_PLATFORM_KEY: "platform-key-for-tests",
  GROWZAR_SIGNING_SECRET: "signing-secret-for-tests",
};
const SHOP = "acme.myshopify.com";
const NOW = 1_790_000_000_000;
const STATUS_PATH = `/api/v1/growzar/status?shop=${encodeURIComponent(SHOP)}`;

/** A request exactly as Growzar's outboundHeaders() builds it. */
function growzarRequest({
  path = STATUS_PATH,
  method = "GET",
  body = "",
  key = env.GROWZAR_PLATFORM_KEY,
  secret = env.GROWZAR_SIGNING_SECRET,
  timestamp = NOW,
  shop = SHOP,
  signed = true,
} = {}) {
  const headers = new Headers({ Authorization: `Bearer ${key}`, "X-Growzar-Shop": shop });
  if (signed) {
    headers.set("X-Growzar-Timestamp", String(timestamp));
    headers.set(
      "X-Growzar-Signature",
      sign(secret, signingPayload({ timestamp, method, pathWithQuery: path, body })),
    );
  }
  return new Request(`https://preventify.growzar.com${path}`, {
    method,
    headers,
    ...(method === "GET" ? {} : { body }),
  });
}

const verify = (request) => verifyPlatformRequest(request, { now: NOW, env });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("signing", () => {
  test("payload is <ts>.<METHOD> <path+query>.<body>, as Growzar builds it", () => {
    expect(signingPayload({ timestamp: 1, method: "post", pathWithQuery: "/a?b=c", body: "{}" }))
      .toBe("1.POST /a?b=c.{}");
  });

  test("signature is sha256=<hex HMAC>", () => {
    const expected = createHmac("sha256", "s").update("p").digest("hex");
    expect(sign("s", "p")).toBe(`sha256=${expected}`);
  });

  test("a timestamp from the future is refused as firmly as an old one", () => {
    const base = { secret: "s", method: "GET", pathWithQuery: "/", body: "" };
    const ahead = NOW + 5 * 60_000 + 1;
    const signature = sign("s", signingPayload({ ...base, timestamp: ahead }));
    expect(verifySignature({ ...base, signature, timestamp: String(ahead), now: NOW }))
      .toEqual({ ok: false, reason: "timestamp_out_of_range" });
  });
});

describe("verifyPlatformRequest", () => {
  test("a signed platform request passes and names the shop", async () => {
    const result = await verify(growzarRequest());
    expect(result).toMatchObject({ ok: true, shop: SHOP });
  });

  test("a valid bearer key without a signature is 401", async () => {
    const result = await verify(growzarRequest({ signed: false }));
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(401);
    expect(await result.response.json()).toEqual({
      error: "This request is not authenticated.",
      errorType: "unauthorized",
    });
  });

  test("a wrong bearer key is 401 even with a good signature", async () => {
    const result = await verify(growzarRequest({ key: "not-the-key" }));
    expect(result.response.status).toBe(401);
  });

  test("a signature older than five minutes is 401", async () => {
    const result = await verify(growzarRequest({ timestamp: NOW - 5 * 60_000 - 1 }));
    expect(result.response.status).toBe(401);
  });

  test("a signature made with another secret is 401", async () => {
    const result = await verify(growzarRequest({ secret: "courierify-secret" }));
    expect(result.response.status).toBe(401);
  });

  test("the query string is signed: changing ?shop= breaks the signature", async () => {
    const request = growzarRequest();
    const tampered = new Request(request.url.replace("acme", "victim"), { headers: request.headers });
    const result = await verify(tampered);
    expect(result.response.status).toBe(401);
  });

  test("header and query naming different shops is 400", async () => {
    const result = await verify(growzarRequest({ shop: "other.myshopify.com" }));
    expect(result.response.status).toBe(400);
  });

  test("a POST body is covered and handed back", async () => {
    const body = JSON.stringify({ a: 1 });
    const result = await verify(growzarRequest({ path: "/api/v1/growzar/x", method: "POST", body }));
    expect(result).toMatchObject({ ok: true, body });
  });

  test("missing configuration refuses, never opens", async () => {
    const result = await verifyPlatformRequest(growzarRequest(), { now: NOW, env: {} });
    expect(result.ok).toBe(false);
    expect(result.response.status).toBe(503);
  });

  test("no CORS header on a refusal", async () => {
    const result = await verify(growzarRequest({ signed: false }));
    expect(result.response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("claim token", () => {
  const decode = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

  const mint = (overrides = {}) =>
    mintClaimToken(
      {
        shop: "ACME.myshopify.com",
        shopifyUserId: "gid://shopify/StaffMember/123",
        email: "Owner@Acme.pk",
        isStoreOwner: true,
        locale: "en",
        ...overrides,
      },
      { now: NOW, env },
    );

  test("carries the §10 claims, with a 5-minute life", () => {
    const claims = decode(mint());
    expect(claims).toMatchObject({
      iss: "preventify",
      aud: "growzar",
      shop: "acme.myshopify.com",
      shopifyUserId: "gid://shopify/StaffMember/123",
      email: "owner@acme.pk",
      isStoreOwner: true,
      locale: "en",
      iat: NOW / 1000,
      exp: NOW / 1000 + CLAIM_TOKEN_TTL_SECONDS,
    });
    expect(CLAIM_TOKEN_TTL_SECONDS).toBe(300);
  });

  test("is HS256 over header.payload with the Growzar secret", () => {
    const token = mint();
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    const expected = createHmac("sha256", env.GROWZAR_SIGNING_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  test("every token has its own jti", () => {
    expect(decode(mint()).jti).not.toBe(decode(mint()).jti);
  });

  test("isStoreOwner is only true when it is exactly true", () => {
    expect(decode(mint({ isStoreOwner: "yes" })).isStoreOwner).toBe(false);
  });

  test("refuses a shop that is not a myshopify domain", () => {
    expect(() => mint({ shop: "acme.com" })).toThrow();
  });

  test("goes in the fragment, never the query string", () => {
    const url = claimUrl("a.b.c", env);
    expect(url).toBe("https://growzar.example.com/claim#token=a.b.c");
    expect(new URL(url).search).toBe("");
  });
});

describe("events", () => {
  test("retry schedule is 1m, 5m, 30m, 2h, 6h, 12h, then give up", () => {
    expect(RETRY_SCHEDULE_MS).toEqual([60e3, 300e3, 1800e3, 7200e3, 21600e3, 43200e3]);
    expect([1, 2, 3, 4, 5, 6].map(nextRetryDelayMs)).toEqual(RETRY_SCHEDULE_MS);
    expect(nextRetryDelayMs(7)).toBeNull();
  });

  test("a webhook redelivery produces the same eventId; different webhooks do not", () => {
    expect(eventIdFor("app.uninstalled", "wh-1")).toBe(eventIdFor("app.uninstalled", "wh-1"));
    expect(eventIdFor("app.uninstalled", "wh-1")).not.toBe(eventIdFor("app.uninstalled", "wh-2"));
    expect(eventIdFor("app.uninstalled", "wh-1")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("envelope has the §7 shape", () => {
    const envelope = buildEnvelope({
      topic: "app.uninstalled",
      shop: "Acme.myshopify.com",
      occurredAt: new Date("2026-09-24T10:00:00Z"),
      actor: { type: "shopify" },
      sourceId: "wh-1",
    });
    expect(envelope).toEqual({
      eventId: eventIdFor("app.uninstalled", "wh-1"),
      topic: "app.uninstalled",
      occurredAt: "2026-09-24T10:00:00.000Z",
      shop: "acme.myshopify.com",
      actor: { type: "shopify" },
      data: {},
    });
  });

  test("postEvent signs the exact body over POST /api/v1/events", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const body = '{"eventId":"e1"}';
    const result = await postEvent(body, { env, fetchImpl, now: NOW });

    expect(result).toEqual({ ok: true, status: 202 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://growzar.example.com/api/v1/events");
    expect(init.body).toBe(body);
    expect(init.headers["X-Growzar-Signature"]).toBe(
      sign(env.GROWZAR_SIGNING_SECRET, `${NOW}.POST /api/v1/events.${body}`),
    );
  });

  test("5xx, 429 and network errors are retryable; other 4xx are not", async () => {
    const withStatus = (status) => postEvent("{}", { env, fetchImpl: async () => new Response(null, { status }) });
    expect((await withStatus(500)).retryable).toBe(true);
    expect((await withStatus(503)).retryable).toBe(true);
    expect((await withStatus(429)).retryable).toBe(true);
    expect((await withStatus(400)).retryable).toBe(false);
    const network = await postEvent("{}", { env, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    expect(network).toMatchObject({ ok: false, retryable: true, status: null });
  });
});
