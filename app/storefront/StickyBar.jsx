import React, { useState, useEffect } from 'react';

// Mobile-only sticky bar pinned to the page (not the form). Tapping it opens
// the COD form via the same handler as the inline BuyButton. Useful when the
// main buy button has scrolled out of view on long product pages.
const MOBILE_MAX_WIDTH = 768;

export default function StickyBar({ config, onClick }) {
  const settings = config.settings || {};
  const isRTL = settings.enableRTL || false;
  const position = settings.stickyBarPosition === 'top' ? 'top' : 'bottom';
  const alwaysVisible = settings.stickyBarAlwaysVisible !== false;

  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_MAX_WIDTH : false,
  );
  // When not always-visible, reveal only after the user scrolls a bit down.
  const [scrolledEnough, setScrolledEnough] = useState(alwaysVisible);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_MAX_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (alwaysVisible) {
      setScrolledEnough(true);
      return undefined;
    }
    const onScroll = () => setScrolledEnough(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [alwaysVisible]);

  if (!isMobile || !scrolledEnough) return null;

  const renderIcon = (iconType) => {
    const iconProps = {
      width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round',
    };
    switch (iconType) {
      case 'cart':
        return (<svg {...iconProps}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>);
      case 'truck':
        return (<svg {...iconProps}><path d="M1 3h15v13H1z" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>);
      case 'package':
        return (<svg {...iconProps}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>);
      case 'cash':
        return (<svg {...iconProps}><rect x="2" y="7" width="20" height="10" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M18 12h.01M6 12h.01" /></svg>);
      default:
        return null;
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        [position]: 0,
        zIndex: 2147483646,
        // No wrapper padding/background — the button spans edge-to-edge and the
        // surrounding area is transparent. Keep only the iOS safe-area inset at
        // the bottom so the button clears the home indicator.
        paddingBottom: position === 'bottom' ? 'env(safe-area-inset-bottom, 0px)' : 0,
        backgroundColor: 'transparent',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
        style={{
          width: '100%',
          backgroundColor: settings.buttonBgColor || '#000000',
          color: settings.buttonTextColor || '#FFFFFF',
          padding: '16px 24px',
          border: 'none',
          borderRadius: 0,
          fontSize: `${settings.buttonFontSize || 16}px`,
          fontFamily: 'inherit',
          fontWeight: '600',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          flexDirection: isRTL ? 'row-reverse' : 'row',
        }}
      >
        {renderIcon(settings.buttonIcon || 'cart')}
        {settings.buttonText}
      </button>
    </div>
  );
}
