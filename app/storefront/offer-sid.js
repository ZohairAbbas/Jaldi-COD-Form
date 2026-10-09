/**
 * A random id for this browser tab, sent as `sid` with every offer stat call
 * so the server records one dated event per offer, kind and tab (Growzar,
 * pack G-PRV5-3). It identifies nothing about the buyer: no IP, no
 * fingerprint, nothing persisted beyond the tab (sessionStorage).
 */
const KEY = "preventify_offer_sid";
let memo = null;

export function getOfferSid() {
  if (memo) return memo;
  try {
    memo = window.sessionStorage.getItem(KEY);
  } catch {
    // Storage blocked (private mode, sandboxed frame): fall back to this page view.
  }
  if (!memo) {
    memo =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    try {
      window.sessionStorage.setItem(KEY, memo);
    } catch {
      // Same as above.
    }
  }
  return memo;
}
