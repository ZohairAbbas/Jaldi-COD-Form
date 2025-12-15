import React from 'react';

export default function BuyButton({ config, onClick }) {
  const settings = config.settings;

  // Get animation class
  const getAnimationClass = (animation) => {
    switch (animation) {
      case 'pulse':
        return 'jaldi-button-pulse';
      case 'shake':
        return 'jaldi-button-shake';
      case 'bounce':
        return 'jaldi-button-bounce';
      default:
        return '';
    }
  };

  const buttonStyle = {
    width: '100%',
    backgroundColor: settings.buttonBgColor || '#000000',
    color: settings.buttonTextColor || '#FFFFFF',
    padding: '12px 24px',
    border: `${settings.buttonBorderWidth || 0}px solid ${settings.buttonBorderColor || '#000000'}`,
    borderRadius: `${settings.buttonBorderRadius || 4}px`,
    fontSize: `${settings.buttonFontSize || 16}px`,
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: `0 ${settings.buttonShadow || 4}px ${(settings.buttonShadow || 4) * 2}px rgba(0, 0, 0, 0.1)`,
    transition: 'all 0.3s ease',
  };

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  };

  // Icon renderer
  const renderIcon = (iconType) => {
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

    switch (iconType) {
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
  };

  return (
    <button
      onClick={onClick}
      className={getAnimationClass(settings.buttonAnimation)}
      style={buttonStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 ${(settings.buttonShadow || 4) + 2}px ${((settings.buttonShadow || 4) + 2) * 2}px rgba(0, 0, 0, 0.15)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 ${settings.buttonShadow || 4}px ${(settings.buttonShadow || 4) * 2}px rgba(0, 0, 0, 0.1)`;
      }}
    >
      <div style={containerStyle}>
        {renderIcon(settings.buttonIcon || 'cart')}
        {settings.buttonText}
      </div>
    </button>
  );
}
