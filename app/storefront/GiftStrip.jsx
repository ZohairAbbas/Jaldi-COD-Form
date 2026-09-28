import React from 'react';

/**
 * The free-gift strip attached to the bottom of a quantity-offer tier card.
 * Shared by the storefront BundleWidget and the admin live preview, so what the
 * merchant sees while editing is what customers get.
 *
 * Colours come from the offer's preset (no per-gift pickers): a selected tier's
 * strip is filled with the tier's selected border colour, an unselected one is a
 * muted tint of it.
 */

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function readableOn(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#fff';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#111' : '#fff';
}

function tint(hex, alpha) {
  const rgb = hexToRgb(hex);
  return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : `rgba(0, 0, 0, ${alpha})`;
}

const sameColor = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/** Gold ribbon + bow down the strip's trailing edge. Flat fills, no SVG ids. */
function Ribbon({ isRTL }) {
  return (
    <svg
      aria-hidden="true"
      width="44"
      height="100%"
      viewBox="0 0 44 64"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [isRTL ? 'left' : 'right']: '10px',
        height: '100%',
        pointerEvents: 'none',
        transform: isRTL ? 'scaleX(-1)' : undefined,
      }}
    >
      <rect x="18" y="0" width="8" height="64" fill="#E0B64A" />
      <rect x="21" y="0" width="2" height="64" fill="#F5D77F" />
      <path d="M22 32 C 10 18, 2 22, 6 30 C 8 35, 16 34, 22 32 Z" fill="#E0B64A" stroke="#B8892B" strokeWidth="1" />
      <path d="M22 32 C 34 18, 42 22, 38 30 C 36 35, 28 34, 22 32 Z" fill="#E0B64A" stroke="#B8892B" strokeWidth="1" />
      <path d="M22 32 L 12 50 L 16 49 L 18 53 L 22 34 Z" fill="#D4A63A" stroke="#B8892B" strokeWidth="1" />
      <path d="M22 32 L 32 50 L 28 49 L 26 53 L 22 34 Z" fill="#D4A63A" stroke="#B8892B" strokeWidth="1" />
      <circle cx="22" cy="32" r="4" fill="#F5D77F" stroke="#B8892B" strokeWidth="1" />
    </svg>
  );
}

export default function GiftStrip({
  gift, // { name, image, quantity, unitPrice?, variants?, variantId?, showOriginalPrice }
  isSelected,
  colors = {},
  radius = 12,
  space = 12,
  currencySymbol = '',
  exchangeRate = null,
  freeLabel = 'FREE',
  isRTL = false,
  compact = false, // horizontal layout: narrow column cards
  onVariantChange = null,
}) {
  if (!gift) return null;

  const accent = colors.selectedTier?.borderColor || '#000';
  const background = isSelected ? accent : tint(accent, 0.12);
  const ink = isSelected ? readableOn(accent) : (colors.tierTitle?.color || '#111');

  // The FREE pill uses the preset's badge colours unless they'd vanish into the
  // strip (e.g. a black preset whose badge is also black) — then invert.
  let freeBg = colors.badge?.bgColor || '#000';
  let freeInk = colors.badge?.textColor || '#fff';
  if (isSelected && sameColor(freeBg, accent)) {
    freeBg = ink;
    freeInk = accent;
  }

  const original = gift.unitPrice != null ? gift.unitPrice * gift.quantity * (exchangeRate || 1) : null;
  const showOriginal = gift.showOriginalPrice !== false && original != null && original > 0;
  const choosable = isSelected
    && onVariantChange
    && Array.isArray(gift.variants)
    && gift.variants.length > 1;
  const innerRadius = Math.max(0, radius - 2);

  const thumb = (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {gift.image ? (
        <img
          src={gift.image}
          alt=""
          style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', background: '#fff', display: 'block' }}
        />
      ) : (
        <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🎁</div>
      )}
      <span
        style={{
          position: 'absolute',
          top: '-6px',
          [isRTL ? 'right' : 'left']: '-6px',
          minWidth: '18px',
          height: '18px',
          padding: '0 4px',
          borderRadius: '9px',
          background: freeBg,
          color: freeInk,
          fontSize: '10px',
          fontWeight: '700',
          lineHeight: '18px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        {gift.quantity}x
      </span>
    </div>
  );

  const select = choosable && (
    <select
      value={gift.variantId}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onVariantChange(e.target.value); }}
      style={{
        marginTop: '4px',
        maxWidth: '100%',
        padding: '2px 6px',
        borderRadius: '4px',
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#111',
        fontSize: '12px',
        cursor: 'pointer',
      }}
    >
      {gift.variants.map((v) => (
        <option key={v.id} value={v.id}>{v.title}</option>
      ))}
    </select>
  );

  const price = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'center' : (isRTL ? 'flex-start' : 'flex-end'), gap: '2px', flexShrink: 0 }}>
      {showOriginal && (
        <span style={{ fontSize: '11px', textDecoration: 'line-through', opacity: 0.8 }}>
          {currencySymbol}{original.toFixed(2)}
        </span>
      )}
      <span
        style={{
          background: freeBg,
          color: freeInk,
          fontSize: '12px',
          fontWeight: '800',
          padding: '2px 8px',
          borderRadius: '4px',
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {freeLabel}
      </span>
    </div>
  );

  return (
    <div
      style={{
        position: 'relative',
        margin: `${space}px -${space}px -${space}px`,
        // Room on the trailing edge for the ribbon.
        padding: compact
          ? `${space + 4}px 8px ${space}px`
          : (isRTL ? `${space}px ${space}px ${space}px ${space + 56}px` : `${space}px ${space + 56}px ${space}px ${space}px`),
        background,
        color: ink,
        borderRadius: `0 0 ${innerRadius}px ${innerRadius}px`,
        opacity: isSelected ? 1 : 0.85,
        transition: 'all 0.2s',
        overflow: 'visible',
      }}
    >
      {/* "+" connector straddling the card / strip boundary */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          background: '#fff',
          border: `1.5px solid ${accent}`,
          color: accent,
          fontSize: '14px',
          fontWeight: '700',
          lineHeight: '15px',
          textAlign: 'center',
          boxSizing: 'border-box',
          zIndex: 1,
        }}
      >
        +
      </span>

      {!compact && <Ribbon isRTL={isRTL} />}

      {compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
          {thumb}
          <span style={{ fontSize: '12px', fontWeight: '600', lineHeight: 1.3, wordBreak: 'break-word' }}>{gift.name}</span>
          {select}
          {price}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          {thumb}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: '600', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {gift.name}
            </div>
            {select}
          </div>
          {price}
        </div>
      )}
    </div>
  );
}
