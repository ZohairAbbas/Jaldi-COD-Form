import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json();
    const { country, enableMultiCountry, supportedCountries } = data;

    // Build update data object
    const updateData = {};
    if (country !== undefined) {
      updateData.country = country;
    }
    if (enableMultiCountry !== undefined) {
      updateData.enableMultiCountry = enableMultiCountry;
    }
    if (supportedCountries !== undefined) {
      updateData.supportedCountries = supportedCountries;
    }

    // Update shop with provided fields
    await prisma.shop.update({
      where: { shopifyDomain: session.shop },
      data: updateData,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating shop:", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
