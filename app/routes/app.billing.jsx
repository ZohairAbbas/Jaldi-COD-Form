/**
 * Billing Page
 *
 * Manage subscription, view plans, and handle billing
 */

import { useLoaderData, Form, useActionData } from 'react-router';
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

  // Get or create customer in Mantle
  let customer = null;
  try {
    customer = await getOrCreateCustomer(shop, session.accessToken);
  } catch (error) {
    console.error('Failed to get Mantle customer:', error);
  }

  // Get subscription details
  const subscription = await getSubscription(shop.id);

  // Get available plans
  const plans = await getPlans();

  // Track page view
  trackServerEvent(shop.shopifyDomain, 'Billing Page Viewed', {
    has_subscription: !!subscription,
    subscription_status: subscription?.status,
  });

  return {
    shop: {
      id: shop.id,
      domain: shop.shopifyDomain,
    },
    subscription,
    customer,
    plans,
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

      const subscription = await subscribeToPlan(
        shop,
        planId,
        session.accessToken
      );

      // Track subscription event
      trackServerEvent(shop.shopifyDomain, BILLING_EVENTS.SUBSCRIPTION_STARTED, {
        plan_id: planId,
        plan_name: subscription.planName,
      });

      return { success: true, subscription };
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
  const { shop, subscription, customer, plans } = useLoaderData();
  const actionData = useActionData();

  const hasActiveSubscription =
    subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    !subscription.cancelAtPeriodEnd;

  return (
    <s-page heading="Billing & Subscription">
      {/* Success/Error Messages */}
      {actionData?.success && (
        <s-banner status="success" style={{ marginBottom: '16px' }}>
          {actionData.cancelled
            ? 'Subscription cancelled successfully'
            : 'Subscription updated successfully'}
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
                    ${plan.price}
                    {plan.interval && (
                      <s-text variant="body-sm">/{plan.interval}</s-text>
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
