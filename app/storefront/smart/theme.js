/**
 * Smart Checkout theming.
 *
 * The design derives its whole accent palette from a single brand colour
 * (deriveTheme in the prototype's app.jsx). We feed that from the merchant's
 * already-configured `settings.buttonBgColor` so stores keep the brand colour
 * they set, rather than introducing a second colour setting for the same idea.
 *
 * Only these four tokens are computed at runtime; everything else is static in
 * styles.css.
 */

const FALLBACK = { r: 14, g: 159, b: 173 }; // #0E9FAD — the design's default brand

/**
 * Parse a CSS colour into {r,g,b}.
 *
 * Handles the two formats the settings UI actually produces: `rgba(0,0,0,1)`
 * (the schema default) and `#RRGGBB` / `#RGB`. Anything else — a named colour,
 * `hsl()`, an empty string — falls back to the design's brand rather than
 * producing NaN channels, which would render the accent transparent.
 */
function parseColor(input) {
  if (typeof input !== 'string') return FALLBACK;
  const value = input.trim();

  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Math.max(0, Math.round(parseFloat(n)))));
    if ([r, g, b].every(Number.isFinite)) return { r, g, b };
    return FALLBACK;
  }

  let hex = value.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length !== 6 || !/^[0-9a-f]{6}$/i.test(hex)) return FALLBACK;

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/**
 * Build the runtime CSS custom properties for a brand colour.
 *
 * Returns a style object to spread onto the form's root element. Matches the
 * prototype's deriveTheme: soft/softer are alpha tints of the brand (so they
 * sit correctly on any background) and ink is a 45%-luminance shade used for
 * text on those tints.
 */
export function deriveTheme(brandColor) {
  const { r, g, b } = parseColor(brandColor);
  return {
    '--brand': `rgb(${r}, ${g}, ${b})`,
    '--brand-soft': `rgba(${r}, ${g}, ${b}, 0.10)`,
    '--brand-softer': `rgba(${r}, ${g}, ${b}, 0.05)`,
    '--brand-ink': `rgb(${Math.round(r * 0.45)}, ${Math.round(g * 0.45)}, ${Math.round(b * 0.45)})`,
  };
}

/**
 * Corner-radius presets. The prototype exposes these as a tweak; we expose the
 * same three so a merchant setting can drive them later without a redesign.
 */
export const RADIUS_PRESETS = {
  sharp: { '--radius-lg': '8px', '--radius': '6px', '--radius-sm': '4px' },
  rounded: { '--radius-lg': '20px', '--radius': '14px', '--radius-sm': '10px' },
  pill: { '--radius-lg': '24px', '--radius': '20px', '--radius-sm': '14px' },
};

export function radiusVars(preset) {
  return RADIUS_PRESETS[preset] || RADIUS_PRESETS.rounded;
}
