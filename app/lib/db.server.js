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
    enablePopup: true,
    enableEmbedded: false,
    buttonText: "Buy with Cash on Delivery",
    buttonBgColor: "rgba(0,0,0,1)",
    buttonTextColor: "rgba(255,255,255,1)",
    orderCreationMode: "checkout",
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
      id: "phone",
      type: "text",
      label: "Phone number",
      placeholder: "Phone",
      required: true,
      visible: true,
      order: 2,
      section: "shipping-address",
    },
    {
      id: "email",
      type: "text",
      label: "Email",
      placeholder: "Email",
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
