import { useState } from "react";
import { SHOPIFY_FIELD_OPTIONS, isFieldIdTaken } from "../../lib/constants.js";

export default function FieldTypeModal({ isOpen, onClose, onSelectType, existingFields }) {
  const [activeTab, setActiveTab] = useState("shopify");

  if (!isOpen) return null;

  // Filter out already added Shopify fields
  const availableShopifyFields = SHOPIFY_FIELD_OPTIONS.filter(
    field => !isFieldIdTaken(field.id, existingFields)
  );

  const renderIcon = (iconName) => {
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

    switch (iconName) {
      case "person":
        return (
          <svg {...iconProps}>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case "email":
        return (
          <svg {...iconProps}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        );
      case "phone":
        return (
          <svg {...iconProps}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        );
      case "location":
        return (
          <svg {...iconProps}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        );
      case "discount":
        return (
          <svg {...iconProps}>
            <circle cx="9" cy="9" r="7" />
            <path d="M9 3v6l4 4" />
          </svg>
        );
      case "quantity":
        return (
          <svg {...iconProps}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        );
      default:
        return null;
    }
  };

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
          padding: "0",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "80vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "24px 24px 16px 24px", borderBottom: "1px solid #e5e7eb" }}>
          <s-heading>Add new field</s-heading>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
          <button
            onClick={() => setActiveTab("shopify")}
            style={{
              flex: 1,
              padding: "12px 24px",
              border: "none",
              backgroundColor: "transparent",
              borderBottom: activeTab === "shopify" ? "2px solid #000" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeTab === "shopify" ? "600" : "400",
              color: activeTab === "shopify" ? "#000" : "#6b7280",
            }}
          >
            Shopify fields
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            style={{
              flex: 1,
              padding: "12px 24px",
              border: "none",
              backgroundColor: "transparent",
              borderBottom: activeTab === "custom" ? "2px solid #000" : "2px solid transparent",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeTab === "custom" ? "600" : "400",
              color: activeTab === "custom" ? "#000" : "#6b7280",
            }}
          >
            Custom fields
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", overflow: "auto", flex: 1 }}>
          {activeTab === "shopify" && (
            <s-stack direction="block" gap="base">
              {availableShopifyFields.length === 0 ? (
                <s-text tone="subdued">All Shopify fields have been added to your form.</s-text>
              ) : (
                availableShopifyFields.map((field) => (
                  <div
                    key={field.id}
                    onClick={() => onSelectType("shopify", field.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#000";
                      e.currentTarget.style.backgroundColor = "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#e5e7eb";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div style={{ color: "#6b7280" }}>
                      {renderIcon(field.icon)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <s-text variant="heading-sm">{field.label}</s-text>
                    </div>
                    <div style={{ fontSize: "20px", color: "#6b7280" }}>›</div>
                  </div>
                ))
              )}
            </s-stack>
          )}

          {activeTab === "custom" && (
            <s-stack direction="block" gap="base">
              <s-text>
                Create custom fields to collect additional information from customers.
                Custom fields will be visible on Shopify order details page.
              </s-text>
              <div
                onClick={() => onSelectType("custom")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "16px",
                  border: "2px dashed #d1d5db",
                  borderRadius: "8px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#000";
                  e.currentTarget.style.backgroundColor = "#f9fafb";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#d1d5db";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <s-text variant="heading-sm">Add new field</s-text>
              </div>
            </s-stack>
          )}
        </div>
      </div>
    </div>
  );
}
