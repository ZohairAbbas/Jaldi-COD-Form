import { PrismaClient } from "@prisma/client";
import prisma from "../db.server.js";
import { recalculateBuyerRisk } from "./risk.server.js";

// Courierify status → Preventify deliveryOutcome
const COURIERIFY_STATUS_MAP = {
  delivered: "delivered",
  returned: "returned",
  cancelled: "cancelled",
  in_transit: "in_transit",
  out_for_delivery: "in_transit",
  picked_up: "in_transit",
  booked: "booked",
  pending: "booked",
};

const BATCH_SIZE = 50;

/**
 * Sync Courierify shipment outcomes into Preventify's ExternalDeliveryRecord table.
 * Opens a second Prisma client for Courierify's DB, reads terminal shipments,
 * writes deduplicated records into Preventify, then recalculates risk for affected buyers.
 *
 * Safe to run multiple times — @@unique([sourceApp, externalId]) prevents duplicates.
 */
export async function syncCourierifyData() {
  const courierifyUrl = process.env.COURIERIFY_DATABASE_URL;
  if (!courierifyUrl) {
    console.warn("[courierify-sync] COURIERIFY_DATABASE_URL not set — skipping");
    return { skipped: true, reason: "COURIERIFY_DATABASE_URL not configured" };
  }

  let courierifyPrisma;
  try {
    courierifyPrisma = new PrismaClient({ datasources: { db: { url: courierifyUrl } } });
    await courierifyPrisma.$connect();
  } catch (err) {
    console.error("[courierify-sync] Failed to connect to Courierify DB:", err.message);
    return { skipped: true, reason: `DB connection failed: ${err.message}` };
  }

  try {
    // Step 1: Get all normalized phones from Preventify's GlobalBuyer
    const globalBuyers = await prisma.globalBuyer.findMany({
      select: { phone: true },
    });
    const knownPhones = globalBuyers.map((b) => b.phone);

    if (knownPhones.length === 0) {
      return { phonesEnriched: 0, recordsImported: 0, errors: 0 };
    }

    // Step 2: Get already-imported externalIds to avoid re-processing
    const existingRecords = await prisma.externalDeliveryRecord.findMany({
      where: { sourceApp: "courierify" },
      select: { externalId: true },
    });
    const importedIds = new Set(existingRecords.map((r) => r.externalId));

    let totalImported = 0;
    let totalErrors = 0;
    const affectedPhones = new Set();

    // Step 3: Batch through phones — query Courierify in groups of 50
    for (let i = 0; i < knownPhones.length; i += BATCH_SIZE) {
      const phoneBatch = knownPhones.slice(i, i + BATCH_SIZE);

      // Build all possible phone format variants for matching
      // (Courierify may store 03001234567, +923001234567, or 00923001234567)
      const phoneVariants = buildPhoneVariants(phoneBatch);

      try {
        const shipments = await courierifyPrisma.shipment.findMany({
          where: {
            customerPhone: { in: phoneVariants },
            status: { in: Object.keys(COURIERIFY_STATUS_MAP) },
          },
          select: {
            id: true,
            customerPhone: true,
            status: true,
            codAmount: true,
            shop: { select: { domain: true } },
          },
        });

        const newRecords = [];

        for (const shipment of shipments) {
          if (importedIds.has(shipment.id)) continue;

          const normalizedPhone = normalizeCourierifyPhone(shipment.customerPhone);
          if (!normalizedPhone || !knownPhones.includes(normalizedPhone)) continue;

          const deliveryOutcome = COURIERIFY_STATUS_MAP[shipment.status] || "booked";

          newRecords.push({
            phone: normalizedPhone,
            sourceApp: "courierify",
            sourceShopDomain: shipment.shop?.domain || "unknown",
            externalId: shipment.id,
            deliveryOutcome,
            orderValue: shipment.codAmount ? parseFloat(shipment.codAmount) : null,
          });

          affectedPhones.add(normalizedPhone);
          importedIds.add(shipment.id); // prevent duplicates within this run
        }

        if (newRecords.length > 0) {
          await prisma.externalDeliveryRecord.createMany({
            data: newRecords,
            skipDuplicates: true,
          });
          totalImported += newRecords.length;
        }
      } catch (err) {
        console.error(`[courierify-sync] Batch ${i}–${i + BATCH_SIZE} failed:`, err.message);
        totalErrors++;
      }
    }

    // Step 4: Recalculate risk for all affected buyers
    for (const phone of affectedPhones) {
      try {
        await recalculateBuyerRisk(phone);
      } catch (err) {
        console.error(`[courierify-sync] Risk recalc failed for ${phone}:`, err.message);
        totalErrors++;
      }
    }

    console.log(
      `[courierify-sync] Done — imported ${totalImported} records, enriched ${affectedPhones.size} buyers, ${totalErrors} errors`
    );

    return {
      phonesEnriched: affectedPhones.size,
      recordsImported: totalImported,
      errors: totalErrors,
    };
  } finally {
    await courierifyPrisma.$disconnect();
  }
}

/**
 * Normalize a Courierify customerPhone to +92XXXXXXXXXX (Pakistani) or
 * +[countrycode]XXXXXXXXX (foreign). Returns null for garbage/unresolvable.
 *
 * Pakistani variants handled (236k+ records):
 *   03XXXXXXXXXX  (170k) → strip leading 0, prepend +92
 *   +92XXXXXXXXXX (51k)  → already canonical
 *   3XXXXXXXXX    (10k)  → prepend +92
 *   92XXXXXXXXXX  (3.7k) → prepend +
 *   0092XXXXXXXXXX (366) → replace 0092 with +92
 *   092XXXXXXXXXX  (~1)  → replace 092 with +92
 *   02X/04X/05X... landlines (~40) → skip (not mobile, can't match)
 *
 * Foreign numbers: already in +[code] form → pass through as-is.
 * Garbage: [REDACTED], empty, "Unknown", too short → return null.
 */
function normalizeCourierifyPhone(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, "");

  // Garbage patterns
  if (!cleaned || cleaned === "Unknown" || cleaned === "[REDACTED]") return null;
  if (cleaned.length < 7) return null;

  // Already in E.164 format (+countrycode...)
  if (cleaned.startsWith("+")) {
    // Foreign numbers — pass through
    if (!cleaned.startsWith("+92")) return cleaned;
    // +92XXXXXXXXXX — canonical Pakistani
    return cleaned;
  }

  // 0092XXXXXXXXXX → +92XXXXXXXXXX
  if (cleaned.startsWith("0092")) return "+92" + cleaned.slice(4);

  // 092XXXXXXXXXX (extra leading 0) → +92XXXXXXXXXX
  if (cleaned.startsWith("092") && cleaned.length === 13) return "+92" + cleaned.slice(3);

  // 92XXXXXXXXXX → +92XXXXXXXXXX
  if (cleaned.startsWith("92") && cleaned.length === 12) return "+" + cleaned;

  // 03XXXXXXXXXX → +923XXXXXXXXXX
  if (cleaned.startsWith("03") && cleaned.length === 11) return "+92" + cleaned.slice(1);

  // 3XXXXXXXXX (10 digits) → +923XXXXXXXXXX
  if (cleaned.startsWith("3") && cleaned.length === 10) return "+92" + cleaned;

  // Landlines (021, 042, 051 etc.) — not matchable to mobile GlobalBuyer records
  if (cleaned.startsWith("0") && cleaned.length <= 11) return null;

  return null;
}

/**
 * Build all Pakistani phone format variants for a Preventify normalized phone (+92XXXXXXXXXX).
 * Used in the Courierify DB WHERE clause so we match whichever format they stored.
 * Foreign numbers (+1, +44 etc.) are passed through as-is since they're already canonical.
 */
function buildPhoneVariants(normalizedPhones) {
  const variants = new Set();
  for (const phone of normalizedPhones) {
    variants.add(phone); // always include canonical form

    if (phone.startsWith("+92") && phone.length === 13) {
      const national = phone.slice(3); // 3XXXXXXXXXX (10 digits)
      variants.add("92" + national);    // 923XXXXXXXXXX
      variants.add("0092" + national);  // 00923XXXXXXXXXX
      variants.add("092" + national);   // 0923XXXXXXXXXX
      variants.add("0" + national);     // 03XXXXXXXXXX
      variants.add(national);           // 3XXXXXXXXXX
    } else if (phone.startsWith("+")) {
      // Foreign: also add without leading +
      variants.add(phone.slice(1));
    }
  }
  return Array.from(variants);
}
