import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CODForm from './CODForm';
import BuyButton from './BuyButton';
import UpsellModal from './UpsellModal';

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
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentPageType, setCurrentPageType] = useState('unknown');

  // Upsell state
  const [showUpsellModal, setShowUpsellModal] = useState(false);
  const [upsellHandled, setUpsellHandled] = useState(false); // Track if upsell was already shown in this session
  const [upsellProduct, setUpsellProduct] = useState(null); // Store accepted upsell product

  // Post-purchase upsell state
  const [showPostPurchaseUpsell, setShowPostPurchaseUpsell] = useState(false);
  const [postPurchaseUpsellConfig, setPostPurchaseUpsellConfig] = useState(null);
  const [orderResult, setOrderResult] = useState(null); // Store order result for post-purchase flow

  console.log('Preventify COD Form & Upsells: Rendered with mode', mode, 'shop', shopDomain, 'currentProduct', currentProduct);

  useEffect(() => {
    console.log('Preventify COD Form & Upsells: Loading config');
    loadConfig();
  }, []);

  // Detect page type on mount
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
    }
    // Unknown page type
    else {
      console.log('Detected page type: unknown');
      setCurrentPageType('unknown');
    }
  }, []);

  // Listen for variant changes on product page
  useEffect(() => {
    if (currentPageType !== 'product') return;

    const container = document.querySelector('[data-preventify-app-embed]');
    if (!container) return;

    // Track last known variant to avoid duplicate updates
    let lastKnownVariantId = currentProduct?.variantId?.split('/').pop() || null;
    let isUpdating = false;

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

        return {
          variantId: `gid://shopify/ProductVariant/${variant.id}`,
          title: productData.title,
          variant: variant.title !== 'Default Title' ? variant.title : null,
          quantity: 1,
          price: variant.price / 100,
          image: variant.featured_image?.src || productData.featured_image || container.dataset.productImage,
        };
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

    // Poll for variant changes every 300ms
    // This is the most reliable method since Shopify themes update the input value programmatically
    const pollInterval = setInterval(() => {
      const currentVariantId = getSelectedVariantId();
      if (currentVariantId && currentVariantId !== lastKnownVariantId) {
        console.log('Preventify: Poll detected variant change');
        updateProductVariant(currentVariantId);
      }
    }, 300);

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

    // Initial check
    setTimeout(() => updateProductVariant(), 500);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('click', handleClick);
      window.removeEventListener('popstate', handleUrlChange);
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
      // Temporarily use production proxy since staging proxy isn't configured yet
      const response = await fetch(`/apps/jaldi-cod/proxy/config?shop=${shopDomain}`);
      const data = await response.json();
      console.log('Preventify COD Form & Upsells: Config loaded', data);
      setConfig(data);
      setConfigLoaded(true);
    } catch (error) {
      console.error('Failed to load config:', error);
      // Keep using default config on error
      setConfigLoaded(true);
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
      } else if (cartItems.length === 0 || !config?.settings?.allowCartItems) {
        // For popup mode when no cart items or cart items disabled
        if (currentProduct) {
          setCart({ items: [currentProduct] });
        } else {
          setCart({ items: [] });
        }
      } else {
        // For popup mode with cart items allowed, combine current product + cart by default
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
    if (mode === 'popup' && config?.settings?.allowCartItems && currentProduct) {
      if (productSelection === 'current') {
        setCart({ items: [currentProduct] });
      } else {
        // current+cart
        setCart({ items: [currentProduct, ...fullCart.items] });
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
      const response = await fetch('/apps/jaldi-cod/proxy/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...orderData, shop: shopDomain }),
      });

      const result = await response.json();

      if (result.success) {
        setShowSuccess(true);
        setOrderResult(result);

        // Check if there's a post-purchase upsell to show
        if (result.postPurchaseUpsell) {
          // Show success briefly, then show post-purchase upsell
          setTimeout(() => {
            setShowSuccess(false);
            setIsModalOpen(false);
            setPostPurchaseUpsellConfig(result.postPurchaseUpsell);
            setShowPostPurchaseUpsell(true);
            // Track impression for post-purchase upsell
            trackUpsellStat(result.postPurchaseUpsell.id, 'impression');
          }, 1500); // 1.5 seconds to show success message
        } else {
          // No post-purchase upsell, redirect normally
          setTimeout(() => {
            if (result.orderStatusUrl) {
              window.location.href = result.orderStatusUrl;
            } else {
              setIsModalOpen(false);
              setShowSuccess(false);
            }
          }, 1000);
        }
      } else {
        alert('Failed to submit order: ' + (result.error || 'Unknown error'));
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
    const activeUpsell = getActivePrePurchaseUpsell();

    // If there's an active upsell and hasn't been shown yet, show upsell modal first
    if (activeUpsell && !upsellHandled) {
      setShowUpsellModal(true);
      // Track impression
      trackUpsellStat(activeUpsell.id, 'impression');
    } else {
      // No upsell or already handled, go straight to COD form
      setIsModalOpen(true);
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
      await fetch(`/apps/jaldi-cod/proxy/upsell-stats?upsellId=${upsellId}&stat=${stat}`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Failed to track upsell stat:', error);
    }
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
      const response = await fetch('/apps/jaldi-cod/proxy/order-upsell', {
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
        />
        {showSuccess && (
          <div style={{
            marginTop: '20px',
            padding: '16px',
            backgroundColor: '#10b981',
            color: 'white',
            borderRadius: '4px',
            textAlign: 'center',
          }}>
            ✓ Order submitted successfully! Redirecting to order confirmation...
          </div>
        )}
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
      onClick={() => setIsModalOpen(false)}
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
        {showSuccess ? (
          <div style={{
            padding: '60px 40px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '64px',
              color: '#10b981',
              marginBottom: '20px',
            }}>✓</div>
            <h2 style={{ marginBottom: '10px' }}>Order Submitted Successfully!</h2>
            <p>Redirecting to order confirmation...</p>
          </div>
        ) : !configLoaded ? (
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
            onClose={() => setIsModalOpen(false)}
            onRemoveItem={handleRemoveItem}
            mode="popup"
            upsellProduct={upsellProduct}
            showProductSelection={config.settings.allowCartItems && fullCart.items.length > 0 && currentProduct}
            productSelection={productSelection}
            onProductSelectionChange={setProductSelection}
            fullCartItemCount={fullCart.items.length}
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
        />,
        document.body
      )}

      {isModalOpen && createPortal(modalContent, document.body)}
    </>
  );
}
