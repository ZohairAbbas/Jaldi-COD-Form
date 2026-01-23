import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getPixelsByShop,
  createPixel,
  updatePixel,
  deletePixel,
  getPixelById,
} from "../lib/db.server";

/**
 * GET /api/pixels - List all pixels for the shop
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const pixels = await getPixelsByShop(shop.id);

  return { pixels };
}

/**
 * POST /api/pixels - Create or update pixel
 * DELETE /api/pixels - Delete pixel
 */
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.json();
  const method = request.method;

  try {
    if (method === "POST") {
      const { id, ...pixelData } = formData;

      if (id) {
        // Update existing pixel
        const pixel = await updatePixel(id, pixelData);
        return { success: true, pixel };
      } else {
        // Create new pixel
        const pixel = await createPixel(shop.id, pixelData);
        return { success: true, pixel };
      }
    }

    if (method === "DELETE") {
      const { id } = formData;

      if (!id) {
        return Response.json({ success: false, error: "Pixel ID is required" }, { status: 400 });
      }

      // Verify pixel belongs to this shop
      const pixel = await getPixelById(id);
      if (!pixel || pixel.shopId !== shop.id) {
        return Response.json({ success: false, error: "Pixel not found" }, { status: 404 });
      }

      await deletePixel(id);
      return { success: true };
    }

    return Response.json({ success: false, error: "Invalid method" }, { status: 405 });
  } catch (error) {
    console.error("Pixel API error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
