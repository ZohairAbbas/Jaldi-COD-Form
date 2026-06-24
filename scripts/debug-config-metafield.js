/**
 * Debug: inspect the storefront-config metafield as Shopify actually stored it.
 *
 * Tells us the REAL namespace/key (app-owned $app metafields get mangled), and
 * whether the value is present. Use this to figure out the correct Liquid path.
 *
 * Run: node scripts/debug-config-metafield.js [shopDomain]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_VERSION = '2026-01';

async function main() {
  const domainArg = process.argv[2];
  const shop = domainArg
    ? await prisma.shop.findUnique({ where: { shopifyDomain: domainArg }, select: { shopifyDomain: true, accessToken: true } })
    : await prisma.shop.findFirst({ select: { shopifyDomain: true, accessToken: true } });

  if (!shop) {
    console.error('No shop found', domainArg || '');
    await prisma.$disconnect();
    process.exit(1);
  }

  const query = `{
    shop {
      id
      metafields(first: 100) {
        nodes { namespace key type ownerType updatedAt }
      }
    }
  }`;

  const res = await fetch(`https://${shop.shopifyDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shop.accessToken },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();

  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
  }

  const nodes = json?.data?.shop?.metafields?.nodes || [];
  console.log(`\nShop: ${shop.shopifyDomain}`);
  console.log(`Total shop metafields: ${nodes.length}\n`);

  const relevant = nodes.filter(
    (n) => (n.key || '').includes('storefront') || (n.namespace || '').includes('app') || (n.namespace || '').includes('preventify')
  );
  console.log('Relevant metafields (storefront/app/preventify):');
  console.log(JSON.stringify(relevant, null, 2));
  console.log('\nALL namespaces present:', [...new Set(nodes.map((n) => n.namespace))].join(', '));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
