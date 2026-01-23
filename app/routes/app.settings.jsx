import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import FormModeSelector from "../components/Settings/FormModeSelector";
import ButtonCustomizer from "../components/Settings/ButtonCustomizer";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return {
    settings: shop.settings,
  };
};

export default function Settings() {
  const { settings: initialSettings } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);

  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);

  const handleUpdate = (updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        shopify.toast.show("Settings saved successfully!");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      shopify.toast.show("Error saving settings", { isError: true });
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Attach event listener to save button (web components don't support React's onClick)
  useEffect(() => {
    const button = saveButtonRef.current;
    if (button) {
      button.addEventListener("click", handleSave);
      return () => {
        button.removeEventListener("click", handleSave);
      };
    }
  }, [handleSave]);

  return (
    <s-page heading="Settings">
      <s-button
        ref={saveButtonRef}
        slot="primary-action"
        {...(isSaving ? { loading: true } : {})}
        variant="primary"
      >
        Save Settings
      </s-button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left Column - Form Mode */}
        <div>
          <s-section>
            <FormModeSelector settings={settings} onUpdate={handleUpdate} />
          </s-section>
        </div>

        {/* Right Column - Button Customization */}
        <div>
          <s-section>
            <ButtonCustomizer settings={settings} onUpdate={handleUpdate} />
          </s-section>
        </div>
      </div>

      <s-section heading="Setup Instructions">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            After configuring your settings, follow these steps to enable the COD
            form on your storefront:
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">For Popup Mode:</s-text>
              <s-unordered-list>
                <s-list-item>
                  Go to your Shopify theme editor
                </s-list-item>
                <s-list-item>
                  Enable the "Jaldi COD Form - Popup" app embed
                </s-list-item>
                <s-list-item>
                  The sticky button will appear on all product pages
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">For Embedded Mode:</s-text>
              <s-unordered-list>
                <s-list-item>
                  Go to your Shopify theme editor
                </s-list-item>
                <s-list-item>
                  Add the "Jaldi COD Form" app block to your desired page
                </s-list-item>
                <s-list-item>
                  The form will be embedded directly on the page
                </s-list-item>
              </s-unordered-list>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
