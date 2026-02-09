import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CODForm from './CODForm';
import BuyButton from './BuyButton';
import UpsellModal from './UpsellModal';
import DownsellModal from './DownsellModal';
import { initStorefrontMixpanel, trackStorefrontEvent, trackButtonClick } from './mixpanel-storefront';
import { initializePixels, resetEventId, trackPurchase, trackSnapchatPurchase, trackTikTokPlaceAnOrder, trackTikTokCompletePayment } from './pixels';
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

export default function JaldiCODFormApp({ mode, shopDomain, currentProduct: initialProduct, isCartDrawer = false }) {
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

  // Multi-country detection state
  const [detectedCountry, setDetectedCountry] = useState(null);

  console.log('Preventify COD Form & Upsells: Rendered with mode', mode, 'shop', shopDomain, 'currentProduct', currentProduct);

  useEffect(() => {
    console.log('Preventify COD Form & Upsells: Loading config');
    loadConfig();
  }, []);

  // Detect page type on mount and check product availability
  useEffect(() => {
    const pathname = window.location.pathname;
    console.log('Detecting page type from pathname:', pathname);

    // Check for cart page (could be /cart or /cart/)
    if (pathname === '/cart' || pathname.startsWith('/cart/') || pathname.endsWith('/cart')) {
      console.log('Detected page type: cart');
      setCurrentPageType('cart');
    }
    // Check for product page
    else if (pathname.includes('/products/')) {
      console.log('Detected page type: product');
      setCurrentPageType('product');

      // Check product availability on product pages
      checkProductAvailability();
    }
    // Check for collection page
    else if (pathname.includes('/collections/')) {
      console.log('Detected page type: collection');
      setCurrentPageType('collection');
    }
    // Check for homepage
    else if (pathname === '/' || pathname === '') {
      console.log('Detected page type: homepage');
      setCurrentPageType('homepage');
    }
    // Unknown page type
    else {
      console.log('Detected page type: unknown');
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
          console.log('Preventify: Current variant is sold out');
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

      console.log('Preventify: Pumper Bundle detected', { quantity, discountedPrice, originalPrice });

      return {
        quantity,
        discountedPrice,
        originalPrice,
        hasBundleDiscount: originalPrice !== null && originalPrice > discountedPrice,
      };
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

        const variant = productData.variants.find(v => v.id === parseInt(variantId));
        if (!variant) return null;

        // Check if variant is available (not sold out)
        if (!variant.available) {
          console.log('Preventify: Variant is sold out, not updating product data');
          setIsProductAvailable(false);
          return null;
        }

        // Variant is available
        setIsProductAvailable(true);

        // Check for Pumper Bundles discount
        const pumperData = getPumperBundleData();

        // Use Pumper's quantity and price if available
        let quantity = pumperData?.quantity || 1;
        let price = pumperData?.discountedPrice || (variant.price / 100);

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

        const productDataResult = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: quantity,
          price: price,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        // Add bundle discount info if applicable
        if (pumperData?.hasBundleDiscount) {
          productDataResult.originalPrice = pumperData.originalPrice;
          productDataResult.hasBundleDiscount = true;
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

      console.log('Preventify: Variant changed from', lastKnownVariantId, 'to', newVariantId);
      isUpdating = true;
      lastKnownVariantId = newVariantId;

      const newProductData = await fetchVariantData(newVariantId);

      if (newProductData) {
        console.log('Preventify: Updating product data', newProductData);
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

      console.log('Preventify: Pumper Bundle selection changed', pumperData);
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

        const newProductData = {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: pumperData.quantity,
          price: pumperData.discountedPrice,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };

        if (pumperData.hasBundleDiscount) {
          newProductData.originalPrice = pumperData.originalPrice;
          newProductData.hasBundleDiscount = true;
        }

        console.log('Preventify: Updating with Pumper Bundle price', newProductData);
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

    // Poll for variant changes and quantity changes every 300ms
    // This is the most reliable method since Shopify themes update the input value programmatically
    const pollInterval = setInterval(async () => {
      // First check for Pumper Bundle changes (takes priority)
      const pumperUpdated = await updateWithPumperBundle();
      if (pumperUpdated) return; // Skip other checks if Pumper updated

      // Check for variant changes
      const currentVariantId = getSelectedVariantId();
      if (currentVariantId && currentVariantId !== lastKnownVariantId) {
        console.log('Preventify: Poll detected variant change');
        updateProductVariant(currentVariantId);
      }

      // Check for quantity changes (only if no Pumper Bundles)
      const hasPumperBundles = document.querySelector('.prvw_pair');
      if (!hasPumperBundles) {
        const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
        if (quantityInput) {
          const currentQuantity = parseInt(quantityInput.value);
          if (!isNaN(currentQuantity) && currentQuantity > 0 && currentQuantity !== lastKnownQuantity) {
            console.log('Preventify: Poll detected quantity change from', lastKnownQuantity, 'to', currentQuantity);
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
    }, 300);

    // Listen for quantity changes
    const handleQuantityChange = () => {
      const quantityInput = document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
      if (quantityInput) {
        const newQuantity = parseInt(quantityInput.value);
        if (!isNaN(newQuantity) && newQuantity > 0 && newQuantity !== lastKnownQuantity) {
          console.log('Preventify: Quantity changed from', lastKnownQuantity, 'to', newQuantity);
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
            console.log('Preventify: Click detected variant change');
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
        console.log('Preventify: URL change detected variant');
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

    // Initial check
    setTimeout(() => updateProductVariant(), 500);

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
      console.log('Preventify COD Form & Upsells: Loading cart with config', config);
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
      console.log('Preventify COD Form & Upsells: Fetching config for shop', shopDomain);
      // Use default app path for initial config fetch
      const response = await fetch(`/apps/preventify/proxy/config?shop=${shopDomain}`);
      const data = await response.json();
      console.log('Preventify COD Form & Upsells: Config loaded', data);
      setConfig(data);
      setConfigLoaded(true);

      // Set dynamic app path from config
      if (data.appPath) {
        setAppPath(data.appPath);
        console.log('Preventify COD Form & Upsells: Using app path', data.appPath);
      }

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
      console.log('Preventify: Using cached country:', cached);
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
      console.log('Preventify: Country detected:', data.country, 'source:', data.source);
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

      const cartItems = cartData.items.map(item => ({
        variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
        title: item.product_title,
        variant: item.variant_title,
        quantity: item.quantity,
        price: item.price / 100,
        image: item.image || item.featured_image || null,
      }));

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
        console.log('Preventify COD Form & Upsells: Cart fetch failed, using current product', currentProduct);
        setCart({ items: [currentProduct] });
      } else {
        setCart({ items: [] });
      }
    }
  };

  // Update cart based on product selection
  useEffect(() => {
    if (mode === 'popup' && currentProduct) {
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
      console.log('shouldShowButton: Collection/homepage, always showing button');
      return true;
    }

    if (mode !== 'popup') {
      console.log('shouldShowButton: Not popup mode, showing button');
      return true; // Only applies to popup mode
    }

    const visibility = config?.settings?.buttonPageVisibility || 'product';
    console.log('shouldShowButton check:', {
      visibility,
      currentPageType,
      shouldShow: (
        (visibility === 'product' && currentPageType === 'product') ||
        (visibility === 'cart' && currentPageType === 'cart') ||
        (visibility === 'both' && ['product', 'cart'].includes(currentPageType))
      )
    });

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

  // Calculate cart total for downsell discount calculation
  const getCartTotal = () => {
    const cartWithUpsell = getCartWithUpsell();
    return cartWithUpsell.items.reduce((sum, item) => {
      const price = item.isUpsell && item.originalPrice ? item.originalPrice : item.price;
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

      if (result.success) {
        console.log('Post-purchase upsell added to order');
      } else {
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
    console.log('Preventify: Product is sold out, not rendering form/button');
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
          />
        )}
      </div>
    </div>
  );

  return (
    <>
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
          currencySymbol={getCurrencySymbol(config?.shop?.country)}
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
          currencySymbol={getCurrencySymbol(config?.shop?.country)}
        />,
        document.body
      )}

      {/* Downsell Modal */}
      {showDownsellModal && activeDownsell && createPortal(
        <DownsellModal
          downsellConfig={activeDownsell}
          cartTotal={getCartTotal()}
          onAccept={handleDownsellAccept}
          onDecline={handleDownsellDecline}
          isRTL={config?.settings?.enableRTL}
          currencySymbol={getCurrencySymbol(config?.shop?.country)}
        />,
        document.body
      )}

      {isModalOpen && createPortal(modalContent, document.body)}
    </>
  );
}
