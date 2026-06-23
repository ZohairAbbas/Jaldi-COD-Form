import { authenticate } from "../shopify.server";
import {
  getOrCreateShop,
  getPixelsByShop,
  createPixel,
  updatePixel,
  deletePixel,
  getPixelById,
} from "../lib/db.server";
import { syncStorefrontConfigByDomain } from "../lib/storefront-config.server";

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
  const { admin, session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const formData = await request.json();
  const method = request.method;

  try {
    if (method === "POST") {
      const { id, ...pixelData } = formData;

      let pixel;
      if (id) {
        // Update existing pixel
        pixel = await updatePixel(id, pixelData);
      } else {
        // Create new pixel
        pixel = await createPixel(shop.id, pixelData);
      }
      await syncStorefrontConfigByDomain(admin, session.shop);
      return { success: true, pixel };
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
      await syncStorefrontConfigByDomain(admin, session.shop);
      return { success: true };
    }

    return Response.json({ success: false, error: "Invalid method" }, { status: 405 });
  } catch (error) {
    console.error("Pixel API error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
