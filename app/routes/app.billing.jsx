/**
 * Billing Page
 *
 * Manage subscription, view plans, and handle billing
 */

import { useLoaderData, Form, useActionData, redirect, useNavigation } from 'react-router';
import { useEffect } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticate } from '../shopify.server';
import { getOrCreateShop, getMonthlyOrderCount } from '../lib/db.server';
import {
  getOrCreateCustomer,
  getSubscription,
  getPlans,
  subscribeToPlan,
  cancelSubscription,
  syncSubscriptionStatus,
} from '../lib/mantle.server';
import { trackServerEvent } from '../lib/mixpanel.server';
import { BILLING_EVENTS } from '../lib/analytics-events';
import { PLAN_LIMITS, getPlanLimit, getUsagePercentage, getUsageStatus, getEffectivePlanName } from '../lib/plan-limits';

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Check if redirected back from Shopify charge approval
  const url = new URL(request.url);
  const chargeApproved = url.searchParams.get('charge_approved') === 'true';

  if (chargeApproved) {
    console.log('[Billing] Charge approved, syncing subscription status');
    try {
      await syncSubscriptionStatus(shop, session.accessToken);
    } catch (error) {
      console.error('Failed to sync subscription after charge approval:', error);
    }
  }

  // Get or create customer in Mantle
  let customer = null;
  try {
    customer = await getOrCreateCustomer(shop, session.accessToken);
  } catch (error) {
    console.error('Failed to get Mantle customer:', error);
  }

  // Get subscription details
  const subscription = await getSubscription(shop.id);

  // Get available plans (pass shop and accessToken)
  const plans = await getPlans(shop, session.accessToken);

  // Get monthly usage
  const monthlyOrderCount = await getMonthlyOrderCount(shop.id);
  const currentPlanName = getEffectivePlanName(subscription);
  const planLimit = getPlanLimit(currentPlanName);

  // Track page view
  trackServerEvent(shop.shopifyDomain, 'Billing Page Viewed', {
    has_subscription: !!subscription,
    subscription_status: subscription?.status,
    charge_approved: chargeApproved,
  });

  return {
    shop: {
      id: shop.id,
      domain: shop.shopifyDomain,
    },
    subscription,
    customer,
    plans: (plans || []).sort((a, b) => (a.price || 0) - (b.price || 0)),
    chargeApproved,
    monthlyOrderCount,
    currentPlanName,
    planLimit,
    usagePercentage: getUsagePercentage(monthlyOrderCount, planLimit),
    usageStatus: getUsageStatus(monthlyOrderCount, planLimit),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.formData();
  const action = formData.get('action');

  try {
    if (action === 'subscribe') {
      const planId = formData.get('planId');

      const result = await subscribeToPlan(
        shop,
        planId,
        session.accessToken
      );

      // For Flex Billing, always expect a confirmation URL
      if (result.confirmationUrl) {
        return {
          success: true,
          confirmationUrl: result.confirmationUrl,
          requiresApproval: true
        };
      }

      // Track subscription event (for non-flex plans)
      trackServerEvent(shop.shopifyDomain, BILLING_EVENTS.SUBSCRIPTION_STARTED, {
        plan_id: planId,
        plan_name: result.planName || result.subscription?.planName,
      });

      return { success: true, subscription: result };
    }

    if (action === 'cancel') {
      const immediately = formData.get('immediately') === 'true';

      await cancelSubscription(shop, session.accessToken, immediately);

      trackServerEvent(
        shop.shopifyDomain,
        BILLING_EVENTS.SUBSCRIPTION_CANCELLED,
        { immediately }
      );

      return { success: true, cancelled: true };
    }

    if (action === 'sync') {
      const subscription = await syncSubscriptionStatus(shop, session.accessToken);
      return { success: true, subscription };
    }

    return { success: false, error: 'Invalid action' };
  } catch (error) {
    console.error('Billing action failed:', error);
    return { success: false, error: error.message };
  }
};

export default function BillingPage() {
  const {
    shop, subscription, customer, plans, chargeApproved,
    monthlyOrderCount, currentPlanName, planLimit, usagePercentage, usageStatus,
  } = useLoaderData();
  const actionData = useActionData();
  const app = useAppBridge();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === 'submitting';
  const submittingAction = isSubmitting ? navigation.formData?.get('action') : null;
  const submittingPlanId = isSubmitting ? navigation.formData?.get('planId') : null;

  const hasActiveSubscription =
    subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd;

  // Handle redirect to Shopify charge approval page
  useEffect(() => {
    if (actionData?.confirmationUrl) {
      console.log('[Billing] Redirecting to confirmation URL:', actionData.confirmationUrl);
      if (window.top) {
        window.top.location.href = actionData.confirmationUrl;
      } else {
        window.location.href = actionData.confirmationUrl;
      }
    }
  }, [actionData]);

  // Get features for a plan - prefer local config, fall back to Mantle
  const getPlanDisplayFeatures = (plan) => {
    const localFeatures = PLAN_LIMITS[plan.name]?.features || [];
    return localFeatures.length > 0 ? localFeatures : (plan.features || []);
  };

  const isCurrentPlan = (plan) => subscription?.planId === plan.id;

  const progressBarColor =
    usageStatus === 'exceeded' ? '#d72c0d' :
    usageStatus === 'warning' ? '#ffc453' : '#2a9d5c';

  return (
    <s-page heading="Billing & Subscription">
      {/* Success/Error Messages */}
      {chargeApproved && (
        <s-banner tone="success" style={{ marginBottom: '16px' }}>
          Subscription charge approved successfully! Your plan is now active.
        </s-banner>
      )}

      {actionData?.success && !actionData?.confirmationUrl && !chargeApproved && (
        <s-banner tone="success" style={{ marginBottom: '16px' }}>
          {actionData.cancelled
            ? 'Subscription cancelled successfully'
            : 'Subscription updated successfully'}
        </s-banner>
      )}

      {actionData?.confirmationUrl && (
        <s-banner tone="info" style={{ marginBottom: '16px' }}>
          Redirecting to Shopify to approve the subscription charge...
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
                  {subscription && (
                    <s-badge tone={
                      subscription.status === 'active' ? 'success' :
                      subscription.status === 'trialing' ? 'info' : 'critical'
                    }>
                      {subscription.status}
                    </s-badge>
                  )}
                </div>
                {subscription?.trialEndsAt && subscription.status === 'trialing' && (
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

            {/* Sync + Cancel row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e3e3e3' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Form method="post">
                  <input type="hidden" name="action" value="sync" />
                  <button type="submit" disabled={submittingAction === 'sync'} style={{
                    backgroundColor: 'white', color: '#303030',
                    border: '1px solid #c9cccf', padding: '6px 12px',
                    borderRadius: '6px', fontSize: '13px',
                    cursor: submittingAction === 'sync' ? 'wait' : 'pointer',
                    opacity: submittingAction === 'sync' ? 0.7 : 1,
                  }}>
                    {submittingAction === 'sync' ? 'Syncing...' : 'Sync Status'}
                  </button>
                </Form>
              </div>
              {hasActiveSubscription && (
                <Form method="post">
                  <input type="hidden" name="action" value="cancel" />
                  <input type="hidden" name="immediately" value="false" />
                  <button type="submit" disabled={submittingAction === 'cancel'} style={{
                    backgroundColor: 'white', color: '#d72c0d',
                    border: '1px solid #d72c0d', padding: '6px 12px',
                    borderRadius: '6px', fontSize: '13px',
                    cursor: submittingAction === 'cancel' ? 'wait' : 'pointer',
                    opacity: submittingAction === 'cancel' ? 0.7 : 1,
                  }}>
                    {submittingAction === 'cancel' ? 'Cancelling...' : 'Cancel Subscription'}
                  </button>
                </Form>
              )}
            </div>
          </div>
        </s-card>
      </s-section>

      {/* Plan Cards */}
      {plans && plans.length > 0 && (
        <s-section>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '16px', fontWeight: 600 }}>Available Plans</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`,
            gap: '16px',
          }}>
            {plans.map((plan) => {
              const isCurrent = isCurrentPlan(plan);
              const features = getPlanDisplayFeatures(plan);
              const orderLimit = PLAN_LIMITS[plan.name]?.monthlyOrderLimit;

              return (
                <div
                  key={plan.id}
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
                      ${plan.presentmentAmount || plan.price || 0}
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
                    <Form method="post">
                      <input type="hidden" name="action" value="subscribe" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <button type="submit" disabled={submittingAction === 'subscribe' && submittingPlanId === plan.id} style={{
                        width: '100%', padding: '10px 20px',
                        backgroundColor: (submittingAction === 'subscribe' && submittingPlanId === plan.id) ? '#505050' : '#303030',
                        color: '#fff',
                        border: 'none', borderRadius: '8px',
                        fontSize: '14px', fontWeight: 600,
                        cursor: (submittingAction === 'subscribe' && submittingPlanId === plan.id) ? 'wait' : 'pointer',
                        opacity: (submittingAction === 'subscribe' && submittingPlanId === plan.id) ? 0.7 : 1,
                      }}>
                        {(submittingAction === 'subscribe' && submittingPlanId === plan.id) ? 'Processing...' : 'Select plan'}
                      </button>
                    </Form>
                  )}
                </div>
              );
            })}
          </div>
        </s-section>
      )}

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
              Cancel anytime by switching to the free plan or uninstalling the app.
            </div>
            {customer && (
              <div style={{ fontSize: '12px', color: '#8c9196', marginTop: '12px' }}>
                Customer ID: {customer.id}
              </div>
            )}
          </div>
        </s-card>
      </s-section>
    </s-page>
  );
}
