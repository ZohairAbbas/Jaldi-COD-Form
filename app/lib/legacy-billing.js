/**
 * Legacy Mantle subscriptions
 *
 * Mantle's "Flex Billing" subscriptions are usage-only Billing API
 * subscriptions: one AppUsagePricing line capped at $14.99 and no recurring
 * line. Mantle charged the plan fee itself, once a month, as a usage record
 * described "Subscription charge for period YYYY-MM-DD to YYYY-MM-DD".
 *
 * With Mantle gone nothing posts those records, so this module works out the
 * next one the same way Mantle did. It continues each subscription's own
 * series — same calendar-month periods, same price as its last charge — so a
 * merchant's invoice doesn't change. Once a subscription is moved to Shopify
 * App Pricing it gains a recurring line, stops matching
 * isLegacyUsageSubscription(), and is left alone.
 *
 * Pure functions only; billing.server.js does the I/O.
 */

const PERIOD_PATTERN = /^Subscription charge for period (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/;

/** True for a live, non-test subscription whose every line is usage-priced. */
export function isLegacyUsageSubscription(subscription) {
  const lineItems = subscription?.lineItems ?? [];
  return (
    !subscription?.test &&
    lineItems.length > 0 &&
    lineItems.every((item) => item.plan?.pricingDetails?.__typename === 'AppUsagePricing')
  );
}

/**
 * The same day next month, as YYYY-MM-DD (UTC). Clamped to the month's last
 * day, so a period starting Jan 31 ends Feb 28/29.
 */
export function addMonth(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, Math.min(day, lastDayOfNextMonth)));
  return next.toISOString().slice(0, 10);
}

/** The most recent "Subscription charge for period" record on a line item, or null. */
function latestPeriodCharge(lineItem) {
  const records = [...(lineItem?.usageRecords?.nodes ?? [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  for (const record of records) {
    const match = PERIOD_PATTERN.exec(record.description || '');
    if (match) return { record, start: match[1], end: match[2] };
  }
  return null;
}

/** Numeric id from an AppSubscription GID, for a compact idempotency key. */
function subscriptionNumber(gid) {
  return String(gid || '').split('/').pop().split('?')[0];
}

/**
 * Decide whether a legacy subscription owes its next plan charge.
 *
 * Due once the last charged period has ended AND nothing has been billed in
 * Shopify's current 30-day cycle yet. The second condition keeps this to one
 * plan charge per Shopify cycle — which the capped amount enforces anyway for
 * Pro, whose cap equals its price — and waits out the few days where Mantle's
 * calendar months and Shopify's 30-day cycles don't line up.
 *
 * If periods were missed (the job was down), only the period containing `now`
 * is charged; missed ones are reported in `skippedPeriods`, never back-billed.
 *
 * @returns {{ due: false, reason: string } | { due: true, lineItemId: string,
 *   amount: string, currencyCode: string, description: string,
 *   idempotencyKey: string, periodStart: string, periodEnd: string,
 *   skippedPeriods: number }}
 */
export function nextLegacyCharge(subscription, now = new Date()) {
  if (!isLegacyUsageSubscription(subscription)) {
    return { due: false, reason: 'not a legacy usage subscription' };
  }
  if (String(subscription.status).toUpperCase() !== 'ACTIVE') {
    return { due: false, reason: `subscription is ${subscription.status}` };
  }

  const lineItem = subscription.lineItems[0];
  const last = latestPeriodCharge(lineItem);
  if (!last) {
    return { due: false, reason: 'no previous plan charge to continue from' };
  }

  const today = now.toISOString().slice(0, 10);
  if (today < last.end) {
    return { due: false, reason: `current period runs to ${last.end}` };
  }

  const balanceUsed = Number(lineItem.plan.pricingDetails.balanceUsed?.amount || 0);
  if (balanceUsed > 0) {
    return { due: false, reason: `already billed ${balanceUsed} in the current Shopify cycle` };
  }

  let periodStart = last.end;
  let skippedPeriods = 0;
  while (addMonth(periodStart) <= today) {
    periodStart = addMonth(periodStart);
    skippedPeriods++;
  }
  const periodEnd = addMonth(periodStart);

  const amount = String(last.record.price.amount);
  const cappedAmount = Number(lineItem.plan.pricingDetails.cappedAmount?.amount || 0);
  if (cappedAmount && Number(amount) > cappedAmount) {
    return { due: false, reason: `charge ${amount} exceeds capped amount ${cappedAmount}` };
  }

  return {
    due: true,
    lineItemId: lineItem.id,
    amount,
    currencyCode: last.record.price.currencyCode,
    description: `Subscription charge for period ${periodStart} to ${periodEnd}`,
    idempotencyKey: `preventify-legacy-${subscriptionNumber(subscription.id)}-${periodStart}`,
    periodStart,
    periodEnd,
    skippedPeriods,
  };
}
