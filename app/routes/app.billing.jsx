/**
 * Billing Page
 *
 * Manage subscription, view plans, and handle billing
 */

import { useLoaderData, Form, useActionData, redirect } from 'react-router';
import { useEffect } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticate } from '../shopify.server';
import { getOrCreateShop } from '../lib/db.server';
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

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  // Check if redirected back from Shopify charge approval
  const url = new URL(request.url);
  const chargeApproved = url.searchParams.get('charge_approved') === 'true';

  if (chargeApproved) {
    console.log('[Billing] Charge approved, syncing subscription status');
    // Sync subscription status after charge approval
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
    plans,
    chargeApproved,
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
        // Return the URL for client-side redirect using App Bridge
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

      // Track cancellation
      trackServerEvent(
        shop.shopifyDomain,
        BILLING_EVENTS.SUBSCRIPTION_CANCELLED,
        {
          immediately,
        }
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
  const { shop, subscription, customer, plans, chargeApproved } = useLoaderData();
  const actionData = useActionData();
  const app = useAppBridge();

  const hasActiveSubscription =
    subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd;

  // Handle redirect to Shopify charge approval page
  useEffect(() => {
    if (actionData?.confirmationUrl) {
      console.log('[Billing] Redirecting to confirmation URL:', actionData.confirmationUrl);
      // Redirect the entire page to the Shopify charge approval URL
      // Using window.top.location to break out of iframe if needed
      if (window.top) {
        window.top.location.href = actionData.confirmationUrl;
      } else {
        window.location.href = actionData.confirmationUrl;
      }
    }
  }, [actionData]);

  return (
    <s-page heading="Billing & Subscription">
      {/* Success/Error Messages */}
      {chargeApproved && (
        <s-banner status="success" style={{ marginBottom: '16px' }}>
          🎉 Subscription charge approved successfully! Your plan is now active.
        </s-banner>
      )}

      {actionData?.success && !actionData?.confirmationUrl && !chargeApproved && (
        <s-banner status="success" style={{ marginBottom: '16px' }}>
          {actionData.cancelled
            ? 'Subscription cancelled successfully'
            : 'Subscription updated successfully'}
        </s-banner>
      )}

      {actionData?.confirmationUrl && (
        <s-banner status="info" style={{ marginBottom: '16px' }}>
          Redirecting to Shopify to approve the subscription charge...
        </s-banner>
      )}

      {actionData?.error && (
        <s-banner status="critical" style={{ marginBottom: '16px' }}>
          Error: {actionData.error}
        </s-banner>
      )}

      {/* Current Subscription Section */}
      <s-section heading="Current Subscription">
        {subscription ? (
          <s-box
            padding="large"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" align="space-between">
                <div>
                  <s-text variant="heading-lg">
                    {subscription.planName || 'No Plan'}
                  </s-text>
                  <s-text variant="body-sm" tone="subdued">
                    Status:{' '}
                    <s-badge
                      tone={
                        subscription.status === 'active'
                          ? 'success'
                          : subscription.status === 'trialing'
                          ? 'info'
                          : 'critical'
                      }
                    >
                      {subscription.status}
                    </s-badge>
                  </s-text>
                </div>

                <Form method="post">
                  <input type="hidden" name="action" value="sync" />
                  <s-button variant="tertiary" type="submit">
                    Sync Status
                  </s-button>
                </Form>
              </s-stack>

              {subscription.trialEndsAt && subscription.status === 'trialing' && (
                <s-text>
                  Trial ends:{' '}
                  {new Date(subscription.trialEndsAt).toLocaleDateString()}
                </s-text>
              )}

              {subscription.currentPeriodEnd && subscription.status === 'active' && (
                <s-text>
                  Next billing date:{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </s-text>
              )}

              {subscription.cancelAtPeriodEnd && (
                <s-text tone="critical">
                  Subscription will cancel on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </s-text>
              )}

              {hasActiveSubscription && (
                <Form method="post">
                  <input type="hidden" name="action" value="cancel" />
                  <input type="hidden" name="immediately" value="false" />
                  <s-button variant="primary" tone="critical" type="submit">
                    Cancel Subscription
                  </s-button>
                </Form>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="large" style={{ textAlign: 'center' }}>
            <s-text tone="subdued">No active subscription</s-text>
          </s-box>
        )}
      </s-section>

      {/* Available Plans */}
      {plans && plans.length > 0 && (
        <s-section heading="Available Plans" style={{ marginTop: '24px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {plans.map((plan) => (
              <s-box
                key={plan.id}
                padding="large"
                borderWidth="base"
                borderRadius="base"
                background={
                  subscription?.planId === plan.id ? 'success' : 'subdued'
                }
              >
                <s-stack direction="block" gap="base">
                  <s-text variant="heading-lg">{plan.name}</s-text>

                  {plan.description && (
                    <s-text variant="body-sm" tone="subdued">
                      {plan.description}
                    </s-text>
                  )}

                  <s-text variant="heading-xl">
                    ${plan.presentmentAmount || plan.price || 0}
                    {plan.interval && (
                      <s-text variant="body-sm">
                        /{plan.interval === 'EVERY_30_DAYS' ? 'month' : plan.recurringInterval || 'month'}
                      </s-text>
                    )}
                  </s-text>

                  {plan.features && plan.features.length > 0 && (
                    <s-unordered-list>
                      {plan.features.map((feature, idx) => (
                        <s-list-item key={idx}>{feature}</s-list-item>
                      ))}
                    </s-unordered-list>
                  )}

                  {subscription?.planId !== plan.id && (
                    <Form method="post">
                      <input type="hidden" name="action" value="subscribe" />
                      <input type="hidden" name="planId" value={plan.id} />
                      <s-button variant="primary" type="submit">
                        {subscription ? 'Switch to this plan' : 'Subscribe'}
                      </s-button>
                    </Form>
                  )}

                  {subscription?.planId === plan.id && (
                    <s-badge tone="success">Current Plan</s-badge>
                  )}
                </s-stack>
              </s-box>
            ))}
          </div>
        </s-section>
      )}

      {/* Billing Info */}
      <s-section heading="Billing Information" style={{ marginTop: '24px' }}>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text variant="body-sm">
              Billing is securely managed through Shopify. All charges will
              appear on your Shopify invoice.
            </s-text>

            {customer && (
              <s-text variant="body-sm" tone="subdued">
                Customer ID: {customer.id}
              </s-text>
            )}
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}
