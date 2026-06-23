/**
 * Backfill Script: Populate the inlined storefront-config metafield for all shops.
 *
 * Writes shop metafield preventify.storefront_config (json) so the app embed
 * Liquid can inline window.PREVENTIFY_SETTINGS and the COD button renders on
 * first paint with no proxy round-trip.
 *
 * Idempotent — safe to re-run. Reuses the same buildStorefrontConfig() +
 * syncStorefrontConfigMetafield() the app uses, via a minimal admin client
 * adapter (raw fetch to the Admin GraphQL endpoint with the stored token).
 *
 * Run: node scripts/backfill-storefront-config-metafield.js
 */

import { PrismaClient } from '@prisma/client';
import { syncStorefrontConfigMetafield } from '../app/lib/storefront-config.server.js';

const prisma = new PrismaClient();
const API_VERSION = '2026-01';

// Minimal stand-in for the request-time `admin` object: exposes .graphql(query, { variables })
// returning an object with .json(), matching what syncStorefrontConfigMetafield expects.
function makeAdminClient(shopifyDomain, accessToken) {
  return {
    graphql: async (query, options = {}) => {
      const res = await fetch(
        `https://${shopifyDomain}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken,
          },
          body: JSON.stringify({ query, variables: options.variables || {} }),
        }
      );
      return res;
    },
  };
}

async function main() {
  // syncStorefrontConfigMetafield takes shopData directly, so load shops with the
  // same relation set buildStorefrontConfig needs (matching getShopByDomain).
  const shops = await prisma.shop.findMany({
    include: {
      settings: true,
      formConfig: true,
      upsells: { where: { enabled: true, productId: { not: null } }, orderBy: { priority: 'asc' } },
      downsells: { where: { enabled: true }, orderBy: { priority: 'asc' } },
      bundles: { where: { enabled: true, status: 'published' }, orderBy: { priority: 'asc' } },
    },
  });

  console.log(`Processing ${shops.length} shops...\n`);

  let ok = 0;
  let failed = 0;

  for (const shop of shops) {
    process.stdout.write(`  ${shop.shopifyDomain} ... `);

    // Skip shops without core config (never set up) — nothing meaningful to inline.
    if (!shop.settings || !shop.formConfig) {
      console.log('– skipped (no settings/formConfig)');
      continue;
    }

    const admin = makeAdminClient(shop.shopifyDomain, shop.accessToken);
    const result = await syncStorefrontConfigMetafield(admin, shop);

    if (result.success) {
      console.log('✓ synced');
      ok++;
    } else {
      console.log(`✗ ${result.error || JSON.stringify(result.errors)}`);
      failed++;
    }

    // Respect Shopify API rate limits (definitionCreate + shop query + metafieldsSet).
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nDone. Synced: ${ok}, Failed/skipped: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
