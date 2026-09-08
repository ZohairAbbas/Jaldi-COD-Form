import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const shop = await getOrCreateShop(session.shop, session.accessToken);
    const body = await request.json();
    const { action: updateAction } = body;

    // Only dismissals are stored. The two step flags used to live here too, but
    // completion is now derived from the shop's actual state on each dashboard
    // load (see lib/setup-status.server.js) rather than self-reported, so
    // writing them would just leave a stale value nothing reads.
    const currentProgress = shop.setupProgress || {
      welcomeDismissed: false,
      setupGuideDismissed: false,
    };

    let updatedProgress = { ...currentProgress };

    switch (updateAction) {
      case "dismissWelcome":
        updatedProgress.welcomeDismissed = true;
        break;
      case "dismissSetupGuide":
        updatedProgress.setupGuideDismissed = true;
        break;
      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }

    // Update shop in database
    await prisma.shop.update({
      where: { id: shop.id },
      data: { setupProgress: updatedProgress },
    });

    return Response.json({ success: true, setupProgress: updatedProgress });
  } catch (error) {
    console.error("Error updating setup progress:", error);
    return Response.json({ error: "Failed to update setup progress" }, { status: 500 });
  }
};
