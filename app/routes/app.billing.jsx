/**
 * Billing Page
 *
 * Shows the current plan and usage. Plans are chosen, changed and cancelled on
 * Shopify's hosted plan page (Shopify App Pricing); Shopify redirects back here
 * with `plan_handle` after the merchant approves.
 */

import { useLoaderData, Form, useActionData, useNavigation } from 'react-router';
import { authenticate } from '../shopify.server';
import { getOrCreateShop, getMonthlyOrderCount } from '../lib/db.server';
import { syncSubscription, planSelectionUrl } from '../lib/billing.server';
import { trackServerEvent } from '../lib/mixpanel.server';
import { BILLING_EVENTS } from '../lib/analytics-events';
import {
  PLAN_LIMITS, PLAN_NAMES, getPlanLimit, getUsagePercentage, getUsageStatus, getEffectivePlanName,
} from '../lib/plan-limits';

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Shopify appends plan_handle when a merchant comes back from approving a
  // plan. It is a URL parameter the merchant could edit, so it only names the
  // plan; the forced sync confirms against Shopify that the charge exists.
  const url = new URL(request.url);
  const planHandle = url.searchParams.get('plan_handle');

  const subscription = await syncSubscription(admin, shop, {
    planHandle,
    force: !!planHandle,
  });

  const monthlyOrderCount = await getMonthlyOrderCount(shop.id);
  const currentPlanName = getEffectivePlanName(subscription);
  const planLimit = getPlanLimit(currentPlanName);

  if (planHandle) {
    trackServerEvent(shop.shopifyDomain, BILLING_EVENTS.SUBSCRIPTION_STARTED, {
      plan_handle: planHandle,
      plan_name: currentPlanName,
    });
  }

  trackServerEvent(shop.shopifyDomain, 'Billing Page Viewed', {
    has_subscription: !!subscription,
    subscription_status: subscription?.status,
    charge_approved: !!planHandle,
  });

  return {
    subscription,
    plans: PLAN_NAMES.map((name) => ({ name, ...PLAN_LIMITS[name] })),
    planUrl: planSelectionUrl(shop.shopifyDomain),
    planChanged: !!planHandle,
    monthlyOrderCount,
    currentPlanName,
    planLimit,
    usagePercentage: getUsagePercentage(monthlyOrderCount, planLimit),
    usageStatus: getUsageStatus(monthlyOrderCount, planLimit),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  if (formData.get('action') !== 'sync') {
    return { success: false, error: 'Invalid action' };
  }

  const subscription = await syncSubscription(admin, shop, { force: true });
  return { success: true, synced: !!subscription?.lastCheckedAt };
};

export default function BillingPage() {
  const {
    subscription, plans, planUrl, planChanged,
    monthlyOrderCount, currentPlanName, planLimit, usagePercentage, usageStatus,
  } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();

  const isSyncing =
    navigation.state === 'submitting' && navigation.formData?.get('action') === 'sync';

  const isPaidPlan = currentPlanName !== 'Free';
  const currentRank = plans.findIndex((p) => p.name === currentPlanName);

  const progressBarColor =
    usageStatus === 'exceeded' ? '#d72c0d' :
    usageStatus === 'warning' ? '#ffc453' : '#2a9d5c';

  return (
    <s-page heading="Billing & Subscription">
      {/* Success/Error Messages */}
      {planChanged && (
        <s-banner tone="success" style={{ marginBottom: '16px' }}>
          Your plan has been updated. You are now on the {currentPlanName} plan.
        </s-banner>
      )}

      {actionData?.success && !planChanged && (
        <s-banner tone={actionData.synced ? 'success' : 'warning'} style={{ marginBottom: '16px' }}>
          {actionData.synced
            ? 'Plan status refreshed from Shopify.'
            : 'Could not reach Shopify to refresh your plan. Please try again shortly.'}
        </s-banner>
      )}

      {actionData?.error && (
        <s-banner tone="critical" style={{ marginBottom: '16px' }}>
          Error: {actionData.error}
        </s-banner>
      )}

      {/* Current Plan Usage Summary */}
      <s-section>
        <s-card>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#6b7177', marginBottom: '4px' }}>Current Plan</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 600 }}>{currentPlanName}</span>
                  {/* "none" is a shop with no Shopify subscription, i.e. plain Free */}
                  {subscription && subscription.status !== 'none' && (
                    <s-badge tone={
                      subscription.status === 'active' ? 'success' :
                      subscription.status === 'trialing' ? 'info' : 'critical'
                    }>
                      {subscription.status}
                    </s-badge>
                  )}
                </div>
                {/* Shopify reports a trialing subscription as active, with a trial end date */}
                {subscription?.trialEndsAt && new Date(subscription.trialEndsAt) > new Date() && (
                  <div style={{ fontSize: '13px', color: '#6b7177' }}>
                    Trial ends: {new Date(subscription.trialEndsAt).toLocaleDateString()}
                  </div>
                )}
                {subscription?.currentPeriodEnd && subscription.status === 'active' && (
                  <div style={{ fontSize: '13px', color: '#6b7177' }}>
                    Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </div>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <div style={{ fontSize: '13px', color: '#d72c0d', marginTop: '4px' }}>
                    Subscription will cancel on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}. You will be moved to the Free plan after this date.
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '13px', color: '#6b7177', marginBottom: '4px' }}>Monthly orders</div>
                <div style={{ fontSize: '20px', fontWeight: 600 }}>
                  {monthlyOrderCount} / {planLimit === null ? 'Unlimited' : planLimit.toLocaleString()}
                </div>
                {planLimit !== null && (
                  <div style={{ fontSize: '12px', color: '#6b7177' }}>{usagePercentage}%</div>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {planLimit !== null && (
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  width: '100%', height: '8px',
                  backgroundColor: '#e3e3e3', borderRadius: '4px', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(usagePercentage, 100)}%`,
                    height: '100%',
                    backgroundColor: progressBarColor,
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            )}

            {/* Refresh + Manage row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e3e3e3' }}>
              <Form method="post">
                <input type="hidden" name="action" value="sync" />
                <button type="submit" disabled={isSyncing} style={{
                  backgroundColor: 'white', color: '#303030',
                  border: '1px solid #c9cccf', padding: '6px 12px',
                  borderRadius: '6px', fontSize: '13px',
                  cursor: isSyncing ? 'wait' : 'pointer',
                  opacity: isSyncing ? 0.7 : 1,
                }}>
                  {isSyncing ? 'Refreshing...' : 'Refresh Status'}
                </button>
              </Form>
              {isPaidPlan && (
                <a href={planUrl} target="_top" rel="noopener noreferrer" style={{
                  backgroundColor: 'white', color: '#303030',
                  border: '1px solid #c9cccf', padding: '6px 12px',
                  borderRadius: '6px', fontSize: '13px', textDecoration: 'none',
                }}>
                  Change or cancel plan
                </a>
              )}
            </div>
          </div>
        </s-card>
      </s-section>

      {/* Plan Cards */}
      <s-section>
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600 }}>Available Plans</span>
        </div>
        <div className="pv-grid" style={{ '--pv-grid-min': '260px' }}>
          {plans.map((plan, rank) => {
            const isCurrent = plan.name === currentPlanName;
            const features = plan.features;
            const orderLimit = plan.monthlyOrderLimit;

            return (
              <div
                key={plan.name}
                style={{
                  border: isCurrent ? '2px solid #2a9d5c' : '1px solid #e3e3e3',
                  borderRadius: '12px',
                  padding: '24px',
                  backgroundColor: '#fff',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: isCurrent ? '0 0 0 1px #2a9d5c' : 'none',
                }}
              >
                {/* Current Plan badge */}
                {isCurrent && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#2a9d5c', color: '#fff',
                    padding: '2px 14px', borderRadius: '12px',
                    fontSize: '12px', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    Current Plan
                  </div>
                )}

                {/* Plan name */}
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
                  {plan.name}
                </div>

                {/* Price */}
                <div style={{ marginBottom: '20px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 700 }}>
                    ${plan.price}
                  </span>
                  <span style={{ fontSize: '14px', color: '#6b7177' }}> /month</span>
                </div>

                {/* Order limit highlight */}
                {orderLimit !== undefined && (
                  <div style={{
                    backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: '6px', padding: '8px 12px',
                    marginBottom: '20px', fontSize: '13px',
                    fontWeight: 500, color: '#166534',
                    textAlign: 'center',
                  }}>
                    {orderLimit === null ? 'Unlimited orders' : `${orderLimit.toLocaleString()} orders/month`}
                  </div>
                )}

                {/* Feature list with checkmarks */}
                <div style={{ flex: 1, marginBottom: '20px' }}>
                  {features.map((feature, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'flex-start',
                      gap: '8px', marginBottom: '10px',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                        style={{ flexShrink: 0, marginTop: '2px' }}>
                        <path d="M13.3 4.3L6 11.6L2.7 8.3" stroke="#2a9d5c"
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ fontSize: '13px', color: '#303030', lineHeight: '1.4' }}>
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Action button */}
                {isCurrent ? (
                  <div style={{
                    padding: '10px 20px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '8px',
                    color: '#6b7177',
                    fontSize: '14px',
                    fontWeight: 500,
                    textAlign: 'center',
                  }}>
                    Current Plan
                  </div>
                ) : (
                  // Plan changes happen on Shopify's hosted page, which
                  // shows proration and asks the merchant to approve.
                  <a
                    href={planUrl}
                    target="_top"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block', boxSizing: 'border-box',
                      width: '100%', padding: '10px 20px',
                      backgroundColor: '#303030', color: '#fff',
                      borderRadius: '8px', textDecoration: 'none',
                      fontSize: '14px', fontWeight: 600, textAlign: 'center',
                    }}
                  >
                    {rank > currentRank ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </s-section>

      {/* Billing Info */}
      <s-section>
        <s-card>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '13px', color: '#6b7177', marginBottom: '8px' }}>
              Payments are processed through Shopify Billing. All charges will appear on your Shopify invoice.
            </div>
            <div style={{ fontSize: '13px', color: '#6b7177', marginBottom: '8px' }}>
              Switching plans does not reset the monthly order count. Used orders continue counting toward the new plan limit.
            </div>
            <div style={{ fontSize: '13px', color: '#6b7177' }}>
              Plans, upgrades and cancellations are handled by Shopify. Cancel anytime by switching to the Free plan or uninstalling the app.
            </div>
          </div>
        </s-card>
      </s-section>
    </s-page>
  );
}
