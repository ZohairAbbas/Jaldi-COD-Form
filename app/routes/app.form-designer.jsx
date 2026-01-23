import { useState, useRef, useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import SectionManager from "../components/FormDesigner/SectionManager";
import FieldManager from "../components/FormDesigner/FieldManager";
import FieldConfigModal from "../components/FormDesigner/FieldConfigModal";
import LivePreview from "../components/FormDesigner/LivePreview";
import StyleCustomizer from "../components/FormDesigner/StyleCustomizer";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return {
    formConfig: {
      ...shop.formConfig,
      sections: JSON.parse(shop.formConfig.sections),
      fields: JSON.parse(shop.formConfig.fields),
    },
  };
};

export default function FormDesigner() {
  const { formConfig: initialConfig } = useLoaderData();
  const shopify = useAppBridge();
  const saveButtonRef = useRef(null);

  const [formConfig, setFormConfig] = useState(initialConfig);
  const [sections, setSections] = useState(initialConfig.sections);
  const [fields, setFields] = useState(initialConfig.fields);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/form-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formConfig,
          sections,
          fields,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        shopify.toast.show("Form configuration saved successfully!");
      } else {
        throw new Error("Failed to save");
      }
    } catch (error) {
      shopify.toast.show("Error saving form configuration", { isError: true });
      console.error("Save error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddField = () => {
    setEditingField(null);
    setIsModalOpen(true);
  };

  const handleEditField = (field) => {
    setEditingField(field);
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
          ref={saveButtonRef}
          slot="primary-action"
          {...(isSaving ? { loading: true } : {})}
          variant="primary"
        >
          Save Changes
        </s-button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Left Column - Configuration */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
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
                  />
                </div>
              </s-stack>
            </s-section>
          </div>
        </div>
      </s-page>

      <FieldConfigModal
        field={editingField}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveField}
      />
    </>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
