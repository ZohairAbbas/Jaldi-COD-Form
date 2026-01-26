export default function ButtonCustomizer({ settings, onUpdate }) {
  const handleChange = (key, value) => {
    onUpdate({ ...settings, [key]: value });
  };

  const inputStyle = {
    width: "100%",
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };

  // Animation keyframes
  const getAnimationCSS = (animation) => {
    switch (animation) {
      case 'pulse':
        return 'pulse 2s ease-in-out infinite';
      case 'shake':
        return 'shake 2s ease-in-out infinite';
      case 'bounce':
        return 'bounce 1s ease-in-out infinite';
      default:
        return 'none';
    }
  };

  // Icon renderer
  const renderIcon = (iconType) => {
    const iconProps = {
      width: "20",
      height: "20",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };

    switch (iconType) {
      case 'cart':
        return (
          <svg {...iconProps}>
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
        );
      case 'truck':
        return (
          <svg {...iconProps}>
            <path d="M1 3h15v13H1z" />
            <path d="M16 8h4l3 3v5h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
        );
      case 'package':
        return (
          <svg {...iconProps}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        );
      case 'cash':
        return (
          <svg {...iconProps}>
            <rect x="2" y="7" width="20" height="10" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M18 12h.01M6 12h.01" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Preview button style with all customizations
  const buttonPreviewStyle = {
    backgroundColor: settings.buttonBgColor || '#000000',
    color: settings.buttonTextColor || '#FFFFFF',
    padding: "16px 32px",
    border: `${settings.buttonBorderWidth || 0}px solid ${settings.buttonBorderColor || '#000000'}`,
    borderRadius: `${settings.buttonBorderRadius || 4}px`,
    fontSize: `${settings.buttonFontSize || 16}px`,
    fontWeight: "600",
    cursor: "pointer",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    boxShadow: `0 ${settings.buttonShadow || 4}px ${(settings.buttonShadow || 4) * 2}px rgba(0, 0, 0, 0.1)`,
    animation: getAnimationCSS(settings.buttonAnimation),
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Buy Button Customization</s-heading>
      <s-paragraph>
        Customize the "Buy with COD" button that appears on your
        storefront. The button will be placed wherever you add the app block.
      </s-paragraph>

      {/* Button Text */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Button Text</s-text>
        <input
          type="text"
          value={settings.buttonText}
          onChange={(e) => handleChange("buttonText", e.target.value)}
          placeholder="Buy with Cash on Delivery"
          style={inputStyle}
        />
        <s-text variant="body-sm" tone="subdued">
          The text that appears on the button
        </s-text>
      </s-stack>

      {/* Background Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Background Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              settings.buttonBgColor.startsWith("rgba")
                ? "#000000"
                : settings.buttonBgColor
            }
            onChange={(e) => handleChange("buttonBgColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={settings.buttonBgColor}
            onChange={(e) => handleChange("buttonBgColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(0,0,0,1)"
          />
        </s-stack>
        <s-text variant="body-sm" tone="subdued">
          Button background color (supports rgba)
        </s-text>
      </s-stack>

      {/* Text Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Text Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={
              settings.buttonTextColor.startsWith("rgba")
                ? "#FFFFFF"
                : settings.buttonTextColor
            }
            onChange={(e) => handleChange("buttonTextColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={settings.buttonTextColor}
            onChange={(e) => handleChange("buttonTextColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="rgba(255,255,255,1)"
          />
        </s-stack>
        <s-text variant="body-sm" tone="subdued">
          Button text color (supports rgba)
        </s-text>
      </s-stack>

      {/* Font Size */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Font Size: {settings.buttonFontSize || 16}px</s-text>
        <input
          type="range"
          min="12"
          max="24"
          value={settings.buttonFontSize || 16}
          onChange={(e) => handleChange("buttonFontSize", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <s-text variant="body-sm" tone="subdued">
          Adjust the button text size (12px - 24px)
        </s-text>
      </s-stack>

      {/* Border Radius */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Border Radius: {settings.buttonBorderRadius || 4}px</s-text>
        <input
          type="range"
          min="0"
          max="50"
          value={settings.buttonBorderRadius || 4}
          onChange={(e) => handleChange("buttonBorderRadius", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <s-text variant="body-sm" tone="subdued">
          Adjust the button corner roundness (0px - 50px)
        </s-text>
      </s-stack>

      {/* Border Width */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Border Width: {settings.buttonBorderWidth || 0}px</s-text>
        <input
          type="range"
          min="0"
          max="10"
          value={settings.buttonBorderWidth || 0}
          onChange={(e) => handleChange("buttonBorderWidth", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <s-text variant="body-sm" tone="subdued">
          Adjust the button border thickness (0px - 10px)
        </s-text>
      </s-stack>

      {/* Border Color */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Border Color</s-text>
        <s-stack direction="inline" gap="small" align="center">
          <input
            type="color"
            value={settings.buttonBorderColor || "#000000"}
            onChange={(e) => handleChange("buttonBorderColor", e.target.value)}
            style={{ width: "50px", height: "35px" }}
          />
          <input
            type="text"
            value={settings.buttonBorderColor || "#000000"}
            onChange={(e) => handleChange("buttonBorderColor", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="#000000"
          />
        </s-stack>
        <s-text variant="body-sm" tone="subdued">
          Button border color
        </s-text>
      </s-stack>

      {/* Shadow */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Shadow Intensity: {settings.buttonShadow || 4}px</s-text>
        <input
          type="range"
          min="0"
          max="20"
          value={settings.buttonShadow || 4}
          onChange={(e) => handleChange("buttonShadow", parseInt(e.target.value))}
          style={{ width: "100%" }}
        />
        <s-text variant="body-sm" tone="subdued">
          Adjust the button shadow depth (0px - 20px)
        </s-text>
      </s-stack>

      {/* Animation */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Animation</s-text>
        <select
          value={settings.buttonAnimation || 'none'}
          onChange={(e) => handleChange("buttonAnimation", e.target.value)}
          style={inputStyle}
        >
          <option value="none">None</option>
          <option value="pulse">Pulse</option>
          <option value="shake">Shake</option>
          <option value="bounce">Bounce</option>
        </select>
        <s-text variant="body-sm" tone="subdued">
          Add an animation effect to attract attention
        </s-text>
      </s-stack>

      {/* Icon Selection */}
      <s-stack direction="block" gap="tight">
        <s-text variant="heading-sm">Button Icon</s-text>
        <select
          value={settings.buttonIcon || 'cart'}
          onChange={(e) => handleChange("buttonIcon", e.target.value)}
          style={inputStyle}
        >
          <option value="cart">Shopping Cart</option>
          <option value="truck">Delivery Truck</option>
          <option value="package">Package</option>
          <option value="cash">Cash</option>
          <option value="none">No Icon</option>
        </select>
        <s-text variant="body-sm" tone="subdued">
          Choose an icon to display on the button
        </s-text>
      </s-stack>

    </s-stack>
  );
}
