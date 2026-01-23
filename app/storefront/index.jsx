import { createRoot } from 'react-dom/client';
import JaldiCODFormApp from './App';

console.log('Preventify COD Form & Upsells: Script loaded');

// Helper to extract product data from container
function getProductData(container) {
  if (!container) return null;

  const productId = container.dataset.productId;
  const variantId = container.dataset.variantId;
  const productTitle = container.dataset.productTitle;
  const variantTitle = container.dataset.variantTitle;
  const productPrice = container.dataset.productPrice;
  const productImage = container.dataset.productImage;
  const productAvailable = container.dataset.productAvailable;

  // Check if product is available (not sold out)
  if (productAvailable === 'false') {
    console.log('Preventify: Product is sold out, not showing form');
    return null;
  }

  if (productId && variantId) {
    // Try to get quantity from product form
    let quantity = 1;
    const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
    if (quantityInput) {
      const inputQuantity = parseInt(quantityInput.value);
      if (!isNaN(inputQuantity) && inputQuantity > 0) {
        quantity = inputQuantity;
      }
    }

    return {
      variantId: `gid://shopify/ProductVariant/${variantId}`,
      title: productTitle,
      variant: variantTitle !== 'Default Title' ? variantTitle : null,
      quantity: quantity,
      price: parseFloat(productPrice),
      image: productImage,
    };
  }

  return null;
}

// Detect current page type
function detectPageType() {
  const path = window.location.pathname;

  if (path.includes('/products/')) {
    return 'product';
  } else if (path.includes('/cart')) {
    return 'cart';
  }

  return null;
}

// Check if should show on current page based on visibility settings
function shouldShowOnPage(config) {
  const pageType = detectPageType();
  const visibility = config.settings.buttonPageVisibility;

  if (visibility === 'disabled') return false;
  if (visibility === 'both') return true;
  if (visibility === 'product' && pageType === 'product') return true;
  if (visibility === 'cart' && pageType === 'cart') return true;

  return false;
}

// Hide native Shopify buttons based on settings
function hideNativeButtons(config) {
  const pageType = detectPageType();
  const settings = config.settings;

  // Hide checkout button on cart page
  if (settings.hideCheckoutButton && pageType === 'cart') {
    const checkoutButtons = document.querySelectorAll(
      'button[name="checkout"], #checkout, .cart__checkout-button, [data-checkout-button], form[action="/checkout"] button[type="submit"]'
    );
    checkoutButtons.forEach(btn => {
      btn.style.display = 'none';
      console.log('Preventify: Hidden checkout button');
    });
  }

  // Hide Add to Cart button on product pages
  if (settings.hideAddToCartButton && pageType === 'product') {
    const addToCartButtons = document.querySelectorAll(
      'button[name="add"], .product-form__submit, [data-add-to-cart], form[action*="/cart/add"] button[type="submit"]:not(.shopify-payment-button__button)'
    );
    addToCartButtons.forEach(btn => {
      btn.style.display = 'none';
      console.log('Preventify: Hidden Add to Cart button');
    });
  }

  // Hide Buy Now button on product pages
  if (settings.hideBuyNowButton && pageType === 'product') {
    const buyNowButtons = document.querySelectorAll(
      '.shopify-payment-button, .shopify-payment-button__button, [data-shopify-buttoncontainer], .product-form__buttons .shopify-payment-button'
    );
    buyNowButtons.forEach(btn => {
      btn.style.display = 'none';
      console.log('Preventify: Hidden Buy Now button');
    });
  }
}

// Create popup button element
function createPopupButton(container, shopDomain, productData, pageType) {
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'preventify-popup';
  // Only add padding on product page, not on cart page
  if (pageType === 'product') {
    buttonContainer.style.padding = '20px 0';
  }
  buttonContainer.dataset.shop = shopDomain;

  if (productData && container) {
    Object.keys(container.dataset).forEach(key => {
      if (key.startsWith('product') || key.startsWith('variant')) {
        buttonContainer.dataset[key] = container.dataset[key];
      }
    });
  }

  const root = createRoot(buttonContainer);
  root.render(<JaldiCODFormApp mode="popup" shopDomain={shopDomain} currentProduct={productData} />);

  return buttonContainer;
}

// Create embedded form element
function createEmbeddedForm(container, shopDomain, productData) {
  const formContainer = document.createElement('div');
  formContainer.id = 'preventify-embedded';
  formContainer.dataset.shop = shopDomain;

  if (productData && container) {
    Object.keys(container.dataset).forEach(key => {
      if (key.startsWith('product') || key.startsWith('variant')) {
        formContainer.dataset[key] = container.dataset[key];
      }
    });
  }

  const root = createRoot(formContainer);
  root.render(<JaldiCODFormApp mode="embedded" shopDomain={shopDomain} currentProduct={productData} />);

  return formContainer;
}

// Render popup button at default position
function renderPopupAtDefault(shopDomain, productData) {
  const pageType = detectPageType();

  if (pageType === 'product') {
    // Find product form area - try multiple selectors for different themes
    const addToCartButton = document.querySelector('button[name="add"]');
    const productFormButtons = addToCartButton?.closest('.product-form-buttons');
    const shopifyProductForm = document.querySelector('form.shopify-product-form')
      || document.querySelector('form[action*="/cart/add"]:not(.payment-terms)');
    const productSection = document.querySelector('[data-section-type="product"]')
      || document.querySelector('.product-form')?.closest('section')
      || document.querySelector('form[action*="/cart/add"]')?.closest('section');

    // Priority: after product-form-buttons > after shopify-product-form > append to product section
    const targetContainer = productFormButtons || shopifyProductForm || productSection;

    if (targetContainer) {
      const appEmbedContainer = document.querySelector('[data-preventify-app-embed]');
      const button = createPopupButton(appEmbedContainer, shopDomain, productData, 'product');
      targetContainer.after(button);
      console.log('Preventify: Rendered popup button at default product position');
    } else {
      console.log('Preventify: Could not find product form container');
    }
  } else if (pageType === 'cart') {
    // Find checkout button area - priority: after checkout button's parent (.cart__ctas) > after checkout button
    const checkoutButton = document.querySelector('button[name="checkout"]')
      || document.querySelector('#checkout')
      || document.querySelector('.cart__checkout-button');
    const cartCtas = checkoutButton?.closest('.cart__ctas') || checkoutButton?.parentElement;

    // Fallback to cart form if checkout button not found
    const cartForm = document.querySelector('form[action*="/cart"]:not([action*="/cart/add"])')
      || document.querySelector('cart-form form')
      || document.querySelector('.cart-form')
      || document.querySelector('[data-section-type="cart"]');

    const targetContainer = cartCtas || cartForm;

    if (targetContainer) {
      const appEmbedContainer = document.querySelector('[data-preventify-app-embed]');
      const button = createPopupButton(appEmbedContainer, shopDomain, null, 'cart');
      targetContainer.after(button);
      console.log('Preventify: Rendered popup button at default cart position');
    } else {
      console.log('Preventify: Could not find cart container');
    }
  }
}

// Render embedded form at default position
function renderEmbeddedAtDefault(shopDomain, productData) {
  const pageType = detectPageType();

  if (pageType === 'product') {
    // Find product form area - try multiple selectors for different themes
    const addToCartButton = document.querySelector('button[name="add"]');
    const productFormButtons = addToCartButton?.closest('.product-form-buttons');
    const shopifyProductForm = document.querySelector('form.shopify-product-form')
      || document.querySelector('form[action*="/cart/add"]:not(.payment-terms)');
    const productSection = document.querySelector('[data-section-type="product"]')
      || document.querySelector('.product-form')?.closest('section')
      || document.querySelector('form[action*="/cart/add"]')?.closest('section');

    // Priority: after product-form-buttons > after shopify-product-form > append to product section
    const targetContainer = productFormButtons || shopifyProductForm || productSection;

    if (targetContainer) {
      const appEmbedContainer = document.querySelector('[data-preventify-app-embed]');
      const form = createEmbeddedForm(appEmbedContainer, shopDomain, productData);
      targetContainer.after(form);
      console.log('Preventify: Rendered embedded form at default product position');
    } else {
      console.log('Preventify: Could not find product form container');
    }
  } else if (pageType === 'cart') {
    // Find checkout button area - priority: after checkout button's parent (.cart__ctas) > after checkout button
    const checkoutButton = document.querySelector('button[name="checkout"]')
      || document.querySelector('#checkout')
      || document.querySelector('.cart__checkout-button');
    const cartCtas = checkoutButton?.closest('.cart__ctas') || checkoutButton?.parentElement;

    // Fallback to cart form if checkout button not found
    const cartForm = document.querySelector('form[action*="/cart"]:not([action*="/cart/add"])')
      || document.querySelector('cart-form form')
      || document.querySelector('.cart-form')
      || document.querySelector('[data-section-type="cart"]');

    const targetContainer = cartCtas || cartForm;

    if (targetContainer) {
      const appEmbedContainer = document.querySelector('[data-preventify-app-embed]');
      const form = createEmbeddedForm(appEmbedContainer, shopDomain, null);
      targetContainer.after(form);
      console.log('Preventify: Rendered embedded form at default cart position');
    } else {
      console.log('Preventify: Could not find cart container');
    }
  }
}

// Main initialization function
async function initializePreventify() {
  // Check for manual blocks
  const hasManualPopupBlock = document.querySelector('[data-preventify-manual-popup]');
  const hasManualEmbeddedBlock = document.querySelector('[data-preventify-manual-embedded]');
  const appEmbedContainer = document.querySelector('[data-preventify-app-embed]');

  console.log('Preventify: Manual popup block:', hasManualPopupBlock);
  console.log('Preventify: Manual embedded block:', hasManualEmbeddedBlock);
  console.log('Preventify: App embed container:', appEmbedContainer);

  // If manual blocks exist, render in them directly
  if (hasManualPopupBlock) {
    const shopDomain = hasManualPopupBlock.dataset.shop;
    const productData = getProductData(hasManualPopupBlock);
    console.log('Preventify: Initializing popup mode in manual block for shop', shopDomain);
    const root = createRoot(hasManualPopupBlock);
    root.render(<JaldiCODFormApp mode="popup" shopDomain={shopDomain} currentProduct={productData} />);
    return; // Don't render default
  }

  if (hasManualEmbeddedBlock) {
    const shopDomain = hasManualEmbeddedBlock.dataset.shop;
    const productData = getProductData(hasManualEmbeddedBlock);
    console.log('Preventify: Initializing embedded mode in manual block for shop', shopDomain);
    const root = createRoot(hasManualEmbeddedBlock);
    root.render(<JaldiCODFormApp mode="embedded" shopDomain={shopDomain} currentProduct={productData} />);
    return; // Don't render default
  }

  // Get shop domain from app embed or from Shopify global
  const shopDomain = appEmbedContainer?.dataset.shop || window.Shopify?.shop;

  if (!shopDomain) {
    console.log('Preventify: Could not determine shop domain');
    return;
  }

  const productData = appEmbedContainer ? getProductData(appEmbedContainer) : null;

  // Fetch config from proxy API
  try {
    const response = await fetch(`/apps/preventify/proxy/config?shop=${shopDomain}`);
    const config = await response.json();

    console.log('Preventify: Config loaded', config);

    // Hide native buttons based on settings (runs on product/cart pages)
    hideNativeButtons(config);

    // Always watch for cart drawer in popup mode (drawer can appear on any page)
    if (config.settings.formMode === 'popup') {
      watchCartDrawer(shopDomain);
    }

    // Only render main button/form if app embed exists and page visibility check passes
    if (!appEmbedContainer) {
      console.log('Preventify: No app embed container, only watching cart drawer');
      return;
    }

    // Check if should show main button/form on this page
    if (!shouldShowOnPage(config)) {
      console.log('Preventify: Page visibility check failed for main button');
      return;
    }

    // Render based on mode
    if (config.settings.formMode === 'popup') {
      renderPopupAtDefault(shopDomain, productData);
    } else if (config.settings.formMode === 'embedded') {
      renderEmbeddedAtDefault(shopDomain, productData);
    }
  } catch (error) {
    console.error('Preventify: Failed to load config', error);
  }
}

// Render popup button in cart drawer
function renderPopupInCartDrawer(shopDomain) {
  const cartDrawer = document.querySelector('cart-drawer') || document.querySelector('.cart-drawer');
  if (!cartDrawer) return false;

  // Check if button already exists in drawer - silently return true to indicate "done"
  if (cartDrawer.querySelector('#preventify-drawer-popup')) {
    return true;
  }

  // Find the checkout button's container in the drawer
  const drawerCheckoutButton = cartDrawer.querySelector('button[name="checkout"]')
    || cartDrawer.querySelector('#CartDrawer-Checkout')
    || cartDrawer.querySelector('.cart__checkout-button');
  const drawerCtas = drawerCheckoutButton?.closest('.cart__ctas') || drawerCheckoutButton?.parentElement;

  if (drawerCtas) {
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'preventify-drawer-popup';
    buttonContainer.dataset.shop = shopDomain;
    buttonContainer.style.marginTop = '10px';

    const root = createRoot(buttonContainer);
    root.render(<JaldiCODFormApp mode="popup" shopDomain={shopDomain} currentProduct={null} isCartDrawer={true} />);

    drawerCtas.after(buttonContainer);
    console.log('Preventify: Rendered popup button in cart drawer');
    return true;
  }
  return false;
}

// Watch for cart drawer to open and inject button
function watchCartDrawer(shopDomain) {
  let buttonRendered = false;

  const observer = new MutationObserver(() => {
    // Skip if already rendered
    if (buttonRendered) return;

    const cartDrawer = document.querySelector('cart-drawer') || document.querySelector('.cart-drawer');
    if (cartDrawer) {
      // Check if drawer is visible
      const isVisible = cartDrawer.classList.contains('animate') ||
        cartDrawer.classList.contains('active') ||
        cartDrawer.classList.contains('is-open') ||
        window.getComputedStyle(cartDrawer).display !== 'none';

      if (isVisible) {
        buttonRendered = renderPopupInCartDrawer(shopDomain);
      }
    }
  });

  // Observe the body for changes to cart drawer
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  // Also try to render immediately in case drawer is already open
  buttonRendered = renderPopupInCartDrawer(shopDomain);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePreventify);
} else {
  initializePreventify();
}
