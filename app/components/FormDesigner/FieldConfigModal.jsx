import { useState, useEffect } from "react";
import { getShopifyFieldConfig, CORE_FIELD_IDS } from "../../lib/constants.js";

export default function FieldConfigModal({
  field,
  isOpen,
  onClose,
  onSave,
  fieldCategory,
  shopifyFieldId,
  presetType
}) {
  const [formData, setFormData] = useState({
    id: "",
    type: "text",
    label: "",
    placeholder: "",
    required: false,
    visible: true,
    section: "shipping-address",
    options: [],
  });

  useEffect(() => {
    if (field) {
      // Editing existing field
      setFormData(field);
    } else if (fieldCategory === "shopify" && shopifyFieldId) {
      // Adding new Shopify field
      const shopifyConfig = getShopifyFieldConfig(shopifyFieldId);
      if (shopifyConfig) {
        setFormData({
          id: shopifyConfig.id,
          type: shopifyConfig.type,
          label: shopifyConfig.label,
          placeholder: shopifyConfig.defaultPlaceholder,
          required: CORE_FIELD_IDS.includes(shopifyConfig.id),
          visible: true,
          section: "shipping-address",
          options: shopifyConfig.defaultOptions || [],
          order: 999,
          fieldCategory: "shopify",
          isCore: CORE_FIELD_IDS.includes(shopifyConfig.id),
          isDeletable: !CORE_FIELD_IDS.includes(shopifyConfig.id),
          shopifyProperty: shopifyConfig.shopifyProperty
        });
      }
    } else if (fieldCategory === "custom") {
      // Adding new custom field
      setFormData({
        id: `custom-${Date.now()}`,
        type: presetType || "text",
        label: "",
        placeholder: "",
        required: false,
        visible: true,
        section: "shipping-address",
        options: [],
        order: 999,
        fieldCategory: "custom",
        isCore: false,
        isDeletable: true,
        ...(presetType === "whatsapp" && {
          whatsappNumber: "",
          whatsappMessage: "Hello! I would like to buy this product: {url} Can you help me?",
          whatsappBgColor: "#25d366",
          whatsappTextColor: "#ffffff",
          whatsappFontSize: 16,
          label: "Order by WhatsApp",
        }),
      });
    } else {
      // Reset for new field (fallback)
      setFormData({
        id: `field-${Date.now()}`,
        type: "text",
        label: "",
        placeholder: "",
        required: false,
        visible: true,
        section: "shipping-address",
        options: [],
        order: 999,
        fieldCategory: "custom",
        isCore: false,
        isDeletable: true
      });
    }
  }, [field, isOpen, fieldCategory, shopifyFieldId, presetType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          maxWidth: "500px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="base" align="space-between">
            <s-heading>{field ? "Edit Field" : "Add New Field"}</s-heading>
            {formData.fieldCategory && (
              <s-badge tone={formData.fieldCategory === "shopify" ? "success" : "neutral"}>
                {formData.fieldCategory === "shopify" ? "Shopify" : "Custom"}
              </s-badge>
            )}
          </s-stack>

          {formData.isCore && (
            <s-banner tone="info">
              <s-text>This is a core field and cannot be deleted. You can customize the label and placeholder.</s-text>
            </s-banner>
          )}

          <form onSubmit={handleSubmit}>
            <s-stack direction="block" gap="base">
              {/* Field Type - Only editable for custom fields */}
              {formData.fieldCategory === "custom" && (
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Field Type</s-text>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  >
                    <option value="text">Text Input</option>
                    <option value="dropdown">Dropdown List</option>
                    <option value="checkbox">Checkbox</option>
                    <option value="date">Date Selector</option>
                    <option value="quantity">Quantity Selector</option>
                    <option value="title">Title/Text</option>
                    <option value="whatsapp">WhatsApp Button</option>
                  </select>
                </s-stack>
              )}

              {/* Show field type as read-only for Shopify fields */}
              {formData.fieldCategory === "shopify" && (
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Field Type</s-text>
                  <s-text tone="subdued">{formData.type.charAt(0).toUpperCase() + formData.type.slice(1)}</s-text>
                </s-stack>
              )}

              {/* Label */}
              <s-stack direction="block" gap="tight">
                <s-text variant="heading-sm">Label</s-text>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => handleChange("label", e.target.value)}
                  placeholder="Enter field label"
                  required
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    width: "100%",
                  }}
                />
              </s-stack>

              {/* Placeholder */}
              {["text", "dropdown"].includes(formData.type) && (
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Placeholder</s-text>
                  <input
                    type="text"
                    value={formData.placeholder}
                    onChange={(e) => handleChange("placeholder", e.target.value)}
                    placeholder="Enter placeholder text"
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              )}

              {/* Text field length validation (all text inputs except phone) */}
              {formData.type === "text" && formData.id !== "phone" && (
                <>
                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Min length</s-text>
                      <input
                        type="number"
                        min={0}
                        value={formData.minLength ?? ""}
                        onChange={(e) => handleChange("minLength", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                        placeholder="No minimum"
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Max length</s-text>
                      <input
                        type="number"
                        min={1}
                        value={formData.maxLength ?? ""}
                        onChange={(e) => handleChange("maxLength", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                        placeholder="No maximum"
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                      />
                    </s-stack>
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Invalid value error text</s-text>
                    <input
                      type="text"
                      value={formData.errorText || ""}
                      onChange={(e) => handleChange("errorText", e.target.value)}
                      placeholder="Enter a valid value."
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                    />
                    <s-text tone="subdued">
                      Shown when the value fails the length rules. Leave empty to use your generic invalid field error text (set in Form Designer).
                    </s-text>
                  </s-stack>
                </>
              )}

              {/* Dropdown Options */}
              {formData.type === "dropdown" && (
                <s-stack direction="block" gap="tight">
                  <s-text variant="heading-sm">Options (comma-separated)</s-text>
                  <input
                    type="text"
                    value={formData.options?.join(", ") || ""}
                    onChange={(e) =>
                      handleChange(
                        "options",
                        e.target.value.split(",").map((opt) => opt.trim()),
                      )
                    }
                    placeholder="Option 1, Option 2, Option 3"
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              )}

              {/* Phone Validation Settings (phone field only) */}
              {formData.id === "phone" && (
                <>
                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Min digits</s-text>
                      <input
                        type="number"
                        min={1}
                        value={formData.phoneMinDigits ?? ""}
                        onChange={(e) => handleChange("phoneMinDigits", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                        placeholder="Auto (by country)"
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                      />
                    </s-stack>
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Max digits</s-text>
                      <input
                        type="number"
                        min={1}
                        value={formData.phoneMaxDigits ?? ""}
                        onChange={(e) => handleChange("phoneMaxDigits", e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                        placeholder="Auto (by country)"
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                      />
                    </s-stack>
                  </s-stack>
                  <s-text tone="subdued">
                    Number of digits after the country code. Leave blank to use the built-in per-country rules.
                  </s-text>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Invalid phone error message</s-text>
                    <input
                      type="text"
                      value={formData.phoneErrorMessage || ""}
                      onChange={(e) => handleChange("phoneErrorMessage", e.target.value)}
                      placeholder="Enter a valid phone number."
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                    />
                    <s-text tone="subdued">Shown when the phone length is invalid. Leave blank for the default message.</s-text>
                  </s-stack>
                </>
              )}

              {/* WhatsApp Button Fields */}
              {formData.type === "whatsapp" && (
                <>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">WhatsApp Number</s-text>
                    <input
                      type="text"
                      value={formData.whatsappNumber || ""}
                      onChange={(e) => handleChange("whatsappNumber", e.target.value)}
                      placeholder="+1234567890"
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%" }}
                    />
                    <s-text tone="subdued">Include country code (e.g. +1234567890)</s-text>
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">WhatsApp Message</s-text>
                    <textarea
                      value={formData.whatsappMessage || ""}
                      onChange={(e) => handleChange("whatsappMessage", e.target.value)}
                      placeholder="Hello! I would like to buy this product: {url} Can you help me?"
                      rows={3}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100%", resize: "vertical" }}
                    />
                    <s-text tone="subdued">Use {"{url}"} to insert the customer's page URL</s-text>
                  </s-stack>
                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Background Color</s-text>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="color"
                          value={formData.whatsappBgColor || "#25d366"}
                          onChange={(e) => handleChange("whatsappBgColor", e.target.value)}
                          style={{ width: "40px", height: "32px", padding: "2px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" }}
                        />
                        <input
                          type="text"
                          value={formData.whatsappBgColor || "#25d366"}
                          onChange={(e) => handleChange("whatsappBgColor", e.target.value)}
                          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", flex: 1 }}
                        />
                      </div>
                    </s-stack>
                    <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                      <s-text variant="heading-sm">Text Color</s-text>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <input
                          type="color"
                          value={formData.whatsappTextColor || "#ffffff"}
                          onChange={(e) => handleChange("whatsappTextColor", e.target.value)}
                          style={{ width: "40px", height: "32px", padding: "2px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" }}
                        />
                        <input
                          type="text"
                          value={formData.whatsappTextColor || "#ffffff"}
                          onChange={(e) => handleChange("whatsappTextColor", e.target.value)}
                          style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", flex: 1 }}
                        />
                      </div>
                    </s-stack>
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="heading-sm">Font Size (px)</s-text>
                    <input
                      type="number"
                      value={formData.whatsappFontSize || 16}
                      onChange={(e) => handleChange("whatsappFontSize", parseInt(e.target.value) || 16)}
                      min={10}
                      max={32}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #ccc", width: "100px" }}
                    />
                  </s-stack>
                </>
              )}

              {/* Required Checkbox - Disabled for core fields, hidden for whatsapp */}
              {formData.type !== "whatsapp" && (
                <s-stack direction="inline" gap="small" align="center">
                  <input
                    type="checkbox"
                    checked={formData.required}
                    onChange={(e) => handleChange("required", e.target.checked)}
                    id="required-checkbox"
                    disabled={formData.isCore}
                  />
                  <label htmlFor="required-checkbox">
                    <s-text>Required field {formData.isCore && "(Cannot be changed for core fields)"}</s-text>
                  </label>
                </s-stack>
              )}

              {/* Visible Checkbox */}
              <s-stack direction="inline" gap="small" align="center">
                <input
                  type="checkbox"
                  checked={formData.visible}
                  onChange={(e) => handleChange("visible", e.target.checked)}
                  id="visible-checkbox"
                />
                <label htmlFor="visible-checkbox">
                  <s-text>Visible in form</s-text>
                </label>
              </s-stack>

              {/* Buttons */}
              <s-stack direction="inline" gap="base">
                <s-button type="submit" variant="primary">
                  {field ? "Update Field" : "Add Field"}
                </s-button>
                <span onClick={onClose}>                                                                                                   
         <s-button type="button">                                                                                                
           Cancel                                                                                                                
         </s-button>                                                                                                             
       </span>
              </s-stack>
            </s-stack>
          </form>
        </s-stack>
      </div>
    </div>
  );
}
