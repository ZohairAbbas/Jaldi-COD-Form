import { authenticate } from "../shopify.server";
import { getOrCreateShop, updateFormConfig } from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return Response.json({
    formConfig: {
      ...shop.formConfig,
      sections: JSON.parse(shop.formConfig.sections),
      fields: JSON.parse(shop.formConfig.fields),
    },
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.json();

  // Prepare data for database (stringify JSON fields)
  const updateData = {
    ...formData,
    sections: JSON.stringify(formData.sections || []),
    fields: JSON.stringify(formData.fields || []),
  };

  await updateFormConfig(shop.id, updateData);

  // Keep the inlined storefront config metafield fresh (non-blocking on failure).
  await syncStorefrontConfigByDomain(admin, session.shop);

  return Response.json({ success: true });
};
