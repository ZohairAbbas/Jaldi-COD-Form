import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

/**
 * The Growzar feeds against a real Postgres: paging, the updatedAt triggers,
 * tombstones, settings history and the form.abandoned event.
 *
 * Runs only with TEST_DATABASE_URL pointing at a THROWAWAY database whose name
 * contains "test" (lesson 4 of the pack: tests must never reach production).
 * Without it the whole file is skipped, and says so.
 *
 *   TEST_DATABASE_URL=postgresql://…/preventify_g5_test npx vitest run
 */

const TEST_DB = process.env.TEST_DATABASE_URL || "";
const usable = /test/i.test(new URL(TEST_DB || "postgresql://x/none").pathname);
if (!usable) {
  console.warn(
    "[growzar-feeds.db.test] SKIPPED: set TEST_DATABASE_URL to a disposable database whose name contains 'test'.",
  );
}

const ENV = {
  GROWZAR_URL: "https://growzar.example.test",
  GROWZAR_PLATFORM_KEY: "test-platform-key",
  GROWZAR_SIGNING_SECRET: "test-signing-secret",
  CRON_SECRET: "test-cron-secret",
  // proxy.$ imports shopify.server, which refuses to load without these.
  SHOPIFY_APP_URL: "https://preventify.example.test",
  SHOPIFY_API_KEY: "test-api-key",
  SHOPIFY_API_SECRET: "test-api-secret",
  SCOPES: "read_products",
};

let db;
let growzar;
let routes;
let cron;
let events;
let gdpr;

beforeAll(async () => {
  if (!usable) return;
  // Before any import that builds a PrismaClient.
  process.env.DATABASE_URL = TEST_DB;
  Object.assign(process.env, ENV);
  db = (await import("../db.server")).default;
  growzar = await import("./growzar.server");
  gdpr = await import("./gdpr.server");
  routes = {
    formOrders: await import("../routes/api.v1.growzar.form-orders"),
    abandonments: await import("../routes/api.v1.growzar.abandonments"),
    settings: await import("../routes/api.v1.growzar.settings"),
    settingsChanges: await import("../routes/api.v1.growzar.settings-changes"),
    offers: await import("../routes/api.v1.growzar.offers"),
    offerEvents: await import("../routes/api.v1.growzar.offer-events"),
    fraudEvents: await import("../routes/api.v1.growzar.fraud-events"),
    order: await import("../routes/proxy.order"),
    bundleStats: await import("../routes/proxy.bundle-stats"),
    otpVerify: await import("../routes/proxy.otp-verify"),
  };
  events = await import("./growzar-events.server");
  cron = await import("../routes/proxy.$");
});

afterAll(async () => {
  if (db) await db.$disconnect();
});

const T0 = new Date("2026-10-01T10:00:00.000Z");

async function reset() {
  await db.$executeRawUnsafe(
    `TRUNCATE "GrowzarTombstone", "SettingsChange", "GrowzarOutboxEvent", "Order", "AbandonedCart",
       "OrderSession", "Settings", "Session", "OfferEvent", "FraudEvent", "OTPSession", "Shop" CASCADE`,
  );
}

/** Set updatedAt on purpose, past the no-op guard (growzar.touch). */
async function backdate(table, at, id) {
  const where = id ? `WHERE id = '${id}'` : "";
  await db.$transaction([
    db.$executeRawUnsafe(`SELECT set_config('growzar.touch', 'on', true)`),
    db.$executeRawUnsafe(`UPDATE "${table}" SET "updatedAt" = $1 ${where}`, at),
  ]);
}

async function makeShop(domain, { installed = true, ...extra } = {}) {
  const shop = await db.shop.create({
    data: {
      shopifyDomain: domain,
      accessToken: "shpat_test",
      country: "PAK",
      shopCurrency: "PKR",
      shopTimezone: "Asia/Karachi",
      shopCountryCode: "PK",
      // Fresh, so no feed call reaches Shopify.
      shopFactsSyncedAt: new Date(),
      ...extra,
    },
  });
  if (installed) {
    await db.session.create({
      data: { id: `offline_${domain}`, shop: domain, state: "x", isOnline: false, accessToken: "shpat_test" },
    });
  }
  return shop;
}

let orderSeq = 0;
function orderData(shopId, extra = {}) {
  orderSeq += 1;
  return {
    shopId,
    shopifyOrderId: String(5550000 + orderSeq),
    shopifyOrderNumber: `#${1000 + orderSeq}`,
    firstName: "Test",
    lastName: "Buyer",
    phone: "03001234567",
    address: "1 Test Street",
    city: "Lahore",
    province: "Punjab",
    subtotal: 1000,
    total: 1200,
    shipping: 200,
    items: JSON.stringify([{ variantId: "880001", quantity: 1, price: 1000 }]),
    ...extra,
  };
}

function signedRequest(path, { shop, sign = true } = {}) {
  const url = `https://preventify.example.test${path}`;
  const timestamp = Date.now();
  const { pathname, search } = new URL(url);
  const headers = {
    Authorization: `Bearer ${ENV.GROWZAR_PLATFORM_KEY}`,
    "X-Growzar-Shop": shop,
    "X-Growzar-Timestamp": String(timestamp),
  };
  if (sign) {
    headers["X-Growzar-Signature"] = growzar.sign(
      ENV.GROWZAR_SIGNING_SECRET,
      growzar.signingPayload({ timestamp, method: "GET", pathWithQuery: `${pathname}${search}`, body: "" }),
    );
  }
  return new Request(url, { headers });
}

async function get(route, path, shop, opts) {
  const response = await route.loader({ request: signedRequest(path, { shop, ...opts }) });
  return { status: response.status, body: await response.json() };
}

describe.skipIf(!usable)("Growzar feeds (real Postgres)", () => {
  beforeEach(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await reset();
  });

  describe("plumbing (acceptance 1)", () => {
    test("envelope with ISO shopCountry; unsigned 401; unknown and uninstalled shops 410", async () => {
      await makeShop("a.myshopify.com");
      await makeShop("gone.myshopify.com", { installed: false });

      const ok = await get(routes.formOrders, "/api/v1/growzar/form-orders", "a.myshopify.com");
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({
        shop: "a.myshopify.com",
        shopTimezone: "Asia/Karachi",
        shopCurrency: "PKR",
        shopCountry: "PK",
        shopCountrySource: "location",
        data: [],
        pagination: { limit: 200, count: 0, hasMore: false, nextCursor: null },
        deletedFormOrderIds: [],
        deletedFormOrderIdsTruncated: false,
      });

      expect((await get(routes.formOrders, "/api/v1/growzar/form-orders", "a.myshopify.com", { sign: false })).status).toBe(401);
      const unknown = await get(routes.formOrders, "/api/v1/growzar/form-orders", "nobody.myshopify.com");
      expect(unknown).toMatchObject({ status: 410, body: { errorType: "shop_not_connected" } });
      expect((await get(routes.abandonments, "/api/v1/growzar/abandonments", "gone.myshopify.com")).status).toBe(410);
    });

    test("a billing-derived Shop.country is not sent when the location is unknown", async () => {
      await makeShop("uk.myshopify.com", { shopCountryCode: null, country: "GBR" });
      const { body } = await get(routes.settings, "/api/v1/growzar/settings", "uk.myshopify.com");
      expect(body).toMatchObject({ shopCountry: null, shopCountrySource: null });
    });

    test("a row from another shop never appears", async () => {
      const a = await makeShop("a.myshopify.com");
      const b = await makeShop("b.myshopify.com");
      await db.order.create({ data: orderData(a.id) });
      await db.order.create({ data: orderData(b.id) });
      await db.abandonedCart.create({ data: { shopId: b.id, sessionId: "s_b", cartItems: "[]" } });

      const orders = await get(routes.formOrders, "/api/v1/growzar/form-orders", "a.myshopify.com");
      expect(orders.body.data).toHaveLength(1);
      const carts = await get(routes.abandonments, "/api/v1/growzar/abandonments", "a.myshopify.com");
      expect(carts.body.data).toHaveLength(0);
      expect(JSON.stringify(orders.body)).not.toContain(a.id);
    });

    test("a signed feed request opens the event gate", async () => {
      await makeShop("a.myshopify.com", { growzarStoppedAt: T0 });
      await get(routes.settings, "/api/v1/growzar/settings", "a.myshopify.com");
      const shop = await db.shop.findUnique({ where: { shopifyDomain: "a.myshopify.com" } });
      expect(shop.growzarSeenAt).toBeInstanceOf(Date);
      expect(shop.growzarStoppedAt).toBeNull();
    });
  });

  test("paging with limit=2 over rows sharing one updatedAt returns each row once (acceptance 2)", async () => {
    const a = await makeShop("a.myshopify.com");
    for (let i = 0; i < 7; i += 1) await db.order.create({ data: orderData(a.id) });
    // Six rows on one timestamp, one later.
    await backdate("Order", T0);
    const later = await db.order.findFirst({ orderBy: { id: "desc" } });
    await backdate("Order", new Date(T0.getTime() + 1000), later.id);

    expect(await db.order.count({ where: { updatedAt: T0 } })).toBe(6);

    const seen = [];
    let path = `/api/v1/growzar/form-orders?limit=2&updatedSince=${T0.toISOString()}`;
    for (let pages = 0; pages < 10; pages += 1) {
      const { body } = await get(routes.formOrders, path, "a.myshopify.com");
      seen.push(...body.data.map((row) => row.id));
      if (!body.pagination.hasMore) break;
      path = `/api/v1/growzar/form-orders?limit=2&updatedSince=${T0.toISOString()}&cursor=${body.pagination.nextCursor}`;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(seen[6]).toBe(later.id);
  });

  test("no GID in orderId; old GID-form rows come out numeric (acceptance 3)", async () => {
    const a = await makeShop("a.myshopify.com");
    await db.order.create({ data: orderData(a.id, { shopifyOrderId: "gid://shopify/Order/7770001" }) });
    await db.order.create({ data: orderData(a.id, { shopifyOrderId: "7770002" }) });
    await db.order.create({ data: orderData(a.id, { shopifyOrderId: null }) });
    const { body } = await get(routes.formOrders, "/api/v1/growzar/form-orders", "a.myshopify.com");
    expect(body.data.map((row) => row.orderId).sort()).toEqual(["7770001", "7770002", null].sort());
    expect(JSON.stringify(body)).not.toContain("gid://");
  });

  describe("updatedAt moves only when the feed's content does (acceptance 4)", () => {
    test("Order: the fulfillment sync's writes do not move it; a status change does", async () => {
      const a = await makeShop("a.myshopify.com");
      const order = await db.order.create({ data: orderData(a.id) });
      await backdate("Order", T0, order.id);

      // A plain write of updatedAt alone is a no-op too.
      await db.$executeRaw`UPDATE "Order" SET "updatedAt" = now() WHERE id = ${order.id}`;
      // Exactly what lib/fulfillment-sync.server.js writes, both branches.
      await db.order.update({ where: { id: order.id }, data: { fulfillmentSyncedAt: new Date() } });
      await db.order.update({
        where: { id: order.id },
        data: { fulfillmentStatus: "FULFILLED", deliveryOutcome: "delivered", fulfillmentSyncedAt: new Date() },
      });
      expect((await db.order.findUnique({ where: { id: order.id } })).updatedAt).toEqual(T0);

      await db.order.update({ where: { id: order.id }, data: { status: "confirmed" } });
      expect((await db.order.findUnique({ where: { id: order.id } })).updatedAt.getTime()).toBeGreaterThan(T0.getTime());
    });

    test("AbandonedCart: retry bookkeeping does not move it; recovery does", async () => {
      const a = await makeShop("a.myshopify.com");
      const cart = await db.abandonedCart.create({ data: { shopId: a.id, sessionId: "s1", cartItems: "[]" } });
      await backdate("AbandonedCart", T0, cart.id);

      await db.abandonedCart.update({
        where: { id: cart.id },
        data: { lastError: "draft failed", lastFailedAt: new Date(), shopifyDraftOrderId: "APP_UNINSTALLED" },
      });
      expect((await db.abandonedCart.findUnique({ where: { id: cart.id } })).updatedAt).toEqual(T0);

      await db.abandonedCart.update({ where: { id: cart.id }, data: { recovered: true, recoveredAt: new Date() } });
      expect((await db.abandonedCart.findUnique({ where: { id: cart.id } })).updatedAt.getTime()).toBeGreaterThan(T0.getTime());
    });
  });

  test("GDPR customers/redact hard-deletes come back as tombstones", async () => {
    const a = await makeShop("a.myshopify.com");
    const order = await db.order.create({ data: orderData(a.id, { phone: "03001112223" }) });
    const cart = await db.abandonedCart.create({
      data: { shopId: a.id, sessionId: "s_gdpr", cartItems: "[]", customerPhone: "03001112223" },
    });
    const since = new Date(Date.now() - 1000).toISOString();

    await gdpr.redactCustomer({ shopDomain: "a.myshopify.com", phone: "03001112223" });

    const orders = await get(routes.formOrders, `/api/v1/growzar/form-orders?updatedSince=${since}`, "a.myshopify.com");
    expect(orders.body.deletedFormOrderIds).toEqual([order.id]);
    const carts = await get(routes.abandonments, `/api/v1/growzar/abandonments?updatedSince=${since}`, "a.myshopify.com");
    expect(carts.body.deletedAbandonmentIds).toEqual([cart.id]);
  });

  test("turning OTP on and off writes two SettingsChange rows (acceptance 6)", async () => {
    const a = await makeShop("a.myshopify.com");
    await db.settings.create({ data: { shopId: a.id } });
    const baseline = await db.settingsChange.count({ where: { shopId: a.id } });
    expect(baseline).toBe(8);

    // A styling save writes no history.
    await db.settings.update({ where: { shopId: a.id }, data: { buttonText: "Order now" } });
    await db.settings.update({ where: { shopId: a.id }, data: { enableOTP: true } });
    await db.settings.update({ where: { shopId: a.id }, data: { enableOTP: false } });

    const changes = await db.settingsChange.findMany({ where: { shopId: a.id, source: "trigger" }, orderBy: { changedAt: "asc" } });
    expect(changes.map((c) => [c.field, c.from, c.to])).toEqual([
      ["otpEnabled", "false", "true"],
      ["otpEnabled", "true", "false"],
    ]);

    const feed = await get(routes.settingsChanges, "/api/v1/growzar/settings-changes", "a.myshopify.com");
    expect(feed.body.data).toHaveLength(10);
    expect(feed.body.data.at(-1)).toMatchObject({ field: "otpEnabled", from: true, to: false, source: "trigger" });

    const settings = await get(routes.settings, "/api/v1/growzar/settings", "a.myshopify.com");
    expect(settings.body.data[0]).toMatchObject({ otpEnabled: false, otpChannel: null, updatedAt: changes[1].changedAt.toISOString() });
  });

  describe("form.abandoned (acceptance 5)", () => {
    async function runCron() {
      const request = new Request("https://preventify.example.test/proxy/cron-abandoned-carts", {
        method: "POST",
        headers: { "X-Cron-Secret": ENV.CRON_SECRET },
      });
      return cron.action({ request, params: { "*": "cron-abandoned-carts" } });
    }

    async function idleSession(shopId, sessionId) {
      await db.orderSession.create({
        data: {
          shopId,
          sessionId,
          userPhone: "03001234567",
          cartItems: JSON.stringify([{ variantId: "gid://shopify/ProductVariant/880001", quantity: 2, price: 500 }]),
          totalAmount: 1000,
          lastActivityAt: new Date(Date.now() - 60 * 60_000),
        },
      });
    }

    test("fires once per abandonment; a cron re-run fires 0", async () => {
      const a = await makeShop("a.myshopify.com", { growzarSeenAt: new Date() });
      await idleSession(a.id, "sess_1");

      expect((await runCron()).status).toBe(200);
      const events = await db.growzarOutboxEvent.findMany({ where: { topic: "form.abandoned" } });
      expect(events).toHaveLength(1);
      const cart = await db.abandonedCart.findFirst({ where: { sessionId: "sess_1" } });
      const body = JSON.parse(events[0].body);
      expect(body).toMatchObject({ topic: "form.abandoned", shop: "a.myshopify.com", data: { id: cart.id, phone: "+923001234567" } });
      expect(body.data.lines[0]).toMatchObject({ variantId: "880001", quantity: 2 });
      expect(body.eventId).toBe(growzar.eventIdFor("form.abandoned", cart.id));

      await runCron();
      expect(await db.growzarOutboxEvent.count({ where: { topic: "form.abandoned" } })).toBe(1);
    });

    test("no event for a shop Growzar has never read", async () => {
      const a = await makeShop("a.myshopify.com");
      await idleSession(a.id, "sess_2");
      await runCron();
      expect(await db.abandonedCart.count()).toBe(1);
      expect(await db.growzarOutboxEvent.count({ where: { topic: "form.abandoned" } })).toBe(0);
    });
  });

  describe("P2: offers and fraud events", () => {
    /** The writers are fire-and-forget; wait for the row instead of a fixed sleep. */
    async function eventually(read, until) {
      for (let i = 0; i < 50; i += 1) {
        const value = await read();
        if (until(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return read();
    }

    const VERIFIED = (domain) => ({ verified: true, shopDomain: domain });

    test("offer events: one per offer, kind and tab; no sid is kept undeduplicated; another shop's offer is ignored", async () => {
      const a = await makeShop("a.myshopify.com");
      const b = await makeShop("b.myshopify.com");
      const offer = await db.bundle.create({ data: { shopId: a.id } });
      const other = await db.bundle.create({ data: { shopId: b.id } });

      const shown = (sid, auth = VERIFIED("a.myshopify.com"), row = offer) =>
        events.recordOfferStat({ auth, offer: row, offerType: "bundle", stat: "impressions", sid });
      await shown("tab0000000001");
      await shown("tab0000000001");
      await shown("tab0000000002");
      await shown(null);
      await shown(null);
      await shown("tab0000000003", VERIFIED("a.myshopify.com"), other); // offer of shop B via shop A's storefront
      await shown("tab0000000004", { verified: false, shopDomain: "a.myshopify.com" });
      await events.recordOfferStat({ auth: VERIFIED("a.myshopify.com"), offer, offerType: "bundle", stat: "accepts", sid: "tab0000000001" });

      expect(await db.offerEvent.count({ where: { kind: "shown" } })).toBe(4);
      expect(await db.offerEvent.count({ where: { offerId: other.id } })).toBe(0);

      const feed = await get(routes.offerEvents, "/api/v1/growzar/offer-events", "a.myshopify.com");
      expect(feed.body.data).toHaveLength(5);
      expect(feed.body.data.find((e) => e.kind === "accepted")).toMatchObject({ offerType: "bundle", offerId: offer.id, sessionId: "tab0000000001" });
    });

    /** A storefront call as Shopify's app proxy signs it (sorted params, HMAC with the API secret). */
    function proxyRequest(path, params) {
      const query = { shop: "a.myshopify.com", path_prefix: "/apps/preventify", timestamp: String(Math.floor(Date.now() / 1000)), logged_in_customer_id: "", ...params };
      const message = Object.keys(query).sort().map((k) => `${k}=${query[k]}`).join("");
      const signature = createHmac("sha256", ENV.SHOPIFY_API_SECRET).update(message).digest("hex");
      return new Request(`https://preventify.example.test${path}?${new URLSearchParams({ ...query, signature })}`, { method: "POST" });
    }

    test("the signed stat route: the counter still increments every time, the dated event once per tab", async () => {
      const a = await makeShop("a.myshopify.com");
      const offer = await db.bundle.create({ data: { shopId: a.id } });
      for (let i = 0; i < 2; i += 1) {
        const res = await routes.bundleStats.action({
          request: proxyRequest("/proxy/bundle-stats", { bundleId: offer.id, stat: "impression", sid: "tab0000000001" }),
        });
        expect(res.status).toBe(200);
      }
      expect((await db.bundle.findUnique({ where: { id: offer.id } })).impressions).toBe(2);
      const rows = await eventually(() => db.offerEvent.findMany(), (r) => r.length >= 1);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ offerType: "bundle", kind: "shown", sessionId: "tab0000000001" });

      // Without a valid signature the route refuses, as before this change.
      const unsigned = new Request(`https://preventify.example.test/proxy/bundle-stats?bundleId=${offer.id}&stat=impression`, { method: "POST" });
      expect((await routes.bundleStats.action({ request: unsigned })).status).toBe(400);
    });

    test("/offers merges the three tables, pages with limit=2, and reports a deleted offer", async () => {
      const a = await makeShop("a.myshopify.com");
      await makeShop("b.myshopify.com");
      await db.upsell.create({ data: { shopId: a.id, upsellType: "one-tick", upsellPrice: 499, enabled: true } });
      await db.upsell.create({ data: { shopId: a.id, upsellType: "pre-purchase" } });
      await db.downsell.create({ data: { shopId: a.id } });
      const gone = await db.bundle.create({ data: { shopId: a.id, bundleType: "combo" } });
      await db.bundle.create({ data: { shopId: a.id } });
      const since = new Date(Date.now() - 60_000).toISOString();

      const seen = [];
      let path = "/api/v1/growzar/offers?limit=2";
      for (let pages = 0; pages < 10; pages += 1) {
        const { body } = await get(routes.offers, path, "a.myshopify.com");
        seen.push(...body.data);
        if (!body.pagination.hasMore) break;
        path = `/api/v1/growzar/offers?limit=2&cursor=${body.pagination.nextCursor}`;
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen.map((o) => o.id)).size).toBe(5);
      expect(seen.map((o) => o.type).sort()).toEqual(["bundle", "bundle", "downsell", "one_tick", "upsell"]);

      await db.bundle.delete({ where: { id: gone.id } });
      const after = await get(routes.offers, `/api/v1/growzar/offers?updatedSince=${since}`, "a.myshopify.com");
      expect(after.body.deletedOfferIds).toEqual([gone.id]);
      expect(after.body.data).toHaveLength(4);
      expect((await get(routes.offers, "/api/v1/growzar/offers", "b.myshopify.com")).body.data).toHaveLength(0);
    });

    test("a blocked buyer and a quantity refusal are logged; the decision is unchanged", async () => {
      const a = await makeShop("a.myshopify.com");
      await db.settings.create({ data: { shopId: a.id, enableUserBlocking: true, blockHighQuantityEnabled: true, maxQuantityPerOrder: 2 } });
      const { normalizePhoneForBlocking } = await import("./db.server");
      await db.blockedUser.create({ data: { shopId: a.id, type: "phone", value: normalizePhoneForBlocking("+923001234567") } });

      const submit = (phone, quantity) =>
        routes.order.action({
          request: new Request("https://a.myshopify.com/apps/preventify/proxy/order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              shop: "a.myshopify.com",
              sessionId: "sess_p2",
              firstName: "Test",
              address: "1 Test Street",
              city: "Lahore",
              countryCode: "PAK",
              phone,
              items: [{ variantId: "1", quantity, price: 10 }],
            }),
          }),
        });

      expect((await submit("+923001234567", 1)).status).toBe(403);
      expect((await submit("+923007654321", 5)).status).toBe(403);

      const rows = await eventually(() => db.fraudEvent.findMany({ orderBy: { createdAt: "asc" } }), (r) => r.length >= 2);
      expect(rows.map((r) => [r.kind, r.rule, r.path, r.sessionId])).toEqual([
        ["blocked", "phone", "cod", "sess_p2"],
        ["quantity_gate", "max_quantity", "cod", "sess_p2"],
      ]);

      const feed = await get(routes.fraudEvents, "/api/v1/growzar/fraud-events", "a.myshopify.com");
      expect(feed.body.data[0]).toMatchObject({ kind: "blocked", rule: "phone", phone: "+923001234567" });
      // The rule type only: the blocked value itself never leaves the app.
      expect(feed.body.data[0]).not.toHaveProperty("value");
    });

    test("OTP verify logs failed and verified, never the code", async () => {
      const a = await makeShop("a.myshopify.com");
      await db.oTPSession.create({ data: { shopId: a.id, phone: "+923001234567", otp: "482913", expiresAt: new Date(Date.now() + 300_000) } });
      const verify = (otp) =>
        routes.otpVerify.action({
          request: new Request("https://a.myshopify.com/apps/preventify/proxy/otp-verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop: "a.myshopify.com", phone: "+923001234567", otp }),
          }),
        });

      const wrong = await (await verify("000000")).json();
      expect(wrong).not.toHaveProperty("reason");
      await verify("482913");

      const rows = await eventually(() => db.fraudEvent.findMany({ orderBy: { createdAt: "asc" } }), (r) => r.length >= 2);
      expect(rows.map((r) => [r.kind, r.rule, r.channel])).toEqual([
        ["otp_failed", "incorrect", "whatsapp"],
        ["otp_verified", null, "whatsapp"],
      ]);
      expect(JSON.stringify(rows)).not.toContain("482913");
    });

    test("a polled step is one event (dedupeKey)", async () => {
      const a = await makeShop("a.myshopify.com");
      for (let i = 0; i < 3; i += 1) {
        await events.recordFraudEvent({ shopDomain: "a.myshopify.com", kind: "otp_verified", channel: "whatsapp_login", phone: "03001234567", dedupeKey: "login:tok:verified" });
      }
      const rows = await db.fraudEvent.findMany({ where: { shopId: a.id } });
      expect(rows).toHaveLength(1);
      // Stored the way buyer.server normalizePhone stores phones (a light
      // clean, not E.164), so GDPR redaction matches it; E.164 is on the way out.
      expect(rows[0].phone).toBe("03001234567");
    });

    test("GDPR redaction deletes the buyer's fraud events and reports them", async () => {
      const a = await makeShop("a.myshopify.com");
      await events.recordFraudEvent({ shopId: a.id, kind: "blocked", rule: "phone", phone: "03001112223" });
      await events.recordFraudEvent({ shopId: a.id, kind: "otp_sent", channel: "whatsapp", phone: "03004445556" });
      const target = await db.fraudEvent.findFirst({ where: { kind: "blocked" } });
      const since = new Date(Date.now() - 1000).toISOString();

      await gdpr.redactCustomer({ shopDomain: "a.myshopify.com", phone: "03001112223" });

      const feed = await get(routes.fraudEvents, `/api/v1/growzar/fraud-events?updatedSince=${since}`, "a.myshopify.com");
      expect(feed.body.deletedFraudEventIds).toEqual([target.id]);
      expect(feed.body.data).toHaveLength(1);
    });
  });
});
