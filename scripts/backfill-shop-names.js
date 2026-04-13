/**
 * Backfill Script: Populate Shop.name from Shopify Admin API
 *
 * Fetches the shop name for all stores that have name = null,
 * using their stored access token.
 *
 * Idempotent — safe to re-run. Only touches shops with name = null.
 *
 * Run: node scripts/backfill-shop-names.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fetchShopName(shopifyDomain, accessToken) {
  try {
    const res = await fetch(
      `https://${shopifyDomain}/admin/api/2025-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: '{ shop { name } }' }),
      }
    );
    const data = await res.json();
    return data?.data?.shop?.name || null;
  } catch (err) {
    console.error(`  [error] ${shopifyDomain}: ${err.message}`);
    return null;
  }
}

async function main() {
  const shops = await prisma.shop.findMany({
    where: { name: null },
    select: { id: true, shopifyDomain: true, accessToken: true },
  });

  console.log(`Found ${shops.length} shops with no name.`);
  if (shops.length === 0) { await prisma.$disconnect(); return; }

  let updated = 0;
  let failed = 0;

  for (const shop of shops) {
    process.stdout.write(`  ${shop.shopifyDomain} ... `);
    const name = await fetchShopName(shop.shopifyDomain, shop.accessToken);
    if (name) {
      await prisma.shop.update({ where: { id: shop.id }, data: { name } });
      console.log(`✓ "${name}"`);
      updated++;
    } else {
      console.log('✗ could not fetch name');
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
