import { createRoot } from 'react-dom/client';
import JaldiCODFormApp from './App';
import { normalizePrice } from '../lib/constants';

console.log('Preventify COD Form & Upsells: Script loaded');

// Helper to get Pumper Bundles data if available
function getPumperBundleData() {
  // Find the selected radio button in Pumper Bundles
  const selectedRadio = document.querySelector('.prvw_pair:checked');
  if (!selectedRadio) return null;

  const bundleIndex = parseInt(selectedRadio.value) - 1; // value is 1-based, index is 0-based
  const quantity = parseInt(selectedRadio.value);

  // Get the discounted price from Pumper's price element
  const priceElement = document.querySelector(`#prvw_totalAmount_${bundleIndex}`);
  if (!priceElement) return null;

  // Parse the price (format: "Rs.1,469.90" or "QR 139,00")
  const priceText = priceElement.textContent.trim();
  const priceMatch = priceText.match(/[\d,]+\.?\d*/);
  if (!priceMatch) return null;

  const discountedPrice = normalizePrice(priceMatch[0]);

  // Get original price if available
  const originalPriceElement = document.querySelector(`#prvw_originalAmount_${bundleIndex}`);
  let originalPrice = null;
  if (originalPriceElement && originalPriceElement.textContent.trim()) {
    const originalMatch = originalPriceElement.textContent.trim().match(/[\d,]+\.?\d*/);
    if (originalMatch) {
      originalPrice = normalizePrice(originalMatch[0]);
    }
  }

  console.log('Preventify: Initial Pumper Bundle detected', { quantity, discountedPrice, originalPrice });

  return {
    quantity,
    discountedPrice,
    originalPrice,
    hasBundleDiscount: originalPrice !== null && originalPrice > discountedPrice,
  };
}

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
    // Check for Pumper Bundles discount first
    const pumperData = getPumperBundleData();

    // Use Pumper's quantity and price if available
    let quantity = pumperData?.quantity || 1;
    let price = pumperData?.discountedPrice || normalizePrice(productPrice);

    // If no Pumper data, try to get quantity from product form
    if (!pumperData) {
      const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
      if (quantityInput) {
        const inputQuantity = parseInt(quantityInput.value);
        if (!isNaN(inputQuantity) && inputQuantity > 0) {
          quantity = inputQuantity;
        }
      }
    }

    const productData = {
      variantId: `gid://shopify/ProductVariant/${variantId}`,
      title: productTitle,
      variant: variantTitle !== 'Default Title' ? variantTitle : null,
      quantity: quantity,
      price: price,
      image: productImage,
    };

    // Add bundle discount info if applicable
    if (pumperData?.hasBundleDiscount) {
      productData.originalPrice = pumperData.originalPrice;
      productData.hasBundleDiscount = true;
    }

    return productData;
  }

  return null;
}

// Helper to extract product data from product card on collection/homepage
function getProductCardData(productCard) {
  if (!productCard) return null;

  try {
    // Try to get product ID from data attribute first
    let productId = productCard.dataset.productId;

    // Fallback: Look for hidden input with name="product-id" (Dawn theme)
    if (!productId) {
      const productIdInput = productCard.querySelector('input[name="product-id"]');
      productId = productIdInput?.value;
    }

    if (!productId) return null;

    // Get variant ID from the hidden input in the quick-add form
    const variantInput = productCard.querySelector('input[name="id"]');
    const variantId = variantInput?.value;

    if (!variantId) return null;

    // Get product title - try multiple selectors
    let titleElement = productCard.querySelector('.text-block p, h3');
    // Fallback: Try .card__heading (Dawn theme)
    if (!titleElement) {
      titleElement = productCard.querySelector('.card__heading a, .card__heading');
    }
    const productTitle = titleElement?.textContent?.trim();

    // Get price - try multiple selectors
    let priceElement = productCard.querySelector('product-price .price');
    // Fallback: Try .price-item--sale or .price-item (Dawn theme)
    if (!priceElement) {
      priceElement = productCard.querySelector('.price-item--sale, .price-item--regular');
    }
    const priceText = priceElement?.textContent?.trim();
    let price = 0;

    if (priceText) {
      // Extract numeric value from price text (e.g., "Rs.0.00" or "QAR 129,00" -> normalized)
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        price = normalizePrice(priceMatch[0]);
      }
    }

    // Get product image - try multiple selectors
    let imageElement = productCard.querySelector('slideshow-slide img, .product-media__image');
    // Fallback: Try .card__media img or .media img (Dawn theme)
    if (!imageElement) {
      imageElement = productCard.querySelector('.card__media img, .media img');
    }
    const productImage = imageElement?.src;

    // Check if product is sold out by looking for sold out badge
    const soldOutBadge = productCard.querySelector('.product-badges__badge, .badge');
    const isSoldOut = soldOutBadge?.textContent?.trim().toLowerCase().includes('sold out');

    if (isSoldOut) {
      console.log('Preventify: Product card is sold out, skipping');
      return null;
    }

    // Check if Add to Cart button is disabled
    const addButton = productCard.querySelector('button[name="add"]');
    if (addButton?.disabled) {
      console.log('Preventify: Product card add button is disabled, skipping');
      return null;
    }

    const productData = {
      variantId: `gid://shopify/ProductVariant/${variantId}`,
      title: productTitle || 'Product',
      variant: null,
      quantity: 1,
      price: price,
      image: productImage,
    };

    console.log('Preventify: Extracted product data:', productData);
    return productData;
  } catch (error) {
    console.error('Preventify: Error extracting product card data', error);
    return null;
  }
}

// Detect current page type
function detectPageType() {
  const path = window.location.pathname;

  if (path.includes('/products/')) {
    return 'product';
  } else if (path.includes('/cart')) {
    return 'cart';
  } else if (path.includes('/collections/')) {
    return 'collection';
  } else if (path === '/' || path === '') {
    return 'homepage';
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

// Render popup buttons on product cards (for collection and homepage)
function renderPopupOnProductCards(shopDomain) {
  const pageType = detectPageType();

  if (pageType !== 'collection' && pageType !== 'homepage') {
    return;
  }

  console.log(`Preventify: Rendering popup buttons on ${pageType} product cards`);

  // Find all product cards - try multiple selectors for different themes
  let productCards = document.querySelectorAll('product-card[data-product-id]');

  // Fallback: Try li.grid__item (Dawn theme and similar)
  if (productCards.length === 0) {
    console.log('Preventify: No product-card elements found, trying li.grid__item');
    productCards = document.querySelectorAll('li.grid__item .card-wrapper');
  }

  if (productCards.length === 0) {
    console.log('Preventify: No product cards found on page');
    return;
  }

  console.log(`Preventify: Found ${productCards.length} product cards`);

  productCards.forEach((productCard, index) => {
    try {
      // Skip if button already exists for this card
      if (productCard.querySelector('.preventify-product-card-button')) {
        return;
      }

      // Extract product data from card
      const productData = getProductCardData(productCard);
      if (!productData) {
        console.log(`Preventify: Skipping product card ${index} - no product data`);
        return;
      }

      // Find the image area to overlay button on - try multiple selectors
      let cardGallery = productCard.querySelector('.card-gallery');

      // Fallback: Try .card__media (Dawn theme and similar)
      if (!cardGallery) {
        cardGallery = productCard.querySelector('.card__media');
      }

      if (!cardGallery) {
        console.log(`Preventify: Could not find image area for product card ${index}`);
        return;
      }

      // Make sure card-gallery has relative positioning for absolute child
      const galleryStyle = window.getComputedStyle(cardGallery);
      if (galleryStyle.position === 'static') {
        cardGallery.style.position = 'relative';
      }

      // Create button container - positioned at bottom of image
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'preventify-product-card-button';
      buttonContainer.style.cssText = `
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        z-index: 10;
      `;
      buttonContainer.dataset.shop = shopDomain;

      // Render React component
      const root = createRoot(buttonContainer);
      root.render(<JaldiCODFormApp mode="popup" shopDomain={shopDomain} currentProduct={productData} />);

      // Append button inside the card-gallery (not after)
      cardGallery.appendChild(buttonContainer);
      console.log(`Preventify: Rendered button on product card ${index} for product ${productData.title}`);
    } catch (error) {
      console.error(`Preventify: Error rendering button on product card ${index}`, error);
    }
  });
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
  // Use app path from global variable (set by liquid) or data attribute, fallback to default
  const initialAppPath = window.PREVENTIFY_APP_PATH
    || appEmbedContainer?.dataset.appPath
    || '/apps/preventify/';

  try {
    const response = await fetch(`${initialAppPath}proxy/config?shop=${shopDomain}`);
    const config = await response.json();

    console.log('Preventify: Config loaded', config);

    // Hide native buttons based on settings (runs on product/cart pages)
    hideNativeButtons(config);

    // Always watch for cart drawer in popup mode (drawer can appear on any page)
    if (config.settings.formMode === 'popup') {
      watchCartDrawer(shopDomain);
    }

    // Detect current page type
    const pageType = detectPageType();
    console.log('Preventify: Current page type:', pageType);

    // Handle collection and homepage separately - always show if app embed is enabled
    if ((pageType === 'collection' || pageType === 'homepage') && config.settings.formMode === 'popup') {
      console.log('Preventify: Rendering on collection/homepage product cards');
      renderPopupOnProductCards(shopDomain);
      // Watch for dynamically loaded product cards
      watchProductCards(shopDomain);
      return; // Don't render default button
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

// Watch for dynamically loaded product cards (for infinite scroll, lazy loading, etc.)
function watchProductCards(shopDomain) {
  const pageType = detectPageType();

  if (pageType !== 'collection' && pageType !== 'homepage') {
    return;
  }

  console.log('Preventify: Setting up observer for dynamic product cards');

  let debounceTimer;

  const observer = new MutationObserver(() => {
    // Debounce to avoid excessive re-renders
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Find product cards without buttons
      const productCardsWithoutButton = document.querySelectorAll('product-card[data-product-id]:not(:has(.preventify-product-card-button))');

      if (productCardsWithoutButton.length > 0) {
        console.log(`Preventify: Found ${productCardsWithoutButton.length} new product cards to render buttons on`);
        renderPopupOnProductCards(shopDomain);
      }
    }, 500); // Wait 500ms after last mutation
  });

  // Observe the main content area for new product cards
  const mainContent = document.querySelector('main') || document.body;
  observer.observe(mainContent, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePreventify);
} else {
  initializePreventify();
}
