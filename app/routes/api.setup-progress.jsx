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
    const { action: updateAction, value } = body;

    // Get current setup progress or initialize with defaults
    const currentProgress = shop.setupProgress || {
      step1Completed: false,
      step2Completed: false,
      welcomeDismissed: false,
      setupGuideDismissed: false,
    };

    // Update the appropriate field
    let updatedProgress = { ...currentProgress };

    switch (updateAction) {
      case "dismissWelcome":
        updatedProgress.welcomeDismissed = true;
        break;
      case "dismissSetupGuide":
        updatedProgress.setupGuideDismissed = true;
        break;
      case "completeStep1":
        updatedProgress.step1Completed = value;
        break;
      case "completeStep2":
        updatedProgress.step2Completed = value;
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
