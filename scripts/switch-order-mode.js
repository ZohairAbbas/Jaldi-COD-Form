#!/usr/bin/env node
/**
 * Utility script to switch order creation mode for a shop
 *
 * Usage:
 *   node scripts/switch-order-mode.js yourstore.myshopify.com checkout
 *   node scripts/switch-order-mode.js yourstore.myshopify.com draft
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function switchOrderMode() {
  const shopDomain = process.argv[2];
  const mode = process.argv[3];

  if (!shopDomain || !mode) {
    console.error('❌ Error: Missing required arguments');
    console.log('\nUsage:');
    console.log('  node scripts/switch-order-mode.js <shop-domain> <mode>');
    console.log('\nExample:');
    console.log('  node scripts/switch-order-mode.js yourstore.myshopify.com checkout');
    console.log('  node scripts/switch-order-mode.js yourstore.myshopify.com draft');
    process.exit(1);
  }

  if (mode !== 'checkout' && mode !== 'draft') {
    console.error(`❌ Error: Invalid mode "${mode}"`);
    console.log('   Mode must be either "checkout" or "draft"');
    process.exit(1);
  }

  try {
    // Find the shop
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
      include: { settings: true },
    });

    if (!shop) {
      console.error(`❌ Error: Shop "${shopDomain}" not found in database`);
      process.exit(1);
    }

    if (!shop.settings) {
      console.error(`❌ Error: Shop "${shopDomain}" has no settings record`);
      process.exit(1);
    }

    // Update the order creation mode
    await prisma.settings.update({
      where: { shopId: shop.id },
      data: { orderCreationMode: mode },
    });

    console.log(`✅ Order creation mode for "${shopDomain}" set to: ${mode.toUpperCase()}`);
    console.log('');

    if (mode === 'checkout') {
      console.log('📝 Checkout Mode Active:');
      console.log('   - Customer fills form → Redirects to Shopify Checkout');
      console.log('   - No database save until checkout completes');
      console.log('   - Compliant with Shopify App Store policies');
    } else {
      console.log('📝 Draft Order Mode Active:');
      console.log('   - Customer fills form → Order created immediately');
      console.log('   - Uses Draft Order API');
      console.log('   - Order marked as payment pending');
    }

  } catch (error) {
    console.error('❌ Error updating order mode:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

switchOrderMode();
