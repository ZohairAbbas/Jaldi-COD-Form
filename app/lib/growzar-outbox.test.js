import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// The real client reaches Postgres. What is under test is the bookkeeping.
vi.mock("../db.server", () => ({ default: {} }));

const { enqueueGrowzarEvent, outcomeUpdate, sweepGrowzarOutbox } = await import(
  "./growzar-outbox.server"
);

const NOW = new Date("2026-09-24T10:00:00Z");
const at = (ms) => new Date(NOW.getTime() + ms);

/** An in-memory stand-in for prisma.growzarOutboxEvent. */
function fakeDb() {
  const rows = [];
  const table = {
    rows,
    create: vi.fn(async ({ data }) => {
      if (rows.some((r) => r.eventId === data.eventId)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row = { id: `row${rows.length + 1}`, status: "pending", attempts: 0, ...data };
      rows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }) => Object.assign(rows.find((r) => r.id === where.id), data)),
    updateMany: vi.fn(async ({ where, data }) => {
      const matches = rows.filter(
        (r) =>
          r.id === where.id &&
          r.status === where.status &&
          (!where.nextAttemptAt || r.nextAttemptAt.getTime() === where.nextAttemptAt.getTime()),
      );
      matches.forEach((r) => Object.assign(r, data));
      return { count: matches.length };
    }),
    findMany: vi.fn(async ({ where }) =>
      rows
        .filter((r) => r.status === where.status && r.nextAttemptAt <= where.nextAttemptAt.lte)
        .map((r) => ({ ...r })),
    ),
  };
  const shops = new Map();
  const shop = {
    shops,
    findUnique: vi.fn(async ({ where }) => shops.get(where.shopifyDomain) ?? null),
    updateMany: vi.fn(async ({ where, data }) => {
      const row = shops.get(where.shopifyDomain);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    }),
  };
  return { growzarOutboxEvent: table, shop };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const event = {
  topic: "app.uninstalled",
  shop: "acme.myshopify.com",
  occurredAt: NOW,
  actor: { type: "shopify" },
  data: {},
  sourceId: "webhook-1",
};

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("outcomeUpdate", () => {
  const row = (attempts) => ({ attempts });
  const fail = { ok: false, retryable: true, status: 500, error: "HTTP 500" };

  test("each failure schedules the next step of 1m, 5m, 30m, 2h, 6h, 12h", () => {
    const delays = [0, 1, 2, 3, 4, 5].map(
      (n) => outcomeUpdate(row(n), fail, NOW).nextAttemptAt.getTime() - NOW.getTime(),
    );
    expect(delays).toEqual([60e3, 300e3, 1800e3, 7200e3, 21600e3, 43200e3]);
  });

  test("the seventh failure gives up", () => {
    expect(outcomeUpdate(row(6), fail, NOW)).toMatchObject({ status: "failed", attempts: 7 });
  });

  test("a non-retryable failure gives up at once", () => {
    expect(outcomeUpdate(row(0), { ...fail, retryable: false, status: 400 }, NOW).status).toBe("failed");
  });

  test("success is recorded as delivered", () => {
    expect(outcomeUpdate(row(2), { ok: true, status: 202 }, NOW)).toMatchObject({
      status: "delivered",
      attempts: 3,
      deliveredAt: NOW,
    });
  });
});

describe("enqueueGrowzarEvent", () => {
  test("stores the envelope and sends it at once", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => ({ ok: true, status: 202 }));

    const result = await enqueueGrowzarEvent(event, { db, send });
    await flush();

    expect(result.queued).toBe(true);
    const [row] = db.growzarOutboxEvent.rows;
    expect(JSON.parse(row.body)).toMatchObject({ topic: "app.uninstalled", shop: "acme.myshopify.com" });
    expect(send).toHaveBeenCalledWith(row.body);
    expect(row.status).toBe("delivered");
  });

  test("a forced 500 leaves it pending for a retry a minute later", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => ({ ok: false, retryable: true, status: 500, error: "HTTP 500" }));

    await enqueueGrowzarEvent(event, { db, send });
    await flush();

    const [row] = db.growzarOutboxEvent.rows;
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastStatus: 500 });
  });

  test("a Shopify redelivery of the same webhook is not a second event", async () => {
    const db = fakeDb();
    const send = vi.fn(async () => ({ ok: true, status: 202 }));

    await enqueueGrowzarEvent(event, { db, send });
    const second = await enqueueGrowzarEvent(event, { db, send });
    await flush();

    expect(second.duplicate).toBe(true);
    expect(db.growzarOutboxEvent.rows).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("never throws: a missing table still sends once", async () => {
    const db = fakeDb();
    db.growzarOutboxEvent.create.mockRejectedValue(new Error('relation "GrowzarOutboxEvent" does not exist'));
    const send = vi.fn(async () => ({ ok: true, status: 202 }));

    await expect(enqueueGrowzarEvent(event, { db, send })).resolves.toMatchObject({ queued: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("never throws on a bad shop", async () => {
    const send = vi.fn();
    await expect(enqueueGrowzarEvent({ ...event, shop: "uuid-1234" }, { db: fakeDb(), send }))
      .resolves.toEqual({ queued: false });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("sweepGrowzarOutbox", () => {
  test("retries what is due, sends the same bytes, and leaves the rest", async () => {
    const db = fakeDb();
    db.growzarOutboxEvent.rows.push(
      { id: "due", eventId: "e1", topic: "t", shop: "a.myshopify.com", body: '{"eventId":"e1"}', status: "pending", attempts: 1, nextAttemptAt: at(-1) },
      { id: "later", eventId: "e2", topic: "t", shop: "a.myshopify.com", body: '{"eventId":"e2"}', status: "pending", attempts: 1, nextAttemptAt: at(60_000) },
      { id: "done", eventId: "e3", topic: "t", shop: "a.myshopify.com", body: "{}", status: "delivered", attempts: 1, nextAttemptAt: at(-1) },
    );
    const send = vi.fn(async () => ({ ok: true, status: 202 }));

    const result = await sweepGrowzarOutbox({ db, send, now: NOW });

    expect(result).toEqual({ due: 1, delivered: 1, failed: 0 });
    expect(send).toHaveBeenCalledWith('{"eventId":"e1"}');
    expect(db.growzarOutboxEvent.rows.find((r) => r.id === "due").status).toBe("delivered");
  });

  test("a row leased by another attempt is skipped", async () => {
    const db = fakeDb();
    db.growzarOutboxEvent.rows.push(
      { id: "due", eventId: "e1", topic: "t", shop: "a.myshopify.com", body: "{}", status: "pending", attempts: 0, nextAttemptAt: at(-1) },
    );
    // Someone else leases it between our read and our lease.
    const findMany = db.growzarOutboxEvent.findMany;
    db.growzarOutboxEvent.findMany = vi.fn(async (args) => {
      const found = await findMany(args);
      db.growzarOutboxEvent.rows[0].nextAttemptAt = at(120_000);
      return found;
    });
    const send = vi.fn();

    const result = await sweepGrowzarOutbox({ db, send, now: NOW });
    expect(result.delivered + result.failed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("the event gate (contract §7)", () => {
  const abandoned = { ...event, topic: "form.abandoned", sourceId: "ab_1", data: { id: "ab_1" } };

  test("form.abandoned is not queued for a shop Growzar has never asked about", async () => {
    const db = fakeDb();
    const send = vi.fn();
    expect(await enqueueGrowzarEvent(abandoned, { db, send })).toEqual({ queued: false, gated: true });
    expect(db.growzarOutboxEvent.rows).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  test("it is queued once Growzar has made a signed request for the shop, and only once", async () => {
    const db = fakeDb();
    db.shop.shops.set("acme.myshopify.com", { growzarSeenAt: NOW, growzarStoppedAt: null });
    const send = vi.fn(async () => ({ ok: true, status: 202 }));
    expect((await enqueueGrowzarEvent(abandoned, { db, send })).queued).toBe(true);
    expect((await enqueueGrowzarEvent(abandoned, { db, send })).duplicate).toBe(true);
    expect(db.growzarOutboxEvent.rows).toHaveLength(1);
  });

  test("app.uninstalled keeps its ungated Phase 1 behaviour", async () => {
    const db = fakeDb();
    expect((await enqueueGrowzarEvent(event, { db, send: vi.fn(async () => ({ ok: true, status: 202 })) })).queued).toBe(true);
  });

  test("a 410 closes the gate and is not retried; pending events for the shop then stop", async () => {
    const db = fakeDb();
    db.shop.shops.set("acme.myshopify.com", { growzarSeenAt: NOW, growzarStoppedAt: null });
    const gone = vi.fn(async () => ({ ok: false, retryable: false, status: 410, error: "HTTP 410" }));
    await enqueueGrowzarEvent(abandoned, { db, send: gone });
    await flush();
    expect(db.growzarOutboxEvent.rows[0].status).toBe("failed");
    expect(db.shop.shops.get("acme.myshopify.com").growzarStoppedAt).toBeInstanceOf(Date);

    expect((await enqueueGrowzarEvent({ ...abandoned, sourceId: "ab_2" }, { db, send: gone })).gated).toBe(true);
  });

  test("the sweep drops a queued gated event once the gate has closed", async () => {
    const db = fakeDb();
    db.shop.shops.set("acme.myshopify.com", { growzarSeenAt: NOW, growzarStoppedAt: null });
    const send = vi.fn(async () => ({ ok: false, retryable: true, status: 503, error: "HTTP 503" }));
    await enqueueGrowzarEvent(abandoned, { db, send });
    await flush();
    db.shop.shops.get("acme.myshopify.com").growzarStoppedAt = NOW;
    send.mockClear();

    // The failed first attempt scheduled its retry from the real clock.
    const result = await sweepGrowzarOutbox({ db, send, now: new Date(Date.now() + 3_600_000) });
    expect(send).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
    expect(db.growzarOutboxEvent.rows[0]).toMatchObject({ status: "failed" });
  });

  test("a 401 from Growzar is retried on the ladder", () => {
    const update = outcomeUpdate({ attempts: 0 }, { ok: false, retryable: true, status: 401, error: "HTTP 401" }, NOW);
    expect(update.status).toBe("pending");
    expect(update.nextAttemptAt).toEqual(at(60_000));
  });
});
