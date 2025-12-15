import React from 'react';
import { createRoot } from 'react-dom/client';
import JaldiCODFormApp from './App';

console.log('Jaldi COD Form: Script loaded');

// Helper to extract product data from container
function getProductData(container) {
  if (!container) return null;

  const productId = container.dataset.productId;
  const variantId = container.dataset.variantId;
  const productTitle = container.dataset.productTitle;
  const variantTitle = container.dataset.variantTitle;
  const productPrice = container.dataset.productPrice;
  const productImage = container.dataset.productImage;

  if (productId && variantId) {
    return {
      variantId: `gid://shopify/ProductVariant/${variantId}`,
      title: productTitle,
      variant: variantTitle !== 'Default Title' ? variantTitle : null,
      quantity: 1,
      price: parseFloat(productPrice),
      image: productImage,
    };
  }

  return null;
}

// Initialize embedded form
const embeddedContainer = document.getElementById('jaldi-cod-form-embedded');
console.log('Jaldi COD Form: Embedded container', embeddedContainer);
if (embeddedContainer) {
  const shopDomain = embeddedContainer.dataset.shop;
  const productData = getProductData(embeddedContainer);
  console.log('Jaldi COD Form: Initializing embedded mode for shop', shopDomain, 'with product', productData);
  const root = createRoot(embeddedContainer);
  root.render(<JaldiCODFormApp mode="embedded" shopDomain={shopDomain} currentProduct={productData} />);
}

// Initialize popup form
const popupContainer = document.getElementById('jaldi-cod-form-popup');
console.log('Jaldi COD Form: Popup container', popupContainer);
if (popupContainer) {
  const shopDomain = popupContainer.dataset.shop;
  const productData = getProductData(popupContainer);
  console.log('Jaldi COD Form: Initializing popup mode for shop', shopDomain, 'with product', productData);
  const root = createRoot(popupContainer);
  root.render(<JaldiCODFormApp mode="popup" shopDomain={shopDomain} currentProduct={productData} />);
}
