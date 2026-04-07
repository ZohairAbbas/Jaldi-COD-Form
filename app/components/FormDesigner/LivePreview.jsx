import { t } from '../../storefront/translations';

export default function LivePreview({ formConfig, sections, fields, settings, currencySymbol = 'Rs.' }) {
  const visibleSections = sections.filter((s) => s.visible).sort((a, b) => a.order - b.order);
  const visibleFields = fields.filter((f) => f.visible).sort((a, b) => a.order - b.order);

  const lang = settings?.language || 'en';
  const isRTL = settings?.enableRTL || lang === 'ar';

  const formStyle = {
    backgroundColor: formConfig.backgroundColor,
    color: formConfig.textColor,
    fontSize: `${formConfig.fontSize}px`,
    borderRadius: `${formConfig.borderRadius}px`,
    border: `${formConfig.borderWidth}px solid ${formConfig.borderColor}`,
    boxShadow: `0 ${formConfig.shadowIntensity}px ${formConfig.shadowIntensity * 2}px rgba(0,0,0,0.1)`,
    padding: "24px",
    maxWidth: "560px",
    margin: "0 auto",
    direction: isRTL ? "rtl" : "ltr",
  };

  const hasIcon = (fieldId) => ['full-name', 'first-name', 'last-name', 'email', 'phone', 'address', 'city'].includes(fieldId);

  const PersonIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000">
      <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z" />
    </svg>
  );

  const PhoneIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000">
      <path fillRule="evenodd" d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511z" />
    </svg>
  );

  const EmailIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000">
      <path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555ZM0 4.697v7.104l5.803-3.558L0 4.697ZM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757ZM16 11.801V4.697l-5.803 3.546L16 11.801Z" />
    </svg>
  );

  const LocationIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000">
      <path fillRule="evenodd" d="M12.166 8.94c-.524 1.062-1.234 2.12-1.96 3.07A31.493 31.493 0 0 1 8 14.58a31.481 31.481 0 0 1-2.206-2.57c-.726-.95-1.436-2.008-1.96-3.07C3.304 7.867 3 6.862 3 6a5 5 0 0 1 10 0c0 .862-.305 1.867-.834 2.94zM8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10z" />
      <path d="M8 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );

  const getFieldIcon = (fieldId) => {
    if (fieldId === 'full-name' || fieldId === 'first-name' || fieldId === 'last-name') return <PersonIcon />;
    if (fieldId === 'email') return <EmailIcon />;
    if (fieldId === 'phone') return <PhoneIcon />;
    if (fieldId === 'address' || fieldId === 'city') return <LocationIcon />;
    return null;
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "0",
    border: "none",
    fontSize: "16px",
    color: "#111827",
    backgroundColor: "#FFFFFF",
    outline: "none",
    flex: 1,
  };

  const inputGroupStyle = {
    display: "flex",
    alignItems: "center",
    borderRadius: "4px",
    border: "1px solid #D1D5DB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    flex: 1,
  };

  const iconContainerStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 12px",
    backgroundColor: "#E9ECEF",
    borderRight: "1px solid #D1D5DB",
    alignSelf: "stretch",
  };

  const labelStyle = {
    display: "flex",
    alignItems: "center",
    fontSize: "16px",
    fontWeight: "600",
    color: "#000000",
    width: "100px",
    minWidth: "100px",
    flexShrink: 0,
    lineHeight: "1.3",
  };

  const fieldRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "16px",
  };

  const renderField = (field) => {
    // Special rendering for discount-code field
    if (field.id === 'discount-code') {
      return (
        <div key={field.id} style={{ marginBottom: "16px" }}>
          <div style={fieldRowStyle}>
            <label style={labelStyle}>
              {field.label}
            </label>
            <div style={{ display: "flex", gap: "8px", flex: 1 }}>
              <div style={inputGroupStyle}>
                <input
                  type="text"
                  placeholder={field.placeholder || "Discount Code"}
                  style={inputStyle}
                  disabled
                />
              </div>
              <button
                type="button"
                disabled
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#000000",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "not-allowed",
                  opacity: 0.5,
                  whiteSpace: "nowrap",
                  minWidth: "80px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t(lang, 'apply')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    switch (field.type) {
      case "text":
        return (
          <div key={field.id} style={{ marginBottom: "0" }}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  {hasIcon(field.id) && (
                    <div style={iconContainerStyle}>
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <input
                    type={field.id === "email" ? "email" : "text"}
                    placeholder={field.id === "email" ? "email@example.com" : field.placeholder}
                    style={inputStyle}
                    disabled
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case "dropdown":
        return (
          <div key={field.id} style={{ marginBottom: "0" }}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <select style={{ ...inputStyle, cursor: "pointer" }} disabled>
                    <option>{field.placeholder || "Select..."}</option>
                    {field.options?.map((opt, idx) => (
                      <option key={idx}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case "checkbox":
        return (
          <div key={field.id} style={{ marginBottom: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input type="checkbox" disabled />
              <span>
                {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
              </span>
            </label>
          </div>
        );

      case "date":
        return (
          <div key={field.id} style={{ marginBottom: "0" }}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <input type="date" style={inputStyle} disabled />
                </div>
              </div>
            </div>
          </div>
        );

      case "quantity":
        return (
          <div key={field.id} style={{ marginBottom: "0" }}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: "#EF4444" }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <input type="number" min="1" defaultValue="1" style={inputStyle} disabled />
                </div>
              </div>
            </div>
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
      <h2 style={{ marginTop: 0, marginBottom: "24px", fontWeight: "900" }}>{formConfig.formTitle}</h2>

      {visibleSections.map((section) => {
        switch (section.type) {
          case "orderSummary":
            return (
              <div key={section.id} style={{
                marginBottom: "24px",
                borderTop: "1px solid #E5E7EB",
                borderBottom: "1px solid #E5E7EB",
                padding: "16px 0",
              }}>
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
                          fontSize: "16px",
                          fontWeight: "700",
                          color: "#000000",
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
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "#000000",
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
                    padding: "8px 12px",
                    backgroundColor: "#F3F4F6",
                    borderRadius: "4px",
                    border: "1px solid #E5E7EB",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "16px", fontWeight: "400", color: "#000000" }}>
                    <span>{t(lang, 'subtotal')}</span>
                    <span style={{ fontWeight: "600" }}>{currencySymbol} 19.99</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: "16px", fontWeight: "400", color: "#000000" }}>
                    <span>{t(lang, 'shipping')}</span>
                    <span style={{ fontWeight: "600" }}>{t(lang, 'free')}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: "8px",
                      marginTop: "4px",
                      borderTop: "1px solid #D1D5DB",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#000000",
                    }}
                  >
                    <span>{t(lang, 'total')}</span>
                    <span>{currencySymbol} 19.99</span>
                  </div>
                </div>
              </div>
            );

          case "shippingMethod":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "8px", fontSize: "16px", fontWeight: "700" }}>{t(lang, 'shippingOptions')}</h3>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 16px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "4px",
                  backgroundColor: "#FFFFFF",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input type="radio" checked disabled style={{ width: "16px", height: "16px", accentColor: "#000" }} />
                    <span style={{ fontSize: "16px", color: "#000000" }}>{t(lang, 'freeShipping')}</span>
                  </div>
                  <span style={{ fontSize: "16px", fontWeight: "700", color: "#000000" }}>{t(lang, 'free')}</span>
                </label>
              </div>
            );

          case "shippingAddress":
            return (
              <div key={section.id} style={{ marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "12px", fontSize: "16px", fontWeight: "700" }}>{t(lang, 'enterShippingAddress')}</h3>
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
        {t(lang, 'completeOrder')} - {currencySymbol} 19.99
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
          <span>{settings?.cardButtonText && settings.cardButtonText !== 'PAY WITH CARD' ? settings.cardButtonText : t(lang, 'payWithCard')}</span>
        </button>
      )}
    </div>
  );
}
