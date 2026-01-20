import { useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return {};
};

export default function SalesBoosterLanding() {
  const navigate = useNavigate();

  // Refs for s-button elements
  const configureButtonRef = useRef(null);
  const watchDemoButtonRef = useRef(null);
  const configureTickButtonRef = useRef(null);

  const handleConfigureUpsells = useCallback(() => {
    navigate("/app/sales-booster/one-click");
  }, [navigate]);

  const handleConfigureTickUpsells = useCallback(() => {
    navigate("/app/sales-booster/one-tick");
  }, [navigate]);

  const handleWatchDemo = useCallback(() => {
    // TODO: Add demo video URL or modal
    window.open("https://www.youtube.com/watch?v=demo", "_blank");
  }, []);

  // Attach event listeners to buttons
  useEffect(() => {
    const configureBtn = configureButtonRef.current;
    const demoBtn = watchDemoButtonRef.current;
    const configureTickBtn = configureTickButtonRef.current;

    if (configureBtn) {
      configureBtn.addEventListener("click", handleConfigureUpsells);
    }
    if (demoBtn) {
      demoBtn.addEventListener("click", handleWatchDemo);
    }
    if (configureTickBtn) {
      configureTickBtn.addEventListener("click", handleConfigureTickUpsells);
    }

    return () => {
      if (configureBtn) {
        configureBtn.removeEventListener("click", handleConfigureUpsells);
      }
      if (demoBtn) {
        demoBtn.removeEventListener("click", handleWatchDemo);
      }
      if (configureTickBtn) {
        configureTickBtn.removeEventListener("click", handleConfigureTickUpsells);
      }
    };
  }, [handleConfigureUpsells, handleWatchDemo, handleConfigureTickUpsells]);

  return (
    <s-page heading="Upsells & Downsells">
      <s-section>
        <s-box padding="loose" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="loose">
            {/* Header with Icon */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <s-stack direction="block" gap="base">
                  {/* Title with Icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "24px" }}>🛒</span>
                    <s-text variant="heading-lg">One-Click Upsells</s-text>
                  </div>

                  {/* Description */}
                  <s-text variant="body-md">
                    These upsells will appear in a popup view before or after your customers buy on the COD form.
                    They can be used to upsell related products to your customers to increase your AOV.
                  </s-text>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <s-button
                      ref={configureButtonRef}
                      variant="primary"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        🛒 Configure One-Click Upsells
                      </span>
                    </s-button>

                    <s-button
                      ref={watchDemoButtonRef}
                      variant="secondary"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        ▶️ Watch demo
                      </span>
                    </s-button>
                  </div>
                </s-stack>
              </div>

              {/* Illustration/Icon on the right */}
              <div style={{
                width: "120px",
                height: "120px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9fafb",
                borderRadius: "12px",
                border: "2px solid #e5e7eb"
              }}>
                <span style={{ fontSize: "64px" }}>📊</span>
              </div>
            </div>
          </s-stack>
        </s-box>
      </s-section>

      {/* Additional Information Section */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-text variant="heading-md">Why Use One-Click Upsells?</s-text>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px"
          }}>
            {/* Feature Card 1 */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>💰</div>
                <s-text variant="heading-sm">Increase Average Order Value</s-text>
                <s-text variant="body-sm" tone="subdued">
                  Offer complementary products at the perfect moment to boost your revenue per customer
                </s-text>
              </s-stack>
            </s-box>

            {/* Feature Card 2 */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚡</div>
                <s-text variant="heading-sm">One-Click Purchase</s-text>
                <s-text variant="body-sm" tone="subdued">
                  Customers can add upsell products with a single click without re-entering information
                </s-text>
              </s-stack>
            </s-box>

            {/* Feature Card 3 */}
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎯</div>
                <s-text variant="heading-sm">Pre & Post-Purchase Options</s-text>
                <s-text variant="body-sm" tone="subdued">
                  Show upsells before checkout or after order completion for maximum flexibility
                </s-text>
              </s-stack>
            </s-box>
          </div>
        </s-stack>
      </s-section>

      {/* Getting Started Section */}
      <s-section>
        <s-box padding="base" borderRadius="base" background="info">
          <s-stack direction="inline" gap="base" align="start">
            <span style={{ fontSize: "20px" }}>💡</span>
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Getting Started</s-text>
              <s-text variant="body-sm">
                Click "Configure One-Click Upsells" to create your first upsell campaign.
                You can set up both pre-purchase and post-purchase upsells, customize their appearance,
                and track their performance with built-in analytics.
              </s-text>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* One-Tick Upsells Section */}
      <s-section>
        <s-box padding="loose" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="loose">
            {/* Header with Icon */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <s-stack direction="block" gap="base">
                  {/* Title with Icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "24px" }}>✓</span>
                    <s-text variant="heading-lg">One-Tick Upsells</s-text>
                  </div>

                  {/* Description */}
                  <s-text variant="body-md">
                    These upsells will appear inside your COD form and you can use them to increase your AOV with add-ons.
                    Examples: <strong>Shipping protection, Gift wrapping, Extended warranty</strong>
                  </s-text>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <s-button
                      ref={configureTickButtonRef}
                      variant="primary"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        ✓ Configure One-Tick Upsells
                      </span>
                    </s-button>
                  </div>
                </s-stack>
              </div>

              {/* Illustration/Icon on the right */}
              <div style={{
                width: "120px",
                height: "120px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9fafb",
                borderRadius: "12px",
                border: "2px solid #e5e7eb"
              }}>
                <span style={{ fontSize: "64px" }}>☑️</span>
              </div>
            </div>
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
