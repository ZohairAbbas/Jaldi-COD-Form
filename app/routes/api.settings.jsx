import { authenticate } from "../shopify.server";
import { getOrCreateShop, updateSettings } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  return Response.json({
    settings: shop.settings,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const settingsData = await request.json();

  await updateSettings(shop.id, settingsData);

  return Response.json({ success: true });
};
