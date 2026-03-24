/**
 * Billing Banner Component
 *
 * Displays subscription status and prompts for action
 * Shows trial information, expired subscriptions, usage warnings, etc.
 */

import { Link } from 'react-router';

export default function BillingBanner({ subscription, planUsage }) {
  // Order usage warnings (checked first - most actionable)
  if (planUsage && planUsage.usageStatus === 'exceeded') {
    return (
      <s-banner
        status="critical"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          You have used <strong>{planUsage.monthlyOrderCount} / {planUsage.planLimit} orders</strong> this month.
          You have exceeded your plan limit.{' '}
          <Link to="/app/billing">
            <s-link>Upgrade your plan</s-link>
          </Link>{' '}
          for more orders.
        </s-text>
      </s-banner>
    );
  }

  if (planUsage && planUsage.usageStatus === 'warning') {
    return (
      <s-banner
        status="warning"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          You have used <strong>{planUsage.monthlyOrderCount} / {planUsage.planLimit} orders</strong> this month
          ({planUsage.usagePercentage}%). You are approaching your plan limit.{' '}
          <Link to="/app/billing">
            <s-link>Upgrade your plan</s-link>
          </Link>{' '}
          to avoid any disruptions.
        </s-text>
      </s-banner>
    );
  }

  // Subscription status warnings
  if (!subscription) return null;

  const { status, trialEndsAt, planName, cancelAtPeriodEnd, currentPeriodEnd } =
    subscription;

  // Active subscription with no issues
  if (status === 'active' && !cancelAtPeriodEnd) {
    return null;
  }

  // Trial active
  if (status === 'trialing' && trialEndsAt) {
    const daysLeft = Math.ceil(
      (new Date(trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)
    );

    if (daysLeft > 0) {
      return (
        <s-banner
          status="info"
          style={{ marginBottom: '16px' }}
        >
          <s-text>
            Your free trial ends in <strong>{daysLeft} days</strong>.{' '}
            <Link to="/app/billing">
              <s-link>Choose a plan</s-link>
            </Link>{' '}
            to continue using all features after the trial.
          </s-text>
        </s-banner>
      );
    }
  }

  // Trial expired or subscription expired
  if (status === 'expired' || (status === 'trialing' && new Date() > new Date(trialEndsAt))) {
    return (
      <s-banner
        status="critical"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          Your subscription has expired. Some features may be limited.{' '}
          <Link to="/app/billing">
            <s-link>Subscribe now</s-link>
          </Link>{' '}
          to restore full access.
        </s-text>
      </s-banner>
    );
  }

  // Subscription cancelled but still active until period end
  if (cancelAtPeriodEnd && currentPeriodEnd) {
    const daysLeft = Math.ceil(
      (new Date(currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return (
      <s-banner
        status="warning"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          Your subscription will end in <strong>{daysLeft} days</strong>.{' '}
          <Link to="/app/billing">
            <s-link>Reactivate subscription</s-link>
          </Link>{' '}
          to continue using the app.
        </s-text>
      </s-banner>
    );
  }

  // Cancelled
  if (status === 'cancelled') {
    return (
      <s-banner
        status="critical"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          Your subscription has been cancelled.{' '}
          <Link to="/app/billing">
            <s-link>Subscribe again</s-link>
          </Link>{' '}
          to restore access.
        </s-text>
      </s-banner>
    );
  }

  // Payment failed or past due
  if (status === 'past_due') {
    return (
      <s-banner
        status="critical"
        style={{ marginBottom: '16px' }}
      >
        <s-text>
          Your payment failed. Please{' '}
          <Link to="/app/billing">
            <s-link>update your payment method</s-link>
          </Link>{' '}
          to avoid service interruption.
        </s-text>
      </s-banner>
    );
  }

  return null;
}
