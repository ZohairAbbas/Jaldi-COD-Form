/**
 * Setup guide status — derived, not merchant-reported.
 *
 * The guide used to rely on the merchant ticking each step off by hand, which
 * meant the checkmarks recorded intent rather than reality: a shop could show a
 * completed guide with the app embed switched off, or nag a merchant who had
 * finished everything and never touched the checkboxes.
 *
 * Both steps are observable, so they are computed from the shop's actual state
 * on every dashboard load instead.
 */

import { getDefaultSettings, getDefaultFormConfig } from "./db.server.js";

// Held as JSON strings rather than scalars, and compared separately (or not at
// all) — see fieldsDifferFromDefault.
const BLOB_KEYS = new Set(["sections", "fields"]);

/**
 * True when any scalar setting has moved off its default.
 *
 * Driven by the keys of the defaults object itself, so a newly added default is
 * picked up here without anyone remembering to update a list. A stored value of
 * null/undefined counts as untouched — the column was added after this shop was
 * created and has never been written.
 */
function scalarsDifferFromDefault(stored, defaults) {
  if (!stored) return false;

  return Object.entries(defaults).some(([key, defaultValue]) => {
    if (BLOB_KEYS.has(key)) return false;
    const current = stored[key];
    if (current === undefined || current === null) return false;
    return current !== defaultValue;
  });
}

function parseFields(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * True when the merchant has reshaped the form's fields.
 *
 * Compared field-by-field rather than as raw JSON, because the stored blob
 * drifts from today's defaults for reasons that have nothing to do with the
 * merchant: getOrCreateShop backfills a missing `email` field into legacy form
 * configs and renumbers every `order` after it. Comparing the strings would
 * mark those shops as customised when nobody customised anything.
 *
 * So `order` is ignored outright, and only `visible` / `required` are compared —
 * the two flags the backfill leaves alone and a merchant changes on purpose.
 * Labels and placeholders are skipped too: those have shifted across releases,
 * and stale copy in an old row is not a signal about the merchant.
 */
function fieldsDifferFromDefault(storedRaw, defaultRaw) {
  const stored = parseFields(storedRaw);
  const defaults = parseFields(defaultRaw);

  // Unparseable on either side: report no change rather than guess. A false
  // "not done" only costs a nag; a false "done" hides a broken install.
  if (!stored || !defaults) return false;

  const defaultsById = new Map(defaults.map((f) => [f.id, f]));

  // Adding or deleting a field is unambiguous customisation.
  if (stored.length !== defaults.length) return true;

  return stored.some((field) => {
    const fallback = defaultsById.get(field.id);
    if (!fallback) return true;
    return (
      field.visible !== fallback.visible || field.required !== fallback.required
    );
  });
}

/**
 * Has this shop customised its form or settings at all?
 */
export function isCustomized(settings, formConfig) {
  const defaultSettings = getDefaultSettings();
  const defaultFormConfig = getDefaultFormConfig();

  return (
    scalarsDifferFromDefault(settings, defaultSettings) ||
    scalarsDifferFromDefault(formConfig, defaultFormConfig) ||
    fieldsDifferFromDefault(formConfig?.fields, defaultFormConfig.fields)
  );
}

/**
 * Derive both setup steps from observable state.
 *
 * `themeEmbedEnabled` must be a real observation — pass null when the theme
 * could not be read, so the caller's cached value is used instead of a failed
 * lookup being reported to the merchant as "you haven't enabled the form".
 */
export function deriveSetupSteps({ settings, formConfig, themeEmbedEnabled }) {
  return {
    step1Completed: themeEmbedEnabled === true,
    step2Completed: isCustomized(settings, formConfig),
  };
}
