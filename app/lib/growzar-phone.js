import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * The one phone normalizer for the Growzar feeds (API-CONTRACT §3, pack
 * G-PRV5-5). Stored phones are never rewritten; this runs on the way out.
 *
 * Rules (shared with Retainify so the two apps agree on a buyer):
 *   - only a VALID number is returned, never a guess;
 *   - a number written with "+" ignores the region;
 *   - digits without "+" are read as national (in the shop's region) and as
 *     international; if both readings are valid and differ, the answer is null.
 *
 * Returns { phone, reason }: `phone` is E.164 or null, `reason` says why it is
 * null ("empty" | "no_region" | "invalid" | "ambiguous") and is only used for
 * the report's counts.
 */
export function normalizePhoneE164(raw, region) {
  const text = String(raw ?? "").trim();
  if (!text) return { phone: null, reason: "empty" };

  const digits = text.replace(/\D/g, "");
  if (!digits) return { phone: null, reason: "invalid" };

  if (text.startsWith("+")) {
    const phone = validE164(`+${digits}`);
    return { phone, reason: phone ? null : "invalid" };
  }

  const national = region ? validE164(digits, region) : null;
  // "00" is the international prefix almost everywhere these shops sell.
  const international = validE164(`+${digits.replace(/^00/, "")}`);

  if (national && international && national !== international) return { phone: null, reason: "ambiguous" };
  if (national || international) return { phone: national || international, reason: null };
  return { phone: null, reason: region ? "invalid" : "no_region" };
}

function validE164(text, region) {
  const parsed = parsePhoneNumberFromString(text, region || undefined);
  return parsed?.isValid() ? parsed.number : null;
}

/** `{ phone, phoneRaw }` for a feed row. */
export function phoneFields(raw, region) {
  const phoneRaw = raw == null || String(raw).trim() === "" ? null : String(raw);
  return { phone: normalizePhoneE164(phoneRaw, region).phone, phoneRaw };
}
