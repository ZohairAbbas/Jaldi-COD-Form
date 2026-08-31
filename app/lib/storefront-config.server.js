import { getShopByDomain, getEnabledPixels, getEnabledShippingRates, ensureFreeShippingRate } from "./db.server.js";

// Metafield location for the inlined storefront config.
// Inlined by the app embed Liquid (window.PREVENTIFY_SETTINGS) so the storefront
// button/hide-ATC render on first paint with no network round-trip.
//
// Uses a PLAIN custom namespace (NOT the reserved $app namespace) with a
// definition that grants Online Store / storefront visibility, so the value is
// readable in Liquid as `shop.metafields.preventify.storefront_config`.
//
// Why not $app: app-owned ($app) metafields are stored under a mangled
// `app--<id>` namespace that is NOT accessible via shop.metafields.app.x in
// Liquid, so they can't be inlined by the theme. A plain namespace with
// storefront access is the proven pattern (e.g. Releasit's `_rsi_cod_form_sf`).
//
// The payload contains no secrets — it is the same data already served publicly
// by proxy/config — so PUBLIC_READ storefront access is safe.
export const STOREFRONT_CONFIG_NAMESPACE = "preventify";
export const STOREFRONT_CONFIG_KEY = "storefront_config";
export const STOREFRONT_CONFIG_TYPE = "json";

/**
 * Build the STATIC storefront config payload for a shop.
 *
 * This is the single source of truth for what the storefront receives. It is
 * used both by the `proxy/config` loader (which adds per-request values like
 * appPath/ENV on top) and by the metafield sync (which inlines this verbatim).
 *
 * Request/env-dependent values (appPath, ENV.MIXPANEL_TOKEN,
 * settings.whatsappBusinessPhone) are intentionally NOT included here — they are
 * merged in by the caller (proxy.config) or inlined separately in Liquid and
 * merged client-side. This keeps the metafield pure and free of secrets.
 */
/**
 * Per-offer country targeting, shared by every offer mapper below. `targetCountries`
 * is a JSON column so it may arrive as an array or a serialized string.
 */
function offerCountryTargeting(offer) {
  const raw = offer.targetCountries;
  return {
    countryTargeting: offer.countryTargeting || 'all',
    targetCountries: Array.isArray(raw)
      ? raw
      : (typeof raw === 'string' ? JSON.parse(raw) : []),
  };
}

export async function buildStorefrontConfig(shopData) {
  // Get enabled pixels for storefront (without sensitive data like access tokens)
  const pixels = await getEnabledPixels(shopData.id);

  // Ensure free shipping exists and get all enabled rates
  await ensureFreeShippingRate(shopData.id);
  const shippingRates = await getEnabledShippingRates(shopData.id);

  return {
    formConfig: {
      formTitle: shopData.formConfig.formTitle,
      textColor: shopData.formConfig.textColor,
      backgroundColor: shopData.formConfig.backgroundColor,
      fontSize: shopData.formConfig.fontSize,
      borderRadius: shopData.formConfig.borderRadius,
      borderWidth: shopData.formConfig.borderWidth,
      borderColor: shopData.formConfig.borderColor,
      shadowIntensity: shopData.formConfig.shadowIntensity,
      sections: JSON.parse(shopData.formConfig.sections),
      fields: JSON.parse(shopData.formConfig.fields),
      requiredFieldErrorText: shopData.formConfig.requiredFieldErrorText,
      invalidFieldErrorText: shopData.formConfig.invalidFieldErrorText,
      submitButtonText: shopData.formConfig.submitButtonText,
      submitButtonBgColor: shopData.formConfig.submitButtonBgColor,
      submitButtonTextColor: shopData.formConfig.submitButtonTextColor,
      submitButtonFontSize: shopData.formConfig.submitButtonFontSize,
      submitButtonIcon: shopData.formConfig.submitButtonIcon,
      formTitleAlign: shopData.formConfig.formTitleAlign || 'left',
    },
    settings: {
      formMode: shopData.settings.formMode,
      allowCartItems: shopData.settings.allowCartItems,
      enableRTL: shopData.settings.enableRTL,
      buttonPageVisibility: shopData.settings.buttonPageVisibility,
      // Sticky page bar (mobile)
      stickyBarEnabled: shopData.settings.stickyBarEnabled || false,
      stickyBarPosition: shopData.settings.stickyBarPosition || 'bottom',
      stickyBarAlwaysVisible: shopData.settings.stickyBarAlwaysVisible !== false,
      // Hide native buttons settings
      hideCheckoutButton: shopData.settings.hideCheckoutButton,
      hideAddToCartButton: shopData.settings.hideAddToCartButton,
      hideBuyNowButton: shopData.settings.hideBuyNowButton,
      // Button customization
      buttonText: shopData.settings.buttonText,
      buttonBgColor: shopData.settings.buttonBgColor,
      buttonTextColor: shopData.settings.buttonTextColor,
      buttonFontSize: shopData.settings.buttonFontSize,
      buttonBorderRadius: shopData.settings.buttonBorderRadius,
      buttonBorderWidth: shopData.settings.buttonBorderWidth,
      buttonBorderColor: shopData.settings.buttonBorderColor,
      buttonShadow: shopData.settings.buttonShadow,
      buttonAnimation: shopData.settings.buttonAnimation,
      buttonIcon: shopData.settings.buttonIcon,
      // Pay with Card settings
      enableCartPermalink: shopData.settings.enableCartPermalink,
      hideCompleteOrderButton: shopData.settings.hideCompleteOrderButton,
      cardButtonText: shopData.settings.cardButtonText,
      cardButtonBgColor: shopData.settings.cardButtonBgColor,
      cardButtonTextColor: shopData.settings.cardButtonTextColor,
      cardButtonFontSize: shopData.settings.cardButtonFontSize,
      cardDiscountEnabled: shopData.settings.cardDiscountEnabled,
      cardDiscountType: shopData.settings.cardDiscountType,
      cardDiscountValue: shopData.settings.cardDiscountValue,
      allowDiscountOnBundles: shopData.settings.allowDiscountOnBundles,
      // Native-checkout bundles mode: hide the COD button and let bundles drive
      // the theme's native Add-to-Cart + Shopify checkout (Discount Function
      // applies the tier discount). Master enable + per-country list (empty =
      // everywhere). Native mode and COD are mutually exclusive per country.
      nativeBundleCheckout: shopData.settings.nativeBundleCheckout || false,
      nativeBundleCountries: Array.isArray(shopData.settings.nativeBundleCountries)
        ? shopData.settings.nativeBundleCountries
        : (typeof shopData.settings.nativeBundleCountries === 'string' ? JSON.parse(shopData.settings.nativeBundleCountries) : []),
      // PayFast settings (credentials never exposed to storefront)
      payfastEnabled: shopData.settings.payfastEnabled || false,
      payfastButtonText: shopData.settings.payfastButtonText,
      payfastButtonBgColor: shopData.settings.payfastButtonBgColor,
      payfastButtonTextColor: shopData.settings.payfastButtonTextColor,
      payfastButtonFontSize: shopData.settings.payfastButtonFontSize,
      // OTP verification
      enableOTP: shopData.settings.enableOTP,
      enableSmartCheckout: shopData.settings.enableSmartCheckout,
      // Language
      language: shopData.settings.language || 'en',
      // Specific product targeting
      enableSpecificProducts: shopData.settings.enableSpecificProducts || false,
      specificProductIds: Array.isArray(shopData.settings.specificProductIds)
        ? shopData.settings.specificProductIds
        : (typeof shopData.settings.specificProductIds === 'string' ? JSON.parse(shopData.settings.specificProductIds) : []),
      disableSpecificProducts: shopData.settings.disableSpecificProducts || false,
      disabledProductIds: Array.isArray(shopData.settings.disabledProductIds)
        ? shopData.settings.disabledProductIds
        : (typeof shopData.settings.disabledProductIds === 'string' ? JSON.parse(shopData.settings.disabledProductIds) : []),
      // Country restriction — only show the COD form to allowed countries
      enableCountryRestriction: shopData.settings.enableCountryRestriction || false,
      allowedCountries: Array.isArray(shopData.settings.allowedCountries)
        ? shopData.settings.allowedCountries
        : (typeof shopData.settings.allowedCountries === 'string' ? JSON.parse(shopData.settings.allowedCountries) : []),
      // Post-order redirection (COD)
      redirectMode: shopData.settings.redirectMode || 'shopify',
      redirectUrl: shopData.settings.redirectUrl || null,
      redirectWhatsappNumber: shopData.settings.redirectWhatsappNumber || null,
      redirectWhatsappMessage: shopData.settings.redirectWhatsappMessage || null,
      thankYouMessage: shopData.settings.thankYouMessage || null,
      // Free shipping progress nudge
      freeShippingNudgeEnabled: shopData.settings.freeShippingNudgeEnabled || false,
      freeShippingNudgeAmountText: shopData.settings.freeShippingNudgeAmountText || '',
      freeShippingNudgeQtyText: shopData.settings.freeShippingNudgeQtyText || '',
      freeShippingNudgeSuccessText: shopData.settings.freeShippingNudgeSuccessText || '',
    },
    shop: {
      country: shopData.country || 'PAK',
      enableMultiCountry: shopData.enableMultiCountry || false,
      supportedCountries: shopData.supportedCountries || [],
    },
    shopDomain: shopData.shopifyDomain,
    // Upsell configurations (multiple upsells, sorted by priority)
    upsells: {
      prePurchase: (shopData.upsells || [])
        .filter(u => u.upsellType === 'pre-purchase')
        .map(upsell => ({
          id: upsell.id,
          enabled: upsell.enabled,
          ...offerCountryTargeting(upsell),
          product: {
            id: upsell.productId,
            title: upsell.productTitle,
            image: upsell.productImage,
            price: upsell.productPrice,
            variantId: upsell.variantId,
          },
          discount: {
            type: upsell.discountType,
            value: upsell.discountValue,
          },
          customization: {
            modalTitle: upsell.modalTitle,
            acceptButtonText: upsell.acceptButtonText,
            declineButtonText: upsell.declineButtonText,
            acceptButtonBgColor: upsell.acceptButtonBgColor,
            acceptButtonTextColor: upsell.acceptButtonTextColor,
            declineButtonBgColor: upsell.declineButtonBgColor,
            declineButtonTextColor: upsell.declineButtonTextColor,
          },
        })),
      postPurchase: (shopData.upsells || [])
        .filter(u => u.upsellType === 'post-purchase')
        .map(upsell => ({
          id: upsell.id,
          enabled: upsell.enabled,
          ...offerCountryTargeting(upsell),
          product: {
            id: upsell.productId,
            title: upsell.productTitle,
            image: upsell.productImage,
            price: upsell.productPrice,
            variantId: upsell.variantId,
          },
          discount: {
            type: upsell.discountType,
            value: upsell.discountValue,
          },
          customization: {
            modalTitle: upsell.modalTitle,
            acceptButtonText: upsell.acceptButtonText,
            declineButtonText: upsell.declineButtonText,
            acceptButtonBgColor: upsell.acceptButtonBgColor,
            acceptButtonTextColor: upsell.acceptButtonTextColor,
            declineButtonBgColor: upsell.declineButtonBgColor,
            declineButtonTextColor: upsell.declineButtonTextColor,
          },
        })),
      oneTick: (shopData.upsells || [])
        .filter(u => u.upsellType === 'one-tick' && u.enabled)
        .map(upsell => ({
          id: upsell.id,
          ...offerCountryTargeting(upsell),
          upsellTitle: upsell.upsellTitle,
          upsellPrice: upsell.upsellPrice,
          checkboxText: upsell.checkboxText,
          descriptionText: upsell.descriptionText,
          textColor: upsell.textColor,
          descriptionColor: upsell.descriptionColor,
          preselectUpsell: upsell.preselectUpsell,
          imageUrl: upsell.imageUrl,
          backgroundColor: upsell.backgroundColor,
          borderStyle: upsell.borderStyle,
          borderWidth: upsell.borderWidth,
          borderColor: upsell.borderColor,
          borderRadius: upsell.borderRadius,
          product: upsell.productId ? {
            id: upsell.productId,
            title: upsell.productTitle,
            image: upsell.productImage,
            price: upsell.productPrice,
            variantId: upsell.variantId,
          } : null,
        })),
    },
    // Downsell configurations (for exit-intent recovery)
    downsells: (shopData.downsells || [])
      .map(downsell => ({
        id: downsell.id,
        ...offerCountryTargeting(downsell),
        showCount: downsell.showCount,
        disableOtherDiscounts: downsell.disableOtherDiscounts,
        discount: {
          type: downsell.discountType,
          value: downsell.discountValue,
        },
        customization: {
          title: downsell.title,
          titleColor: downsell.titleColor,
          titleFontSize: downsell.titleFontSize,
          subtitle: downsell.subtitle,
          subtitleColor: downsell.subtitleColor,
          subtitleFontSize: downsell.subtitleFontSize,
          plaqueText: downsell.plaqueText,
          plaqueTextColor: downsell.plaqueTextColor,
          plaqueBackgroundColor: downsell.plaqueBackgroundColor,
          plaqueGradientEndColor: downsell.plaqueGradientEndColor,
          plaqueDiscountColor: downsell.plaqueDiscountColor,
          plaqueSize: downsell.plaqueSize,
          ctaText: downsell.ctaText,
          ctaTextColor: downsell.ctaTextColor,
          acceptButtonText: downsell.acceptButtonText,
          acceptButtonAnimation: downsell.acceptButtonAnimation,
          acceptButtonIcon: downsell.acceptButtonIcon,
          acceptButtonBgColor: downsell.acceptButtonBgColor,
          acceptButtonTextColor: downsell.acceptButtonTextColor,
          acceptButtonFontSize: downsell.acceptButtonFontSize,
          acceptButtonRadius: downsell.acceptButtonRadius,
          acceptButtonBorderWidth: downsell.acceptButtonBorderWidth,
          acceptButtonBorderColor: downsell.acceptButtonBorderColor,
          acceptButtonShadow: downsell.acceptButtonShadow,
          declineButtonText: downsell.declineButtonText,
          declineButtonBgColor: downsell.declineButtonBgColor,
          declineButtonTextColor: downsell.declineButtonTextColor,
          declineButtonFontSize: downsell.declineButtonFontSize,
          declineButtonRadius: downsell.declineButtonRadius,
          declineButtonBorderWidth: downsell.declineButtonBorderWidth,
          declineButtonBorderColor: downsell.declineButtonBorderColor,
          declineButtonShadow: downsell.declineButtonShadow,
        },
      })),
    // Pixel tracking configurations (client-side only, no access tokens)
    pixels: {
      facebook: pixels
        .filter(p => p.type === 'facebook_pixel')
        .map(p => ({
          pixelId: p.pixelId,
          purchaseEvent: p.purchaseEvent,
          enableAddToCart: p.enableAddToCart,
          enableAddPaymentInfo: p.enableAddPaymentInfo,
          enableInitiateCheckout: p.enableInitiateCheckout,
          testMode: p.testMode,
          testEventCode: p.testEventCode,
        })),
      snapchat: pixels
        .filter(p => p.type === 'snapchat_pixel')
        .map(p => ({
          pixelId: p.pixelId,
          enableStartCheckout: p.enableStartCheckout,
          enablePurchase: p.enablePurchase,
          testMode: p.testMode,
        })),
      tiktok: pixels
        .filter(p => p.type === 'tiktok_pixel')
        .map(p => ({
          pixelId: p.pixelId,
          enableTikTokInitiateCheckout: p.enableTikTokInitiateCheckout,
          enablePlaceAnOrder: p.enablePlaceAnOrder,
          enableCompletePayment: p.enableCompletePayment,
          testMode: p.testMode,
        })),
    },
    // Bundle / Quantity Break configurations
    bundles: (shopData.bundles || []).map(bundle => ({
      id: bundle.id,
      headerText: bundle.headerText,
      hideHeaderLines: bundle.hideHeaderLines,
      applyOn: bundle.applyOn,
      productIds: typeof bundle.productIds === 'string' ? JSON.parse(bundle.productIds) : bundle.productIds,
      collectionIds: typeof bundle.collectionIds === 'string' ? JSON.parse(bundle.collectionIds) : bundle.collectionIds,
      allowVariantMix: bundle.allowVariantMix,
      hideThemeVariants: bundle.hideThemeVariants,
      volumeDiscount: bundle.volumeDiscount,
      showStockWarning: bundle.showStockWarning,
      tiers: typeof bundle.tiers === 'string' ? JSON.parse(bundle.tiers) : bundle.tiers,
      styling: typeof bundle.styling === 'string' ? JSON.parse(bundle.styling) : bundle.styling,
    })),
    // Shipping rates for storefront
    shippingRates: shippingRates.map(rate => ({
      id: rate.id,
      name: rate.name,
      description: rate.description,
      price: rate.price,
      conditions: typeof rate.conditions === 'string'
        ? JSON.parse(rate.conditions)
        : rate.conditions,
      isShopifyImported: rate.isShopifyImported,
    })),
  };
}

// Ensure the definition exists once per process per shop (idempotent — an
// existing definition returns TAKEN, which we ignore).
const definitionEnsured = new Set();

/**
 * Ensure the metafield DEFINITION exists with storefront visibility so the value
 * is readable in Liquid as shop.metafields.preventify.storefront_config.
 *
 * The app owns this custom-namespace definition; creating it works with the
 * app's existing token (no special scope). `access.storefront: PUBLIC_READ`
 * is what exposes it to the Online Store / Liquid.
 */
async function ensureMetafieldDefinition(admin) {
  const mutation = `#graphql
    mutation CreateDef($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id }
        userErrors { field message code }
      }
    }`;

  const res = await admin.graphql(mutation, {
    variables: {
      definition: {
        name: "Preventify Storefront Config",
        namespace: STOREFRONT_CONFIG_NAMESPACE,
        key: STOREFRONT_CONFIG_KEY,
        description: "Inlined storefront config for instant button/hide-ATC rendering (managed by Preventify).",
        type: STOREFRONT_CONFIG_TYPE,
        ownerType: "SHOP",
        access: { storefront: "PUBLIC_READ" },
      },
    },
  });
  const json = await res.json();
  const errors = json?.data?.metafieldDefinitionCreate?.userErrors || [];
  // TAKEN = definition already exists. Safe to ignore.
  const fatal = errors.filter((e) => e.code !== "TAKEN");
  if (fatal.length > 0) {
    console.warn("[Preventify] metafieldDefinitionCreate userErrors:", JSON.stringify(fatal));
  }
}

/**
 * Build the static storefront config for a shop and write it to the shop
 * metafield so the app embed Liquid can inline it (no proxy round-trip).
 *
 * @param {object} admin   Admin GraphQL client from authenticate.admin()
 * @param {object} shopData  Shop record (with relations) from getOrCreateShop/getShopByDomain
 */
export async function syncStorefrontConfigMetafield(admin, shopData) {
  try {
    if (!definitionEnsured.has(shopData.shopifyDomain)) {
      await ensureMetafieldDefinition(admin);
      definitionEnsured.add(shopData.shopifyDomain);
    }

    const config = await buildStorefrontConfig(shopData);

    // metafieldsSet needs the shop's GraphQL gid as ownerId.
    const shopIdRes = await admin.graphql(`#graphql
      query { shop { id } }`);
    const shopIdJson = await shopIdRes.json();
    const ownerId = shopIdJson?.data?.shop?.id;
    if (!ownerId) {
      throw new Error("Could not resolve shop GID for metafield owner");
    }

    const mutation = `#graphql
      mutation SetConfig($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message code }
        }
      }`;

    const res = await admin.graphql(mutation, {
      variables: {
        metafields: [{
          ownerId,
          namespace: STOREFRONT_CONFIG_NAMESPACE,
          key: STOREFRONT_CONFIG_KEY,
          type: STOREFRONT_CONFIG_TYPE,
          value: JSON.stringify(config),
        }],
      },
    });
    const json = await res.json();
    const errors = json?.data?.metafieldsSet?.userErrors || [];
    if (errors.length > 0) {
      console.warn("[Preventify] metafieldsSet userErrors:", JSON.stringify(errors));
      return { success: false, errors };
    }
    return { success: true };
  } catch (error) {
    // Never let a metafield sync failure break the merchant's save — the proxy
    // fetch fallback keeps the storefront working.
    console.error("[Preventify] syncStorefrontConfigMetafield failed:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Convenience wrapper: load the shop by domain then sync. Used by routes that
 * only have the domain handy (and to ensure fresh DB data post-save).
 */
export async function syncStorefrontConfigByDomain(admin, shopDomain) {
  const shopData = await getShopByDomain(shopDomain);
  if (!shopData) {
    console.warn("[Preventify] syncStorefrontConfigByDomain: shop not found", shopDomain);
    return { success: false, error: "shop not found" };
  }
  return syncStorefrontConfigMetafield(admin, shopData);
}
