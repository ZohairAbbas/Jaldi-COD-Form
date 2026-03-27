import { createWhatsAppLoginSession } from "../lib/whatsapp.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { phone } = await request.json();

    if (!phone) {
      return Response.json({ error: "Phone is required" }, { status: 400 });
    }

    const { token, deepLink } = await createWhatsAppLoginSession(phone);

    return Response.json({ token, deepLink });
  } catch (error) {
    console.error("WhatsApp login init error:", error);
    return Response.json(
      { error: error.message || "Failed to create login session" },
      { status: 500 }
    );
  }
};
