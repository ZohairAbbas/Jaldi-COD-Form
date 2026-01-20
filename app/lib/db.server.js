import prisma from "../db.server.js";

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
    shop = await prisma.shop.create({
      data: {
        shopifyDomain,
        accessToken,
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
          required: true,
          visible: true,
          order: 2,
          section: "shipping-address",
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
      label: "First name",
      placeholder: "First name",
      required: true,
      visible: true,
      order: 0,
      section: "shipping-address",
    },
    {
      id: "last-name",
      type: "text",
      label: "Last name",
      placeholder: "Last name",
      required: true,
      visible: true,
      order: 1,
      section: "shipping-address",
    },
    {
      id: "email",
      type: "text",
      label: "Email",
      placeholder: "email@example.com",
      required: true,
      visible: true,
      order: 2,
      section: "shipping-address",
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
