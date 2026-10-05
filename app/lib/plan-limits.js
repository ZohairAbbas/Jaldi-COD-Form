/**
 * Plan Limits Configuration
 *
 * Defines order limits per plan. These are LOCAL constants controlled by the
 * app; Shopify owns pricing and charging.
 *
 * `handle` must match the plan handle in the Partner Dashboard (Pricing
 * content) exactly — Shopify sends it back as `plan_handle` after a merchant
 * approves a plan. `price` is display-only and must be kept in step with the
 * Dashboard by hand.
 */

export const PLAN_LIMITS = {
  Free: {
    handle: 'free',
    price: 0,
    monthlyOrderLimit: 200,
    features: [
      '200 orders/month',
      'COD form customization',
      'Upsells & Downsells',
      'Bundle Offers',
      'Multi-Currency',
      'Multi-Pixels',
      'Fraud Protection',
      'Analytics & Insights',
    ],
  },
  Basic: {
    handle: 'basic',
    price: 4.99,
    monthlyOrderLimit: 1000,
    features: [
      '1000 orders/month',
      'All Free plan features',
      'OTP Verification',
      '24/7 Live Chat Support',
    ],
  },
  Pro: {
    handle: 'pro',
    price: 14.99,
    monthlyOrderLimit: null, // Unlimited
    features: [
      'Unlimited orders',
      'All Basic plan features',
      'Priority Support',
    ],
  },
};

export const DEFAULT_PLAN_NAME = 'Free';

/** Plan names, cheapest first. */
export const PLAN_NAMES = Object.keys(PLAN_LIMITS);

/**
 * Map a Shopify plan handle (from `plan_handle` or the Partner API) to a plan
 * name. Returns null when unrecognised, so the caller can fall back rather
 * than guess.
 */
export function planNameFromHandle(handle) {
  if (!handle) return null;
  const needle = String(handle).trim().toLowerCase();
  return PLAN_NAMES.find((name) => PLAN_LIMITS[name].handle === needle) || null;
}

/**
 * Map a Shopify subscription's display name to a plan name. Subscriptions
 * Mantle created are named exactly "Basic" / "Pro"; Shopify App Pricing ones
 * carry the Dashboard plan name.
 *
 * Fragile by nature — a Dashboard rename breaks it — so callers must treat
 * null as "unknown, keep the previous plan", never as Free.
 */
export function planNameFromSubscriptionName(subscriptionName) {
  if (!subscriptionName) return null;
  const needle = String(subscriptionName).trim().toLowerCase();
  return (
    PLAN_NAMES.find((name) => name.toLowerCase() === needle) ||
    // Tolerate names like "Preventify Pro" / "Basic plan".
    PLAN_NAMES.find((name) => new RegExp(`\\b${name.toLowerCase()}\\b`).test(needle)) ||
    null
  );
}

export const USAGE_WARNING_THRESHOLD = 85;
export const USAGE_LIMIT_THRESHOLD = 100;

/**
 * Get the monthly order limit for a plan name.
 * Returns null for unlimited plans, defaults to Free limit if plan not found.
 */
export function getPlanLimit(planName) {
  const plan = PLAN_LIMITS[planName];
  if (!plan) return PLAN_LIMITS[DEFAULT_PLAN_NAME]?.monthlyOrderLimit ?? null;
  return plan.monthlyOrderLimit;
}

/**
 * Get usage percentage (0-100+). Returns 0 for unlimited plans.
 */
export function getUsagePercentage(currentCount, limit) {
  if (limit === null || limit === 0) return 0;
  return Math.round((currentCount / limit) * 100);
}

/**
 * Determine the usage status based on current count and plan limit.
 * Returns: 'normal' | 'warning' | 'exceeded'
 */
export function getUsageStatus(currentCount, limit) {
  if (limit === null) return 'normal';
  const percentage = getUsagePercentage(currentCount, limit);
  if (percentage >= USAGE_LIMIT_THRESHOLD) return 'exceeded';
  if (percentage >= USAGE_WARNING_THRESHOLD) return 'warning';
  return 'normal';
}

/**
 * Get the features list for a given plan name.
 */
export function getPlanFeatures(planName) {
  return PLAN_LIMITS[planName]?.features ?? [];
}

/**
 * Subscription statuses that grant no paid plan. `canceled` is the spelling
 * Mantle wrote for some rows; Shopify's own statuses are lowercased on sync.
 */
export const INACTIVE_STATUSES = ['cancelled', 'canceled', 'expired', 'frozen', 'declined'];

/**
 * Get the effective plan name based on subscription status.
 * Treats inactive subscriptions as Free plan.
 */
export function getEffectivePlanName(subscription) {
  if (!subscription) return DEFAULT_PLAN_NAME;
  const { status, planName } = subscription;
  if (INACTIVE_STATUSES.includes(status)) return DEFAULT_PLAN_NAME;
  return planName || DEFAULT_PLAN_NAME;
}
