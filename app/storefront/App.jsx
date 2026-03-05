import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CODForm from './CODForm';
import BuyButton from './BuyButton';
import UpsellModal from './UpsellModal';
import DownsellModal from './DownsellModal';
import BundleWidget, { calculateTierPrice } from './BundleWidget';
import { initializePixels, captureUtmParams, resetEventId, trackPurchase, trackSnapchatPurchase, trackTikTokPlaceAnOrder, trackTikTokCompletePayment } from './pixels';
import { initStorefrontMixpanel, trackStorefrontEvent, trackButtonClick } from './mixpanel-storefront';
import { normalizePrice, getCurrencyCode, getCurrencySymbol } from '../lib/constants';

// Default config to show button immediately while real config loads
const defaultConfig = {
  settings: {
    formMode: 'popup',
    buttonPageVisibility: 'both',
    allowCartItems: true,
    enableRTL: false,
    buttonText: 'Buy with Cash on Delivery',
    buttonBgColor: 'rgba(0,0,0,1)',
    buttonTextColor: 'rgba(255,255,255,1)',
    buttonFontSize: 16,
    buttonBorderRadius: 4,
    buttonBorderWidth: 0,
    buttonBorderColor: '#000000',
    buttonShadow: 4,
    buttonAnimation: 'none',
    buttonIcon: 'cart',
  },
  formConfig: {
    formTitle: 'CASH ON DELIVERY',
    textColor: 'rgba(0,0,0,1)',
    backgroundColor: 'rgba(255,255,255,1)',
    fontSize: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowIntensity: 5,
    sections: [],
    fields: [],
  },
};

export default function JaldiCODFormApp({ mode, shopDomain, currentProduct: initialProduct, isCartDrawer = false, initialInventoryQuantity = null }) {
  const [config, setConfig] = useState(defaultConfig);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(initialProduct);
  const [cart, setCart] = useState({ items: initialProduct ? [initialProduct] : [] });
  const [fullCart, setFullCart] = useState({ items: [] }); // Store full cart separately
  const [productSelection, setProductSelection] = useState('current+cart'); // 'current' or 'current+cart'
  const [configLoaded, setConfigLoaded] = useState(false);
  const [currentPageType, setCurrentPageType] = useState('unknown');
  const [isProductAvailable, setIsProductAvailable] = useState(true); // Track if current product is available
  const [appPath, setAppPath] = useState('/apps/preventify/'); // Dynamic app path

  // Upsell state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellHandled, setUpsellHandled] = useState(false); // Track if upsell was already shown in this session
  const [upsellProduct, setUpsellProduct] = useState(null); // Store accepted upsell product

  // Post-purchase upsell state
  const [showPostPurchaseUpsell, setShowPostPurchaseUpsell] = useState(false);
  const [postPurchaseUpsellConfig, setPostPurchaseUpsellConfig] = useState(null);
  const [orderResult, setOrderResult] = useState(null); // Store order result for post-purchase flow

  // Downsell state
  const [showDownsellModal, setShowDownsellModal] = useState(false);
  const [activeDownsell, setActiveDownsell] = useState(null);
  const [downsellShownCount, setDownsellShownCount] = useState(0);
  const [recoveryDiscount, setRecoveryDiscount] = useState(null);

  // Bundle / Quantity Break state
  const [activeBundleConfig, setActiveBundleConfig] = useState(null);
  const [selectedBundleTier, setSelectedBundleTier] = useState(null);
  const [bundleBasePrice, setBundleBasePrice] = useState(null); // Original single-unit price, never mutated
  const [inventoryQuantity, setInventoryQuantity] = useState(initialInventoryQuantity); // null = unknown/unlimited, number = tracked stock
  const [productVariants, setProductVariants] = useState(null); // Cached product variants for variant mix dropdowns
  const [variantMixSelections, setVariantMixSelections] = useState(null); // Array of variant IDs per bundle slot
  const [variantMixOosError, setVariantMixOosError] = useState(false); // True if any slot has OOS variant

  // Multi-country detection state
  const [detectedCountry, setDetectedCountry] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  // Detect page type on mount and check product availability
  useEffect(() => {
    const pathname = window.location.pathname;

    // Check for cart page (could be /cart or /cart/)
    if (pathname === '/cart' || pathname.startsWith('/cart/') || pathname.endsWith('/cart')) {
      setCurrentPageType('cart');
    }
    // Check for product page
    else if (pathname.includes('/products/')) {
      setCurrentPageType('product');

      // Check product availability on product pages
      checkProductAvailability();
    }
    // Check for collection page
    else if (pathname.includes('/collections/')) {
      setCurrentPageType('collection');
    }
    // Check for homepage
    else if (pathname === '/' || pathname === '') {
      setCurrentPageType('homepage');
    }
    // Unknown page type
    else {
      setCurrentPageType('unknown');
    }
  }, []);

  // Function to check if current product/variant is available
  const checkProductAvailability = async () => {
    try {
      // Get product handle from URL
      const pathParts = window.location.pathname.split('/');
      const productIndex = pathParts.indexOf('products');
      if (productIndex === -1 || !pathParts[productIndex + 1]) return;

      const productHandle = pathParts[productIndex + 1].split('?')[0];
      const response = await fetch(`/products/${productHandle}.js`);
      const productData = await response.json();

      // Get currently selected variant
      const variantInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
      const variantSelect = document.querySelector('select[name="id"]');
      const urlParams = new URLSearchParams(window.location.search);
      const variantId = urlParams.get('variant') || variantInput?.value || variantSelect?.value;

      if (variantId) {
        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (variant && !variant.available) {
          setIsProductAvailable(false);
          setCurrentProduct(null);
          setCart({ items: [] });
          return;
        }
      }

      setIsProductAvailable(true);
    } catch (error) {
      console.error('Preventify: Failed to check product availability', error);
      setIsProductAvailable(true); // Default to available on error
    }
  };

  // Listen for variant changes on product page
  useEffect(() => {
    if (currentPageType !== 'product') return;

    const container = document.querySelector('[data-preventify-app-embed]');
    if (!container) return;

    // Track last known variant to avoid duplicate updates
    let lastKnownVariantId = currentProduct?.variantId?.split('/').pop() || null;
    let lastKnownQuantity = currentProduct?.quantity || 1;
    let isUpdating = false;
    let lastKnownDisplayCurrency = currentProduct?.displayCurrencySymbol || null;

    // ===== PUMPER BUNDLES INTEGRATION =====
    // Helper to get Pumper Bundles selected bundle data
    const getPumperBundleData = () => {
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

      return {
        quantity,
        discountedPrice,
        originalPrice,
        hasBundleDiscount: originalPrice !== null && originalPrice > discountedPrice,
      };
    };

    // Helper to get Bundler app (Bundler - Product Bundles) data
    const getBundlerData = () => {
      const bundlerEl = document.querySelector('.bndlr-quantity-break');
      if (!bundlerEl) return null;

      const selectedRadio = bundlerEl.querySelector('input[name="bundle_quantity"]:checked');
      if (!selectedRadio) return null;

      const quantity = parseInt(selectedRadio.value);
      if (isNaN(quantity) || quantity < 1) return null;

      const radioContainer = selectedRadio.closest('.bndlr-radio-container');
      if (!radioContainer) return null;

      const discountedPriceEl = radioContainer.querySelector('.bndlr-discounted-price[data-currentprice]');
      if (!discountedPriceEl) return null;

      const discountedPriceCents = parseInt(discountedPriceEl.dataset.currentprice);
      if (isNaN(discountedPriceCents)) return null;
      const discountedPrice = discountedPriceCents / 100;

      const originalPriceEl = radioContainer.querySelector('.bndlr-original-price[data-currentprice]');
      let originalPrice = null;
      if (originalPriceEl) {
        const originalPriceCents = parseInt(originalPriceEl.dataset.currentprice);
        if (!isNaN(originalPriceCents)) {
          originalPrice = originalPriceCents / 100;
        }
      }

      return {
        quantity,
        discountedPrice,
        originalPrice,
        hasBundleDiscount: originalPrice !== null && originalPrice > discountedPrice,
      };
    };

    // Helper to get theme built-in quantity-breaks bundle data (e.g. Shrine theme)
    const getQuantityBreaksData = () => {
      const quantityBreaksEl = document.querySelector('quantity-breaks');
      if (!quantityBreaksEl) return null;

      // Find the selected radio input inside quantity-breaks
      const selectedRadio = quantityBreaksEl.querySelector('input[name="quantity"]:checked');
      if (!selectedRadio) return null;

      const quantity = parseInt(selectedRadio.value);
      if (isNaN(quantity) || quantity < 1) return null;

      // Find the label associated with the selected radio
      const label = quantityBreaksEl.querySelector(`label[for="${selectedRadio.id}"]`);
      if (!label) return null;

      // Helper: get the base-currency price and display price from an element
      // If a currency converter (Bucks) has modified it, use bucks-init (original price)
      // and return the displayed converted price separately
      const getPrices = (el) => {
        if (!el) return { base: null, display: null };
        const bucksEl = el.closest('.buckscc-converted') || el.querySelector('.buckscc-converted');
        if (bucksEl && bucksEl.getAttribute('bucks-init')) {
          const base = parseFloat(bucksEl.getAttribute('bucks-init'));
          // Get the displayed (converted) price from the text
          const text = el.textContent.trim();
          const match = text.match(/[\d,]+\.?\d*/);
          const display = match ? normalizePrice(match[0]) : null;
          return { base, display };
        }
        const text = el.textContent.trim();
        const match = text.match(/[\d,]+\.?\d*/);
        return { base: match ? normalizePrice(match[0]) : null, display: null };
      };

      // Get the displayed price (discounted total for this bundle option)
      const priceEl = label.querySelector('.quantity-break__price span');
      if (!priceEl) return null;

      const priceParts = getPrices(priceEl);
      if (!priceParts.base) return null;

      // Get the compare/original price if available (visible when there's a discount)
      const comparePriceEl = label.querySelector('.quantity-break__compare-price span');
      let originalPrice = null;
      let displayOriginalPrice = null;
      if (comparePriceEl && !comparePriceEl.closest('.quantity-break__compare-price')?.classList.contains('hidden')) {
        const compareParts = getPrices(comparePriceEl);
        originalPrice = compareParts.base;
        displayOriginalPrice = compareParts.display;
      }

      return {
        quantity,
        discountedPrice: priceParts.base,
        displayDiscountedPrice: priceParts.display,
        originalPrice: originalPrice,
        displayOriginalPrice: displayOriginalPrice,
        hasBundleDiscount: originalPrice !== null && originalPrice > priceParts.base,
      };
    };

    // Helper to get displayed/converted price from the DOM (for currency converter extensions like Bucks)
    const getDisplayedPriceData = () => {
      // Use product-price parent to target the actual product price, not hidden/unrelated $0.00 elements
      const convertedEl = document.querySelector('product-price .buckscc-converted[bucks-current]')
        || document.querySelector('.price .buckscc-converted[bucks-current]');
      if (convertedEl) {
        const currentPrice = convertedEl.getAttribute('bucks-current') || '';
        const currency = convertedEl.getAttribute('bucks-currency') || '';
        const match = currentPrice.match(/^([^\d]*)([\d,]+\.?\d*)(.*)$/);
        if (match) {
          const symbol = match[1] || match[3] || '';
          const amount = normalizePrice(match[2]);
          if (amount > 0) {
            // Derive exchange rate from original price (bucks-init) to convert other items
            const initPrice = parseFloat(convertedEl.getAttribute('bucks-init') || '0');
            const exchangeRate = initPrice > 0 ? amount / initPrice : null;
            return { currencySymbol: symbol, price: amount, currencyCode: currency, exchangeRate };
          }
        }
      }
      return null;
    };

    // Helper to fetch variant data from Shopify's product JSON
    const fetchVariantData = async (variantId) => {
      try {
        // Get product handle from URL
        const pathParts = window.location.pathname.split('/');
        const productIndex = pathParts.indexOf('products');
        if (productIndex === -1 || !pathParts[productIndex + 1]) return null;

        const productHandle = pathParts[productIndex + 1].split('?')[0];
        const response = await fetch(`/products/${productHandle}.js`);
        const productData = await response.json();

        // Cache full product variant data for variant mix dropdowns
        if (productData.variants && productData.options) {
          setProductVariants({
            options: productData.options,
            variants: productData.variants.map(v => ({
              id: v.id,
              title: v.title,
              option1: v.option1,
              option2: v.option2,
              option3: v.option3,
              available: v.available,
              price: v.price / 100,
              image: v.featured_image?.src || null,
            })),
          });
        }

        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (!variant) return null;

        // Check if variant is available (not sold out)
        if (!variant.available) {
          setIsProductAvailable(false);
          return null;
        }

        // Variant is available
        setIsProductAvailable(true);

        // Track inventory quantity for stock validation (bundles, etc.)
        // Use PREVENTIFY_VARIANT_INVENTORY map rendered by Liquid (contains all variants)
        // Only set inventory when variant is actively tracked by Shopify AND policy is "deny";
        // untracked variants have stale data, and "continue" policy means overselling is allowed.
        const inventoryMap = window.PREVENTIFY_VARIANT_INVENTORY;
        const variantInv = inventoryMap?.[variantId];
        if (variantInv && variantInv.tracked && variantInv.policy !== 'continue') {
          setInventoryQuantity(Math.max(0, variantInv.quantity));
        } else {
          setInventoryQuantity(null);
        }

        // Check for bundle data: Pumper Bundles first, then Bundler app, then theme quantity-breaks
        const pumperData = getPumperBundleData();
        const bundlerData = !pumperData ? getBundlerData() : null;
        const quantityBreaksData = !pumperData && !bundlerData ? getQuantityBreaksData() : null;
        const bundleData = pumperData || bundlerData || quantityBreaksData;

        // Use bundle quantity and price if available
        let quantity = bundleData?.quantity || 1;
        let price = bundleData?.discountedPrice || (variant.price / 100);

        // If no bundle data, try to get quantity from product form
        if (!bundleData) {
          const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
          if (quantityInput) {
            const inputQuantity = parseInt(quantityInput.value);
            if (!isNaN(inputQuantity) && inputQuantity > 0) {
              quantity = inputQuantity;
            }
          }
        }

        // Check for currency converter displayed price (display only, never affects order price)
        const displayedPriceData = getDisplayedPriceData();

        const productDataResult = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: quantity,
          price: price,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        // Add displayed currency info if a converter is active (for display only)
        if (displayedPriceData) {
          // Use bundle's display price if available (currency converter modifies bundle DOM prices)
          // Otherwise fall back to the general displayed price from the page
          productDataResult.displayPrice = bundleData?.displayDiscountedPrice || displayedPriceData.price;
          productDataResult.displayCurrencySymbol = displayedPriceData.currencySymbol;
          productDataResult.displayCurrencyCode = displayedPriceData.currencyCode;
          if (displayedPriceData.exchangeRate) productDataResult.displayExchangeRate = displayedPriceData.exchangeRate;
          if (bundleData?.displayOriginalPrice) productDataResult.displayOriginalPrice = bundleData.displayOriginalPrice;
        }

        // Add bundle discount info if applicable
        if (bundleData?.hasBundleDiscount) {
          productDataResult.originalPrice = bundleData.originalPrice;
          productDataResult.hasBundleDiscount = true;
          // Store the actual Shopify variant price (what Shopify charges per unit).
          // Apps like Pumper modify the variant price to their discounted price,
          // so draft orders must calculate discount against this, not compare_at.
          productDataResult.variantShopifyPrice = variant.price / 100;
        }

        return productDataResult;
      } catch (error) {
        console.error('Preventify: Failed to fetch variant data', error);
        return null;
      }
    };

    // Helper to get variant ID from URL or form
    const getSelectedVariantId = () => {
      // First try URL params
      const urlParams = new URLSearchParams(window.location.search);
      const urlVariantId = urlParams.get('variant');
      if (urlVariantId) return urlVariantId;

      // Try hidden variant input in product form (most common)
      const variantInput = document.querySelector('form[action*="/cart/add"] input[name="id"]');
      if (variantInput) return variantInput.value;

      // Try select element
      const variantSelect = document.querySelector('select[name="id"]');
      if (variantSelect) return variantSelect.value;

      // Fallback to container data
      return container.dataset.variantId;
    };

    // Update product when variant changes
    const updateProductVariant = async (variantId) => {
      if (isUpdating) return;

      const newVariantId = variantId || getSelectedVariantId();

      if (!newVariantId || newVariantId === lastKnownVariantId) {
        return;
      }

      isUpdating = true;
      lastKnownVariantId = newVariantId;

      const newProductData = await fetchVariantData(newVariantId);

      if (newProductData) {
        setCurrentProduct(newProductData);
        setCart(prevCart => {
          // Keep only cart items (not the current product)
          const cartItems = prevCart.items.filter(item => {
            // Keep items that are from the cart (fullCart), not the current product
            const isCurrentProduct = item.variantId === currentProduct?.variantId;
            return !isCurrentProduct && !item.isUpsell;
          });
          return { items: [newProductData, ...cartItems] };
        });

      }

      isUpdating = false;
    };

    // Track last known Pumper Bundle selection
    let lastKnownPumperBundle = null;

    // Helper to update product with Pumper Bundle data
    const updateWithPumperBundle = async () => {
      const pumperData = getPumperBundleData();
      if (!pumperData) return false;

      // Create a key to detect changes
      const pumperKey = `${pumperData.quantity}-${pumperData.discountedPrice}`;
      if (pumperKey === lastKnownPumperBundle) return false;

      lastKnownPumperBundle = pumperKey;
      lastKnownQuantity = pumperData.quantity;

      // Get current variant data and merge with Pumper pricing
      const variantId = getSelectedVariantId();
      if (!variantId) return false;

      try {
        const pathParts = window.location.pathname.split('/');
        const productIndex = pathParts.indexOf('products');
        if (productIndex === -1 || !pathParts[productIndex + 1]) return false;

        const productHandle = pathParts[productIndex + 1].split('?')[0];
        const response = await fetch(`/products/${productHandle}.js`);
        const productData = await response.json();

        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (!variant || !variant.available) return false;

        // Check for currency converter displayed price
        const displayedPriceData = getDisplayedPriceData();

        const newProductData = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: pumperData.quantity,
          price: pumperData.discountedPrice,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        if (displayedPriceData) {
          newProductData.displayPrice = displayedPriceData.price;
          newProductData.displayCurrencySymbol = displayedPriceData.currencySymbol;
          newProductData.displayCurrencyCode = displayedPriceData.currencyCode;
          if (displayedPriceData.exchangeRate) newProductData.displayExchangeRate = displayedPriceData.exchangeRate;
        }

        if (pumperData.hasBundleDiscount) {
          newProductData.originalPrice = pumperData.originalPrice;
          newProductData.hasBundleDiscount = true;
          newProductData.variantShopifyPrice = variant.price / 100;
        }

        setCurrentProduct(newProductData);
        setCart(prevCart => {
          const cartItems = prevCart.items.filter(item => {
            const isCurrentProduct = item.variantId === currentProduct?.variantId;
            return !isCurrentProduct && !item.isUpsell;
          });
          return { items: [newProductData, ...cartItems] };
        });

        return true;
      } catch (error) {
        console.error('Preventify: Failed to update with Pumper data', error);
        return false;
      }
    };

    // Track last known Bundler app selection
    let lastKnownBundlerData = null;

    // Helper to update product with Bundler app data
    const updateWithBundlerData = async () => {
      const bundlerData = getBundlerData();
      if (!bundlerData) return false;

      // Create a key to detect changes
      const bundlerKey = `${bundlerData.quantity}-${bundlerData.discountedPrice}`;
      if (bundlerKey === lastKnownBundlerData) return false;

      lastKnownBundlerData = bundlerKey;
      lastKnownQuantity = bundlerData.quantity;

      // Get current variant data and merge with Bundler pricing
      const variantId = getSelectedVariantId();
      if (!variantId) return false;

      try {
        const pathParts = window.location.pathname.split('/');
        const productIndex = pathParts.indexOf('products');
        if (productIndex === -1 || !pathParts[productIndex + 1]) return false;

        const productHandle = pathParts[productIndex + 1].split('?')[0];
        const response = await fetch(`/products/${productHandle}.js`);
        const productData = await response.json();

        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (!variant || !variant.available) return false;

        // Check for currency converter displayed price
        const displayedPriceData = getDisplayedPriceData();

        const newProductData = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: bundlerData.quantity,
          price: bundlerData.discountedPrice,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        if (displayedPriceData) {
          newProductData.displayPrice = displayedPriceData.price;
          newProductData.displayCurrencySymbol = displayedPriceData.currencySymbol;
          newProductData.displayCurrencyCode = displayedPriceData.currencyCode;
          if (displayedPriceData.exchangeRate) newProductData.displayExchangeRate = displayedPriceData.exchangeRate;
        }

        if (bundlerData.hasBundleDiscount) {
          newProductData.originalPrice = bundlerData.originalPrice;
          newProductData.hasBundleDiscount = true;
          newProductData.variantShopifyPrice = variant.price / 100;
        }

        setCurrentProduct(newProductData);
        setCart(prevCart => {
          const cartItems = prevCart.items.filter(item => {
            const isCurrentProduct = item.variantId === currentProduct?.variantId;
            return !isCurrentProduct && !item.isUpsell;
          });
          return { items: [newProductData, ...cartItems] };
        });

        return true;
      } catch (error) {
        console.error('Preventify: Failed to update with Bundler data', error);
        return false;
      }
    };

    // Track last known quantity-breaks selection
    let lastKnownQuantityBreaks = null;

    // Helper to update product with theme quantity-breaks data
    const updateWithQuantityBreaks = async () => {
      const qbData = getQuantityBreaksData();
      if (!qbData) return false;

      // Create a key to detect changes
      const qbKey = `${qbData.quantity}-${qbData.discountedPrice}`;
      if (qbKey === lastKnownQuantityBreaks) return false;

      lastKnownQuantityBreaks = qbKey;
      lastKnownQuantity = qbData.quantity;

      // Get current variant data and merge with quantity-breaks pricing
      const variantId = getSelectedVariantId();
      if (!variantId) return false;

      try {
        const pathParts = window.location.pathname.split('/');
        const productIndex = pathParts.indexOf('products');
        if (productIndex === -1 || !pathParts[productIndex + 1]) return false;

        const productHandle = pathParts[productIndex + 1].split('?')[0];
        const response = await fetch(`/products/${productHandle}.js`);
        const productData = await response.json();

        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (!variant || !variant.available) return false;

        // Check for currency converter displayed price
        const displayedPriceData = getDisplayedPriceData();

        const newProductData = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: qbData.quantity,
          price: qbData.discountedPrice,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        if (displayedPriceData) {
          newProductData.displayPrice = qbData.displayDiscountedPrice || displayedPriceData.price;
          newProductData.displayCurrencySymbol = displayedPriceData.currencySymbol;
          newProductData.displayCurrencyCode = displayedPriceData.currencyCode;
          if (displayedPriceData.exchangeRate) newProductData.displayExchangeRate = displayedPriceData.exchangeRate;
          if (qbData.displayOriginalPrice) newProductData.displayOriginalPrice = qbData.displayOriginalPrice;
        }

        if (qbData.hasBundleDiscount) {
          newProductData.originalPrice = qbData.originalPrice;
          newProductData.hasBundleDiscount = true;
        }

        setCurrentProduct(newProductData);
        setCart(prevCart => {
          const cartItems = prevCart.items.filter(item => {
            const isCurrentProduct = item.variantId === currentProduct?.variantId;
            return !isCurrentProduct && !item.isUpsell;
          });
          return { items: [newProductData, ...cartItems] };
        });

        return true;
      } catch (error) {
        console.error('Preventify: Failed to update with quantity-breaks data', error);
        return false;
      }
    };

    // Poll for variant changes and quantity changes every 300ms
    // This is the most reliable method since Shopify themes update the input value programmatically
    const pollInterval = setInterval(async () => {
      // Skip 3rd-party bundle detection when our internal bundle widget is active
      if (activeBundleConfig) {
        // Only check for variant changes, not external bundle apps
        const currentVariantId = getSelectedVariantId();
        if (currentVariantId && currentVariantId !== lastKnownVariantId) {
          updateProductVariant(currentVariantId);
        }
        return;
      }

      // First check for Pumper Bundle changes (takes priority)
      const pumperUpdated = await updateWithPumperBundle();
      if (pumperUpdated) return; // Skip other checks if Pumper updated

      // Then check for Bundler app changes
      const bundlerUpdated = await updateWithBundlerData();
      if (bundlerUpdated) return; // Skip other checks if Bundler updated

      // Then check for theme quantity-breaks changes
      const qbUpdated = await updateWithQuantityBreaks();
      if (qbUpdated) return; // Skip other checks if quantity-breaks updated

      // Check for variant changes
      const currentVariantId = getSelectedVariantId();
      if (currentVariantId && currentVariantId !== lastKnownVariantId) {
        updateProductVariant(currentVariantId);
      }

      // Check for quantity changes (only if no bundle apps are active)
      const hasPumperBundles = document.querySelector('.prvw_pair');
      const hasBundlerApp = document.querySelector('.bndlr-quantity-break');
      const hasQuantityBreaks = document.querySelector('quantity-breaks');
      if (!hasPumperBundles && !hasBundlerApp && !hasQuantityBreaks) {
        const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
        if (quantityInput) {
          const currentQuantity = parseInt(quantityInput.value);
          if (!isNaN(currentQuantity) && currentQuantity > 0 && currentQuantity !== lastKnownQuantity) {
            lastKnownQuantity = currentQuantity;
            setCurrentProduct(prev => prev ? { ...prev, quantity: currentQuantity } : prev);
            setCart(prevCart => {
              const items = prevCart.items.map(item => {
                // Update the first item that matches the current product variant
                if (item.variantId && lastKnownVariantId && item.variantId.includes(lastKnownVariantId)) {
                  return { ...item, quantity: currentQuantity };
                }
                return item;
              });
              return { items };
            });
          }
        }
      }

      // Check for currency converter updates (detects initial load and currency switches)
      // Store as displayPrice — never overwrite price (used for order submission in original currency)
      const displayedPriceData = getDisplayedPriceData();
      if (displayedPriceData) {
        const displayKey = `${displayedPriceData.currencyCode}-${displayedPriceData.price}`;
        if (displayKey !== lastKnownDisplayCurrency) {
          lastKnownDisplayCurrency = displayKey;
          const rate = displayedPriceData.exchangeRate;

          // Re-read quantity-breaks display prices for the new currency
          const qbData = getQuantityBreaksData();

          setCurrentProduct(prev => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              displayCurrencySymbol: displayedPriceData.currencySymbol,
              displayCurrencyCode: displayedPriceData.currencyCode,
              displayExchangeRate: displayedPriceData.exchangeRate || prev.displayExchangeRate,
            };
            // Use bundle display price if available, otherwise convert base price
            if (qbData?.displayDiscountedPrice) {
              updated.displayPrice = qbData.displayDiscountedPrice;
              if (qbData.displayOriginalPrice) updated.displayOriginalPrice = qbData.displayOriginalPrice;
            } else if (rate && prev.price) {
              updated.displayPrice = parseFloat((prev.price * rate).toFixed(2));
              if (prev.originalPrice) updated.displayOriginalPrice = parseFloat((prev.originalPrice * rate).toFixed(2));
            } else {
              updated.displayPrice = displayedPriceData.price;
            }
            return updated;
          });
          // Update display prices for all items in cart and fullCart
          const updateItemDisplay = (item) => {
            const updatedItem = {
              ...item,
              displayCurrencySymbol: displayedPriceData.currencySymbol,
              displayCurrencyCode: displayedPriceData.currencyCode,
            };
            if (rate) {
              updatedItem.displayPrice = parseFloat((item.price * rate).toFixed(2));
              if (item.originalPrice) {
                updatedItem.displayOriginalPrice = parseFloat((item.originalPrice * rate).toFixed(2));
              }
            }
            return updatedItem;
          };
          setCart(prevCart => ({
            items: prevCart.items.map(updateItemDisplay)
          }));
          setFullCart(prevFullCart => ({
            items: prevFullCart.items.map(updateItemDisplay)
          }));
        }
      }
    }, 300);

    // Listen for quantity changes
    const handleQuantityChange = () => {
      const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
      if (quantityInput) {
        const newQuantity = parseInt(quantityInput.value);
        if (!isNaN(newQuantity) && newQuantity > 0 && newQuantity !== lastKnownQuantity) {
          lastKnownQuantity = newQuantity;
          setCurrentProduct(prev => prev ? { ...prev, quantity: newQuantity } : prev);
          setCart(prevCart => {
            const items = prevCart.items.map(item => {
              // Update the first item that matches the current product variant
              if (item.variantId && item.variantId.includes(lastKnownVariantId)) {
                return { ...item, quantity: newQuantity };
              }
              return item;
            });
            return { items };
          });
        }
      }
    };

    // Also listen for click events on variant selectors (swatches, buttons, etc.)
    const handleClick = (e) => {
      // Check if clicked element is related to variant selection
      const target = e.target;
      const isVariantSelector =
        target.closest('[data-variant-id]') ||
        target.closest('.variant-input') ||
        target.closest('.swatch') ||
        target.closest('[class*="variant"]') ||
        target.closest('[class*="option"]') ||
        target.closest('label[for*="option"]');

      if (isVariantSelector) {
        // Delay check to allow theme JS to update the input
        setTimeout(() => {
          const currentVariantId = getSelectedVariantId();
          if (currentVariantId && currentVariantId !== lastKnownVariantId) {
            updateProductVariant(currentVariantId);
          }
        }, 100);
      }

      // Check for Pumper Bundles clicks
      const isPumperBundleClick = target.closest('.prvw_pair') ||
                                   target.closest('.template_4_label') ||
                                   target.closest('.block__cb') ||
                                   target.closest('[class*="prvw"]');
      if (isPumperBundleClick) {
        // Delay to allow Pumper to update the DOM
        setTimeout(() => {
          updateWithPumperBundle();
        }, 150);
      }

      // Check for Bundler app clicks
      const isBundlerClick = target.closest('.bndlr-quantity-break') ||
                              target.closest('.bndlr-radio-container') ||
                              target.closest('[class*="bndlr"]');
      if (isBundlerClick) {
        // Delay to allow Bundler to update the DOM
        setTimeout(() => {
          updateWithBundlerData();
        }, 150);
      }

      // Check for theme quantity-breaks clicks
      const isQuantityBreaksClick = target.closest('quantity-breaks') ||
                                     target.closest('.quantity-break') ||
                                     target.closest('label[for^="quantity"]');
      if (isQuantityBreaksClick) {
        // Delay to allow theme JS to update the DOM
        setTimeout(() => {
          updateWithQuantityBreaks();
        }, 150);
      }

      // Also check for quantity changes when plus/minus buttons are clicked
      const isQuantityButton = target.closest('[name="plus"]') ||
                               target.closest('[name="minus"]') ||
                               target.closest('.quantity__button') ||
                               target.closest('[class*="quantity"]');
      if (isQuantityButton) {
        setTimeout(handleQuantityChange, 100);
      }
    };

    // Listen for URL changes (some themes update URL)
    const handleUrlChange = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlVariantId = urlParams.get('variant');
      if (urlVariantId && urlVariantId !== lastKnownVariantId) {
        updateProductVariant(urlVariantId);
      }
    };

    // Add event listeners
    document.addEventListener('click', handleClick);
    window.addEventListener('popstate', handleUrlChange);

    // Listen for quantity input changes
    const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
    if (quantityInput) {
      quantityInput.addEventListener('change', handleQuantityChange);
      quantityInput.addEventListener('input', handleQuantityChange);
    }

    // Initial check — always fetch variant data to populate productVariants cache
    // (needed for variant mix dropdowns). Can't skip via lastKnownVariantId guard
    // because on remount the variant ID is unchanged but productVariants state was lost.
    setTimeout(async () => {
      const variantId = getSelectedVariantId();
      if (variantId) {
        const data = await fetchVariantData(variantId);
        if (data) {
          lastKnownVariantId = variantId;
          setCurrentProduct(data);
        }
      }
    }, 500);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('click', handleClick);
      window.removeEventListener('popstate', handleUrlChange);
      if (quantityInput) {
        quantityInput.removeEventListener('change', handleQuantityChange);
        quantityInput.removeEventListener('input', handleQuantityChange);
      }
    };
  }, [currentPageType]); // Removed currentProduct?.variantId dependency to avoid re-creating effect

  // Load cart after config is loaded
  useEffect(() => {
    if (config) {
      loadCart();
    }
  }, [config]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isModalOpen]);

  const loadConfig = async () => {
    try {
      // Use app path from Liquid template global, fallback to default
      const initialAppPath = window.PREVENTIFY_APP_PATH || '/apps/preventify/';
      const response = await fetch(`${initialAppPath}proxy/config?shop=${shopDomain}`);
      const data = await response.json();
      setConfig(data);
      setConfigLoaded(true);

      // Use app path from Liquid template (most reliable), fallback to config response
      const resolvedAppPath = window.PREVENTIFY_APP_PATH || data.appPath || '/apps/preventify/';
      setAppPath(resolvedAppPath);

      // Find matching bundle for current product page
      if (data.bundles && data.bundles.length > 0) {
        const pathname = window.location.pathname;
        if (pathname.includes('/products/')) {
          // Get current product numeric ID from embed container
          const container = document.querySelector('[data-preventify-app-embed]');
          const currentProductId = container?.dataset?.productId;
          // Collection IDs from Liquid data attribute (if available)
          const productCollections = container?.dataset?.productCollections;
          const collectionIds = productCollections ? productCollections.split(',').map(id => id.trim()).filter(Boolean) : [];

          const matchedBundle = data.bundles.find(bundle => {
            if (bundle.applyOn === 'all') return true;
            if (bundle.applyOn === 'specific' && currentProductId) {
              return (bundle.productIds || []).some(pid => {
                const numericPid = String(pid).replace(/\D/g, '');
                return numericPid === String(currentProductId);
              });
            }
            if (bundle.applyOn === 'collections' && collectionIds.length > 0) {
              return (bundle.collectionIds || []).some(cid => {
                const numericCid = String(cid).replace(/\D/g, '');
                return collectionIds.some(pcid => pcid === numericCid);
              });
            }
            return false;
          });

          if (matchedBundle) {
            setActiveBundleConfig(matchedBundle);
            // Auto-select the preselected tier if one exists
            const preselectedTier = (matchedBundle.tiers || []).find(t => t.preselectTier);
            if (preselectedTier) {
              setSelectedBundleTier(preselectedTier);
            }
            // Track bundle impression
            const resolvedPath = window.PREVENTIFY_APP_PATH || data.appPath || '/apps/preventify/';
            fetch(`${resolvedPath}proxy/bundle-stats?bundleId=${matchedBundle.id}&stat=impression`, { method: 'POST' }).catch(() => {});
          }
        }
      }

      // Capture UTM params regardless of pixel config
      captureUtmParams();

      // Initialize pixel tracking
      if (data.pixels) {
        initializePixels(data.pixels);
      }

      // Detect country if multi-country is enabled
      if (data.shop?.enableMultiCountry) {
        detectCountry(data);
      }

      // Initialize Mixpanel for storefront tracking
      if (data.ENV?.MIXPANEL_TOKEN) {
        initStorefrontMixpanel(data.ENV.MIXPANEL_TOKEN, shopDomain);
        trackStorefrontEvent('App Loaded', {
          has_config: !!data.formConfig,
          form_mode: data.settings?.formMode,
          has_upsells: data.upsells?.prePurchase?.length > 0,
          has_downsells: data.downsells?.length > 0,
        });
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      // Keep using default config on error
      setConfigLoaded(true);
    }
  };

  // Country detection with caching
  const getCachedCountry = () => {
    try {
      const cached = sessionStorage.getItem(`preventify_detected_country_${shopDomain}`);
      if (cached) {
        const data = JSON.parse(cached);
        // Cache valid for 1 hour
        if (Date.now() - data.timestamp < 3600000) {
          return data.country;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  const cacheCountry = (country) => {
    try {
      sessionStorage.setItem(
        `preventify_detected_country_${shopDomain}`,
        JSON.stringify({ country, timestamp: Date.now() })
      );
    } catch (e) {
      // Ignore storage errors
    }
  };

  const detectCountry = async (configData) => {
    // Check cache first
    const cached = getCachedCountry();
    if (cached) {
      setDetectedCountry(cached);
      return;
    }

    // Set timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(
        `${appPath}proxy/detect-country?shop=${shopDomain}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      const data = await response.json();
      setDetectedCountry(data.country);
      cacheCountry(data.country);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('Preventify: Country detection timeout');
      } else {
        console.error('Preventify: Country detection failed:', error);
      }
      // Fallback to shop default
      setDetectedCountry(configData?.shop?.country || 'PAK');
    }
  };

  const loadCart = async () => {
    try {
      const response = await fetch('/cart.js');
      const cartData = await response.json();

      // Check for currency converter to apply display prices to cart items
      const convertedEl = document.querySelector('product-price .buckscc-converted[bucks-current]')
        || document.querySelector('.price .buckscc-converted[bucks-current]');
      let displayCurrencyInfo = null;
      if (convertedEl) {
        const currentPrice = convertedEl.getAttribute('bucks-current') || '';
        const currency = convertedEl.getAttribute('bucks-currency') || '';
        const priceMatch = currentPrice.match(/^([^\d]*)([\d,]+\.?\d*)(.*)$/);
        if (priceMatch) {
          const symbol = priceMatch[1] || priceMatch[3] || '';
          const convertedAmount = normalizePrice(priceMatch[2]);
          const initPrice = parseFloat(convertedEl.getAttribute('bucks-init') || '0');
          if (convertedAmount > 0 && initPrice > 0) {
            displayCurrencyInfo = {
              symbol,
              currencyCode: currency,
              exchangeRate: convertedAmount / initPrice,
            };
          }
        }
      }

      const cartItems = cartData.items.map(item => {
        // Use final_price (after line-level discounts) as the actual price
        const finalPrice = item.final_price != null ? item.final_price / 100 : item.price / 100;
        const originalBasePrice = item.price / 100;
        const cartItem = {
          variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
          title: item.product_title,
          variant: item.variant_title,
          quantity: item.quantity,
          price: finalPrice,
          image: item.image || item.featured_image || null,
        };
        // Detect cart-level discounts (e.g. quantity-breaks bundles)
        // Compare original price vs final_price to catch line-level discounts
        if (originalBasePrice > finalPrice) {
          cartItem.originalPrice = originalBasePrice;
          cartItem.hasCartDiscount = true;
        }
        // Apply currency conversion for display
        if (displayCurrencyInfo) {
          cartItem.displayPrice = parseFloat((finalPrice * displayCurrencyInfo.exchangeRate).toFixed(2));
          cartItem.displayCurrencySymbol = displayCurrencyInfo.symbol;
          cartItem.displayCurrencyCode = displayCurrencyInfo.currencyCode;
          if (cartItem.hasCartDiscount) {
            cartItem.displayOriginalPrice = parseFloat((originalBasePrice * displayCurrencyInfo.exchangeRate).toFixed(2));
          }
        }
        return cartItem;
      });

      // Store full cart
      setFullCart({ items: cartItems });

      // Determine what items to show in the form
      if (mode === 'embedded') {
        // For embedded mode on product page, use current product only
        // For embedded mode on cart page (no currentProduct), use cart items
        if (currentProduct) {
          setCart({ items: [currentProduct] });
        } else {
          // On cart page, use all cart items
          setCart({ items: cartItems });
        }
      } else if (cartItems.length === 0) {
        // For popup mode when no cart items
        if (currentProduct) {
          setCart({ items: [currentProduct] });
        } else {
          setCart({ items: [] });
        }
      } else {
        // For popup mode with cart items, combine current product + cart by default
        // (This happens both when allowCartItems is enabled or disabled)
        if (currentProduct) {
          setCart({ items: [currentProduct, ...cartItems] });
        } else {
          setCart({ items: cartItems });
        }
      }
    } catch (error) {
      console.error('Failed to load cart:', error);
      // If cart fetch fails but we have a current product, use it
      if (currentProduct) {
        setCart({ items: [currentProduct] });
      } else {
        setCart({ items: [] });
      }
    }
  };

  // Update cart based on product selection
  useEffect(() => {
    if (mode === 'popup' && currentProduct) {
      // When variant mix bundle is active, cart is managed by buildVariantMixCartItems
      // with split items per variant — don't overwrite it with the single currentProduct
      if (currentProduct.isVariantMixBundle) return;

      // When variant mix is about to initialize (productVariants just loaded but
      // variantMixSelections not yet set), skip to avoid overwriting the cart that
      // the preselect useEffect is about to populate with split items.
      if (activeBundleConfig?.allowVariantMix && productVariants && selectedBundleTier
          && activeBundleConfig?.styling?.layout !== 'horizontal' && !variantMixSelections) {
        return;
      }

      // When allowCartItems is DISABLED, always include both cart and current product
      if (!config?.settings?.allowCartItems) {
        setCart({ items: [currentProduct, ...fullCart.items] });
      }
      // When allowCartItems is ENABLED, respect the user's selection
      else if (config?.settings?.allowCartItems) {
        if (productSelection === 'current') {
          setCart({ items: [currentProduct] });
        } else {
          // current+cart
          setCart({ items: [currentProduct, ...fullCart.items] });
        }
      }
    }
  }, [productSelection, config, mode, currentProduct, fullCart]);

  const handleRemoveItem = (variantId) => {
    // Only allow removing items in popup mode
    if (mode !== 'popup') return;

    // Remove the item from the cart
    setCart(prevCart => ({
      items: prevCart.items.filter(item => item.variantId !== variantId)
    }));

    // Also remove from fullCart if it exists there
    setFullCart(prevCart => ({
      items: prevCart.items.filter(item => item.variantId !== variantId)
    }));
  };

  // Check if button should show based on page visibility setting
  const shouldShowButton = () => {
    // Cart drawer button always shows (visibility check done at index.jsx level)
    if (isCartDrawer) {
      return true;
    }

    // Collection and homepage always show buttons (controlled by app embed being enabled)
    if (currentPageType === 'collection' || currentPageType === 'homepage') {
      return true;
    }

    if (mode !== 'popup') {
      return true; // Only applies to popup mode
    }

    const visibility = config?.settings?.buttonPageVisibility || 'product';

    if (visibility === 'disabled') return false;
    if (visibility === 'product') return currentPageType === 'product';
    if (visibility === 'cart') return currentPageType === 'cart';
    if (visibility === 'both') return ['product', 'cart'].includes(currentPageType);

    return false;
  };

  const handleSubmit = async (orderData) => {
    try {
      const response = await fetch(`${appPath}proxy/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...orderData, shop: shopDomain }),
      });

      const result = await response.json();

      if (result.success) {
        setOrderResult(result);

        // Track Purchase event with the same event ID used for server-side tracking
        const currency = getCurrencyCode(config.shop?.country);

        trackPurchase({
          items: orderData.items,
          total: result.total || orderData.total,
          orderNumber: result.shopifyOrderNumber,
          eventId: orderData.pixelEventId, // Use same event ID for deduplication
        }, currency);

        // Track Snapchat Purchase event
        trackSnapchatPurchase({
          items: orderData.items,
          total: result.total || orderData.total,
          orderNumber: result.shopifyOrderNumber,
        }, currency);

        // Track TikTok events (PlaceAnOrder and CompletePayment)
        trackTikTokPlaceAnOrder({
          items: orderData.items,
          total: result.total || orderData.total,
          orderNumber: result.shopifyOrderNumber,
        }, currency);

        trackTikTokCompletePayment({
          items: orderData.items,
          total: result.total || orderData.total,
          orderNumber: result.shopifyOrderNumber,
        }, currency);

        // Check if there's a post-purchase upsell to show
        if (result.postPurchaseUpsell) {
          // Directly show post-purchase upsell without success modal
          setIsModalOpen(false);
          setPostPurchaseUpsellConfig(result.postPurchaseUpsell);
          setShowPostPurchaseUpsell(true);
          // Track impression for post-purchase upsell
          trackUpsellStat(result.postPurchaseUpsell.id, 'impression');
        } else {
          // No post-purchase upsell, redirect immediately
          if (result.orderStatusUrl) {
            window.location.href = result.orderStatusUrl;
          } else {
            setIsModalOpen(false);
          }
        }
      } else {
        // Throw validation error with field-specific errors
        const error = new Error(result.error || 'Unknown error');
        error.fieldErrors = result.fieldErrors || {};
        throw error;
      }
    } catch (error) {
      console.error('Order submission error:', error);
      throw error;
    }
  };

  // Get the first enabled pre-purchase upsell (sorted by priority)
  const getActivePrePurchaseUpsell = () => {
    const prePurchaseUpsells = config?.upsells?.prePurchase || [];
    // Return the first one (already sorted by priority from backend)
    return prePurchaseUpsells.find(u => u.enabled && u.product?.id) || null;
  };

  // Build split cart items for variant mix bundles
  const buildVariantMixCartItems = (tier, unitPrice, totalQuantity, selections) => {
    if (!selections || !productVariants) return;

    const { fullPrice, discountedPrice, hasDiscount } = calculateTierPrice(unitPrice, tier);
    const totalBundleDiscount = hasDiscount ? fullPrice - discountedPrice : 0;
    const perUnitDiscount = hasDiscount ? totalBundleDiscount / totalQuantity : 0;
    const rate = currentProduct.displayExchangeRate;

    // Group selections by variant ID
    const grouped = {};
    selections.forEach(variantIdStr => {
      grouped[variantIdStr] = (grouped[variantIdStr] || 0) + 1;
    });

    const splitItems = Object.entries(grouped).map(([variantIdStr, qty]) => {
      const variantData = productVariants.variants.find(v => v.id === parseInt(variantIdStr));
      const itemOriginalTotal = unitPrice * qty;
      const itemDiscountedTotal = (unitPrice - perUnitDiscount) * qty;

      const item = {
        variantId: `gid://shopify/ProductVariant/${variantIdStr}`,
        title: currentProduct.title,
        variant: variantData?.title !== 'Default Title' ? variantData?.title : null,
        quantity: qty,
        price: hasDiscount ? itemDiscountedTotal : itemOriginalTotal,
        originalPrice: hasDiscount ? itemOriginalTotal : undefined,
        hasBundleDiscount: hasDiscount,
        bundleGroupId: `bundle-${activeBundleConfig.id}`,
        image: variantData?.image || currentProduct.image,
      };

      if (rate) {
        item.displayPrice = parseFloat((item.price * rate).toFixed(2));
        if (hasDiscount) {
          item.displayOriginalPrice = parseFloat((itemOriginalTotal * rate).toFixed(2));
        }
        item.displayCurrencySymbol = currentProduct.displayCurrencySymbol;
        item.displayCurrencyCode = currentProduct.displayCurrencyCode;
        item.displayExchangeRate = rate;
      }

      return item;
    });

    // Update currentProduct to reflect total bundle pricing
    setCurrentProduct(prev => ({
      ...prev,
      quantity: totalQuantity,
      price: discountedPrice,
      originalPrice: hasDiscount ? fullPrice : undefined,
      hasBundleDiscount: hasDiscount,
      isVariantMixBundle: true,
    }));

    // Replace cart items: remove old bundle/current product items, add split items
    setCart(prevCart => {
      const nonBundleItems = prevCart.items.filter(item =>
        !item.bundleGroupId && item.variantId !== currentProduct.variantId
      );
      return { items: [...splitItems, ...nonBundleItems] };
    });
  };

  // Handle variant mix dropdown change
  const handleVariantMixChange = (slotIndex, newVariantId) => {
    if (!variantMixSelections || !selectedBundleTier) return;

    const newSelections = [...variantMixSelections];
    newSelections[slotIndex] = newVariantId;
    setVariantMixSelections(newSelections);

    // Validate inventory for each variant
    const invMap = window.PREVENTIFY_VARIANT_INVENTORY || {};
    let hasOosError = false;

    // Count how many of each variant are selected
    const variantCounts = {};
    newSelections.forEach(vid => {
      variantCounts[vid] = (variantCounts[vid] || 0) + 1;
    });

    // Check each variant's inventory (only for tracked variants)
    for (const [vid, count] of Object.entries(variantCounts)) {
      const variantData = productVariants?.variants.find(v => v.id === parseInt(vid));
      if (variantData && !variantData.available) {
        hasOosError = true;
        break;
      }
      const inv = invMap[vid];
      // Skip inventory enforcement for untracked variants (stale data)
      if (!inv || !inv.tracked) continue;
      const clampedQty = Math.max(0, inv.quantity);
      if (inv.policy !== 'continue' && clampedQty < count) {
        hasOosError = true;
        break;
      }
    }

    setVariantMixOosError(hasOosError);

    // Rebuild cart items with new selections
    const unitPrice = bundleBasePrice ?? currentProduct.price;
    buildVariantMixCartItems(selectedBundleTier, unitPrice, newSelections.length, newSelections);
  };

  // Handle bundle tier selection
  const handleBundleTierSelect = (tier) => {
    setSelectedBundleTier(tier);

    if (!currentProduct) return;

    // Capture the original single-unit price on first tier selection,
    // so subsequent selections never use an already-discounted price.
    const unitPrice = bundleBasePrice ?? currentProduct.price;
    if (bundleBasePrice === null) {
      setBundleBasePrice(unitPrice);
    }

    // Check if stock is sufficient for the requested tier quantity.
    // If not, cap to available stock and use single-unit pricing (no bundle discount).
    const isStockLimited = inventoryQuantity != null && tier.quantity > inventoryQuantity;
    const effectiveQuantity = isStockLimited ? Math.max(1, inventoryQuantity) : tier.quantity;

    // Determine if variant mix is enabled for this tier
    const isVertical = activeBundleConfig?.styling?.layout !== 'horizontal';
    const enableVariantMix = activeBundleConfig?.allowVariantMix && isVertical && productVariants;

    if (enableVariantMix) {
      // Always use full tier quantity for variant mix — per-slot OOS validation handles stock limits
      const currentVariantNumericId = currentProduct.variantId.split('/').pop();
      const selections = Array(tier.quantity).fill(currentVariantNumericId);
      setVariantMixSelections(selections);

      // Run initial OOS validation (e.g., 2-pair tier but only 1 in stock of current variant)
      // Skip inventory enforcement for untracked variants (stale data)
      const invMap = window.PREVENTIFY_VARIANT_INVENTORY || {};
      let hasOosError = false;
      const inv = invMap[currentVariantNumericId];
      const variantData = productVariants.variants.find(v => v.id === parseInt(currentVariantNumericId));
      if (variantData && !variantData.available) {
        hasOosError = true;
      } else if (inv && inv.tracked && inv.policy !== 'continue' && Math.max(0, inv.quantity) < tier.quantity) {
        hasOosError = true;
      }
      setVariantMixOosError(hasOosError);

      // Build split cart items
      buildVariantMixCartItems(tier, unitPrice, tier.quantity, selections);
    } else {
      // Standard single-item path
      setVariantMixSelections(null);
      setVariantMixOosError(false);

      let effectivePrice, effectiveOriginalPrice, effectiveHasDiscount;
      const { fullPrice, discountedPrice, hasDiscount } = calculateTierPrice(unitPrice, tier);
      if (isStockLimited) {
        // Stock is less than tier quantity — find the best matching tier for the clamped quantity.
        // e.g. stock=1, selected 3-pair → use the 1-pair tier's pricing (which may have its own discount).
        const tiers = activeBundleConfig?.tiers || [];
        const matchingTier = tiers.find(t => t.quantity === effectiveQuantity);
        if (matchingTier) {
          const matched = calculateTierPrice(unitPrice, matchingTier);
          effectivePrice = matched.hasDiscount ? matched.discountedPrice : matched.fullPrice;
          effectiveOriginalPrice = matched.hasDiscount ? matched.fullPrice : undefined;
          effectiveHasDiscount = matched.hasDiscount;
        } else {
          // No exact tier match — derive per-unit discounted price from selected tier
          const perUnitDiscounted = hasDiscount ? discountedPrice / tier.quantity : unitPrice;
          effectivePrice = perUnitDiscounted * effectiveQuantity;
          effectiveOriginalPrice = hasDiscount ? unitPrice * effectiveQuantity : undefined;
          effectiveHasDiscount = hasDiscount;
        }
      } else {
        effectivePrice = hasDiscount ? discountedPrice : fullPrice;
        effectiveOriginalPrice = hasDiscount ? fullPrice : undefined;
        effectiveHasDiscount = hasDiscount;
      }

      const rate = currentProduct.displayExchangeRate;
      const displayEffectivePrice = rate ? parseFloat((effectivePrice * rate).toFixed(2)) : null;
      const displayOriginal = rate && effectiveOriginalPrice ? parseFloat((effectiveOriginalPrice * rate).toFixed(2)) : undefined;

      setCurrentProduct(prev => ({
        ...prev,
        quantity: effectiveQuantity,
        price: effectivePrice,
        originalPrice: effectiveOriginalPrice,
        hasBundleDiscount: effectiveHasDiscount,
        isVariantMixBundle: false,
        ...(displayEffectivePrice && {
          displayPrice: displayEffectivePrice,
          displayOriginalPrice: displayOriginal,
        }),
      }));

      setCart(prevCart => {
        // Remove any old variant mix split items
        const filteredItems = prevCart.items.filter(item => !item.bundleGroupId);
        const updatedItems = filteredItems.map(item => {
          if (item.variantId === currentProduct.variantId) {
            return {
              ...item,
              quantity: effectiveQuantity,
              price: effectivePrice,
              originalPrice: effectiveOriginalPrice,
              hasBundleDiscount: effectiveHasDiscount,
              ...(displayEffectivePrice && {
                displayPrice: displayEffectivePrice,
                displayOriginalPrice: displayOriginal,
              }),
            };
          }
          return item;
        });
        return { items: updatedItems };
      });
    }

    // Track accept stat
    if (activeBundleConfig && appPath) {
      fetch(`${appPath}proxy/bundle-stats?bundleId=${activeBundleConfig.id}&stat=accept`, { method: 'POST' }).catch(() => {});
    }
  };

  // Apply preselected bundle tier pricing and variant mix initialization.
  // Watches all required deps including productVariants so it re-fires
  // when variant data becomes available (important after component remount).
  useEffect(() => {
    if (!selectedBundleTier || !currentProduct || !activeBundleConfig) return;

    // Determine if this bundle expects variant mix
    const wantsVariantMix = activeBundleConfig.allowVariantMix
      && activeBundleConfig.styling?.layout !== 'horizontal';

    // If variant mix is wanted but productVariants not loaded yet, only cache
    // the base price — don't call handleBundleTierSelect yet (which would take
    // the standard single-item path). Wait for productVariants to arrive.
    if (wantsVariantMix && !productVariants) {
      if (bundleBasePrice === null) {
        setBundleBasePrice(currentProduct.price);
      }
      return;
    }

    // Either variant mix is not wanted, or productVariants IS loaded.
    // If bundleBasePrice is null (first init or post-variant-change reset),
    // OR if variant mix is wanted but selections haven't been initialized yet,
    // run the full tier selection.
    const needsPricing = bundleBasePrice === null;
    const needsVariantMixInit = wantsVariantMix && !variantMixSelections;

    if (needsPricing || needsVariantMixInit) {
      handleBundleTierSelect(selectedBundleTier);
    }
  }, [selectedBundleTier, currentProduct, bundleBasePrice, activeBundleConfig, productVariants, variantMixSelections]);

  // Re-apply selected bundle tier when variant changes.
  // When the variant changes, currentProduct gets a new variantId but bundleBasePrice
  // still holds the old variant's price. Reset it so the above useEffect re-fires.
  const currentVariantIdRef = React.useRef(currentProduct?.variantId);
  useEffect(() => {
    if (currentProduct?.variantId && currentProduct.variantId !== currentVariantIdRef.current) {
      currentVariantIdRef.current = currentProduct.variantId;
      if (selectedBundleTier && activeBundleConfig && bundleBasePrice !== null) {
        setBundleBasePrice(null);
        setVariantMixSelections(null);
        setVariantMixOosError(false);
        setCurrentProduct(prev => prev ? { ...prev, isVariantMixBundle: false } : prev);
      }
    }
  }, [currentProduct?.variantId, selectedBundleTier, activeBundleConfig, bundleBasePrice]);

  // Handle button click - check for upsell first
  const handleBuyButtonClick = () => {
    // Track button click
    trackButtonClick('cod_button', {
      has_current_product: !!currentProduct,
      cart_items_count: cart.items.length,
      page_type: currentPageType,
    });

    const activeUpsell = getActivePrePurchaseUpsell();

    // If there's an active upsell and hasn't been shown yet, show upsell modal first
    if (activeUpsell && !upsellHandled) {
      setShowUpsellModal(true);
      // Track impression
      trackUpsellStat(activeUpsell.id, 'impression');
      trackStorefrontEvent('Pre-Purchase Upsell Viewed', {
        upsell_id: activeUpsell.id,
        product_title: activeUpsell.product?.title,
        discount_type: activeUpsell.discount?.type,
        discount_value: activeUpsell.discount?.value,
      });
    } else {
      // No upsell or already handled, go straight to COD form
      setIsModalOpen(true);
      trackStorefrontEvent('COD Form Opened', {
        has_upsell_product: !!upsellProduct,
        cart_items_count: getCartWithUpsell().items.length,
      });
    }
  };

  // Handle upsell acceptance
  const handleUpsellAccept = () => {
    const activeUpsell = getActivePrePurchaseUpsell();
    if (!activeUpsell?.product) return;

    // Calculate discounted price
    let finalPrice = activeUpsell.product.price;
    if (activeUpsell.discount.type === 'fixed') {
      finalPrice = Math.max(0, activeUpsell.product.price - activeUpsell.discount.value);
    } else if (activeUpsell.discount.type === 'percentage') {
      finalPrice = activeUpsell.product.price * (1 - activeUpsell.discount.value / 100);
    }

    // Create upsell product object
    const upsellItem = {
      variantId: activeUpsell.product.variantId,
      title: activeUpsell.product.title,
      variant: null,
      quantity: 1,
      price: finalPrice,
      originalPrice: activeUpsell.product.price,
      image: activeUpsell.product.image,
      isUpsell: true, // Mark as upsell item
    };

    // Add display price if currency converter is active
    const rate = currentProduct?.displayExchangeRate;
    if (rate) {
      upsellItem.displayPrice = parseFloat((finalPrice * rate).toFixed(2));
      upsellItem.displayOriginalPrice = parseFloat((activeUpsell.product.price * rate).toFixed(2));
      upsellItem.displayCurrencySymbol = currentProduct.displayCurrencySymbol;
      upsellItem.displayCurrencyCode = currentProduct.displayCurrencyCode;
    }

    setUpsellProduct(upsellItem);
    setUpsellHandled(true);
    setShowUpsellModal(false);
    setIsModalOpen(true);

    // Track accept
    trackUpsellStat(activeUpsell.id, 'accept');
  };

  // Handle upsell decline
  const handleUpsellDecline = () => {
    const activeUpsell = getActivePrePurchaseUpsell();
    setUpsellHandled(true);
    setShowUpsellModal(false);
    setIsModalOpen(true);

    // Track decline
    if (activeUpsell) {
      trackUpsellStat(activeUpsell.id, 'decline');
    }
  };

  // Track upsell stats
  const trackUpsellStat = async (upsellId, stat) => {
    try {
      await fetch(`${appPath}proxy/upsell-stats?upsellId=${upsellId}&stat=${stat}`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to track upsell stat:', error);
    }
  };

  // Track downsell stats
  const trackDownsellStat = async (downsellId, stat) => {
    try {
      await fetch(`${appPath}proxy/downsell-stats?downsellId=${downsellId}&stat=${stat}`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to track downsell stat:', error);
    }
  };

  // Get the first eligible downsell
  const getEligibleDownsell = () => {
    const downsells = config?.downsells || [];

    // Find the first downsell that:
    // 1. Has not exceeded its showCount for this session
    // 2. Doesn't have disableOtherDiscounts when cart already has a discount

    // Check if cart already has a discount:
    // - User accepted a pre-purchase upsell with a discount
    const hasUpsellDiscount = upsellProduct && upsellProduct.originalPrice && upsellProduct.originalPrice !== upsellProduct.price;
    const cartHasDiscount = hasUpsellDiscount;

    return downsells.find(d => {
      if (downsellShownCount >= d.showCount) return false;
      if (d.disableOtherDiscounts && cartHasDiscount) return false;
      return true;
    }) || null;
  };

  // Calculate effective cart total for downsell discount calculation
  // Uses prices AFTER bundle and upsell discounts (not raw subtotal)
  const getCartTotal = () => {
    const cartWithUpsell = getCartWithUpsell();
    return cartWithUpsell.items.reduce((sum, item) => {
      if (item.hasBundleDiscount) {
        // Bundle price is already the total for all units, don't multiply by quantity
        return sum + item.price;
      }
      return sum + (item.price * item.quantity);
    }, 0);
  };

  // Display cart total using converted prices (for downsell modal display)
  // Uses prices AFTER bundle and upsell discounts
  const getDisplayCartTotal = () => {
    const cartWithUpsell = getCartWithUpsell();
    return cartWithUpsell.items.reduce((sum, item) => {
      if (item.hasBundleDiscount) {
        const dp = item.displayPrice != null ? item.displayPrice : item.price;
        return sum + dp;
      }
      const price = item.displayPrice != null ? item.displayPrice : item.price;
      return sum + (price * item.quantity);
    }, 0);
  };

  // Handle form close - check for downsell first
  const handleFormClose = () => {
    const eligibleDownsell = getEligibleDownsell();

    if (eligibleDownsell && !recoveryDiscount) {
      // Show downsell modal instead of closing
      setActiveDownsell(eligibleDownsell);
      setShowDownsellModal(true);
      setDownsellShownCount(prev => prev + 1);
      // Track impression
      trackDownsellStat(eligibleDownsell.id, 'impression');
    } else {
      // No downsell or already accepted one, close the form
      setIsModalOpen(false);
    }
  };

  // Handle downsell acceptance
  const handleDownsellAccept = () => {
    if (!activeDownsell) return;

    // Calculate discount amount
    const cartTotal = getCartTotal();
    let discountAmount;
    if (activeDownsell.discount.type === 'percentage') {
      discountAmount = cartTotal * (activeDownsell.discount.value / 100);
    } else {
      discountAmount = Math.min(activeDownsell.discount.value, cartTotal);
    }

    // Set the recovery discount
    setRecoveryDiscount({
      type: activeDownsell.discount.type,
      value: activeDownsell.discount.value,
      amount: discountAmount,
      downsellId: activeDownsell.id,
    });

    setShowDownsellModal(false);
    // Form stays open with discount applied - don't close

    // Track accept
    trackDownsellStat(activeDownsell.id, 'accept');
  };

  // Handle downsell decline
  const handleDownsellDecline = () => {
    if (activeDownsell) {
      trackDownsellStat(activeDownsell.id, 'decline');
    }

    setShowDownsellModal(false);
    setIsModalOpen(false); // Close the form completely
  };

  // Handle post-purchase upsell acceptance
  const handlePostPurchaseAccept = async () => {
    if (!postPurchaseUpsellConfig || !orderResult) return;

    // Track accept
    trackUpsellStat(postPurchaseUpsellConfig.id, 'accept');

    // Calculate discounted price
    let finalPrice = postPurchaseUpsellConfig.product.price;
    if (postPurchaseUpsellConfig.discount.type === 'fixed') {
      finalPrice = Math.max(0, postPurchaseUpsellConfig.product.price - postPurchaseUpsellConfig.discount.value);
    } else if (postPurchaseUpsellConfig.discount.type === 'percentage') {
      finalPrice = postPurchaseUpsellConfig.product.price * (1 - postPurchaseUpsellConfig.discount.value / 100);
    }

    try {
      // Call API to add upsell item to the existing order
      const response = await fetch(`${appPath}proxy/order-upsell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop: shopDomain,
          shopifyOrderId: orderResult.shopifyOrderId,
          upsellItem: {
            variantId: postPurchaseUpsellConfig.product.variantId,
            title: postPurchaseUpsellConfig.product.title,
            price: finalPrice,
            originalPrice: postPurchaseUpsellConfig.product.price,
            quantity: 1,
          },
        }),
      });

      const result = await response.json();

      if (!result.success) {
        console.error('Failed to add upsell to order:', result.error);
      }
    } catch (error) {
      console.error('Error adding upsell to order:', error);
    }

    // Close modal and redirect to order confirmation
    setShowPostPurchaseUpsell(false);
    if (orderResult.orderStatusUrl) {
      window.location.href = orderResult.orderStatusUrl;
    }
  };

  // Handle post-purchase upsell decline
  const handlePostPurchaseDecline = () => {
    if (postPurchaseUpsellConfig) {
      trackUpsellStat(postPurchaseUpsellConfig.id, 'decline');
    }

    // Close modal and redirect to order confirmation
    setShowPostPurchaseUpsell(false);
    if (orderResult?.orderStatusUrl) {
      window.location.href = orderResult.orderStatusUrl;
    }
  };

  // Get cart items with upsell product included
  const getCartWithUpsell = () => {
    if (upsellProduct) {
      return { items: [...cart.items, upsellProduct] };
    }
    return cart;
  };

  // Don't render if product is sold out on product pages
  if (currentPageType === 'product' && !isProductAvailable) {
    return null;
  }

  // Embedded mode - only show if formMode is 'embedded'
  if (mode === 'embedded') {
    if (config.settings.formMode !== 'embedded') {
      return null; // Don't render if mode is not embedded
    }

    // For embedded mode, wait for config to load before showing form
    if (!configLoaded) {
      return null;
    }

    return (
      <div style={{ padding: '20px 0' }}>
        <CODForm
          config={config}
          cart={cart}
          onSubmit={handleSubmit}
          onRemoveItem={handleRemoveItem}
          mode="embedded"
          detectedCountry={detectedCountry}
          appPath={appPath}
          variantMixOosError={variantMixOosError}
        />
      </div>
    );
  }

  // Popup mode - only show button if formMode is 'popup' and on the correct page
  if (config.settings.formMode !== 'popup') {
    return null; // Don't render if mode is not popup
  }

  // Check if button should be visible on current page
  // BUT always render if we're showing a post-purchase upsell or if the COD modal is open
  if (!shouldShowButton() && !showPostPurchaseUpsell && !isModalOpen) {
    return null; // Don't render if not on the correct page type
  }

  const modalContent = isModalOpen && (
    <div
      className="jaldi-modal-overlay"
      style={{
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2147483647,
        padding: '20px',
        overflowY: 'auto',
      }}
      onClick={handleFormClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          position: 'relative',
          margin: 'auto',
        }}
      >
        {!configLoaded ? (
          <div style={{
            padding: '60px 40px',
            textAlign: 'center',
          }}>
            <p>Loading...</p>
          </div>
        ) : (
          <CODForm
            config={config}
            cart={getCartWithUpsell()}
            onSubmit={handleSubmit}
            onClose={handleFormClose}
            onRemoveItem={handleRemoveItem}
            mode="popup"
            upsellProduct={upsellProduct}
            showProductSelection={config.settings.allowCartItems && fullCart.items.length > 0 && currentProduct}
            productSelection={productSelection}
            onProductSelectionChange={setProductSelection}
            appPath={appPath}
            fullCartItemCount={fullCart.items.length}
            recoveryDiscount={recoveryDiscount}
            detectedCountry={detectedCountry}
            variantMixOosError={variantMixOosError}
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Bundle / Quantity Break Widget */}
      {activeBundleConfig && currentPageType === 'product' && currentProduct && (
        <BundleWidget
          bundleConfig={activeBundleConfig}
          productPrice={bundleBasePrice ?? currentProduct?.price ?? 0}
          currencySymbol={currentProduct?.displayCurrencySymbol || getCurrencySymbol(config?.shop?.country)}
          onTierSelect={handleBundleTierSelect}
          selectedTierId={selectedBundleTier?.id}
          isRTL={config?.settings?.enableRTL}
          exchangeRate={currentProduct?.displayExchangeRate || null}
          inventoryQuantity={inventoryQuantity}
          productVariants={activeBundleConfig?.allowVariantMix ? productVariants : null}
          variantMixSelections={variantMixSelections}
          onVariantMixChange={handleVariantMixChange}
          variantMixOosError={variantMixOosError}
          inventoryMap={typeof window !== 'undefined' ? window.PREVENTIFY_VARIANT_INVENTORY : null}
        />
      )}

      <BuyButton
        config={config}
        onClick={handleBuyButtonClick}
      />

      {/* Pre-Purchase Upsell Modal */}
      {showUpsellModal && createPortal(
        <UpsellModal
          upsellConfig={getActivePrePurchaseUpsell()}
          onAccept={handleUpsellAccept}
          onDecline={handleUpsellDecline}
          isRTL={config?.settings?.enableRTL}
          currencySymbol={currentProduct?.displayCurrencySymbol || getCurrencySymbol(config?.shop?.country)}
          exchangeRate={currentProduct?.displayExchangeRate || null}
        />,
        document.body
      )}

      {/* Post-Purchase Upsell Modal */}
      {showPostPurchaseUpsell && postPurchaseUpsellConfig && createPortal(
        <UpsellModal
          upsellConfig={postPurchaseUpsellConfig}
          onAccept={handlePostPurchaseAccept}
          onDecline={handlePostPurchaseDecline}
          isRTL={config?.settings?.enableRTL}
          isPostPurchase={true}
          currencySymbol={currentProduct?.displayCurrencySymbol || getCurrencySymbol(config?.shop?.country)}
          exchangeRate={currentProduct?.displayExchangeRate || null}
        />,
        document.body
      )}

      {/* Downsell Modal */}
      {showDownsellModal && activeDownsell && createPortal(
        <DownsellModal
          downsellConfig={activeDownsell}
          cartTotal={getDisplayCartTotal()}
          onAccept={handleDownsellAccept}
          onDecline={handleDownsellDecline}
          isRTL={config?.settings?.enableRTL}
          currencySymbol={currentProduct?.displayCurrencySymbol || getCurrencySymbol(config?.shop?.country)}
        />,
        document.body
      )}

      {isModalOpen && createPortal(modalContent, document.body)}
    </>
  );
}
