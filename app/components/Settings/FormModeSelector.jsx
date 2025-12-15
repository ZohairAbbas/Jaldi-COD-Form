export default function FormModeSelector({ settings, onUpdate }) {
  const handleModeChange = (mode) => {
    const updates = {
      formMode: mode,
      enablePopup: mode === "popup" || mode === "both",
      enableEmbedded: mode === "embedded" || mode === "both",
    };
    onUpdate(updates);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form Deployment Mode</s-heading>
      <s-paragraph>
        Choose how your COD form appears on your storefront. You can enable
        popup mode, embedded mode, or both.
      </s-paragraph>

      <s-stack direction="block" gap="base">
        {/* Popup Mode */}
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background={settings.formMode === "popup" ? "primary" : "surface"}
          style={{ cursor: "pointer" }}
          onClick={() => handleModeChange("popup")}
        >
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Popup Mode</s-text>
              <s-text variant="body-sm">
                Form appears as a modal popup when customers click the "Buy with
                COD" button. Ideal for product pages.
              </s-text>
            </s-stack>
            <input
              type="radio"
              name="formMode"
              checked={settings.formMode === "popup"}
              onChange={() => handleModeChange("popup")}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>
        </s-box>

        {/* Embedded Mode */}
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background={settings.formMode === "embedded" ? "primary" : "surface"}
          style={{ cursor: "pointer" }}
          onClick={() => handleModeChange("embedded")}
        >
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Embedded Mode</s-text>
              <s-text variant="body-sm">
                Form is embedded directly on the page. Perfect for dedicated
                checkout pages or landing pages.
              </s-text>
            </s-stack>
            <input
              type="radio"
              name="formMode"
              checked={settings.formMode === "embedded"}
              onChange={() => handleModeChange("embedded")}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>
        </s-box>

        {/* Both Modes */}
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background={settings.formMode === "both" ? "primary" : "surface"}
          style={{ cursor: "pointer" }}
          onClick={() => handleModeChange("both")}
        >
          <s-stack direction="inline" gap="base" align="space-between">
            <s-stack direction="block" gap="tight">
              <s-text variant="heading-sm">Both Modes</s-text>
              <s-text variant="body-sm">
                Enable both popup and embedded modes. Use popup on product pages
                and embedded on checkout pages.
              </s-text>
            </s-stack>
            <input
              type="radio"
              name="formMode"
              checked={settings.formMode === "both"}
              onChange={() => handleModeChange("both")}
              style={{ width: "20px", height: "20px" }}
            />
          </s-stack>
        </s-box>
      </s-stack>

      {/* Current Status */}
      <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
        <s-stack direction="block" gap="tight">
          <s-text variant="heading-sm">Current Configuration</s-text>
          <s-stack direction="inline" gap="base">
            <s-badge tone={settings.enablePopup ? "success" : "subdued"}>
              Popup: {settings.enablePopup ? "Enabled" : "Disabled"}
            </s-badge>
            <s-badge tone={settings.enableEmbedded ? "success" : "subdued"}>
              Embedded: {settings.enableEmbedded ? "Enabled" : "Disabled"}
            </s-badge>
          </s-stack>
        </s-stack>
      </s-box>
    </s-stack>
  );
}
