import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import CODForm from './CODForm';
import BuyButton from './BuyButton';

export default function JaldiCODFormApp({ mode, shopDomain, currentProduct }) {
  const [config, setConfig] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cart, setCart] = useState({ items: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  console.log('Jaldi COD Form App: Rendered with mode', mode, 'shop', shopDomain, 'currentProduct', currentProduct);

  useEffect(() => {
    console.log('Jaldi COD Form App: Loading config and cart');
    loadConfig();
    loadCart();
  }, []);

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
      console.log('Jaldi COD Form App: Fetching config for shop', shopDomain);
      const response = await fetch(`/apps/jaldi-cod/proxy/config?shop=${shopDomain}`);
      const data = await response.json();
      console.log('Jaldi COD Form App: Config loaded', data);
      setConfig(data);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setIsLoading(false);
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
      }));

      // If there's a current product and it's not in the cart, add it
      if (currentProduct && cartItems.length === 0) {
        console.log('Jaldi COD Form App: No cart items, using current product', currentProduct);
        setCart({ items: [currentProduct] });
      } else {
        setCart({ items: cartItems });
      }
    } catch (error) {
      console.error('Failed to load cart:', error);
      // If cart fetch fails but we have a current product, use it
      if (currentProduct) {
        console.log('Jaldi COD Form App: Cart fetch failed, using current product', currentProduct);
        setCart({ items: [currentProduct] });
      } else {
        setCart({ items: [] });
      }
    }
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
        if (result.mode === "checkout" && result.redirect) {
          // === CHECKOUT MODE ===
          // Show redirecting message and redirect to Shopify Checkout
          setSuccessMessage('Redirecting to checkout...');
          setShowSuccess(true);

          // Redirect after brief delay for user feedback
          setTimeout(() => {
            window.location.href = result.redirect;
          }, 1000);

        } else if (result.mode === "draft") {
          // === DRAFT MODE ===
          // Show success message and close modal
          setSuccessMessage('Order submitted successfully!');
          setShowSuccess(true);
          setTimeout(() => {
            setIsModalOpen(false);
            setShowSuccess(false);
          }, 3000);
        }
      } else {
        alert('Failed to submit order: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Order submission error:', error);
      throw error;
    }
  };

  if (isLoading || !config) {
    return <div>Loading...</div>;
  }

  // Embedded mode - only show if embedded is enabled
  if (mode === 'embedded') {
    if (!config.settings.enableEmbedded && config.settings.formMode !== 'both') {
      return null; // Don't render if embedded is not enabled
    }

    return (
      <div style={{ padding: '20px 0' }}>
        <CODForm
          config={config}
          cart={cart}
          onSubmit={handleSubmit}
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
            ✓ {successMessage}
          </div>
        )}
      </div>
    );
  }

  // Popup mode - only show button if popup is enabled
  if (!config.settings.enablePopup && config.settings.formMode !== 'both') {
    return null; // Don't render if popup is not enabled
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
            <h2 style={{ marginBottom: '10px' }}>{successMessage}</h2>
            <p>{successMessage.includes('Redirecting') ? 'Please wait...' : "We'll contact you shortly to confirm your order."}</p>
          </div>
        ) : (
          <CODForm
            config={config}
            cart={cart}
            onSubmit={handleSubmit}
            onClose={() => setIsModalOpen(false)}
            mode="popup"
          />
        )}
      </div>
    </div>
  );

  return (
    <>
      {config.settings.enablePopup && (
        <BuyButton
          config={config}
          onClick={() => setIsModalOpen(true)}
        />
      )}

      {isModalOpen && createPortal(modalContent, document.body)}
    </>
  );
}
