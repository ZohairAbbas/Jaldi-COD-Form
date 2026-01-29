export default function CardButtonCustomizer({ settings, onUpdate }) {
  const handleChange = (key, value) => {
    onUpdate({ [key]: value });
  };

  const inputStyle = {
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    width: "100%",
  };

  return (
    <s-stack direction="block" gap="loose">
      <s-text variant="heading-sm">Customize Pay with Card Button</s-text>

      {/* Button Text */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Button Text</s-text>
        <input
          type="text"
          value={settings.cardButtonText || "PAY WITH CARD"}
          onChange={(e) => handleChange("cardButtonText", e.target.value)}
          placeholder="PAY WITH CARD"
          style={inputStyle}
        />
      </s-stack>

      {/* Background Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Background Color</s-text>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="color"
            value={settings.cardButtonBgColor || "#FFFFFF"}
            onChange={(e) => handleChange("cardButtonBgColor", e.target.value)}
            style={{ width: "50px", height: "35px", cursor: "pointer" }}
          />
          <input
            type="text"
            value={settings.cardButtonBgColor || "#FFFFFF"}
            onChange={(e) => handleChange("cardButtonBgColor", e.target.value)}
            placeholder="#FFFFFF"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </s-stack>

      {/* Text Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Text Color</s-text>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="color"
            value={settings.cardButtonTextColor || "#000000"}
            onChange={(e) => handleChange("cardButtonTextColor", e.target.value)}
            style={{ width: "50px", height: "35px", cursor: "pointer" }}
          />
          <input
            type="text"
            value={settings.cardButtonTextColor || "#000000"}
            onChange={(e) => handleChange("cardButtonTextColor", e.target.value)}
            placeholder="#000000"
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      </s-stack>

      {/* Font Size */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Font Size: {settings.cardButtonFontSize || 14}px</s-text>
        <input
          type="range"
          min="12"
          max="20"
          value={settings.cardButtonFontSize || 14}
          onChange={(e) => handleChange("cardButtonFontSize", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </s-stack>
    </s-stack>
  );
}
