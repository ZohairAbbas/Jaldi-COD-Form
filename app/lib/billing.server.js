/**
 * Shopify billing
 *
 * Shopify App Pricing owns plans, approval, proration and invoicing. This
 * module only mirrors the resulting subscription into the local Subscription
 * row, which the billing page, banners, plan limits and the Merchant360 admin
 * app read.
 *
 * Where the truth comes from:
 *  - Admin API `currentAppInstallation.activeSubscriptions` is the backbone. It
 *    returns both Shopify App Pricing subscriptions and the legacy Billing API
 *    ones Mantle created, works for the non-public staging app, and is what
 *    the legacy charge job needs anyway.
 *  - The Partner API `activeSubscription` query, when configured, adds what the
 *    Admin API can't say: the App Pricing plan handle, a pending cancellation
 *    and the trial end. A Partner API failure never blocks a sync.
 *
 * Shopify App Pricing sends no subscription webhooks and no `charge_id`, so
 * changes made outside the post-approval redirect (cancellations, freezes) are
 * picked up by the sync on app load and by the scheduled sweep below.
 */

import prisma from '../db.server.js';
import { unauthenticated } from '../shopify.server.js';
import { planNameFromHandle, planNameFromSubscriptionName, DEFAULT_PLAN_NAME } from './plan-limits.js';
import { nextLegacyCharge, isLegacyUsageSubscription } from './legacy-billing.js';

/** Re-check Shopify at most this often per shop on app load. */
const SYNC_TTL_MS = 10 * 60 * 1000;

/** Shops synced at once by the scheduled sweep. */
const SWEEP_CONCURRENCY = 5;

/** Admin API statuses that mean the store itself can't be reached. */
const UNREACHABLE_SHOP_CODES = [401, 402, 403, 404, 423];

/**
 * Whether a failed lookup is the store's own state rather than a job fault.
 * Besides HTTP codes, Shopify answers a store it is reviewing with a 200 and
 * "Access denied for currentAppInstallation field. Shop is under review."
 */
function isUnreachableShop(error) {
  return (
    UNREACHABLE_SHOP_CODES.includes(error.response?.code) ||
    /shop is under review/i.test(error.message || '')
  );
}

/**
 * Subscription fields for a shop that no longer has the app: Shopify cancels
 * an app's subscriptions on uninstall.
 */
export const UNINSTALLED_SUBSCRIPTION = {
  planName: DEFAULT_PLAN_NAME,
  planHandle: null,
  shopifySubscriptionId: null,
  status: 'cancelled',
  currentPeriodEnd: null,
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  lastCheckedAt: null,
};

const PARTNER_API_VERSION = process.env.SHOPIFY_PARTNER_API_VERSION || '2026-07';

/**
 * Shopify's hosted plan selection page for a shop. Uses the App Home handle
 * (the slug after /apps/ in the admin URL), not the App Store listing slug.
 */
export function planSelectionUrl(shopDomain) {
  const storeHandle = String(shopDomain || '').replace('.myshopify.com', '');
  const appHandle = process.env.SHOPIFY_APP_HANDLE || 'jaldi-cod-form';
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/**
 * Whether test subscriptions count as paid. Off by default so a test charge
 * can never unlock a paid plan on a live store.
 */
function acceptTestCharges() {
  return process.env.SHOPIFY_BILLING_TEST === 'true';
}

/**
 * Whether the legacy charge job posts real charges. Off by default: without
 * it the sweep logs what it would have charged and charges nothing.
 */
export function legacyChargingEnabled() {
  return process.env.LEGACY_BILLING_CHARGE === 'true';
}

const BILLING_STATE_QUERY = `#graphql
  query PreventifyBillingState {
    shop {
      id
    }
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
        createdAt
        currentPeriodEnd
        trialDays
        lineItems {
          id
          plan {
            pricingDetails {
              __typename
              ... on AppUsagePricing {
                balanceUsed { amount currencyCode }
                cappedAmount { amount currencyCode }
              }
            }
          }
          usageRecords(first: 5, reverse: true) {
            nodes {
              createdAt
              description
              price { amount currencyCode }
            }
          }
        }
      }
    }
  }`;

const PARTNER_SUBSCRIPTION_QUERY = `
  query PreventifyActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle { startTime endTime }
      items { handle }
      legacySubscriptionId
    }
  }`;

function partnerApiConfig() {
  const orgId = process.env.SHOPIFY_PARTNER_ORG_ID;
  const token = process.env.SHOPIFY_PARTNER_API_TOKEN;
  const appId = process.env.SHOPIFY_PARTNER_APP_ID;
  if (!orgId || !token || !appId) return null;
  return {
    url: `https://partners.shopify.com/${orgId}/api/${PARTNER_API_VERSION}/graphql.json`,
    token,
    appId: appId.startsWith('gid://') ? appId : `gid://shopify/App/${appId}`,
  };
}

/** The shop's App Pricing subscription from the Partner API, or null. Throws on failure. */
async function fetchPartnerSubscription(shopGid) {
  const config = partnerApiConfig();
  if (!config || !shopGid) return null;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': config.token,
    },
    body: JSON.stringify({
      query: PARTNER_SUBSCRIPTION_QUERY,
      variables: { appId: config.appId, shopId: shopGid },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Partner API HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(`Partner API: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data?.activeSubscription ?? null;
}

/**
 * Everything Shopify knows about a shop's billing. `admin` is the client from
 * authenticate.admin() or unauthenticated.admin(). Throws when the Admin API
 * call fails; a Partner API failure only leaves `partner` null.
 */
export async function loadBillingState(admin, shopDomain) {
  const response = await admin.graphql(BILLING_STATE_QUERY);
  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }

  const shopGid = json.data?.shop?.id ?? null;
  const subscriptions = json.data?.currentAppInstallation?.activeSubscriptions ?? [];

  // Only a live paid subscription has anything the Partner API adds, so Free
  // shops don't spend a Partner API call.
  let partner = null;
  if (subscriptions.some((s) => acceptTestCharges() || !s.test)) {
    try {
      partner = await fetchPartnerSubscription(shopGid);
    } catch (error) {
      console.error(`[Billing] Partner API lookup failed shop=${shopDomain}:`, error.message);
    }
  }

  return { shopGid, subscriptions, partner };
}

/**
 * Turn Shopify's billing state into Subscription row fields.
 *
 * An unrecognised plan keeps the shop's previous plan rather than dropping a
 * paying merchant to Free — it almost always means a plan was renamed in the
 * Partner Dashboard.
 */
export function resolveSubscriptionRecord({ subscriptions, partner, planHandle, existing, acceptTest }) {
  const subscription = subscriptions.find((s) => acceptTest || !s.test) || null;

  if (!subscription) {
    return {
      planName: DEFAULT_PLAN_NAME,
      planHandle: null,
      shopifySubscriptionId: null,
      status: 'none',
      currentPeriodEnd: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
    };
  }

  const partnerHandle = partner?.items?.[0]?.handle ?? null;
  const resolvedName =
    planNameFromHandle(partnerHandle) ||
    planNameFromHandle(planHandle) ||
    planNameFromSubscriptionName(subscription.name);

  if (!resolvedName) {
    console.error(
      `[Billing] Unmapped subscription name="${subscription.name}" handle="${partnerHandle || planHandle || ''}" — keeping plan ${existing?.planName || DEFAULT_PLAN_NAME}`
    );
  }

  const periodEnd = partner?.currentBillingCycle?.endTime ?? subscription.currentPeriodEnd;

  return {
    planName: resolvedName || existing?.planName || DEFAULT_PLAN_NAME,
    planHandle: partnerHandle || planHandle || existing?.planHandle || null,
    shopifySubscriptionId: subscription.id,
    status: String(subscription.status || 'ACTIVE').toLowerCase(),
    currentPeriodEnd: periodEnd ? new Date(periodEnd) : null,
    trialEndsAt: partner?.trialEndsAt ? new Date(partner.trialEndsAt) : trialEnd(subscription),
    cancelAtPeriodEnd: !!partner?.cancelAtEndOfCycle,
  };
}

/** Trial end from createdAt + trialDays, when Shopify reports a trial. */
function trialEnd(subscription) {
  const days = Number(subscription?.trialDays || 0);
  if (!days || !subscription?.createdAt) return null;
  const end = new Date(new Date(subscription.createdAt).getTime() + days * 24 * 60 * 60 * 1000);
  return end > new Date() ? end : null;
}

/** Write a loaded billing state to the shop's Subscription row. */
async function saveBillingState(shop, state, { planHandle = null } = {}) {
  const existing = await prisma.subscription.findUnique({ where: { shopId: shop.id } });
  const record = resolveSubscriptionRecord({
    subscriptions: state.subscriptions,
    partner: state.partner,
    planHandle,
    existing,
    acceptTest: acceptTestCharges(),
  });
  const data = { ...record, lastCheckedAt: new Date() };

  return prisma.subscription.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, ...data },
    update: data,
  });
}

/**
 * Bring a shop's Subscription row in line with Shopify. Skips the call when
 * the row was checked within the TTL unless `force` is set (use it on the
 * post-approval redirect). Never downgrades on a failed lookup — the previous
 * row is returned unchanged.
 *
 * @param {object} admin - from authenticate.admin()
 * @param {{ id: string, shopifyDomain: string }} shop
 * @param {{ planHandle?: string|null, force?: boolean }} [opts]
 */
export async function syncSubscription(admin, shop, { planHandle = null, force = false } = {}) {
  const existing = await prisma.subscription.findUnique({ where: { shopId: shop.id } });

  if (
    !force &&
    existing?.lastCheckedAt &&
    Date.now() - existing.lastCheckedAt.getTime() < SYNC_TTL_MS
  ) {
    return existing;
  }

  try {
    const state = await loadBillingState(admin, shop.shopifyDomain);
    return await saveBillingState(shop, state, { planHandle });
  } catch (error) {
    console.error(`[Billing] Sync failed shop=${shop.shopifyDomain}:`, error.message);
    return existing;
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(shopId) {
  try {
    return await prisma.subscription.findUnique({
      where: { shopId },
      include: {
        shop: {
          select: {
            shopifyDomain: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('Failed to get subscription:', error);
    return null;
  }
}

const LEGACY_CHARGE_MUTATION = `#graphql
  mutation PreventifyLegacyCharge(
    $lineItemId: ID!
    $price: MoneyInput!
    $description: String!
    $idempotencyKey: String
  ) {
    appUsageRecordCreate(
      subscriptionLineItemId: $lineItemId
      price: $price
      description: $description
      idempotencyKey: $idempotencyKey
    ) {
      appUsageRecord { id }
      userErrors { field message }
    }
  }`;

/** Post one legacy plan charge. Throws on failure. */
async function postLegacyCharge(admin, charge) {
  const response = await admin.graphql(LEGACY_CHARGE_MUTATION, {
    variables: {
      lineItemId: charge.lineItemId,
      price: { amount: charge.amount, currencyCode: charge.currencyCode },
      description: charge.description,
      idempotencyKey: charge.idempotencyKey,
    },
  });
  const json = await response.json();
  const result = json.data?.appUsageRecordCreate;
  const errors = [...(json.errors || []), ...(result?.userErrors || [])];
  if (errors.length || !result?.appUsageRecord) {
    throw new Error(errors.map((e) => e.message).join('; ') || 'no usage record returned');
  }
  return result.appUsageRecord.id;
}

/**
 * Sync one installed shop and, when its subscription is a legacy Mantle one
 * that is due, post that period's plan charge.
 */
async function sweepShop(shop, { now, live }) {
  const { admin } = await unauthenticated.admin(shop.shopifyDomain);
  const state = await loadBillingState(admin, shop.shopifyDomain);
  await saveBillingState(shop, state);

  const charges = [];
  for (const subscription of state.subscriptions) {
    if (!isLegacyUsageSubscription(subscription)) continue;

    const charge = nextLegacyCharge(subscription, now);
    if (!charge.due) {
      charges.push({ shop: shop.shopifyDomain, subscription: subscription.name, outcome: 'not_due', reason: charge.reason });
      continue;
    }

    const summary = {
      shop: shop.shopifyDomain,
      subscription: subscription.name,
      amount: `${charge.amount} ${charge.currencyCode}`,
      description: charge.description,
      skippedPeriods: charge.skippedPeriods,
    };

    if (!live) {
      console.log('[Billing] Legacy charge DRY RUN (set LEGACY_BILLING_CHARGE=true to charge):', JSON.stringify(summary));
      charges.push({ ...summary, outcome: 'dry_run' });
      continue;
    }

    const usageRecordId = await postLegacyCharge(admin, charge);
    console.log('[Billing] Legacy charge posted:', JSON.stringify({ ...summary, usageRecordId }));
    charges.push({ ...summary, outcome: 'charged', usageRecordId });
  }
  return charges;
}

/**
 * Scheduled sweep over every installed shop:
 *  1. Sync its Subscription row, so cancellations and freezes land even for
 *     merchants who never open the app (App Pricing sends no webhooks).
 *  2. Post the monthly plan charge on legacy Mantle subscriptions, exactly as
 *     Mantle did, until they are moved to Shopify App Pricing.
 * Shops without the app are settled to cancelled, in case the uninstall
 * webhook was missed (or predates this code).
 */
export async function runBillingSweep({ now = new Date(), live = legacyChargingEnabled() } = {}) {
  const installed = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ['shop'],
  });
  const shops = await prisma.shop.findMany({
    where: { shopifyDomain: { in: installed.map((s) => s.shop) } },
    select: { id: true, shopifyDomain: true },
  });

  const result = { live, shopsChecked: 0, unreachable: 0, errors: 0, failures: [], charges: [] };

  const queue = [...shops];
  const worker = async () => {
    while (queue.length) {
      const shop = queue.shift();
      result.shopsChecked++;
      try {
        result.charges.push(...(await sweepShop(shop, { now, live })));
      } catch (error) {
        // A closed, frozen or uninstalled-but-not-yet-cleaned-up store answers
        // 401/402/403/404/423. That's the store's state, not a job fault, and
        // counting it would keep cron-health red for as long as it lingers.
        if (isUnreachableShop(error)) {
          result.unreachable++;
          continue;
        }
        result.errors++;
        result.failures.push({ shop: shop.shopifyDomain, error: error.message });
        console.error(`[Billing] Sweep failed shop=${shop.shopifyDomain}:`, error.message);
      }
    }
  };
  await Promise.all(Array.from({ length: SWEEP_CONCURRENCY }, worker));

  const settled = await prisma.subscription.updateMany({
    where: {
      shop: { shopifyDomain: { notIn: installed.map((s) => s.shop) } },
      status: { notIn: ['none', 'cancelled'] },
    },
    data: UNINSTALLED_SUBSCRIPTION,
  });
  result.uninstalledSettled = settled.count;

  return result;
}
