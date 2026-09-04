import React from 'react';

/**
 * Smart Checkout icon set — ported from the design project's icons.jsx.
 *
 * All icons take a `size` prop (px, applied to both width and height) and draw
 * with `currentColor`, so colour comes from the parent's `color`. Any other
 * props (style, aria-*, onClick) pass through to the <svg>.
 *
 * `size` is destructured out rather than spread: it isn't a valid SVG attribute
 * and React would forward it to the DOM and warn.
 *
 * Add icons here, nowhere else.
 */
const Icon = {
  Lock: ({ size = 14, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <rect x="2.5" y="7" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  Phone: ({ size = 18, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M5.5 3h3l1.5 4-2 1.2a10 10 0 0 0 4 4l1.2-2 4 1.5v3a2 2 0 0 1-2 2A12 12 0 0 1 3.5 5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  Whatsapp: ({ size = 20, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...p}>
      <path fill="currentColor" d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2a9.93 9.93 0 0 0-8.61 14.88L2 22l5.25-1.38a9.92 9.92 0 0 0 4.78 1.22h.01a9.94 9.94 0 0 0 9.93-9.92 9.86 9.86 0 0 0-2.92-7zM12.04 20.15h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.24 8.24 0 0 1 12.76-10.23 8.16 8.16 0 0 1 2.42 5.83 8.25 8.25 0 0 1-8.18 8.26zm4.52-6.18c-.25-.13-1.47-.72-1.7-.81-.22-.08-.39-.13-.55.13-.16.25-.63.81-.77.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.55-1.34-.76-1.84-.2-.48-.41-.42-.55-.42h-.47c-.16 0-.43.06-.66.31-.22.25-.86.84-.86 2.06s.88 2.39 1 2.55c.13.17 1.72 2.63 4.17 3.69.58.25 1.04.4 1.4.51.59.19 1.12.16 1.55.1.47-.07 1.45-.59 1.66-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.47-.28z" />
    </svg>
  ),
  Check: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" {...p}>
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevronDown: ({ size = 14, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevronRight: ({ size = 14, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowLeft: ({ size = 18, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M12 5l-5 5 5 5M7 10h11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Close: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Truck: ({ size = 18, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" {...p}>
      <path d="M3 6h11v10H3zM14 9h4l3 4v3h-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7" cy="17.5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17.5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  Cart: ({ size = 18, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" {...p}>
      <path d="M3 4h2l2.6 11.2a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.4-1.1L21 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  ),
  Shield: ({ size = 14, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M10 2l6 2v5c0 4-2.6 7.4-6 9-3.4-1.6-6-5-6-9V4l6-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 10l1.8 1.8L13 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Pin: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M10 18s6-5.5 6-10a6 6 0 1 0-12 0c0 4.5 6 10 6 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  Plus: ({ size = 14, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Edit: ({ size = 13, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  Sparkle: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...p}>
      <path d="M12 2l1.6 5.4L19 9l-5.4 1.6L12 16l-1.6-5.4L5 9l5.4-1.6L12 2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  ),
  Tag: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" {...p}>
      <path d="M3 10V3h7l8 8-7 7-8-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1.2" fill="currentColor" />
    </svg>
  ),
  Info: ({ size = 13, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.5v3.5M8 5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  Star: ({ size = 12, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" {...p}>
      <path d="M8 1l2.1 4.4 4.9.7-3.5 3.4.8 4.8L8 12l-4.3 2.3.8-4.8L1 6.1l4.9-.7L8 1z" />
    </svg>
  ),
  Trash: ({ size = 13, ...p }) => (
    <svg viewBox="0 0 16 16" width={size} height={size} fill="none" {...p}>
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.6 9a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1L12 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  CreditCard: ({ size = 16, ...p }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" {...p}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
};

export default Icon;
