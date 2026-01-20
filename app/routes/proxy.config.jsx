import { getShopByDomain } from "../lib/db.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  try {
    const shopData = await getShopByDomain(shop);

    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    // Return public configuration (no sensitive data)
    return Response.json({
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
      },
      settings: {
        formMode: shopData.settings.formMode,
        allowCartItems: shopData.settings.allowCartItems,
        enableRTL: shopData.settings.enableRTL,
        buttonPageVisibility: shopData.settings.buttonPageVisibility,
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
      },
      shop: {
        country: shopData.country || 'PAK',
      },
      shopDomain: shopData.shopifyDomain,
      // Upsell configurations (multiple upsells, sorted by priority)
      upsells: {
        prePurchase: (shopData.upsells || [])
          .filter(u => u.upsellType === 'pre-purchase')
          .map(upsell => ({
            id: upsell.id,
            enabled: upsell.enabled,
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
    });
  } catch (error) {
    console.error("Error fetching storefront config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
