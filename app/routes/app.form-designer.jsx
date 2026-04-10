import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { getCurrencySymbol } from "../lib/constants";
import SectionManager from "../components/FormDesigner/SectionManager";
import FieldManager from "../components/FormDesigner/FieldManager";
import FieldTypeModal from "../components/FormDesigner/FieldTypeModal";
import FieldConfigModal from "../components/FormDesigner/FieldConfigModal";
import LivePreview from "../components/FormDesigner/LivePreview";
import StyleCustomizer from "../components/FormDesigner/StyleCustomizer";
import ButtonCustomizer from "../components/Settings/ButtonCustomizer";
import CardButtonCustomizer from "../components/Settings/CardButtonCustomizer";
import FormModeSelector from "../components/Settings/FormModeSelector";
import { fieldTranslations } from "../storefront/translations";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return {
    formConfig: {
      ...shop.formConfig,
      sections: JSON.parse(shop.formConfig.sections),
      fields: JSON.parse(shop.formConfig.fields),
    },
    settings: shop.settings,
    currencySymbol: getCurrencySymbol(shop.country),
  };
};

export default function FormDesigner() {
  const { formConfig: initialConfig, settings: initialSettings, currencySymbol } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null)

  const [activeTab, setActiveTab] = useState("form-designer");
  const [formConfig, setFormConfig] = useState(initialConfig);
  const [sections, setSections] = useState(initialConfig.sections);
  const [fields, setFields] = useState(initialConfig.fields);
  const [settings, setSettings] = useState(initialSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldTypeModalOpen, setFieldTypeModalOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [selectedFieldCategory, setSelectedFieldCategory] = useState(null);
  const [selectedShopifyFieldId, setSelectedShopifyFieldId] = useState(null);

  const handleSettingsUpdate = (updates) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  const handleLanguageChange = (newLang) => {
    setSettings((prev) => ({ ...prev, language: newLang, ...(newLang === 'bilingual' ? { enableRTL: false } : {}) }));
    // Auto-translate field labels/placeholders (skip for bilingual — both languages show at runtime)
    const langFields = fieldTranslations[newLang];
    if (langFields) {
      setFields((prev) =>
        prev.map((f) => {
          const tr = langFields[f.id];
          if (tr) {
            return { ...f, label: tr.label, placeholder: tr.placeholder };
          }
          return f;
        }),
      );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Save both form config and settings
      const [formResponse, settingsResponse] = await Promise.all([
        fetch("/api/form-config", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...formConfig,
            sections,
            fields,
          }),
        }),
        fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        }),
      ]);

      const formData = await formResponse.json();
      const settingsData = await settingsResponse.json();

      if (formResponse.ok && formData.success && settingsResponse.ok && settingsData.success) {
        shopify.toast.show("Changes saved successfully!");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      shopify.toast.show("Error saving changes", { isError: true });
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddField = () => {
    setEditingField(null);
    setFieldTypeModalOpen(true);
  };

  const handleFieldTypeSelect = (category, shopifyFieldId = null) => {
    setSelectedFieldCategory(category);
    setSelectedShopifyFieldId(shopifyFieldId);
    setFieldTypeModalOpen(false);
    setIsModalOpen(true);
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setSelectedFieldCategory(null);
    setSelectedShopifyFieldId(null);
    setIsModalOpen(true);
  };

  const handleSaveField = (fieldData) => {
    if (editingField) {
      // Update existing field
      setFields(
        fields.map((f) => (f.id === fieldData.id ? fieldData : f)),
      );
    } else {
      // Add new field
      const newField = {
        ...fieldData,
        order: fields.filter((f) => f.section === "shipping-address").length,
      };
      setFields([...fields, newField]);
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
    <>
      <s-page heading="Form Designer">
        <s-button
          slot="primary-action"
          ref={saveButtonRef}
          {...(isSaving ? { loading: true } : {})}
          variant="primary"
        >
          Save Changes
        </s-button>

        {/* Navigation Tabs */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: "24px",
          padding: "16px 0",
        }}>
          <div style={{
            display: "inline-flex",
            gap: "8px",
            backgroundColor: "#F6F6F7",
            padding: "4px",
            borderRadius: "12px",
            border: "1px solid #E1E3E5",
          }}>
            <button
              onClick={() => setActiveTab("form-designer")}
              style={{
                padding: "10px 20px",
                border: "none",
                backgroundColor: activeTab === "form-designer" ? "#FFFFFF" : "transparent",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
                color: activeTab === "form-designer" ? "#202223" : "#6D7175",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s ease",
                boxShadow: activeTab === "form-designer" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Form Designer
            </button>
            <button
              onClick={() => setActiveTab("button-customization")}
              style={{
                padding: "10px 20px",
                border: "none",
                backgroundColor: activeTab === "button-customization" ? "#FFFFFF" : "transparent",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
                color: activeTab === "button-customization" ? "#202223" : "#6D7175",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s ease",
                boxShadow: activeTab === "button-customization" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              COD Button
            </button>
            <button
              onClick={() => setActiveTab("card-button-customization")}
              style={{
                padding: "10px 20px",
                border: "none",
                backgroundColor: activeTab === "card-button-customization" ? "#FFFFFF" : "transparent",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
                color: activeTab === "card-button-customization" ? "#202223" : "#6D7175",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                transition: "all 0.2s ease",
                boxShadow: activeTab === "card-button-customization" ? "0 1px 3px rgba(0, 0, 0, 0.1)" : "none",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                <line x1="1" y1="10" x2="23" y2="10"></line>
              </svg>
              Card Button
            </button>
          </div>
        </div>

        {/* Form Designer Tab Content */}
        {activeTab === "form-designer" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Left Column - Configuration */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <s-section>
                <FormModeSelector settings={settings} onUpdate={handleSettingsUpdate} />
              </s-section>

              {/* Language Selector */}
              <s-section>
                <s-stack direction="block" gap="base">
                  <s-heading>Language</s-heading>
                  <s-paragraph>
                    Choose the form language. Changing language will auto-translate all field labels and placeholders.
                  </s-paragraph>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[
                      { code: "en", label: "English", flag: "🇬🇧" },
                      { code: "ar", label: "العربية (Arabic)", flag: "🇸🇦" },
                      { code: "bilingual", label: "Bilingual EN+AR", flag: "🌐" },
                    ].map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageChange(lang.code)}
                        style={{
                          flex: 1,
                          padding: "14px 16px",
                          border: settings.language === lang.code ? "2px solid #000" : "1px solid #D1D5DB",
                          borderRadius: "10px",
                          backgroundColor: settings.language === lang.code ? "#F9FAFB" : "#FFFFFF",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "14px",
                          fontWeight: settings.language === lang.code ? "600" : "400",
                          color: "#202223",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: "22px" }}>{lang.flag}</span>
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </s-stack>
              </s-section>

              <s-section>
                <SectionManager sections={sections} onUpdate={setSections} />
              </s-section>

              <s-section>
                <FieldManager
                  fields={fields}
                  onUpdate={setFields}
                  onEditField={handleEditField}
                  onAddField={handleAddField}
                />
              </s-section>

              <s-section>
                <StyleCustomizer formConfig={formConfig} onUpdate={setFormConfig} />
              </s-section>
            </div>

            {/* Right Column - Live Preview */}
            <div style={{ position: "sticky", top: "20px", height: "fit-content" }}>
              <s-section>
                <s-stack direction="block" gap="base">
                  <s-heading>Live Preview</s-heading>
                  <s-paragraph>
                    See how your form will look to customers in real-time.
                  </s-paragraph>
                  <div style={{ maxHeight: "80vh", overflow: "auto" }}>
                    <LivePreview
                      formConfig={formConfig}
                      sections={sections}
                      fields={fields}
                      settings={settings}
                      currencySymbol={currencySymbol}
                    />
                  </div>
                </s-stack>
              </s-section>
            </div>
          </div>
        )}

        {/* Button Customization Tab Content */}
        {activeTab === "button-customization" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Left Column - Customization Options */}
            <div>
              <s-section>
                <ButtonCustomizer settings={settings} onUpdate={handleSettingsUpdate} />
              </s-section>
            </div>

            {/* Right Column - Button Preview */}
            <div style={{ position: "sticky", top: "20px", height: "fit-content" }}>
              <s-section>
                <s-stack direction="block" gap="base">
                  <s-heading>Button Preview</s-heading>
                  <s-paragraph>
                    See how your button will look on the storefront in real-time.
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <style>{`
                      @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.05); }
                      }
                      @keyframes shake {
                        0%, 100% { transform: translateX(0); }
                        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                        20%, 40%, 60%, 80% { transform: translateX(5px); }
                      }
                      @keyframes bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-10px); }
                      }
                      .preview-button {
                        transition: box-shadow 0.3s ease;
                      }
                      .preview-button:hover {
                        box-shadow: 0 ${(settings.buttonShadow || 4) + 4}px ${((settings.buttonShadow || 4) + 4) * 2}px rgba(0, 0, 0, 0.15) !important;
                      }
                    `}</style>
                    <button
                      className="preview-button"
                      style={{
                        backgroundColor: settings.buttonBgColor || '#000000',
                        color: settings.buttonTextColor || '#FFFFFF',
                        padding: "16px 32px",
                        border: `${settings.buttonBorderWidth || 0}px solid ${settings.buttonBorderColor || '#000000'}`,
                        borderRadius: `${settings.buttonBorderRadius || 4}px`,
                        fontSize: `${settings.buttonFontSize || 16}px`,
                        fontWeight: "700",
                        cursor: "pointer",
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        boxShadow: `0 ${settings.buttonShadow || 4}px ${(settings.buttonShadow || 4) * 2}px rgba(0, 0, 0, 0.1)`,
                        animation: settings.buttonAnimation === 'pulse' ? 'pulse 2s ease-in-out infinite' :
                                   settings.buttonAnimation === 'shake' ? 'shake 2s ease-in-out infinite' :
                                   settings.buttonAnimation === 'bounce' ? 'bounce 1s ease-in-out infinite' : 'none',
                      }}
                    >
                      {settings.buttonIcon && settings.buttonIcon !== 'none' && (() => {
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

                        switch (settings.buttonIcon) {
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
                      {settings.buttonText || "Buy with Cash on Delivery"}
                    </button>
                  </s-box>
                  <s-text variant="body-sm" tone="subdued">
                    This is how your button will appear on product and cart pages. Hover over the button to see the shadow effect.
                  </s-text>
                </s-stack>
              </s-section>
            </div>
          </div>
        )}

        {/* Card Button Customization Tab Content */}
        {activeTab === "card-button-customization" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            {/* Left Column - Customization Options */}
            <div>
              <s-section>
                <CardButtonCustomizer settings={settings} onUpdate={handleSettingsUpdate} />
              </s-section>
            </div>

            {/* Right Column - Button Preview */}
            <div style={{ position: "sticky", top: "20px", height: "fit-content" }}>
              <s-section>
                <s-stack direction="block" gap="base">
                  <s-heading>Button Preview</s-heading>
                  <s-paragraph>
                    See how your Pay with Card button will look in the form.
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    <button
                      style={{
                        width: "100%",
                        padding: "14px 20px",
                        backgroundColor: settings.cardButtonBgColor || "#FFFFFF",
                        color: settings.cardButtonTextColor || "#000000",
                        border: "2px solid #000000",
                        borderRadius: "4px",
                        fontSize: `${settings.cardButtonFontSize || 14}px`,
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                      }}
                    >
                      {/* Credit Card Icon */}
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                      {settings.cardButtonText || "PAY WITH CARD"}
                    </button>
                  </s-box>
                  <s-text variant="body-sm" tone="subdued">
                    This button appears below the COD button when "Pay with Card" is enabled in settings.
                  </s-text>
                </s-stack>
              </s-section>
            </div>
          </div>
        )}
      </s-page>

      <FieldTypeModal
        isOpen={fieldTypeModalOpen}
        onClose={() => setFieldTypeModalOpen(false)}
        onSelectType={handleFieldTypeSelect}
        existingFields={fields}
      />

      <FieldConfigModal
        field={editingField}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedFieldCategory(null);
          setSelectedShopifyFieldId(null);
        }}
        onSave={handleSaveField}
        fieldCategory={selectedFieldCategory}
        shopifyFieldId={selectedShopifyFieldId}
      />
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
