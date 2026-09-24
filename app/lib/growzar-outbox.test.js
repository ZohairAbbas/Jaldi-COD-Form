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
          r.nextAttemptAt.getTime() === where.nextAttemptAt.getTime(),
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
  return { growzarOutboxEvent: table };
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
