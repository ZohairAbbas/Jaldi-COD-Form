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
  const configureTickButtonRef = useRef(null);
  const configureDownsellButtonRef = useRef(null);
  const configureBundleButtonRef = useRef(null);

  const handleConfigureUpsells = useCallback(() => {
    navigate("/app/sales-booster/one-click");
  }, [navigate]);

  const handleConfigureTickUpsells = useCallback(() => {
    navigate("/app/sales-booster/one-tick");
  }, [navigate]);

  const handleConfigureDownsells = useCallback(() => {
    navigate("/app/sales-booster/downsell");
  }, [navigate]);

  const handleConfigureBundles = useCallback(() => {
    navigate("/app/sales-booster/bundle");
  }, [navigate]);

  // Attach event listeners to buttons
  useEffect(() => {
    const configureBtn = configureButtonRef.current;
    const configureTickBtn = configureTickButtonRef.current;
    const configureDownsellBtn = configureDownsellButtonRef.current;
    const configureBundleBtn = configureBundleButtonRef.current;

    if (configureBtn) {
      configureBtn.addEventListener("click", handleConfigureUpsells);
    }
    if (configureTickBtn) {
      configureTickBtn.addEventListener("click", handleConfigureTickUpsells);
    }
    if (configureDownsellBtn) {
      configureDownsellBtn.addEventListener("click", handleConfigureDownsells);
    }
    if (configureBundleBtn) {
      configureBundleBtn.addEventListener("click", handleConfigureBundles);
    }

    return () => {
      if (configureBtn) {
        configureBtn.removeEventListener("click", handleConfigureUpsells);
      }
      if (configureTickBtn) {
        configureTickBtn.removeEventListener("click", handleConfigureTickUpsells);
      }
      if (configureDownsellBtn) {
        configureDownsellBtn.removeEventListener("click", handleConfigureDownsells);
      }
      if (configureBundleBtn) {
        configureBundleBtn.removeEventListener("click", handleConfigureBundles);
      }
    };
  }, [handleConfigureUpsells, handleConfigureTickUpsells, handleConfigureDownsells, handleConfigureBundles]);

  return (
    <s-page heading="Upsells & Downsells">
      <s-section>
        <s-box padding="loose" borderRadius="base">
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
                borderRadius: "12px"
              }}>
                <span style={{ fontSize: "64px" }}>📊</span>
              </div>
            </div>
          </s-stack>
        </s-box>
      </s-section>

      {/* One-Tick Upsells Section */}
      <s-section>
        <s-box padding="loose" borderRadius="base">
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
                borderRadius: "12px"
              }}>
                <span style={{ fontSize: "64px" }}>☑️</span>
              </div>
            </div>
          </s-stack>
        </s-box>
      </s-section>

      {/* Downsells Section */}
      <s-section>
        <s-box padding="loose" borderRadius="base">
          <s-stack direction="block" gap="loose">
            {/* Header with Icon */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <s-stack direction="block" gap="base">
                  {/* Title with Icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "24px" }}>🛒</span>
                    <s-text variant="heading-lg">Downsells</s-text>
                  </div>

                  {/* Description */}
                  <s-text variant="body-md">
                    Downsells are popups that offer a discount to your customers to complete their order when they close the form.
                    You can use them to recover sales from customers who opened the form but then closed it.
                  </s-text>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <s-button
                      ref={configureDownsellButtonRef}
                      variant="primary"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        🛒 Configure Downsells
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
                borderRadius: "12px"
              }}>
                <span style={{ fontSize: "64px" }}>💸</span>
              </div>
            </div>
          </s-stack>
        </s-box>
      </s-section>
      {/* Bundle / Quantity Breaks Section */}
      <s-section>
        <s-box padding="loose" borderRadius="base">
          <s-stack direction="block" gap="loose">
            {/* Header with Icon */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <div style={{ flex: 1 }}>
                <s-stack direction="block" gap="base">
                  {/* Title with Icon */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "24px" }}>📦</span>
                    <s-text variant="heading-lg">Bundle / Quantity Breaks</s-text>
                  </div>

                  {/* Description */}
                  <s-text variant="body-md">
                    Create quantity break offers to encourage buying more with tiered pricing.
                    Examples: <strong>Buy 2 get 20% off, Buy 3 get 30% off</strong>
                  </s-text>

                  {/* Action Buttons */}
                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <s-button
                      ref={configureBundleButtonRef}
                      variant="primary"
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        📦 Configure Bundles
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
                borderRadius: "12px"
              }}>
                <span style={{ fontSize: "64px" }}>📦</span>
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
