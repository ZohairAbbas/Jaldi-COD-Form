/**
 * Preset palettes shared by the quantity-break editor and the combo editor.
 *
 * Both offer types render with the same storefront styling object, so they must
 * offer the same presets — a merchant who themes their quantity breaks expects
 * their combos to match.
 */

// ============================================
// COLOR PALETTES
// ============================================
export const COLOR_PALETTES = [
  {
    id: "default",
    label: "Default",
    swatch: "#000000",
    colors: {
      headerText: { color: "#000000", fontSize: 16 },
      tierTitle: { color: "#000000", fontSize: 14 },
      badge: { bgColor: "#000000", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#000000", fontSize: 16 },
      strikethroughPrice: { color: "#999999", fontSize: 14 },
      mostPopularTag: { bgColor: "#ff0000", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#000000", bgColor: "#f5f5f5" },
      unselectedTier: { borderColor: "#e0e0e0", bgColor: "#ffffff" },
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    swatch: "#0077b6",
    colors: {
      headerText: { color: "#023e8a", fontSize: 16 },
      tierTitle: { color: "#023e8a", fontSize: 14 },
      badge: { bgColor: "#0077b6", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#023e8a", fontSize: 16 },
      strikethroughPrice: { color: "#90e0ef", fontSize: 14 },
      mostPopularTag: { bgColor: "#00b4d8", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#0077b6", bgColor: "#caf0f8" },
      unselectedTier: { borderColor: "#90e0ef", bgColor: "#ffffff" },
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    swatch: "#e63946",
    colors: {
      headerText: { color: "#1d3557", fontSize: 16 },
      tierTitle: { color: "#1d3557", fontSize: 14 },
      badge: { bgColor: "#e63946", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#1d3557", fontSize: 16 },
      strikethroughPrice: { color: "#a8dadc", fontSize: 14 },
      mostPopularTag: { bgColor: "#e63946", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#e63946", bgColor: "#f1faee" },
      unselectedTier: { borderColor: "#a8dadc", bgColor: "#ffffff" },
    },
  },
  {
    id: "forest",
    label: "Forest",
    swatch: "#2d6a4f",
    colors: {
      headerText: { color: "#1b4332", fontSize: 16 },
      tierTitle: { color: "#1b4332", fontSize: 14 },
      badge: { bgColor: "#2d6a4f", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#1b4332", fontSize: 16 },
      strikethroughPrice: { color: "#95d5b2", fontSize: 14 },
      mostPopularTag: { bgColor: "#40916c", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#2d6a4f", bgColor: "#d8f3dc" },
      unselectedTier: { borderColor: "#95d5b2", bgColor: "#ffffff" },
    },
  },
  {
    id: "purple",
    label: "Purple",
    swatch: "#7209b7",
    colors: {
      headerText: { color: "#3c096c", fontSize: 16 },
      tierTitle: { color: "#3c096c", fontSize: 14 },
      badge: { bgColor: "#7209b7", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#3c096c", fontSize: 16 },
      strikethroughPrice: { color: "#c77dff", fontSize: 14 },
      mostPopularTag: { bgColor: "#9d4edd", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#7209b7", bgColor: "#e0aaff" },
      unselectedTier: { borderColor: "#c77dff", bgColor: "#ffffff" },
    },
  },
];

// ============================================
// GRADIENT PALETTES
// ============================================
// Gradients apply to ALL tier cards via `bgGradient`. `bgColor` is kept as a
// solid fallback for older renderers / when gradients aren't supported.
export const GRADIENT_PALETTES = [
  {
    id: "gradient-sunrise",
    label: "Sunrise",
    swatch: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)",
    colors: {
      headerText: { color: "#7a2d2d", fontSize: 16 },
      tierTitle: { color: "#7a2d2d", fontSize: 14 },
      badge: { bgColor: "#ef6f6c", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#7a2d2d", fontSize: 16 },
      strikethroughPrice: { color: "#b98a8a", fontSize: 14 },
      mostPopularTag: { bgColor: "#ef6f6c", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#ef6f6c", bgColor: "#fde2e0", bgGradient: "linear-gradient(135deg, #ffd9c0 0%, #ffc1cc 100%)" },
      unselectedTier: { borderColor: "#f5c6c0", bgColor: "#fff5f3", bgGradient: "linear-gradient(135deg, #fff1ea 0%, #ffe6ea 100%)" },
    },
  },
  {
    id: "gradient-aurora",
    label: "Aurora",
    swatch: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    colors: {
      headerText: { color: "#4a3a6b", fontSize: 16 },
      tierTitle: { color: "#4a3a6b", fontSize: 14 },
      badge: { bgColor: "#8b6fc4", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#4a3a6b", fontSize: 16 },
      strikethroughPrice: { color: "#a99ec4", fontSize: 14 },
      mostPopularTag: { bgColor: "#8b6fc4", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#8b6fc4", bgColor: "#ede7f6", bgGradient: "linear-gradient(135deg, #c9b8ee 0%, #f6c8ee 100%)" },
      unselectedTier: { borderColor: "#d6c9f0", bgColor: "#f8f5ff", bgGradient: "linear-gradient(135deg, #efe9fb 0%, #fdeef9 100%)" },
    },
  },
  {
    id: "gradient-mint",
    label: "Mint",
    swatch: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    colors: {
      headerText: { color: "#15524a", fontSize: 16 },
      tierTitle: { color: "#15524a", fontSize: 14 },
      badge: { bgColor: "#34b3a0", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#15524a", fontSize: 16 },
      strikethroughPrice: { color: "#8fc4bb", fontSize: 14 },
      mostPopularTag: { bgColor: "#34b3a0", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#34b3a0", bgColor: "#dcf5ee", bgGradient: "linear-gradient(135deg, #b8f0d4 0%, #bfe6f5 100%)" },
      unselectedTier: { borderColor: "#bfe7dd", bgColor: "#f3fdfa", bgGradient: "linear-gradient(135deg, #e8fbf1 0%, #ecf8fd 100%)" },
    },
  },
  {
    id: "gradient-peach",
    label: "Peach",
    swatch: "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
    colors: {
      headerText: { color: "#7a4326", fontSize: 16 },
      tierTitle: { color: "#7a4326", fontSize: 14 },
      badge: { bgColor: "#f08a5d", textColor: "#ffffff", fontSize: 12 },
      price: { color: "#7a4326", fontSize: 16 },
      strikethroughPrice: { color: "#cba48f", fontSize: 14 },
      mostPopularTag: { bgColor: "#f08a5d", textColor: "#ffffff", fontSize: 11 },
      selectedTier: { borderColor: "#f08a5d", bgColor: "#ffe9d6", bgGradient: "linear-gradient(135deg, #ffe0c2 0%, #ffcab0 100%)" },
      unselectedTier: { borderColor: "#fad9c2", bgColor: "#fff8f1", bgGradient: "linear-gradient(135deg, #fff4e8 0%, #ffeee2 100%)" },
    },
  },
  {
    id: "gradient-midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
    colors: {
      headerText: { color: "#ffffff", fontSize: 16 },
      tierTitle: { color: "#ffffff", fontSize: 14 },
      badge: { bgColor: "#30cfd0", textColor: "#0b2545", fontSize: 12 },
      price: { color: "#ffffff", fontSize: 16 },
      strikethroughPrice: { color: "#b8c4e0", fontSize: 14 },
      mostPopularTag: { bgColor: "#30cfd0", textColor: "#0b2545", fontSize: 11 },
      selectedTier: { borderColor: "#30cfd0", bgColor: "#27306b", bgGradient: "linear-gradient(135deg, #3a3f8f 0%, #241052 100%)" },
      unselectedTier: { borderColor: "#3a3f8f", bgColor: "#2a2f63", bgGradient: "linear-gradient(135deg, #2d3372 0%, #1d0c45 100%)" },
    },
  },
];
