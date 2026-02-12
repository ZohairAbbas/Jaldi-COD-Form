/**
 * Analytics Event Definitions
 *
 * Centralized event tracking definitions for consistency
 * across the application.
 */

// App Events
export const APP_EVENTS = {
  APP_INSTALLED: 'App Installed',
  APP_UNINSTALLED: 'App Uninstalled',
  APP_LOADED: 'App Loaded',
  PAGE_VIEWED: 'Page Viewed',
};

// Subscription/Billing Events
export const BILLING_EVENTS = {
  SUBSCRIPTION_STARTED: 'Subscription Started',
  SUBSCRIPTION_CANCELLED: 'Subscription Cancelled',
  SUBSCRIPTION_UPGRADED: 'Subscription Upgraded',
  SUBSCRIPTION_DOWNGRADED: 'Subscription Downgraded',
  TRIAL_STARTED: 'Trial Started',
  TRIAL_ENDED: 'Trial Ended',
  PAYMENT_SUCCESSFUL: 'Payment Successful',
  PAYMENT_FAILED: 'Payment Failed',
  USAGE_REPORTED: 'Usage Reported',
};

// Form Events
export const FORM_EVENTS = {
  FORM_OPENED: 'Form Opened',
  FORM_CLOSED: 'Form Closed',
  FORM_SUBMITTED: 'Form Submitted',
  FORM_SUBMISSION_FAILED: 'Form Submission Failed',
  FORM_FIELD_FOCUSED: 'Form Field Focused',
  FORM_FIELD_BLURRED: 'Form Field Blurred',
  FORM_VALIDATION_ERROR: 'Form Validation Error',
  FORM_CUSTOMIZED: 'Form Customized',
};

// Order Events
export const ORDER_EVENTS = {
  ORDER_CREATED: 'Order Created',
  ORDER_COMPLETED: 'Order Completed',
  ORDER_FAILED: 'Order Failed',
  ORDER_VIEWED: 'Order Viewed',
  ORDER_UPDATED: 'Order Updated',
};

// Upsell Events
export const UPSELL_EVENTS = {
  // Pre-purchase upsells
  PRE_PURCHASE_UPSELL_VIEWED: 'Pre-Purchase Upsell Viewed',
  PRE_PURCHASE_UPSELL_ACCEPTED: 'Pre-Purchase Upsell Accepted',
  PRE_PURCHASE_UPSELL_DECLINED: 'Pre-Purchase Upsell Declined',

  // Post-purchase upsells
  POST_PURCHASE_UPSELL_VIEWED: 'Post-Purchase Upsell Viewed',
  POST_PURCHASE_UPSELL_ACCEPTED: 'Post-Purchase Upsell Accepted',
  POST_PURCHASE_UPSELL_DECLINED: 'Post-Purchase Upsell Declined',

  // One-tick upsells
  ONE_TICK_UPSELL_SELECTED: 'One-Tick Upsell Selected',
  ONE_TICK_UPSELL_DESELECTED: 'One-Tick Upsell Deselected',
  ONE_TICK_UPSELL_PURCHASED: 'One-Tick Upsell Purchased',

  // Upsell management
  UPSELL_CREATED: 'Upsell Created',
  UPSELL_UPDATED: 'Upsell Updated',
  UPSELL_DELETED: 'Upsell Deleted',
  UPSELL_ENABLED: 'Upsell Enabled',
  UPSELL_DISABLED: 'Upsell Disabled',
};

// Downsell Events
export const DOWNSELL_EVENTS = {
  DOWNSELL_VIEWED: 'Downsell Viewed',
  DOWNSELL_ACCEPTED: 'Downsell Accepted',
  DOWNSELL_DECLINED: 'Downsell Declined',
  DOWNSELL_CREATED: 'Downsell Created',
  DOWNSELL_UPDATED: 'Downsell Updated',
  DOWNSELL_DELETED: 'Downsell Deleted',
  DOWNSELL_ENABLED: 'Downsell Enabled',
  DOWNSELL_DISABLED: 'Downsell Disabled',
};

// Cart Events
export const CART_EVENTS = {
  CART_VIEWED: 'Cart Viewed',
  CART_ABANDONED: 'Cart Abandoned',
  CART_RECOVERED: 'Cart Recovered',
  CART_ITEM_ADDED: 'Cart Item Added',
  CART_ITEM_REMOVED: 'Cart Item Removed',
  CART_ITEM_QUANTITY_CHANGED: 'Cart Item Quantity Changed',
};

// Settings Events
export const SETTINGS_EVENTS = {
  SETTINGS_UPDATED: 'Settings Updated',
  FORM_MODE_CHANGED: 'Form Mode Changed',
  BUTTON_CUSTOMIZED: 'Button Customized',
  SHIPPING_RATE_CREATED: 'Shipping Rate Created',
  SHIPPING_RATE_UPDATED: 'Shipping Rate Updated',
  SHIPPING_RATE_DELETED: 'Shipping Rate Deleted',
  MULTI_COUNTRY_ENABLED: 'Multi-Country Enabled',
  MULTI_COUNTRY_DISABLED: 'Multi-Country Disabled',
};

// Pixel Events
export const PIXEL_EVENTS = {
  PIXEL_CONFIGURED: 'Pixel Configured',
  PIXEL_REMOVED: 'Pixel Removed',
  PIXEL_EVENT_FIRED: 'Pixel Event Fired',
  PIXEL_EVENT_FAILED: 'Pixel Event Failed',
};

// Session Events
export const SESSION_EVENTS = {
  SESSION_STARTED: 'Session Started',
  SESSION_ENDED: 'Session Ended',
  SESSION_ABANDONED: 'Session Abandoned',
};

// Button Events
export const BUTTON_EVENTS = {
  BUY_BUTTON_CLICKED: 'Buy Button Clicked',
  BUY_BUTTON_VIEWED: 'Buy Button Viewed',
  CARD_PAYMENT_BUTTON_CLICKED: 'Card Payment Button Clicked',
};

// Product Events
export const PRODUCT_EVENTS = {
  PRODUCT_VIEWED: 'Product Viewed',
  PRODUCT_SELECTED: 'Product Selected',
  VARIANT_CHANGED: 'Variant Changed',
  QUANTITY_CHANGED: 'Quantity Changed',
};

// Analytics Events
export const ANALYTICS_EVENTS = {
  ANALYTICS_VIEWED: 'Analytics Viewed',
  REPORT_GENERATED: 'Report Generated',
  REPORT_EXPORTED: 'Report Exported',
};

// Error Events
export const ERROR_EVENTS = {
  ERROR_OCCURRED: 'Error Occurred',
  API_ERROR: 'API Error',
  VALIDATION_ERROR: 'Validation Error',
  NETWORK_ERROR: 'Network Error',
};

// All events combined for easy reference
export const ALL_EVENTS = {
  ...APP_EVENTS,
  ...BILLING_EVENTS,
  ...FORM_EVENTS,
  ...ORDER_EVENTS,
  ...UPSELL_EVENTS,
  ...DOWNSELL_EVENTS,
  ...CART_EVENTS,
  ...SETTINGS_EVENTS,
  ...PIXEL_EVENTS,
  ...SESSION_EVENTS,
  ...BUTTON_EVENTS,
  ...PRODUCT_EVENTS,
  ...ANALYTICS_EVENTS,
  ...ERROR_EVENTS,
};

/**
 * Helper to create event properties with common fields
 */
export function createEventProperties(customProperties = {}) {
  return {
    timestamp: new Date().toISOString(),
    ...customProperties,
  };
}

/**
 * Event property builders for specific event types
 */
export const EventProperties = {
  // Form events
  formEvent: (formData, additionalProps = {}) => ({
    form_mode: formData.mode,
    form_title: formData.title,
    field_count: formData.fields?.length || 0,
    ...additionalProps,
  }),

  // Order events
  orderEvent: (order, additionalProps = {}) => ({
    order_id: order.id,
    shopify_order_id: order.shopifyOrderId,
    order_number: order.shopifyOrderNumber,
    total: order.total,
    subtotal: order.subtotal,
    shipping: order.shipping,
    items_count: Array.isArray(order.items) ? order.items.length : 0,
    payment_method: order.paymentMethod,
    country: order.country,
    city: order.city,
    province: order.province,
    ...additionalProps,
  }),

  // Upsell events
  upsellEvent: (upsell, additionalProps = {}) => ({
    upsell_id: upsell.id,
    upsell_name: upsell.name,
    upsell_type: upsell.upsellType,
    product_title: upsell.productTitle,
    product_price: upsell.productPrice,
    discount_type: upsell.discountType,
    discount_value: upsell.discountValue,
    ...additionalProps,
  }),

  // Downsell events
  downsellEvent: (downsell, additionalProps = {}) => ({
    downsell_id: downsell.id,
    downsell_name: downsell.name,
    discount_type: downsell.discountType,
    discount_value: downsell.discountValue,
    show_count: downsell.showCount,
    ...additionalProps,
  }),

  // Cart events
  cartEvent: (cart, additionalProps = {}) => ({
    cart_items_count: cart.items?.length || 0,
    cart_total: cart.items?.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    ),
    ...additionalProps,
  }),

  // Error events
  errorEvent: (error, context = {}) => ({
    error_message: error.message || error,
    error_stack: error.stack,
    error_name: error.name,
    ...context,
  }),
};

export default ALL_EVENTS;
