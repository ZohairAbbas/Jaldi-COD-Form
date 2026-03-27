import { checkWhatsAppLoginStatus } from "../lib/whatsapp.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { token } = await request.json();

    if (!token) {
      return Response.json({ status: "expired" });
    }

    const result = await checkWhatsAppLoginStatus(token);

    return Response.json(result);
  } catch (error) {
    console.error("WhatsApp login status error:", error);
    return Response.json({ status: "expired" });
  }
};
