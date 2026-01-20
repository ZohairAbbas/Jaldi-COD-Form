import { useState, useEffect, useRef } from "react";

export default function SectionManager({ sections, onUpdate }) {
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

  const moveSection = (index, direction) => {
    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newSections.length) return;

    // Swap sections
    [newSections[index], newSections[targetIndex]] = [
      newSections[targetIndex],
      newSections[index],
    ];

    // Update order values
    newSections.forEach((section, idx) => {
      section.order = idx;
    });

    onUpdate(newSections);
  };

  return (
    <s-stack direction="block" gap="base">
      <s-heading>Form Sections</s-heading>
      <s-paragraph>
        Control which sections appear in your form and their order.
      </s-paragraph>

      {sections
        .sort((a, b) => a.order - b.order)
        .map((section, index) => (
          <s-box
            key={section.id}
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background={section.visible ? "surface" : "subdued"}
          >
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="inline" gap="base" align="center">
                <span style={{ fontSize: '18px', color: '#8C9196', cursor: 'grab' }}>⋮⋮</span> 
                <s-text variant="heading-sm">
                  {sectionTypes[section.type] || section.type}
                </s-text>
                <s-badge tone={section.visible ? "success" : "subdued"}>
                  {section.visible ? "Visible" : "Hidden"}
                </s-badge>
              </s-stack>

              <s-stack direction="inline" gap="small">
                <span onClick={() => moveSection(index, "up")}>                                                                            
                   <s-button                                                                                                                
                     variant="tertiary"                                                                                                     
                     size="small"                                                                                                           
                     disabled={index === 0}                                                                                                 
                   >                                                                                                                        
                     ↑                                                                                                                      
                   </s-button>                                                                                                              
                </span>                                                                                                                     
                 <span onClick={() => moveSection(index, "down")}>                                                                          
                  <s-button                                                                                                                 
                     variant="tertiary"                                                                                                     
                     size="small"                                                                                                           
                     disabled={index === sections.length - 1}                                                                               
                  >                                                                                                                         
                     ↓                                                                                                                      
                   </s-button>                                                                                                              
                 </span>                                                                                                                    
                 <span onClick={() => toggleVisibility(section.id)}>                                                                        
                   <s-button                                                                                                                
                     variant={section.visible ? "tertiary" : "primary"}                                                                     
                     size="small"                                                                                                           
                   >                                                                                                                        
                     {section.visible ? "Hide" : "Show"}                                                                                    
                   </s-button>                                                                                                              
                 </span>
              </s-stack>
            </s-stack>
          </s-box>
        ))}
    </s-stack>
  );
}
