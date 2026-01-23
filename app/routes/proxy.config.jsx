import { getShopByDomain } from "../lib/db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS requests for CORS preflight
export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(null, { status: 405, headers: corsHeaders });
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    const shopData = await getShopByDomain(shop);

    if (!shopData) {
      return Response.json({ error: "Shop not found" }, {
        status: 404,
        headers: corsHeaders
      });
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
        enablePopup: shopData.settings.enablePopup,
        enableEmbedded: shopData.settings.enableEmbedded,
        buttonText: shopData.settings.buttonText,
        buttonPosition: shopData.settings.buttonPosition,
        buttonBgColor: shopData.settings.buttonBgColor,
        buttonTextColor: shopData.settings.buttonTextColor,
        buttonFontSize: shopData.settings.buttonFontSize,
        buttonBorderRadius: shopData.settings.buttonBorderRadius,
        buttonBorderWidth: shopData.settings.buttonBorderWidth,
        buttonBorderColor: shopData.settings.buttonBorderColor,
        buttonShadow: shopData.settings.buttonShadow,
        buttonAnimation: shopData.settings.buttonAnimation,
        buttonIcon: shopData.settings.buttonIcon,
      },
      shopDomain: shopData.shopifyDomain,
    }, {
      headers: corsHeaders
    });
  } catch (error) {
    console.error("Error fetching storefront config:", error);
    return Response.json({ error: "Internal server error" }, {
      status: 500,
      headers: corsHeaders
    });
  }
};
