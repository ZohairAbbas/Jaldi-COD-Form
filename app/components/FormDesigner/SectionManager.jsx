import { useState } from "react";

export default function SectionManager({ sections, onUpdate }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const sectionTypes = {
    orderSummary: "Order Summary",
    shippingMethod: "Shipping Method",
    shippingAddress: "Shipping Address",
  };

  // Default heading text shown as placeholder when no custom label is set
  const defaultLabels = {
    orderSummary: "Order summary",
    shippingMethod: "Shipping",
    shippingAddress: "Enter your shipping address",
  };

  const updateLabel = (sectionId, value) => {
    const updated = sections.map((section) =>
      section.id === sectionId
        ? { ...section, customLabel: value }
        : section,
    );
    onUpdate(updated);
  };

  const updateAlign = (sectionId, value) => {
    const updated = sections.map((section) =>
      section.id === sectionId
        ? { ...section, headingAlign: value }
        : section,
    );
    onUpdate(updated);
  };

  const toggleVisibility = (sectionId) => {
    const updated = sections.map((section) =>
      section.id === sectionId
        ? { ...section, visible: !section.visible }
        : section,
    );
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
      const sortedSections = [...sections].sort((a, b) => a.order - b.order);
      const newSections = [...sortedSections];
      const draggedItem = newSections[draggedIndex];

      // Remove from old position
      newSections.splice(draggedIndex, 1);
      // Insert at new position
      newSections.splice(dragOverIndex, 0, draggedItem);

      // Update order values
      newSections.forEach((section, idx) => {
        section.order = idx;
      });

      onUpdate(newSections);
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
      default:
        return null;
    }
  };

  // 'totals' is merged into Order Summary — never show it in the designer
  const sortedSections = [...sections]
    .filter((s) => s.type !== "totals")
    .sort((a, b) => a.order - b.order);

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form Sections</s-heading>
      <s-paragraph>
        Control which sections appear in your form and their order.
      </s-paragraph>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sortedSections.map((section, index) => (
          <div
            key={section.id}
            style={{
              border: '1px solid #E1E3E5',
              borderRadius: '8px',
              backgroundColor: dragOverIndex === index ? '#F6F6F7' : 'white',
              opacity: draggedIndex === index ? 0.5 : 1,
              transition: 'background-color 0.2s, opacity 0.2s',
            }}
          >
            {/* Draggable header row: drag handle + section name + actions */}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
              style={{
                padding: '12px',
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Left side: drag handle + section name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                <span style={{ fontSize: '16px', color: '#8C9196', cursor: 'grab', lineHeight: 1 }}>⋮⋮</span>

                <span style={{ fontSize: '14px', fontWeight: '500', color: '#202223' }}>
                  {sectionTypes[section.type] || section.type}
                </span>
              </div>

              {/* Right side: action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {/* Toggle visibility button - hide for shipping-address section */}
                {section.id !== 'shipping-address' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVisibility(section.id);
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
                    title={section.visible ? "Hide" : "Show"}
                  >
                    {renderIcon(section.visible ? 'hide' : 'show')}
                  </button>
                )}
              </div>
            </div>

            {/* Custom heading label input */}
            {defaultLabels[section.type] && (
              <div style={{ padding: '0 12px 12px 40px' }}>
                <label htmlFor={`section-label-${section.id}`} style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#6D7175', marginBottom: '4px' }}>
                  Heading label
                </label>
                <input
                  id={`section-label-${section.id}`}
                  type="text"
                  value={section.customLabel || ''}
                  onChange={(e) => updateLabel(section.id, e.target.value)}
                  placeholder={defaultLabels[section.type]}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '14px',
                    border: '1px solid #D1D5DB',
                    borderRadius: '6px',
                    boxSizing: 'border-box',
                    color: '#202223',
                  }}
                />

                {/* Heading alignment */}
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#6D7175', margin: '10px 0 4px' }}>
                  Heading alignment
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {['left', 'center', 'right'].map((align) => (
                    <button
                      key={align}
                      type="button"
                      onClick={() => updateAlign(section.id, align)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        textTransform: 'capitalize',
                        borderRadius: '6px',
                        border: (section.headingAlign || 'left') === align ? '2px solid #000' : '1px solid #D1D5DB',
                        backgroundColor: (section.headingAlign || 'left') === align ? '#F5F5F5' : '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: (section.headingAlign || 'left') === align ? '600' : '400',
                        color: '#202223',
                      }}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </s-stack>
  );
}
