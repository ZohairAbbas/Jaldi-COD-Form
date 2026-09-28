/**
 * Native-checkout free gifts: keep the real Shopify cart honest.
 *
 * A Discount Function can make a gift line free, but it can't remove a line.
 * If the customer changes quantities in the cart so their tier no longer
 * qualifies, the gift would stay in the cart at full price. This module watches
 * the theme's cart requests and removes gift lines the cart no longer earns
 * (and trims extras, since it's one gift per order).
 *
 * It can't see inside Shopify's checkout itself, so a change made there falls
 * back to the gift being charged at full price — the agreed fallback.
 */

import { planGiftCartCleanup } from '../lib/tier-gift';

const CART_MUTATION = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/;
const DEBOUNCE_MS = 400;

let offers = { bundles: [], combos: [] };
let ownRequests = 0;
let timer = null;
let running = null;

function configHasGifts(config) {
  return (config?.bundles || []).some((b) => (b.tiers || []).some((t) => t?.gift));
}

/** Run `fn` without our own cart requests re-triggering the watcher. */
export async function withoutGiftWatcher(fn) {
  ownRequests += 1;
  try {
    return await fn();
  } finally {
    ownRequests -= 1;
  }
}

/**
 * Bring the cart's gift lines in line with what it has earned.
 * @returns {Promise<boolean>} true when the cart was changed
 */
export function reconcileGiftCart() {
  // Coalesce overlapping calls (watcher + the widget's own add).
  if (running) return running;
  running = withoutGiftWatcher(async () => {
    const res = await fetch('/cart.js', { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const cart = await res.json();
    const changes = planGiftCartCleanup(cart.items, offers.bundles, offers.combos);
    if (!changes.length) return false;

    const updates = {};
    for (const change of changes) updates[change.key] = change.quantity;
    const update = await fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates }),
    });
    return update.ok;
  })
    .catch(() => false)
    .finally(() => { running = null; });
  return running;
}

/**
 * Re-render the theme's cart drawer and cart count after we changed the cart.
 * The cart page is simply reloaded — its markup varies too much between themes
 * to patch reliably.
 */
export async function refreshThemeCart() {
  const path = window.location.pathname;
  if (path === '/cart' || path.endsWith('/cart')) {
    window.location.reload();
    return;
  }
  try {
    const res = await fetch(`${window.Shopify?.routes?.root || '/'}?sections=cart-drawer,cart-icon-bubble`);
    if (!res.ok) return;
    const sections = await res.json();
    const parse = (html, selector) => new DOMParser().parseFromString(html, 'text/html').querySelector(selector);

    const liveDrawer = document.querySelector('cart-drawer');
    const freshDrawer = sections['cart-drawer'] && parse(sections['cart-drawer'], 'cart-drawer');
    if (liveDrawer && freshDrawer) {
      liveDrawer.innerHTML = freshDrawer.innerHTML;
      liveDrawer.className = freshDrawer.className;
    }
    const liveBubble = document.querySelector('#cart-icon-bubble');
    const freshBubble = sections['cart-icon-bubble'] && parse(sections['cart-icon-bubble'], '#cart-icon-bubble');
    if (liveBubble && freshBubble) liveBubble.innerHTML = freshBubble.innerHTML;
  } catch (e) {
    // Cosmetic only — the cart itself is already correct.
  }
  document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
}

function schedule() {
  if (ownRequests > 0) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (await reconcileGiftCart()) await refreshThemeCart();
  }, DEBOUNCE_MS);
}

function isCartMutation(url) {
  try {
    return CART_MUTATION.test(new URL(String(url), window.location.href).pathname);
  } catch (e) {
    return false;
  }
}

function patchFetch() {
  const original = window.fetch;
  if (typeof original !== 'function') return;
  window.fetch = function patchedFetch(input) {
    const url = typeof input === 'string' ? input : input?.url;
    const promise = original.apply(this, arguments);
    if (url && ownRequests === 0 && isCartMutation(url)) {
      promise.then(schedule, () => {});
    }
    return promise;
  };
}

function patchXhr() {
  const proto = window.XMLHttpRequest?.prototype;
  if (!proto) return;
  const open = proto.open;
  const send = proto.send;
  proto.open = function patchedOpen(method, url) {
    this.__preventifyCartMutation = isCartMutation(url);
    return open.apply(this, arguments);
  };
  proto.send = function patchedSend() {
    if (this.__preventifyCartMutation && ownRequests === 0) {
      this.addEventListener('loadend', schedule);
    }
    return send.apply(this, arguments);
  };
}

/**
 * Start watching the cart. Safe to call more than once (the config is applied
 * twice, and several app instances can mount): later calls only refresh the
 * offer config the cleanup is checked against.
 */
export function installGiftCartSync(config) {
  if (typeof window === 'undefined') return;
  if (!config?.settings?.nativeBundleCheckout || !configHasGifts(config)) return;

  offers = { bundles: config.bundles || [], combos: config.combos || [] };

  if (window.__preventifyGiftCartSync) return;
  window.__preventifyGiftCartSync = true;

  patchFetch();
  patchXhr();

  // The cart may have changed on a page we weren't watching (another tab,
  // a non-AJAX cart form post) — check once on load too.
  schedule();
}
