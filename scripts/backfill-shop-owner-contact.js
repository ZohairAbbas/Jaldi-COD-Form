/**
 * Backfill Script: Populate Shop.ownerEmail and Shop.ownerPhone from Shopify Admin API
 *
 * Fetches owner email and phone for all shops that are missing either field,
 * using their stored access token.
 *
 * Idempotent — safe to re-run. Only touches shops missing ownerEmail or ownerPhone.
 *
 * Run: node scripts/backfill-shop-owner-contact.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fetchOwnerContact(shopifyDomain, accessToken) {
  try {
    const res = await fetch(
      `https://${shopifyDomain}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: '{ shop { email phone } }' }),
      }
    );
    const data = await res.json();
    return {
      email: data?.data?.shop?.email || null,
      phone: data?.data?.shop?.phone || null,
    };
  } catch (err) {
    console.error(`  [error] ${shopifyDomain}: ${err.message}`);
    return { email: null, phone: null };
  }
}

async function main() {
  const shops = await prisma.shop.findMany({
    where: {
      OR: [{ ownerEmail: null }, { ownerPhone: null }],
    },
    select: { id: true, shopifyDomain: true, accessToken: true, ownerEmail: true, ownerPhone: true },
  });

  console.log(`Found ${shops.length} shops missing ownerEmail or ownerPhone.`);
  if (shops.length === 0) { await prisma.$disconnect(); return; }

  let updated = 0;
  let failed = 0;

  for (const shop of shops) {
    process.stdout.write(`  ${shop.shopifyDomain} ... `);
    const { email, phone } = await fetchOwnerContact(shop.shopifyDomain, shop.accessToken);

    const updateData = {};
    if (email && !shop.ownerEmail) updateData.ownerEmail = email;
    if (phone && !shop.ownerPhone) updateData.ownerPhone = phone;

    if (Object.keys(updateData).length > 0) {
      await prisma.shop.update({ where: { id: shop.id }, data: updateData });
      console.log(`✓ ${JSON.stringify(updateData)}`);
      updated++;
    } else {
      console.log('✗ could not fetch contact info');
      failed++;
    }

    // Respect Shopify API rate limits
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
