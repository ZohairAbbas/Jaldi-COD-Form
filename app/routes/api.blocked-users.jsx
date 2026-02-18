import { authenticate } from "../shopify.server";
import { getOrCreateShop, getBlockedUsers, syncBlockedUsers } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const blockedUsers = await getBlockedUsers(shop.id);

  const blockedEmails = blockedUsers
    .filter(b => b.type === 'email')
    .map(b => b.value);
  const blockedPhones = blockedUsers
    .filter(b => b.type === 'phone')
    .map(b => b.value);

  return Response.json({ blockedEmails, blockedPhones });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const { blockedEmails, blockedPhones } = await request.json();

  await Promise.all([
    syncBlockedUsers(shop.id, 'email', blockedEmails || []),
    syncBlockedUsers(shop.id, 'phone', blockedPhones || []),
  ]);

  return Response.json({ success: true });
};
