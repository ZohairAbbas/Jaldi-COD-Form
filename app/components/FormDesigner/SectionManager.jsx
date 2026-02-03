import { useState } from "react";

export default function SectionManager({ sections, onUpdate }) {
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const sectionTypes = {
    orderSummary: "Order Summary",
    totals: "Totals Summary",
    shippingMethod: "Shipping Method",
    shippingAddress: "Shipping Address",
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

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

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
            {/* Left side: drag handle + section name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <span style={{ fontSize: '16px', color: '#8C9196', cursor: 'grab', lineHeight: 1 }}>⋮⋮</span>

              <span style={{ fontSize: '14px', fontWeight: '500', color: '#202223' }}>
                {sectionTypes[section.type] || section.type}
              </span>
            </div>

            {/* Right side: action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* Toggle visibility button */}
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
            </div>
          </div>
        ))}
      </div>
    </s-stack>
  );
}
