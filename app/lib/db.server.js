import prisma from "../db.server.js";
import { CORE_FIELD_IDS, COUNTRIES, mapShopifyCountryCode } from "./constants.js";

/**
 * Fetch the shop's country from Shopify Admin API and map to our internal code
 * @param {string} shopifyDomain - The shop's myshopify.com domain
 * @param {string} accessToken - Shopify Admin API access token
 * @returns {string} Our internal country code (e.g., "GBR", "PAK")
 */
async function fetchShopCountry(shopifyDomain, accessToken) {
  try {
    const response = await fetch(
      `https://${shopifyDomain}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `{ shop { billingAddress { countryCodeV2 } shopAddress { countryCodeV2 } } }`,
        }),
      }
    );

    if (!response.ok) {
      console.error(`[Preventify] Failed to fetch shop country: ${response.status}`);
      return 'PAK';
    }

    const data = await response.json();
    // shopAddress is the newer field (replaces deprecated billingAddress)
    const shopifyCountryCode = data?.data?.shop?.shopAddress?.countryCodeV2
      || data?.data?.shop?.billingAddress?.countryCodeV2;

    if (shopifyCountryCode) {
      const mapped = mapShopifyCountryCode(shopifyCountryCode);
      console.log(`[Preventify] Detected shop country: ${shopifyCountryCode} -> ${mapped}`);
      return mapped;
    }

    return 'PAK';
  } catch (error) {
    console.error('[Preventify] Error fetching shop country:', error.message);
    return 'PAK';
  }
}

/**
 * Get or create shop record with default settings and form config
 */
export async function getOrCreateShop(shopifyDomain, accessToken) {
  let shop = await prisma.shop.findUnique({
    where: { shopifyDomain },
    include: {
      settings: true,
      formConfig: true,
      upsells: true,
    },
  });

  if (!shop) {
    // Detect the shop's actual country from Shopify Admin API
    const detectedCountry = await fetchShopCountry(shopifyDomain, accessToken);

    shop = await prisma.shop.create({
      data: {
        shopifyDomain,
        accessToken,
        country: detectedCountry,
        setupProgress: {
          step1Completed: false,
          step2Completed: false,
          welcomeDismissed: false,
          setupGuideDismissed: false,
        },
        settings: {
          create: getDefaultSettings(),
        },
        formConfig: {
          create: getDefaultFormConfig(),
        },
      },
      include: {
        settings: true,
        formConfig: true,
        upsells: true,
      },
    });
  } else {
    // Update access token if changed
    if (shop.accessToken !== accessToken) {
      shop = await prisma.shop.update({
        where: { shopifyDomain },
        data: { accessToken },
        include: {
          settings: true,
          formConfig: true,
          upsells: true,
        },
      });
    }

    // Auto-detect country for shops still using the old PAK default
    if (shop.country === 'PAK') {
      const detectedCountry = await fetchShopCountry(shopifyDomain, accessToken);
      if (detectedCountry !== 'PAK') {
        shop = await prisma.shop.update({
          where: { shopifyDomain },
          data: { country: detectedCountry },
          include: {
            settings: true,
            formConfig: true,
            upsells: true,
          },
        });
        console.log(`[Preventify] Updated ${shopifyDomain} country from PAK to ${detectedCountry}`);
      }
    }

    // Initialize setupProgress if missing
    if (!shop.setupProgress) {
      shop = await prisma.shop.update({
        where: { shopifyDomain },
        data: {
          setupProgress: {
            step1Completed: false,
            step2Completed: false,
            welcomeDismissed: false,
            setupGuideDismissed: false,
          },
        },
        include: {
          settings: true,
          formConfig: true,
          upsells: true,
        },
      });
    }

    // Create default settings if missing
    if (!shop.settings) {
      await prisma.settings.create({
        data: {
          shopId: shop.id,
          ...getDefaultSettings(),
        },
      });
    }

    // Create default form config if missing
    if (!shop.formConfig) {
      await prisma.formConfig.create({
        data: {
          shopId: shop.id,
          ...getDefaultFormConfig(),
        },
      });
    } else {
      // Check if email field exists in form config, add if missing
      const existingFields = JSON.parse(shop.formConfig.fields);
      const hasEmailField = existingFields.some(f => f.id === 'email');

      if (!hasEmailField) {
        // Add email field after last-name
        const emailField = {
          id: "email",
          type: "text",
          label: "Email",
          placeholder: "email@example.com",
          required: false,
          visible: true,
          order: 2,
          section: "shipping-address",
          fieldCategory: "shopify",
          isCore: false,
          isDeletable: true,
          shopifyProperty: "order.email"
        };

        // Update order of existing fields that come after email (order >= 2)
        const updatedFields = existingFields.map(f => {
          if (f.section === "shipping-address" && f.order >= 2) {
            return { ...f, order: f.order + 1 };
          }
          return f;
        });

        // Add email field
        updatedFields.push(emailField);

        // Sort by order
        updatedFields.sort((a, b) => a.order - b.order);

        // Update form config in database
        await prisma.formConfig.update({
          where: { id: shop.formConfig.id },
          data: { fields: JSON.stringify(updatedFields) },
        });

        // Refresh shop data
        shop = await prisma.shop.findUnique({
          where: { shopifyDomain },
          include: {
            settings: true,
            formConfig: true,
            upsells: true,
          },
        });
      }
    }
  }

  return shop;
}

/**
 * Default settings configuration
 */
export function getDefaultSettings() {
  return {
    formMode: "popup",
    allowCartItems: true,
    enableRTL: false,
    buttonPageVisibility: "both",
    buttonText: "Buy with Cash on Delivery",
    buttonBgColor: "rgba(0,0,0,1)",
    buttonTextColor: "rgba(255,255,255,1)",
  };
}

/**
 * Default form configuration
 */
export function getDefaultFormConfig() {
  const sections = [
    { id: "order-summary", type: "orderSummary", visible: true, order: 0 },
    { id: "totals", type: "totals", visible: true, order: 1 },
    {
      id: "shipping-method",
      type: "shippingMethod",
      visible: true,
      order: 2,
    },
    {
      id: "shipping-address",
      type: "shippingAddress",
      visible: true,
      order: 3,
    },
  ];

  const fields = [
    {
      id: "first-name",
      type: "text",
      label: "First Name",
      placeholder: "First Name",
      required: true,
      visible: true,
      order: 0,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: true,
      isDeletable: false,
      shopifyProperty: "shipping_address.first_name"
    },
    {
      id: "last-name",
      type: "text",
      label: "Last Name",
      placeholder: "Last Name",
      required: false,
      visible: false,
      order: 1,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: false,
      isDeletable: true,
      shopifyProperty: "shipping_address.last_name"
    },
    {
      id: "email",
      type: "text",
      label: "Email",
      placeholder: "email@example.com",
      required: false,
      visible: true,
      order: 2,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: false,
      isDeletable: true,
      shopifyProperty: "order.email"
    },
    {
      id: "phone",
      type: "text",
      label: "Phone number",
      placeholder: "Phone",
      required: true,
      visible: true,
      order: 3,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: true,
      isDeletable: false,
      shopifyProperty: "shipping_address.phone"
    },
    {
      id: "address",
      type: "text",
      label: "Address",
      placeholder: "Address",
      required: true,
      visible: true,
      order: 4,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: true,
      isDeletable: false,
      shopifyProperty: "shipping_address.address1"
    },
    {
      id: "address2",
      type: "text",
      label: "Address 2",
      placeholder: "Apartment, suite, etc. (optional)",
      required: false,
      visible: true,
      order: 5,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: false,
      isDeletable: true,
      shopifyProperty: "shipping_address.address2"
    },
    {
      id: "province",
      type: "dropdown",
      label: "Province",
      placeholder: "Province",
      required: true,
      visible: true,
      order: 6,
      section: "shipping-address",
      options: ["Punjab", "Sindh", "KPK", "Balochistan", "Islamabad"],
      fieldCategory: "shopify",
      isCore: false,
      isDeletable: true,
      shopifyProperty: "shipping_address.province"
    },
    {
      id: "city",
      type: "text",
      label: "City",
      placeholder: "City",
      required: true,
      visible: true,
      order: 7,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: true,
      isDeletable: false,
      shopifyProperty: "shipping_address.city"
    },
    {
      id: "postal-code",
      type: "text",
      label: "Postal code",
      placeholder: "Postal code (optional)",
      required: false,
      visible: true,
      order: 8,
      section: "shipping-address",
      fieldCategory: "shopify",
      isCore: false,
      isDeletable: true,
      shopifyProperty: "shipping_address.zip"
    },
  ];

  return {
    formTitle: "CASH ON DELIVERY",
    textColor: "rgba(0,0,0,1)",
    backgroundColor: "rgba(255,255,255,1)",
    fontSize: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    shadowIntensity: 5,
    sections: JSON.stringify(sections),
    fields: JSON.stringify(fields),
    requiredFieldErrorText: "This field is required.",
    invalidFieldErrorText: "Enter a valid value.",
  };
}

/**
 * Get shop by Shopify domain
 */
export async function getShopByDomain(shopifyDomain) {
  return await prisma.shop.findUnique({
    where: { shopifyDomain },
    include: {
      settings: true,
      formConfig: true,
      upsells: {
        where: { enabled: true, productId: { not: null } },
        orderBy: { priority: "asc" },
      },
      downsells: {
        where: { enabled: true },
        orderBy: { priority: "asc" },
      },
      bundles: {
        where: { enabled: true, status: "published" },
        orderBy: { priority: "asc" },
      },
    },
  });
}

/**
 * Update shop settings
 */
export async function updateSettings(shopId, settingsData) {
  return await prisma.settings.upsert({
    where: { shopId },
    update: settingsData,
    create: {
      shopId,
      ...settingsData,
    },
  });
}

/**
 * Update form configuration
 */
export async function updateFormConfig(shopId, formConfigData) {
  return await prisma.formConfig.upsert({
    where: { shopId },
    update: formConfigData,
    create: {
      shopId,
      ...formConfigData,
    },
  });
}

/**
 * Create a new COD order
 */
export async function createOrder(shopId, orderData) {
  return await prisma.order.create({
    data: {
      shopId,
      ...orderData,
    },
  });
}

/**
 * Get orders for a shop
 */
export async function getOrders(shopId, options = {}) {
  const { page = 1, limit = 20, status, search } = options;
  const skip = (page - 1) * limit;

  const where = {
    shopId,
    ...(status && { status }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

/**
 * Get single order by ID
 */
export async function getOrderById(orderId) {
  return await prisma.order.findUnique({
    where: { id: orderId },
  });
}

/**
 * Update order status
 */
export async function updateOrderStatus(orderId, status) {
  return await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
}

/**
 * Update order with Shopify order details
 */
export async function updateOrderWithShopifyDetails(
  orderId,
  shopifyOrderId,
  shopifyOrderNumber,
) {
  return await prisma.order.update({
    where: { id: orderId },
    data: {
      shopifyOrderId,
      shopifyOrderNumber,
    },
  });
}

/**
 * Get all upsells for a shop
 */
export async function getUpsells(shopId, upsellType = null) {
  const where = { shopId };
  if (upsellType) {
    where.upsellType = upsellType;
  }

  return await prisma.upsell.findMany({
    where,
    orderBy: { priority: "asc" },
  });
}

/**
 * Get a single upsell by ID
 */
export async function getUpsellById(id) {
  return await prisma.upsell.findUnique({
    where: { id },
  });
}

/**
 * Get enabled upsells for a shop by type (for storefront)
 */
export async function getEnabledUpsells(shopId, upsellType) {
  return await prisma.upsell.findMany({
    where: {
      shopId,
      upsellType,
      enabled: true,
      productId: { not: null },
    },
    orderBy: { priority: "asc" },
  });
}

/**
 * Create a new upsell
 */
export async function createUpsell(shopId, upsellData) {
  // Get the highest priority number for this shop to set new upsell at the end
  const maxPriority = await prisma.upsell.aggregate({
    where: { shopId },
    _max: { priority: true },
  });

  const priority = (maxPriority._max.priority || 0) + 1;

  return await prisma.upsell.create({
    data: {
      shopId,
      priority,
      ...upsellData,
    },
  });
}

/**
 * Update an upsell
 */
export async function updateUpsell(id, upsellData) {
  return await prisma.upsell.update({
    where: { id },
    data: upsellData,
  });
}

/**
 * Delete an upsell
 */
export async function deleteUpsell(id) {
  return await prisma.upsell.delete({
    where: { id },
  });
}

/**
 * Update upsell priority
 */
export async function updateUpsellPriority(id, newPriority) {
  return await prisma.upsell.update({
    where: { id },
    data: { priority: newPriority },
  });
}

/**
 * Toggle upsell enabled status
 */
export async function toggleUpsellEnabled(id) {
  const upsell = await prisma.upsell.findUnique({ where: { id } });
  if (!upsell) throw new Error("Upsell not found");

  return await prisma.upsell.update({
    where: { id },
    data: { enabled: !upsell.enabled },
  });
}

/**
 * Increment upsell stats (impressions, accepts, declines)
 */
export async function incrementUpsellStat(upsellId, stat) {
  const validStats = ["impressions", "accepts", "declines"];
  if (!validStats.includes(stat)) {
    throw new Error(`Invalid stat: ${stat}. Must be one of: ${validStats.join(", ")}`);
  }

  return await prisma.upsell.update({
    where: { id: upsellId },
    data: {
      [stat]: { increment: 1 },
    },
  });
}

/**
 * Get upsell stats summary for a shop (last 30 days concept - returns totals for now)
 */
export async function getUpsellStats(shopId) {
  const stats = await prisma.upsell.aggregate({
    where: { shopId },
    _sum: {
      impressions: true,
      accepts: true,
      declines: true,
    },
  });

  return {
    views: stats._sum.impressions || 0,
    sales: stats._sum.accepts || 0,
    conversionRate: stats._sum.impressions > 0
      ? ((stats._sum.accepts || 0) / stats._sum.impressions * 100).toFixed(2)
      : 0,
  };
}

/**
 * Get default upsell data
 */
export function getDefaultUpsell(upsellType = "pre-purchase") {
  const baseDefaults = {
    name: "My Upsell",
    upsellType,
    enabled: false,
    productId: null,
    productTitle: null,
    productImage: null,
    productPrice: null,
    variantId: null,
  };

  // One-Click Upsell defaults
  if (upsellType === "pre-purchase" || upsellType === "post-purchase") {
    return {
      ...baseDefaults,
      discountType: "none",
      discountValue: 0,
      modalTitle: "Add {product_name} to your order!",
      acceptButtonText: "Add to my order",
      declineButtonText: "No thank you, complete my order",
      acceptButtonBgColor: "#000000",
      acceptButtonTextColor: "#ffffff",
      declineButtonBgColor: "#ffffff",
      declineButtonTextColor: "#000000",
    };
  }

  // One-Tick Upsell defaults
  if (upsellType === "one-tick") {
    return {
      ...baseDefaults,
      upsellTitle: "Your Offer Name",
      upsellPrice: 1.99,
      checkboxText: "Add {title} for just {price}",
      descriptionText: "",
      textColor: "rgba(0,0,0,1)",
      descriptionColor: "rgba(89,89,89,1)",
      preselectUpsell: false,
      imageUrl: "",
      backgroundColor: "rgba(217,235,246,1)",
      borderStyle: "solid",
      borderWidth: 2,
      borderColor: "rgba(0,116,191,1)",
      borderRadius: 8,
    };
  }

  return baseDefaults;
}

// ============================================
// DOWNSELL FUNCTIONS
// ============================================

/**
 * Get all downsells for a shop
 */
export async function getDownsells(shopId) {
  return await prisma.downsell.findMany({
    where: { shopId },
    orderBy: { priority: "asc" },
  });
}

/**
 * Get a single downsell by ID
 */
export async function getDownsellById(id) {
  return await prisma.downsell.findUnique({
    where: { id },
  });
}

/**
 * Get enabled downsells for a shop (for storefront)
 */
export async function getEnabledDownsells(shopId) {
  return await prisma.downsell.findMany({
    where: {
      shopId,
      enabled: true,
    },
    orderBy: { priority: "asc" },
  });
}

/**
 * Create a new downsell
 */
export async function createDownsell(shopId, downsellData) {
  // Get the highest priority number for this shop to set new downsell at the end
  const maxPriority = await prisma.downsell.aggregate({
    where: { shopId },
    _max: { priority: true },
  });

  const priority = (maxPriority._max.priority || 0) + 1;

  return await prisma.downsell.create({
    data: {
      shopId,
      priority,
      ...downsellData,
    },
  });
}

/**
 * Update a downsell
 */
export async function updateDownsell(id, downsellData) {
  return await prisma.downsell.update({
    where: { id },
    data: downsellData,
  });
}

/**
 * Delete a downsell
 */
export async function deleteDownsell(id) {
  return await prisma.downsell.delete({
    where: { id },
  });
}

/**
 * Update downsell priority
 */
export async function updateDownsellPriority(id, newPriority) {
  return await prisma.downsell.update({
    where: { id },
    data: { priority: newPriority },
  });
}

/**
 * Toggle downsell enabled status
 */
export async function toggleDownsellEnabled(id) {
  const downsell = await prisma.downsell.findUnique({ where: { id } });
  if (!downsell) throw new Error("Downsell not found");

  return await prisma.downsell.update({
    where: { id },
    data: { enabled: !downsell.enabled },
  });
}

/**
 * Increment downsell stats (impressions, accepts, declines)
 */
export async function incrementDownsellStat(downsellId, stat) {
  const validStats = ["impressions", "accepts", "declines"];
  if (!validStats.includes(stat)) {
    throw new Error(`Invalid stat: ${stat}. Must be one of: ${validStats.join(", ")}`);
  }

  return await prisma.downsell.update({
    where: { id: downsellId },
    data: {
      [stat]: { increment: 1 },
    },
  });
}

/**
 * Get downsell stats summary for a shop
 */
export async function getDownsellStats(shopId) {
  const stats = await prisma.downsell.aggregate({
    where: { shopId },
    _sum: {
      impressions: true,
      accepts: true,
      declines: true,
    },
  });

  return {
    views: stats._sum.impressions || 0,
    accepts: stats._sum.accepts || 0,
    declines: stats._sum.declines || 0,
    conversionRate: stats._sum.impressions > 0
      ? ((stats._sum.accepts || 0) / stats._sum.impressions * 100).toFixed(2)
      : 0,
  };
}

/**
 * Get default downsell data
 */
export function getDefaultDownsell() {
  return {
    name: "New downsell",
    enabled: false,
    showCount: 1,
    disableOtherDiscounts: false,
    discountType: "percentage",
    discountValue: 10,
    // Title section
    title: "Wait!",
    titleColor: "rgba(0,0,0,1)",
    titleFontSize: 13,
    subtitle: "We have an offer for you!",
    subtitleColor: "rgba(45,45,45,1)",
    subtitleFontSize: 13,
    // Discount plaque
    plaqueText: "GET AN EXTRA DISCOUNT ON YOUR ORDER:",
    plaqueTextColor: "rgba(0,0,0,1)",
    plaqueBackgroundColor: "#EF4444",
    plaqueGradientEndColor: "#FF1493",
    plaqueDiscountColor: "rgba(255,255,255,1)",
    plaqueSize: 50,
    // CTA text
    ctaText: "Do you want to complete your order?",
    ctaTextColor: "rgba(0,0,0,1)",
    // Accept button
    acceptButtonText: "COMPLETE ORDER WITH {discount} OFF",
    acceptButtonAnimation: "none",
    acceptButtonIcon: "none",
    acceptButtonBgColor: "linear-gradient(90deg, #ff6b6b, #ee5a5a)",
    acceptButtonTextColor: "rgba(255,255,255,1)",
    acceptButtonFontSize: 14,
    acceptButtonRadius: 8,
    acceptButtonBorderWidth: 0,
    acceptButtonBorderColor: "rgba(0,0,0,1)",
    acceptButtonShadow: 4,
    // Decline button
    declineButtonText: "No thank you",
    declineButtonBgColor: "rgba(255,255,255,1)",
    declineButtonTextColor: "rgba(0,0,0,1)",
    declineButtonFontSize: 14,
    declineButtonRadius: 25,
    declineButtonBorderWidth: 1,
    declineButtonBorderColor: "rgba(0,0,0,1)",
    declineButtonShadow: 0,
  };
}

// ============================================
// BUNDLE / QUANTITY BREAK FUNCTIONS
// ============================================

/**
 * Get all bundles for a shop
 */
export async function getBundles(shopId) {
  return await prisma.bundle.findMany({
    where: { shopId },
    orderBy: { priority: "asc" },
  });
}

/**
 * Get a single bundle by ID
 */
export async function getBundleById(id) {
  return await prisma.bundle.findUnique({
    where: { id },
  });
}

/**
 * Get enabled bundles for a shop (for storefront)
 */
export async function getEnabledBundles(shopId) {
  return await prisma.bundle.findMany({
    where: {
      shopId,
      enabled: true,
      status: "published",
    },
    orderBy: { priority: "asc" },
  });
}

/**
 * Create a new bundle
 */
export async function createBundle(shopId, bundleData) {
  const maxPriority = await prisma.bundle.aggregate({
    where: { shopId },
    _max: { priority: true },
  });

  const priority = (maxPriority._max.priority || 0) + 1;

  return await prisma.bundle.create({
    data: {
      shopId,
      priority,
      ...bundleData,
    },
  });
}

/**
 * Update a bundle
 */
export async function updateBundle(id, bundleData) {
  return await prisma.bundle.update({
    where: { id },
    data: bundleData,
  });
}

/**
 * Delete a bundle
 */
export async function deleteBundle(id) {
  return await prisma.bundle.delete({
    where: { id },
  });
}

/**
 * Duplicate a bundle
 */
export async function duplicateBundle(id) {
  const source = await prisma.bundle.findUnique({ where: { id } });
  if (!source) throw new Error("Bundle not found");

  const maxPriority = await prisma.bundle.aggregate({
    where: { shopId: source.shopId },
    _max: { priority: true },
  });

  const { id: _id, createdAt: _ca, updatedAt: _ua, impressions: _imp, accepts: _acc, ...data } = source;

  return await prisma.bundle.create({
    data: {
      ...data,
      name: `${source.name} (Copy)`,
      priority: (maxPriority._max.priority || 0) + 1,
      status: "draft",
      enabled: false,
      impressions: 0,
      accepts: 0,
    },
  });
}

/**
 * Update bundle status (published / draft / inactive)
 */
export async function updateBundleStatus(id, status) {
  return await prisma.bundle.update({
    where: { id },
    data: {
      status,
      enabled: status === "published",
    },
  });
}

/**
 * Increment bundle stats (impressions, accepts)
 */
export async function incrementBundleStat(bundleId, stat) {
  const validStats = ["impressions", "accepts"];
  if (!validStats.includes(stat)) {
    throw new Error(`Invalid stat: ${stat}. Must be one of: ${validStats.join(", ")}`);
  }

  return await prisma.bundle.update({
    where: { id: bundleId },
    data: {
      [stat]: { increment: 1 },
    },
  });
}

/**
 * Get default bundle data with 3 sample tiers
 */
export function getDefaultBundle() {
  return {
    name: "My Bundle Offer",
    enabled: false,
    status: "draft",
    headerText: "Buy More Save More",
    hideHeaderLines: false,
    applyOn: "all",
    productIds: [],
    productTitles: [],
    collectionIds: [],
    collectionTitles: [],
    allowVariantMix: false,
    hideThemeVariants: false,
    volumeDiscount: false,
    showStockWarning: true,
    tiers: [
      {
        id: "tier-1",
        order: 0,
        discountType: "none",
        discountValue: 0,
        quantity: 1,
        priceRounding: false,
        priceRoundingValue: 0.99,
        titleText: "1 Pair",
        badgeText: "",
        subtitle: "",
        showSubtitle: false,
        showBadge: false,
        showMostPopular: false,
      },
      {
        id: "tier-2",
        order: 1,
        discountType: "percentage",
        discountValue: 20,
        quantity: 2,
        priceRounding: false,
        priceRoundingValue: 0.99,
        titleText: "2 Pair",
        badgeText: "20% OFF",
        subtitle: "",
        showSubtitle: false,
        showBadge: true,
        showMostPopular: true,
      },
      {
        id: "tier-3",
        order: 2,
        discountType: "percentage",
        discountValue: 30,
        quantity: 3,
        priceRounding: false,
        priceRoundingValue: 0.99,
        titleText: "3 Pair",
        badgeText: "30% OFF",
        subtitle: "",
        showSubtitle: false,
        showBadge: true,
        showMostPopular: false,
      },
    ],
    styling: {
      layout: "vertical",
      cornerRoundness: 12,
      breathingSpace: 12,
      colorPalette: "default",
      colors: {
        headerText: { color: "#000000", fontSize: 16 },
        tierTitle: { color: "#000000", fontSize: 14 },
        badge: { bgColor: "#000000", textColor: "#ffffff", fontSize: 12 },
        price: { color: "#000000", fontSize: 16 },
        strikethroughPrice: { color: "#999999", fontSize: 14 },
        mostPopularTag: { bgColor: "#ff0000", textColor: "#ffffff", fontSize: 11 },
        selectedTier: { borderColor: "#000000", bgColor: "#f5f5f5" },
        unselectedTier: { borderColor: "#e0e0e0", bgColor: "#ffffff" },
      },
    },
  };
}

// ============================================
// PIXEL TRACKING FUNCTIONS
// ============================================

/**
 * Get all pixels for a shop
 */
export async function getPixelsByShop(shopId) {
  return await prisma.pixel.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get enabled pixels for storefront config
 */
export async function getEnabledPixels(shopId) {
  return await prisma.pixel.findMany({
    where: {
      shopId,
      enabled: true,
    },
    select: {
      id: true,
      type: true,
      pixelId: true,
      accessToken: true,
      purchaseEvent: true,
      enableAddToCart: true,
      enableAddPaymentInfo: true,
      enableInitiateCheckout: true,
      enableStartCheckout: true,
      enablePurchase: true,
      enableTikTokInitiateCheckout: true,
      enablePlaceAnOrder: true,
      enableCompletePayment: true,
      testMode: true,
      testEventCode: true,
      shopId: true,
    },
  });
}

/**
 * Get pixel by ID
 */
export async function getPixelById(id) {
  return await prisma.pixel.findUnique({
    where: { id },
  });
}

/**
 * Create a new pixel
 */
export async function createPixel(shopId, pixelData) {
  return await prisma.pixel.create({
    data: {
      shopId,
      ...pixelData,
    },
  });
}

/**
 * Update a pixel
 */
export async function updatePixel(id, pixelData) {
  return await prisma.pixel.update({
    where: { id },
    data: pixelData,
  });
}

/**
 * Delete a pixel
 */
export async function deletePixel(id) {
  return await prisma.pixel.delete({
    where: { id },
  });
}

/**
 * Log a pixel event
 */
export async function logPixelEvent(eventData) {
  return await prisma.pixelEvent.create({
    data: eventData,
  });
}

/**
 * Get pixel events for debugging/analytics
 */
export async function getPixelEvents(shopId, filters = {}) {
  const { limit = 50, pixelId, eventName, status } = filters;

  return await prisma.pixelEvent.findMany({
    where: {
      shopId,
      ...(pixelId && { pixelId }),
      ...(eventName && { eventName }),
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      pixel: {
        select: {
          type: true,
          label: true,
        },
      },
    },
  });
}

// ============================================
// SHIPPING RATE FUNCTIONS
// ============================================

/**
 * Get all shipping rates for a shop
 */
export async function getShippingRates(shopId) {
  return await prisma.shippingRate.findMany({
    where: { shopId },
    orderBy: { priority: "asc" },
  });
}

/**
 * Get enabled shipping rates for storefront config
 */
export async function getEnabledShippingRates(shopId) {
  return await prisma.shippingRate.findMany({
    where: {
      shopId,
      enabled: true,
    },
    orderBy: { priority: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      conditions: true,
      isShopifyImported: true,
    },
  });
}

/**
 * Get shipping rate by ID
 */
export async function getShippingRateById(id) {
  return await prisma.shippingRate.findUnique({
    where: { id },
  });
}

/**
 * Create a new shipping rate
 */
export async function createShippingRate(shopId, rateData) {
  // Get highest priority for ordering
  const maxPriority = await prisma.shippingRate.aggregate({
    where: { shopId },
    _max: { priority: true },
  });

  const priority = (maxPriority._max.priority || 0) + 1;

  return await prisma.shippingRate.create({
    data: {
      shopId,
      priority,
      ...rateData,
    },
  });
}

/**
 * Update a shipping rate
 */
export async function updateShippingRate(id, rateData) {
  return await prisma.shippingRate.update({
    where: { id },
    data: rateData,
  });
}

/**
 * Delete a shipping rate
 */
export async function deleteShippingRate(id) {
  return await prisma.shippingRate.delete({
    where: { id },
  });
}

/**
 * Toggle shipping rate enabled status
 */
export async function toggleShippingRateEnabled(id) {
  const rate = await prisma.shippingRate.findUnique({ where: { id } });
  if (!rate) throw new Error("Shipping rate not found");

  return await prisma.shippingRate.update({
    where: { id },
    data: { enabled: !rate.enabled },
  });
}

/**
 * Upsert shipping rates from Shopify import
 * Matches on shopifyShippingRateId for updates
 */
export async function upsertShopifyShippingRates(shopId, rates) {
  const results = [];

  for (const rate of rates) {
    // Find existing rate by shopifyShippingRateId
    const existing = await prisma.shippingRate.findFirst({
      where: {
        shopId,
        shopifyShippingRateId: rate.shopifyShippingRateId,
      },
    });

    if (existing) {
      // Update existing
      const result = await prisma.shippingRate.update({
        where: { id: existing.id },
        data: {
          name: rate.name,
          price: rate.price,
          conditions: rate.conditions,
          isShopifyImported: true,
        },
      });
      results.push(result);
    } else {
      // Create new
      const result = await createShippingRate(shopId, {
        ...rate,
        isShopifyImported: true,
      });
      results.push(result);
    }
  }

  return results;
}

/**
 * Get default shipping rate data
 */
export function getDefaultShippingRate() {
  return {
    name: "Standard Shipping",
    description: "",
    price: 0,
    enabled: true,
    conditions: [],
    isShopifyImported: false,
  };
}

/**
 * Ensure default "Free Shipping" rate exists for shop
 */
export async function ensureFreeShippingRate(shopId) {
  const existingFree = await prisma.shippingRate.findFirst({
    where: {
      shopId,
      name: "Free Shipping",
      price: 0,
    },
  });

  if (!existingFree) {
    return await createShippingRate(shopId, {
      name: "Free Shipping",
      description: "Free standard shipping",
      price: 0,
      enabled: true,
      conditions: [],
      priority: 9999, // Always last priority (fallback)
    });
  }

  return existingFree;
}

// ============================================
// DASHBOARD STATS FUNCTIONS
// ============================================

/**
 * Get dashboard stats for last 7 days
 */
export async function getDashboardStats(shopId) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Form opens (sessions created in last 7 days)
  const formOpens = await prisma.orderSession.count({
    where: {
      shopId,
      createdAt: { gte: sevenDaysAgo },
    },
  });

  // Orders in last 7 days
  const orders = await prisma.order.findMany({
    where: {
      shopId,
      createdAt: { gte: sevenDaysAgo },
    },
    select: {
      total: true,
    },
  });

  const orderCount = orders.length;

  // Revenue calculation
  const revenue = orders.reduce((sum, order) => sum + order.total, 0);

  // Conversion rate
  const conversionRate = formOpens > 0 ? ((orderCount / formOpens) * 100).toFixed(1) : "0.0";

  return {
    formOpens,
    orderCount,
    revenue,
    conversionRate: parseFloat(conversionRate),
  };
}

/**
 * Get monthly order count for a shop (1st of current month to now).
 * Used for plan usage tracking.
 */
export async function getMonthlyOrderCount(shopId) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return await prisma.order.count({
    where: {
      shopId,
      createdAt: { gte: firstOfMonth },
    },
  });
}

// ============================================
// BLOCKED USER / FRAUD PREVENTION FUNCTIONS
// ============================================

/**
 * Normalize a phone number for blocking comparison.
 * Strips non-digits, removes known country calling codes, and strips leading zeros.
 */
export function normalizePhoneForBlocking(phone) {
  if (!phone) return '';

  const trimmed = phone.trim();

  // Only strip country code if the input explicitly has international prefix (+ or 00)
  let digits = trimmed.replace(/\D/g, '');
  const hasInternationalPrefix = trimmed.startsWith('+') || trimmed.startsWith('00');

  if (hasInternationalPrefix) {
    // Extract country calling codes from COUNTRIES constant
    // Sort by length descending to avoid partial matches
    const callingCodes = Object.values(COUNTRIES)
      .map(c => c.phoneCode?.replace(/\D/g, ''))
      .filter(Boolean);
    const uniqueCodes = [...new Set(callingCodes)].sort((a, b) => b.length - a.length);

    for (const code of uniqueCodes) {
      if (digits.startsWith('00' + code)) {
        digits = digits.substring(2 + code.length);
        break;
      }
      if (digits.startsWith(code)) {
        digits = digits.substring(code.length);
        break;
      }
    }
  }

  // Strip leading zeros
  digits = digits.replace(/^0+/, '');

  return digits;
}

/**
 * Get all blocked users for a shop
 */
export async function getBlockedUsers(shopId) {
  return await prisma.blockedUser.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Sync blocked users list (replaces all entries of a given type)
 */
export async function syncBlockedUsers(shopId, type, values) {
  // Delete all existing entries of this type
  await prisma.blockedUser.deleteMany({
    where: { shopId, type },
  });

  // Clean and normalize values
  const cleanValues = values
    .map(v => v.trim())
    .filter(v => v.length > 0)
    .map(v => type === 'phone' ? normalizePhoneForBlocking(v) : v.toLowerCase());

  // Deduplicate
  const unique = [...new Set(cleanValues)].filter(v => v.length > 0);

  if (unique.length === 0) return [];

  return await prisma.blockedUser.createMany({
    data: unique.map(value => ({
      shopId,
      type,
      value,
    })),
    skipDuplicates: true,
  });
}

/**
 * Check if a user is blocked by email or phone
 */
export async function isUserBlocked(shopId, email, phone) {
  const checks = [];

  if (email && email.trim()) {
    checks.push(
      prisma.blockedUser.findFirst({
        where: {
          shopId,
          type: 'email',
          value: email.trim().toLowerCase(),
        },
      })
    );
  }

  if (phone && phone.trim()) {
    const normalizedPhone = normalizePhoneForBlocking(phone);
    if (normalizedPhone) {
      checks.push(
        prisma.blockedUser.findFirst({
          where: {
            shopId,
            type: 'phone',
            value: normalizedPhone,
          },
        })
      );
    }
  }

  if (checks.length === 0) return false;

  const results = await Promise.all(checks);
  return results.some(r => r !== null);
}
