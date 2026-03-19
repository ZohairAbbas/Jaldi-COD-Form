import { lookupGlobalBuyer } from "../lib/buyer.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { phone } = await request.json();

    if (!phone) {
      return Response.json({ buyer: null });
    }

    // Require at least 7 digits for a valid phone lookup
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return Response.json({ buyer: null });
    }

    // Server determines trust level and returns appropriate data
    const buyer = await lookupGlobalBuyer(phone);
    return Response.json({ buyer });
  } catch (error) {
    console.error("Buyer lookup error:", error);
    return Response.json({ buyer: null });
  }
};
