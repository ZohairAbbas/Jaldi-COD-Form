import { useState } from "react";

export default function FieldManager({ fields, onUpdate, onEditField, onAddField }) {
  const fieldTypeIcons = {
    text: "text",
    dropdown: "list",
    checkbox: "check",
    date: "calendar",
    quantity: "hash",
    title: "text-heading",
    image: "image",
  };

  const toggleVisibility = (fieldId) => {
    const updated = fields.map((field) =>
      field.id === fieldId ? { ...field, visible: !field.visible } : field,
    );
    onUpdate(updated);
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newFields.length) return;

    // Swap fields
    [newFields[index], newFields[targetIndex]] = [
      newFields[targetIndex],
      newFields[index],
    ];

    // Update order values
    newFields.forEach((field, idx) => {
      field.order = idx;
    });

    onUpdate(newFields);
  };

  const deleteField = (fieldId) => {
    if (confirm("Are you sure you want to delete this field?")) {
      const updated = fields.filter((field) => field.id !== fieldId);
      // Update order values
      updated.forEach((field, idx) => {
        field.order = idx;
      });
      onUpdate(updated);
    }
  };

  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="base" align="space-between">
        <s-heading>Form Fields</s-heading>
        <span onClick={onAddField}>                                                                                                        
          <s-button variant="primary" size="small">                                                                                        
            + Add Field                                                                                                                    
          </s-button>                                                                                                                      
        </span>
      </s-stack>

      <s-paragraph>
        Manage the fields in your shipping address section.
      </s-paragraph>

      {fields
        .filter((f) => f.section === "shipping-address")
        .sort((a, b) => a.order - b.order)
        .map((field, index) => (
          <s-box
            key={field.id}
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background={field.visible ? "surface" : "subdued"}
          >
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="inline" gap="base" align="center">
                <span style={{ fontSize: '18px', color: '#8C9196', cursor: 'grab' }}>⋮⋮</span> 
                <s-stack direction="block" gap="extra-tight">
                  <s-text variant="heading-sm">{field.label}</s-text>
                  <s-text variant="body-sm" tone="subdued">
                    {field.type}
                    {field.required ? " • Required" : " • Optional"}
                  </s-text>
                </s-stack>
                <s-badge tone={field.visible ? "success" : "subdued"}>
                  {field.visible ? "Visible" : "Hidden"}
                </s-badge>
              </s-stack>

              <s-stack direction="inline" gap="small">
                <span
                  onClick={() => {
                    const fieldIndex = fields.findIndex((f) => f.id === field.id);
                    moveField(fieldIndex, "up");
                  }}
                ><s-button
                  variant="tertiary"
                  size="small"
                  disabled={index === 0}
                >
                  ↑
                </s-button>
                </span>
                <span
                  onClick={() => {
                    const fieldIndex = fields.findIndex((f) => f.id === field.id);
                    moveField(fieldIndex, "down");
                  }}
                ><s-button
                  variant="tertiary"
                  size="small"
                  disabled={index === fields.filter((f) => f.section === "shipping-address").length - 1}
                >
                  ↓
                </s-button>
                </span>
                <span onClick={() => onEditField(field)}>                                                                                 
         <s-button                                                                                                               
           variant="tertiary"                                                                                                    
           size="small"                                                                                                          
        >                                                                                                                        
           Edit                                                                                                                  
         </s-button>                                                                                                             
      </span>                                                                                                                    
       <span onClick={() => toggleVisibility(field.id)}>                                                                         
         <s-button                                                                                                               
           variant={field.visible ? "tertiary" : "primary"}                                                                      
           size="small"                                                                                                          
         >                                                                                                                       
           {field.visible ? "Hide" : "Show"}                                                                                     
         </s-button>                                                                                                             
       </span>                                                                                                                   
       <span onClick={() => deleteField(field.id)}>                                                                              
         <s-button                                                                                                               
           variant="critical"                                                                                                    
           size="small"                                                                                                          
         >                                                                                                                       
           Delete                                                                                                                
         </s-button>                                                                                                             
       </span>
              </s-stack>
            </s-stack>
          </s-box>
        ))}
    </s-stack>
  );
}
