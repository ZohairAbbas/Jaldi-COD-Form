/**
 * App-wide banner for integrations the merchant must reconnect themselves.
 *
 * Renders on every admin page, alongside BillingBanner, because the failure it
 * reports is one a merchant will otherwise never see: the Google Sheets sync
 * runs in the background, and its status lives on the Settings page. A merchant
 * who does not open Settings has no way of learning that their orders stopped
 * importing — which is exactly how one integration stayed broken for 30 days.
 *
 * Deliberately not dismissible. The condition is real and unresolved, and it
 * disappears by itself the moment the merchant reconnects. A dismiss control
 * would restore the silence this exists to break.
 *
 * The server only populates `sheetsAlert` once a failure is sustained (no
 * successful sync for 24 hours), so a transient Google outage never reaches
 * this component.
 */
export default function IntegrationAlertBanner({ sheetsAlert }) {
  if (!sheetsAlert) return null;

  const lastGood = sheetsAlert.lastSuccessAt
    ? new Date(sheetsAlert.lastSuccessAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <s-banner tone="warning" style={{ marginBottom: "16px" }}>
      <s-stack direction="block" gap="tight">
        <s-text>
          <strong>Google Sheets has stopped importing your orders.</strong>{" "}
          {lastGood
            ? `The last successful import was on ${lastGood}.`
            : "No orders have been imported recently."}{" "}
          Google’s access permission has expired or been revoked, so reconnecting
          your account is needed to start importing again.
        </s-text>
        <s-text variant="body-sm">
          Your spreadsheet and column setup are kept — reconnecting does not
          reset them.
        </s-text>
        <div>
          <s-link href="/app/settings">Reconnect in Settings</s-link>
        </div>
      </s-stack>
    </s-banner>
  );
}
