import { useState, useEffect } from "react";

export default function FieldConfigModal({ field, isOpen, onClose, onSave }) {
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
      setFormData(field);
    } else {
      // Reset for new field
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
      });
    }
  }, [field, isOpen]);

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
          <s-heading>{field ? "Edit Field" : "Add New Field"}</s-heading>

          <form onSubmit={handleSubmit}>
            <s-stack direction="block" gap="base">
              {/* Field Type */}
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
                  <option value="image">Image/GIF</option>
                </select>
              </s-stack>

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

              {/* Required Checkbox */}
              <s-stack direction="inline" gap="small" align="center">
                <input
                  type="checkbox"
                  checked={formData.required}
                  onChange={(e) => handleChange("required", e.target.checked)}
                  id="required-checkbox"
                />
                <label htmlFor="required-checkbox">
                  <s-text>Required field</s-text>
                </label>
              </s-stack>

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
