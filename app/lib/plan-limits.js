/**
 * Plan Limits Configuration
 *
 * Defines order limits per plan. These are LOCAL constants
 * controlled by the app, not dependent on Mantle.
 * Plan names must match the names configured in Mantle dashboard.
 */

export const PLAN_LIMITS = {
  Free: {
    monthlyOrderLimit: 23,
    features: [
      '60 orders/month',
      'COD form customization',
      'Upsells & Downsells',
      'Quantity Offers',
      'Multi-Currency',
      'Multi-Pixels',
      'Basic Fraud Protection',
      'Analytics & Insights',
      'Email support',
    ],
  },
  Basic: {
    monthlyOrderLimit: 500,
    features: [
      '500 orders/month',
      'All Free plan features',
      'Quantity Offers on Product Page',
      'Advanced Fraud Protection',
      'OTP Verification',
      '24/7 Live Chat Support',
    ],
  },
  Pro: {
    monthlyOrderLimit: null, // Unlimited
    features: [
      'Unlimited orders',
      'All Basic plan features',
      'Bundle/Quantity Breaks',
      'User Blocking',
      'Advanced Tax Settings',
      'Priority Support',
    ],
  },
};

export const DEFAULT_PLAN_NAME = 'Free';

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
