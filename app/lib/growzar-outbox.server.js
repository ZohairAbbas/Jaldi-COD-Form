import prisma from "../db.server";
import { buildEnvelope, nextRetryDelayMs, postEvent } from "./growzar.server";

/**
 * Durable delivery of events to Growzar (API-CONTRACT §7).
 *
 * An event is written to GrowzarOutboxEvent first and sent second. The first
 * attempt happens straight away, without holding up the caller; if it fails,
 * the cron worker's sweep (/proxy/cron-growzar-outbox, every minute) retries on
 * the contract's backoff. A restart between attempts loses nothing.
 *
 * The event body is serialised once and stored, so every retry sends the same
 * bytes with the same eventId, and Growzar's dedup does the rest.
 */

/**
 * How long a row is reserved for an attempt already in flight. Without it the
 * sweep and the immediate attempt could send the same event at the same
 * moment. Longer than postEvent's 10 s timeout by a wide margin.
 */
const IN_FLIGHT_LEASE_MS = 2 * 60_000;

const SWEEP_BATCH = 50;

/**
 * Record the outcome of one attempt. `attempts` counts attempts made, so the
 * first failure schedules the first retry (1m) and the seventh gives up.
 */
export function outcomeUpdate(row, result, now = new Date()) {
  const attempts = row.attempts + 1;

  if (result.ok) {
    return {
      status: "delivered",
      attempts,
      lastStatus: result.status,
      lastError: null,
      deliveredAt: now,
    };
  }

  const delay = result.retryable ? nextRetryDelayMs(attempts) : null;
  return {
    status: delay == null ? "failed" : "pending",
    attempts,
    lastStatus: result.status ?? null,
    lastError: String(result.error || "unknown").slice(0, 500),
    ...(delay == null ? {} : { nextAttemptAt: new Date(now.getTime() + delay) }),
  };
}

/** One attempt at one row, with the result written back. Never throws. */
async function attempt(row, { db = prisma, send = postEvent } = {}) {
  const result = await send(row.body);
  const update = outcomeUpdate(row, result);
  try {
    await db.growzarOutboxEvent.update({ where: { id: row.id }, data: update });
  } catch (error) {
    console.error(`[growzar-outbox] could not record attempt for ${row.eventId}:`, error.message);
  }
  if (!result.ok) {
    const next = update.status === "failed" ? "giving up" : `retry at ${update.nextAttemptAt.toISOString()}`;
    console.warn(`[growzar-outbox] ${row.topic} ${row.eventId} for ${row.shop} failed (${result.error}); ${next}`);
  }
  return result;
}

/**
 * Queue an event and fire its first attempt without waiting for it.
 *
 * Returns once the row is on disk. The caller — a Shopify webhook — must not be
 * held up by Growzar, and must not fail because of it, so this never throws.
 *
 * If the outbox table is missing (the code deployed ahead of the migration),
 * the event is still sent once, directly; it just is not retried. That is
 * logged loudly, because it means the retries this module promises are off.
 */
export async function enqueueGrowzarEvent(
  { topic, shop, occurredAt, actor, data, sourceId },
  { db = prisma, send = postEvent } = {},
) {
  let envelope;
  try {
    envelope = buildEnvelope({ topic, shop, occurredAt, actor, data, sourceId });
  } catch (error) {
    console.error(`[growzar-outbox] not queuing ${topic}:`, error.message);
    return { queued: false };
  }
  const body = JSON.stringify(envelope);

  let row;
  try {
    row = await db.growzarOutboxEvent.create({
      data: {
        eventId: envelope.eventId,
        topic,
        shop: envelope.shop,
        body,
        nextAttemptAt: new Date(Date.now() + IN_FLIGHT_LEASE_MS),
      },
    });
  } catch (error) {
    if (error?.code === "P2002") {
      // Shopify redelivered a webhook already queued. It is the same event.
      return { queued: true, duplicate: true, eventId: envelope.eventId };
    }
    console.error(
      `[growzar-outbox] could not store ${topic} for ${envelope.shop} (${error.message}) — sending once without retries`,
    );
    send(body).then((result) => {
      if (!result.ok) console.error(`[growzar-outbox] unqueued ${topic} ${envelope.eventId} failed: ${result.error}`);
    });
    return { queued: false, eventId: envelope.eventId };
  }

  attempt(row, { db, send }).catch(() => {});
  return { queued: true, eventId: envelope.eventId };
}

/**
 * The sweep: retry every pending event that is due.
 *
 * Each row is leased with a conditional update before it is sent, so two
 * overlapping sweeps (or a sweep racing the immediate attempt) cannot both
 * send it. Rows are sent one at a time; there are only ever a handful, and
 * Growzar runs on the same box.
 */
export async function sweepGrowzarOutbox({ db = prisma, send = postEvent, now = new Date() } = {}) {
  const due = await db.growzarOutboxEvent.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: SWEEP_BATCH,
  });

  let delivered = 0;
  let failed = 0;

  for (const row of due) {
    const lease = await db.growzarOutboxEvent.updateMany({
      where: { id: row.id, status: "pending", nextAttemptAt: row.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + IN_FLIGHT_LEASE_MS) },
    });
    if (lease.count !== 1) continue;

    const result = await attempt(row, { db, send });
    if (result.ok) delivered += 1;
    else failed += 1;
  }

  return { due: due.length, delivered, failed };
}
