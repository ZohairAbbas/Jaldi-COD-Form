export default function FormModeSelector({ settings, onUpdate }) {
  const handleModeChange = (mode) => {
    onUpdate({ formMode: mode });
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form Deployment Mode</s-heading>
      <s-paragraph>
        Choose how your COD form appears on your storefront. Select either popup or embedded mode.
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
                Form appears as a modal popup when customers click the "Buy with COD" button.
                The button can be placed manually or will appear automatically at the end of product/cart sections.
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
                Form is embedded directly on the page without a button.
                The form can be placed manually or will appear automatically at the end of product/cart sections.
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
      </s-stack>

      {/* Current Status */}
      <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
        <s-stack direction="block" gap="tight">
          <s-text variant="heading-sm">Current Configuration</s-text>
          <s-badge tone="success">
            Mode: {settings.formMode === "popup" ? "Popup" : "Embedded"}
          </s-badge>
        </s-stack>
      </s-box>
    </s-stack>
  );
}
