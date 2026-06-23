import { authenticate } from "../shopify.server";
import { getOrCreateShop, updateSettings } from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return Response.json({
    settings: shop.settings,
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const settingsData = await request.json();

  await updateSettings(shop.id, settingsData);

  // Keep the inlined storefront config metafield fresh so the button reflects
  // changes on first paint (no proxy round-trip). Non-blocking on failure.
  await syncStorefrontConfigByDomain(admin, session.shop);

  return Response.json({ success: true });
};
