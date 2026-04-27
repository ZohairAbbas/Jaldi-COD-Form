/**
 * Backfill Script: Populate Shop.themeEmbedEnabled from Shopify Admin API
 *
 * For each shop, fetches the main theme via GraphQL, then checks
 * config/settings_data.json via REST to determine if the Preventify
 * app embed block is enabled.
 *
 * Idempotent — safe to re-run. Processes ALL shops regardless of current value
 * so it can correct stale data too.
 *
 * Run: node scripts/backfill-theme-embed-status.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_VERSION = '2026-01';
const APP_EMBED_UUID = '2dc90d2c-a22b-c2f6-dd39-a0cf1161a398602d107a';

async function checkThemeEmbed(shopifyDomain, accessToken) {
  try {
    // Step 1: Get main theme ID via GraphQL
    const gqlRes = await fetch(
      `https://${shopifyDomain}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `{ themes(first: 1, roles: MAIN) { nodes { id } } }`,
        }),
      }
    );

    if (gqlRes.status === 401) return { enabled: false, reason: 'invalid_token' };
    if (!gqlRes.ok) return { enabled: false, reason: `gql_${gqlRes.status}` };

    const gqlData = await gqlRes.json();
    const themeGid = gqlData?.data?.themes?.nodes?.[0]?.id;
    if (!themeGid) return { enabled: false, reason: 'no_theme' };

    const themeIdMatch = themeGid.match(/Theme\/(\d+)/);
    if (!themeIdMatch) return { enabled: false, reason: 'bad_theme_gid' };
    const themeId = themeIdMatch[1];

    // Step 2: Fetch settings_data.json to check embed block
    const assetRes = await fetch(
      `https://${shopifyDomain}/admin/api/${API_VERSION}/themes/${themeId}/assets.json?asset[key]=config/settings_data.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!assetRes.ok) return { enabled: false, reason: `asset_${assetRes.status}` };

    const assetData = await assetRes.json();
    const settingsContent = assetData.asset?.value;
    if (!settingsContent) return { enabled: false, reason: 'no_settings' };

    const settings = JSON.parse(settingsContent);
    const blocks = settings.current?.blocks;
    if (!blocks) return { enabled: false, reason: 'no_blocks' };

    const embedBlock = Object.values(blocks).find(
      b => b.type?.includes(APP_EMBED_UUID) || b.type?.includes('preventify')
    );

    if (!embedBlock) return { enabled: false, reason: 'no_embed_block' };
    return { enabled: embedBlock.disabled === false, reason: 'ok' };
  } catch (err) {
    return { enabled: false, reason: `error: ${err.message}` };
  }
}

async function main() {
  const shops = await prisma.shop.findMany({
    select: { id: true, shopifyDomain: true, accessToken: true, themeEmbedEnabled: true },
  });

  console.log(`Processing ${shops.length} shops...\n`);

  let enabled = 0;
  let disabled = 0;
  let failed = 0;

  for (const shop of shops) {
    process.stdout.write(`  ${shop.shopifyDomain} ... `);
    const { enabled: isEnabled, reason } = await checkThemeEmbed(shop.shopifyDomain, shop.accessToken);

    if (reason === 'invalid_token') {
      console.log('✗ invalid token (uninstalled?)');
      failed++;
    } else if (reason !== 'ok' && !reason.startsWith('no_')) {
      console.log(`✗ ${reason}`);
      failed++;
    } else {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { themeEmbedEnabled: isEnabled, themeEmbedCheckedAt: new Date() },
      });
      if (isEnabled) {
        console.log('✓ embed ON');
        enabled++;
      } else {
        console.log(`– embed OFF (${reason})`);
        disabled++;
      }
    }

    // Respect Shopify API rate limits (2 calls per shop)
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone. Embed ON: ${enabled}, Embed OFF: ${disabled}, Failed/skipped: ${failed}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
