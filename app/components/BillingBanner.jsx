/**
 * Billing Banner Component
 *
 * Displays subscription status and prompts for action
 * Shows trial information, expired subscriptions, usage warnings, etc.
 */

import { Link } from 'react-router';

const daysUntil = (date) =>
  Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));

const pluralDays = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

export default function BillingBanner({ subscription, planUsage, isNavigatingToBilling }) {
  // Determine which banner would show (to get the correct status tone for loading state)
  const getBannerStatus = () => {
    if (planUsage?.usageStatus === 'exceeded') return 'critical';
    if (planUsage?.usageStatus === 'warning') return 'warning';
    if (!subscription) return null;
    const { status, trialEndsAt, cancelAtPeriodEnd, currentPeriodEnd } = subscription;
    if (status === 'active' && !cancelAtPeriodEnd) return null;
    if (status === 'trialing' && trialEndsAt && daysUntil(trialEndsAt) > 0) return 'info';
    if (status === 'expired' || (status === 'trialing' && new Date() > new Date(trialEndsAt))) return 'critical';
    if (status === 'cancelled') return 'critical';
    if (status === 'past_due') return 'critical';
    // Kept below the terminal states above: a subscription that is cancelling
    // but still inside its paid period retains full access, so it warns rather
    // than reading as critical.
    if (cancelAtPeriodEnd && currentPeriodEnd && daysUntil(currentPeriodEnd) > 0) return 'warning';
    return null;
  };

  const bannerStatus = getBannerStatus();

  // While navigating to billing, replace entire banner content with loading message
  if (isNavigatingToBilling && bannerStatus) {
    return (
      <s-banner tone={bannerStatus} style={{ marginBottom: '16px' }}>
        <s-text>Redirecting to billing page...</s-text>
      </s-banner>
    );
  }

  // Order usage warnings (checked first - most actionable)
  if (planUsage && planUsage.usageStatus === 'exceeded') {
    return (
      <s-banner
        tone="critical"
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
        tone="warning"
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
    const daysLeft = daysUntil(trialEndsAt);

    if (daysLeft > 0) {
      return (
        <s-banner
          tone="info"
          style={{ marginBottom: '16px' }}
        >
          <s-text>
            Your free trial ends in <strong>{pluralDays(daysLeft)}</strong>.{' '}
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
        tone="critical"
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
    const daysLeft = daysUntil(currentPeriodEnd);

    if (daysLeft > 0) {
      return (
        <s-banner
          tone="warning"
          style={{ marginBottom: '16px' }}
        >
          <s-text>
            Your subscription is scheduled to end in <strong>{pluralDays(daysLeft)}</strong>.
            You keep full access until then.{' '}
            <Link to="/app/billing">
              <s-link>Reactivate your plan</s-link>
            </Link>{' '}
            to stay subscribed.
          </s-text>
        </s-banner>
      );
    }
  }

  // Cancelled
  if (status === 'cancelled') {
    return (
      <s-banner
        tone="critical"
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
        tone="critical"
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
