export default function StyleCustomizer({ formConfig, onUpdate }) {
  const handleChange = (key, value) => {
    onUpdate({ ...formConfig, [key]: value });
  };

  const inputStyle = {
    width: "100%",
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form Styling</s-heading>
      <s-paragraph>Customize the appearance of your COD form.</s-paragraph>

      {/* Form Title */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Form Title</s-text>
        <input
          type="text"
          value={formConfig.formTitle}
          onChange={(e) => handleChange("formTitle", e.target.value)}
          style={inputStyle}
        />
      </s-stack>

      {/* Form Title Alignment */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Title Alignment</s-text>
        <div style={{ display: "flex", gap: "8px" }}>
          {["left", "center", "right"].map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => handleChange("formTitleAlign", align)}
              style={{
                flex: 1,
                padding: "8px",
                textTransform: "capitalize",
                borderRadius: "6px",
                border: (formConfig.formTitleAlign || "left") === align ? "2px solid #000" : "1px solid #d1d5db",
                backgroundColor: (formConfig.formTitleAlign || "left") === align ? "#f5f5f5" : "#fff",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: (formConfig.formTitleAlign || "left") === align ? "600" : "400",
              }}
            >
              {align}
            </button>
          ))}
        </div>
      </s-stack>

      {/* Text Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Text Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              formConfig.textColor.startsWith("rgba")
                ? "#000000"
                : formConfig.textColor
            }
            onChange={(e) => handleChange("textColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={formConfig.textColor}
            onChange={(e) => handleChange("textColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(0,0,0,1)"
          />
        </s-stack>
      </s-stack>

      {/* Background Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Background Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              formConfig.backgroundColor.startsWith("rgba")
                ? "#FFFFFF"
                : formConfig.backgroundColor
            }
            onChange={(e) => handleChange("backgroundColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={formConfig.backgroundColor}
            onChange={(e) => handleChange("backgroundColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(255,255,255,1)"
          />
        </s-stack>
      </s-stack>

      {/* Font Size */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Font Size: {formConfig.fontSize}px</s-text>
        <input
          type="range"
          min="12"
          max="24"
          value={formConfig.fontSize}
          onChange={(e) => handleChange("fontSize", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </s-stack>

      {/* Border Radius */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">
          Border Radius: {formConfig.borderRadius}px
        </s-text>
        <input
          type="range"
          min="0"
          max="20"
          value={formConfig.borderRadius}
          onChange={(e) =>
            handleChange("borderRadius", parseInt(e.target.value))
          }
          style={{ width: "100%" }}
        />
      </s-stack>

      {/* Border Width */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">
          Border Width: {formConfig.borderWidth}px
        </s-text>
        <input
          type="range"
          min="0"
          max="10"
          value={formConfig.borderWidth}
          onChange={(e) => handleChange("borderWidth", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </s-stack>

      {/* Border Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Border Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              formConfig.borderColor.startsWith("rgba")
                ? "#CCCCCC"
                : formConfig.borderColor
            }
            onChange={(e) => handleChange("borderColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={formConfig.borderColor}
            onChange={(e) => handleChange("borderColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(0,0,0,0.1)"
          />
        </s-stack>
      </s-stack>

      {/* Shadow Intensity */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">
          Shadow Intensity: {formConfig.shadowIntensity}
        </s-text>
        <input
          type="range"
          min="0"
          max="10"
          value={formConfig.shadowIntensity}
          onChange={(e) =>
            handleChange("shadowIntensity", parseInt(e.target.value))
          }
          style={{ width: "100%" }}
        />
      </s-stack>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #E1E3E5", margin: "8px 0" }} />

      <s-heading>Complete Order Button</s-heading>
      <s-paragraph>Customize the submit button at the bottom of the form.</s-paragraph>

      {/* Submit Button Background Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Background Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              (formConfig.submitButtonBgColor || "rgba(0,0,0,1)").startsWith("rgba")
                ? "#000000"
                : formConfig.submitButtonBgColor
            }
            onChange={(e) => handleChange("submitButtonBgColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={formConfig.submitButtonBgColor || "rgba(0,0,0,1)"}
            onChange={(e) => handleChange("submitButtonBgColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(0,0,0,1)"
          />
        </s-stack>
      </s-stack>

      {/* Submit Button Text Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Text Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              (formConfig.submitButtonTextColor || "rgba(255,255,255,1)").startsWith("rgba")
                ? "#FFFFFF"
                : formConfig.submitButtonTextColor
            }
            onChange={(e) => handleChange("submitButtonTextColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={formConfig.submitButtonTextColor || "rgba(255,255,255,1)"}
            onChange={(e) => handleChange("submitButtonTextColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(255,255,255,1)"
          />
        </s-stack>
      </s-stack>

      {/* Submit Button Font Size */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Font Size: {formConfig.submitButtonFontSize || 14}px</s-text>
        <input
          type="range"
          min="12"
          max="24"
          value={formConfig.submitButtonFontSize || 14}
          onChange={(e) => handleChange("submitButtonFontSize", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
      </s-stack>

      {/* Submit Button Icon */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Button Icon</s-text>
        <select
          value={formConfig.submitButtonIcon || "none"}
          onChange={(e) => handleChange("submitButtonIcon", e.target.value)}
          style={inputStyle}
        >
          <option value="none">No Icon</option>
          <option value="cart">Shopping Cart</option>
          <option value="truck">Delivery Truck</option>
          <option value="package">Package</option>
          <option value="cash">Cash</option>
        </select>
      </s-stack>
    </s-stack>
  );
}
