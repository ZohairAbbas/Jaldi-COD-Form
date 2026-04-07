/**
 * Device Recognition for One-Tap Checkout
 *
 * Two-layer approach:
 * 1. localStorage (Layer 1): Fast, 100% accurate for same browser
 * 2. ThumbmarkJS fingerprint (Layer 2): Fallback for cleared storage, ~80% accuracy
 */

const LOCALSTORAGE_KEY = 'preventify_buyer';
let thumbmarkInstance = null;
let cachedFingerprint = null;

// ============================================
// Layer 1: localStorage (fast, reliable)
// ============================================

/**
 * Get buyer data from localStorage (sync, instant)
 * @returns {{ phone: string, firstName: string, savedAt: string } | null}
 */
export function getBuyerFromLocalStorage() {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored);

    // Validate structure
    if (!data.phone || typeof data.phone !== 'string') return null;

    // Optional: expire after 90 days (trust window)
    if (data.savedAt) {
      const savedDate = new Date(data.savedAt);
      const daysSince = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 90) {
        clearBuyerLocalStorage();
        return null;
      }
    }

    return data;
  } catch (error) {
    console.error('[Preventify] localStorage read error:', error);
    return null;
  }
}

/**
 * Save buyer data to localStorage after successful order
 * @param {string} phone - Normalized phone number
 * @param {string} firstName - Buyer's first name
 */
export function saveBuyerToLocalStorage(phone, firstName) {
  try {
    const data = {
      phone,
      firstName,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[Preventify] localStorage write error:', error);
  }
}

/**
 * Clear buyer data from localStorage
 */
export function clearBuyerLocalStorage() {
  try {
    localStorage.removeItem(LOCALSTORAGE_KEY);
  } catch (error) {
    console.error('[Preventify] localStorage clear error:', error);
  }
}

// ============================================
// Layer 2: ThumbmarkJS fingerprint (fallback)
// ============================================

/**
 * Lazy-load ThumbmarkJS and get device fingerprint
 * @returns {Promise<string>} - ThumbmarkJS hash
 */
export async function getFingerprint() {
  // Return cached fingerprint if already computed (same session)
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  try {
    // Lazy-load ThumbmarkJS on first call
    if (!thumbmarkInstance) {
      const { Thumbmark } = await import('@thumbmarkjs/thumbmarkjs');
      thumbmarkInstance = new Thumbmark({
        logging: false, // Disable console logs
        timeout: 3000, // 3s timeout for component collection
        cache_lifetime_in_ms: 60000, // Cache for 1 minute (within session)
      });
    }

    // Get thumbmark
    const result = await thumbmarkInstance.get();

    // Cache the fingerprint for this session
    cachedFingerprint = result.thumbmark;

    return result.thumbmark;
  } catch (error) {
    console.error('[Preventify] Fingerprint generation error:', error);
    // Return null on error — caller should handle gracefully
    return null;
  }
}

/**
 * Clear cached fingerprint (useful for testing)
 */
export function clearFingerprintCache() {
  cachedFingerprint = null;
}