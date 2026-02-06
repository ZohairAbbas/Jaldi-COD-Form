import { useState } from "react";

export default function FieldManager({ fields, onUpdate, onEditField, onAddField }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const toggleVisibility = (fieldId) => {
    const updated = fields.map((field) =>
      field.id === fieldId ? { ...field, visible: !field.visible } : field,
    );
    onUpdate(updated);
  };

  const deleteField = (fieldId, field) => {
    // Prevent deletion of core fields
    if (field.isCore || field.isDeletable === false) {
      alert("This is a core field and cannot be deleted. Core fields (First Name, Phone, Address, City, Email) are required for order processing.");
      return;
    }

    const updated = fields.filter((f) => f.id !== fieldId);
    // Update order values
    updated.forEach((field, idx) => {
      field.order = idx;
    });
    onUpdate(updated);
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      const shippingFields = fields
        .filter((f) => f.section === "shipping-address")
        .sort((a, b) => a.order - b.order);

      const newFields = [...shippingFields];
      const draggedItem = newFields[draggedIndex];

      // Remove from old position
      newFields.splice(draggedIndex, 1);
      // Insert at new position
      newFields.splice(dragOverIndex, 0, draggedItem);

      // Update order values
      newFields.forEach((field, idx) => {
        field.order = idx;
      });

      // Merge with non-shipping-address fields
      const otherFields = fields.filter((f) => f.section !== "shipping-address");
      onUpdate([...newFields, ...otherFields]);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const renderIcon = (iconName) => {
    const iconProps = {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { display: 'block' }
    };

    switch (iconName) {
      case 'edit':
        return (
          <svg {...iconProps}>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        );
      case 'hide':
        return (
          <svg {...iconProps}>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        );
      case 'show':
        return (
          <svg {...iconProps}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        );
      case 'delete':
        return (
          <svg {...iconProps}>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        );
      default:
        return null;
    }
  };

  const shippingFields = fields
    .filter((f) => f.section === "shipping-address")
    .sort((a, b) => a.order - b.order);

  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="base" align="space-between">
        <s-heading>Form Fields</s-heading>
      </s-stack>

      <s-paragraph>
        Manage the fields in your shipping address section.
      </s-paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {shippingFields.map((field, index) => (
          <div
            key={field.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
            style={{
              padding: '12px',
              border: '1px solid #E1E3E5',
              borderRadius: '8px',
              backgroundColor: dragOverIndex === index ? '#F6F6F7' : 'white',
              opacity: draggedIndex === index ? 0.5 : 1,
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'background-color 0.2s, opacity 0.2s',
            }}
          >
            {/* Left side: drag handle + field info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <span style={{ fontSize: '16px', color: '#8C9196', cursor: 'grab', lineHeight: 1 }}>⋮⋮</span>

              <span style={{ fontSize: '14px', fontWeight: '500', color: '#202223' }}>
                {field.label}
              </span>
            </div>

            {/* Right side: badge + action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Shopify/Custom badge */}
              {field.fieldCategory && (
                <s-badge tone={field.fieldCategory === "shopify" ? "success" : "neutral"}>
                  {field.fieldCategory === "shopify" ? "Shopify" : "Custom"}
                </s-badge>
              )}
              {/* Edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditField(field);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  color: '#5C5F62',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F6F6F7'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title="Edit"
              >
                {renderIcon('edit')}
              </button>

              {/* Toggle visibility button - only for non-core fields */}
              {!field.isCore && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(field.id);
                  }}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    color: '#5C5F62',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F6F6F7'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title={field.visible ? "Hide" : "Show"}
                >
                  {renderIcon(field.visible ? 'hide' : 'show')}
                </button>
              )}

              {/* Delete button - only for deletable fields */}
              {field.isDeletable !== false && !field.isCore && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteField(field.id, field);
                  }}
                  style={{
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    color: '#D72C0D',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#FEF3F2'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Delete"
                >
                  {renderIcon('delete')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add new fields button */}
      <button
        onClick={onAddField}
        style={{
          width: '100%',
          padding: '12px',
          border: 'none',
          background: '#303030',
          color: 'white',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1a1a1a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#303030'}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        Add new fields
      </button>
    </s-stack>
  );
}
