export default function LivePreview({ formConfig, sections, fields, settings, currencySymbol = 'Rs.' }) {
  const visibleSections = sections.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  const visibleFields = fields.filter((f) => f.visible).sort((a, b) => a.order - b.order);

  const formStyle = {
    backgroundColor: formConfig.backgroundColor,
    color: formConfig.textColor,
    fontSize: `${formConfig.fontSize}px`,
    borderRadius: `${formConfig.borderRadius}px`,
    border: `${formConfig.borderWidth}px solid ${formConfig.borderColor}`,
    boxShadow: `0 ${formConfig.shadowIntensity}px ${formConfig.shadowIntensity * 2}px rgba(0,0,0,0.1)`,
    padding: "24px",
    maxWidth: "600px",
    margin: "0 auto",
  };

  const renderField = (field) => {
    const inputStyle = {
      width: "100%",
      padding: "8px 12px",
      borderRadius: "4px",
      border: "1px solid #d1d5db",
      fontSize: "14px",
      marginTop: "4px",
    };

    const labelStyle = {
      display: "block",
      marginBottom: "4px",
      fontWeight: "500",
    };

    switch (field.type) {
      case "text":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: "red" }}>*</span>}
            </label>
            <input
              type={field.id === "email" ? "email" : "text"}
              placeholder={field.id === "email" ? "email@example.com" : field.placeholder}
              style={inputStyle}
              disabled
            />
          </div>
        );

      case "dropdown":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: "red" }}>*</span>}
            </label>
            <select style={inputStyle} disabled>
              <option>{field.placeholder || "Select..."}</option>
              {field.options?.map((opt, idx) => (
                <option key={idx}>{opt}</option>
              ))}
            </select>
          </div>
        );

      case "checkbox":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" disabled />
              <span>
                {field.label} {field.required && <span style={{ color: "red" }}>*</span>}
              </span>
            </label>
          </div>
        );

      case "date":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: "red" }}>*</span>}
            </label>
            <input type="date" style={inputStyle} disabled />
          </div>
        );

      case "quantity":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: "red" }}>*</span>}
            </label>
            <input type="number" min="1" defaultValue="1" style={inputStyle} disabled />
          </div>
        );

      case "title":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>{field.label}</h3>
          </div>
        );

      case "image":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <div
              style={{
                width: "100%",
                height: "150px",
                backgroundColor: "#f3f4f6",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
              }}
            >
              Image Placeholder
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={formStyle}>
      <h2 style={{ marginTop: 0, marginBottom: "24px" }}>{formConfig.formTitle}</h2>

      {visibleSections.map((section) => {
        switch (section.type) {
          case "orderSummary":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <div style={{ position: "relative" }}>
                  {/* Product Image with Quantity Badge */}
                  <div style={{ display: "flex", gap: "12px", position: "relative" }}>
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        flexShrink: 0,
                        borderRadius: "8px",
                        backgroundColor: "#F3F4F6",
                        position: "relative",
                        border: "1px solid #E5E7EB",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#9ca3af",
                        fontSize: "10px",
                      }}
                    >
                      IMG
                      {/* Quantity Badge - Top Left */}
                      <div
                        style={{
                          position: "absolute",
                          top: "-8px",
                          left: "-8px",
                          backgroundColor: "#6B7280",
                          color: "#fff",
                          borderRadius: "50%",
                          width: "24px",
                          height: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          fontWeight: "600",
                          border: "2px solid #fff",
                        }}
                      >
                        1
                      </div>
                    </div>

                    {/* Product Details */}
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "500",
                          color: "#111827",
                          marginBottom: "4px",
                          lineHeight: "1.4",
                        }}
                      >
                        Sample Product
                      </div>
                      <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: "1.4" }}>
                        Variant
                      </div>
                    </div>

                    {/* Price */}
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: "600",
                        color: "#111827",
                        whiteSpace: "nowrap",
                        alignSelf: "center",
                      }}
                    >
                      {currencySymbol} 19.99
                    </div>

                    {/* Remove Button (X) - Top Right */}
                    <button
                      type="button"
                      disabled
                      style={{
                        position: "absolute",
                        top: "-4px",
                        right: "-4px",
                        background: "#6B7280",
                        border: "none",
                        borderRadius: "50%",
                        width: "20px",
                        height: "20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "not-allowed",
                        color: "#fff",
                        fontSize: "12px",
                        lineHeight: "1",
                        padding: "0",
                        fontWeight: "600",
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            );

          case "totals":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "#F3F4F6",
                    borderRadius: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "15px", fontWeight: "500", color: "#374151" }}>
                    <span>Subtotal</span>
                    <span style={{ color: "#111827", fontWeight: "600" }}>{currencySymbol} 19.99</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "15px", fontWeight: "500", color: "#374151" }}>
                    <span>Shipping</span>
                    <span style={{ color: "#10B981", fontWeight: "600" }}>Free</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: "12px",
                      borderTop: "1px solid #D1D5DB",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#111827",
                    }}
                  >
                    <span>Total</span>
                    <span>{currencySymbol} 19.99</span>
                  </div>
                </div>
              </div>
            );

          case "shippingMethod":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "12px" }}>Shipping Method</h3>
                <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" checked disabled />
                  <span>Free shipping - Free</span>
                </label>
              </div>
            );

          case "shippingAddress":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "12px" }}>Enter your shipping address</h3>
                {visibleFields
                  .filter((f) => f.section === "shipping-address")
                  .map(renderField)}
              </div>
            );

          default:
            return null;
        }
      })}

      <button
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: formConfig.submitButtonBgColor || "#000",
          color: formConfig.submitButtonTextColor || "#fff",
          border: "none",
          borderRadius: "4px",
          fontSize: `${formConfig.submitButtonFontSize || 14}px`,
          fontWeight: "600",
          cursor: "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
        disabled
      >
        {formConfig.submitButtonIcon && formConfig.submitButtonIcon !== 'none' && (() => {
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
          switch (formConfig.submitButtonIcon) {
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
        })()}
        COMPLETE ORDER - {currencySymbol} 19.99
      </button>

      {/* Pay with Card Button */}
      {settings?.enableCartPermalink && (
        <button
          style={{
            width: "100%",
            padding: "12px",
            marginTop: "12px",
            backgroundColor: settings?.cardButtonBgColor || "#FFFFFF",
            color: settings?.cardButtonTextColor || "#000000",
            border: "2px solid #000000",
            borderRadius: "4px",
            fontSize: `${settings?.cardButtonFontSize || 14}px`,
            fontWeight: "600",
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          disabled
        >
          {/* Credit Card Icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
            <line x1="1" y1="10" x2="23" y2="10"></line>
          </svg>
          <span>{settings?.cardButtonText || 'PAY WITH CARD'}</span>
        </button>
      )}
    </div>
  );
}
