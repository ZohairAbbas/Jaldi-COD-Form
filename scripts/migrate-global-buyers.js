/**
 * Migration Script: CustomerProfile → GlobalBuyer + BuyerAddress + ShopBuyerProfile
 *
 * Consolidates existing per-shop CustomerProfile records into the new global
 * buyer identity layer. Groups by phone number, creates one GlobalBuyer per
 * unique phone, and preserves per-shop stats in ShopBuyerProfile.
 *
 * This script is idempotent — safe to re-run. Skips phones that already exist in GlobalBuyer.
 *
 * Run: node scripts/migrate-global-buyers.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 100;

/**
 * Normalize phone to canonical form for grouping.
 */
function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
  if (!cleaned.startsWith('+') && cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }
  return cleaned || null;
}

async function migrate() {
  console.log('Starting GlobalBuyer migration from CustomerProfile...');
  console.log('==================================\n');

  // 1. Fetch all CustomerProfile records
  const allProfiles = await prisma.customerProfile.findMany({
    orderBy: { lastOrderAt: 'desc' },
  });

  console.log(`Found ${allProfiles.length} CustomerProfile records.`);

  if (allProfiles.length === 0) {
    console.log('Nothing to migrate.');
    await prisma.$disconnect();
    return;
  }

  // 2. Group by normalized phone
  const phoneGroups = new Map();

  for (const profile of allProfiles) {
    const normalized = normalizePhone(profile.phone);
    if (!normalized) continue;

    if (!phoneGroups.has(normalized)) {
      phoneGroups.set(normalized, []);
    }
    phoneGroups.get(normalized).push(profile);
  }

  console.log(`Grouped into ${phoneGroups.size} unique phone numbers.\n`);

  // 3. Process in batches
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const entries = Array.from(phoneGroups.entries());

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(async (tx) => {
      for (const [phone, profiles] of batch) {
        try {
          // Check if GlobalBuyer already exists (idempotent)
          const existing = await tx.globalBuyer.findUnique({
            where: { phone },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Use the most recent profile (first in array, sorted by lastOrderAt desc)
          const primary = profiles[0];

          // Sum total orders across all shops
          const totalOrdersGlobal = profiles.reduce(
            (sum, p) => sum + (p.totalOrders || 0),
            0
          );

          // If buyer has placed orders, set lastVerifiedAt to their most recent order date
          const lastVerifiedAt =
            totalOrdersGlobal >= 1 && primary.lastOrderAt
              ? primary.lastOrderAt
              : null;

          // Create GlobalBuyer
          const buyer = await tx.globalBuyer.create({
            data: {
              phone,
              firstName: primary.firstName,
              lastName: primary.lastName,
              email: primary.email,
              totalOrdersGlobal,
              lastVerifiedAt,
            },
          });

          // Create BuyerAddress from the most recent profile that has address data
          const profileWithAddress = profiles.find(
            (p) => p.address && p.city && p.province
          );

          if (profileWithAddress) {
            await tx.buyerAddress.create({
              data: {
                buyerId: buyer.id,
                label: 'Home',
                address: profileWithAddress.address,
                address2: profileWithAddress.address2 || null,
                city: profileWithAddress.city,
                province: profileWithAddress.province,
                postalCode: profileWithAddress.postalCode || null,
                country: 'Pakistan',
                countryCode: profileWithAddress.countryCode || 'PAK',
                isDefault: true,
                lastUsedAt: profileWithAddress.lastOrderAt || new Date(),
                usageCount: profileWithAddress.totalOrders || 1,
              },
            });
          }

          // Create ShopBuyerProfile for each shop
          for (const profile of profiles) {
            await tx.shopBuyerProfile.create({
              data: {
                shopId: profile.shopId,
                buyerId: buyer.id,
                totalOrders: profile.totalOrders || 0,
                completedOrders: profile.completedOrders || 0,
                rtoOrders: profile.rtoOrders || 0,
                rtoRate: profile.rtoRate || 0,
                riskScore: profile.riskScore || 'UNKNOWN',
                isBlacklisted: profile.isBlacklisted || false,
                firstOrderAt: profile.firstOrderAt,
                lastOrderAt: profile.lastOrderAt,
              },
            });
          }

          processed++;
        } catch (err) {
          console.error(`Error migrating phone ${phone}:`, err.message);
          errors++;
        }
      }
    });

    console.log(
      `Progress: ${Math.min(i + BATCH_SIZE, entries.length)} / ${entries.length} (migrated: ${processed}, skipped: ${skipped}, errors: ${errors})`
    );
  }

  console.log('\n==================================');
  console.log('Migration Complete');
  console.log(`Total unique phones: ${phoneGroups.size}`);
  console.log(`Migrated: ${processed}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Errors: ${errors}`);

  await prisma.$disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
