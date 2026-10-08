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
  };
  cron = await import("../routes/proxy.$");
});

afterAll(async () => {
  if (db) await db.$disconnect();
});

const T0 = new Date("2026-10-01T10:00:00.000Z");

async function reset() {
  await db.$executeRawUnsafe(
    `TRUNCATE "GrowzarTombstone", "SettingsChange", "GrowzarOutboxEvent", "Order", "AbandonedCart",
       "OrderSession", "Settings", "Session", "Shop" CASCADE`,
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
});
