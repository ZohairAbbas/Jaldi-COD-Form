/**
 * Backfill Script: Populate risk scores for existing buyers and orders
 *
 * 1. Recalculates GlobalBuyer risk scores based on delivery outcomes
 * 2. Backfills riskLevel on orders that have riskLevel = null
 *
 * Idempotent — safe to re-run. Only touches orders with riskLevel = null.
 *
 * IMPORTANT: Run this AFTER the first fulfillment sync completes,
 * so deliveryOutcome is populated before risk calculation.
 *
 * Run: node scripts/backfill-risk-scores.js
 */

import { PrismaClient } from '@prisma/client';
import { recalculateBuyerRisk } from '../app/lib/risk.server.js';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Backfill Risk Scores ===\n');

  // Step 1: Recalculate risk for all global buyers
  const buyers = await prisma.globalBuyer.findMany({ select: { phone: true } });
  console.log(`Step 1: Recalculating risk for ${buyers.length} buyers...`);

  let recalculated = 0;
  let recalcErrors = 0;
  for (const buyer of buyers) {
    try {
      await recalculateBuyerRisk(buyer.phone);
      recalculated++;
    } catch (e) {
      console.error(`  Failed for ${buyer.phone}: ${e.message}`);
      recalcErrors++;
    }
  }
  console.log(`  Done: ${recalculated} recalculated, ${recalcErrors} errors\n`);

  // Step 2: Backfill riskLevel on orders from their buyer's current score
  const updatedBuyers = await prisma.globalBuyer.findMany({
    select: { phone: true, riskScoreGlobal: true },
  });
  const phoneToRisk = {};
  for (const b of updatedBuyers) {
    phoneToRisk[b.phone] = b.riskScoreGlobal;
  }

  const orders = await prisma.order.findMany({
    where: { riskLevel: null },
    select: { id: true, phone: true },
  });
  console.log(`Step 2: Backfilling riskLevel on ${orders.length} orders...`);

  let backfilled = 0;
  let backfillErrors = 0;
  for (const order of orders) {
    try {
      const risk = phoneToRisk[order.phone] || 'UNKNOWN';
      await prisma.order.update({
        where: { id: order.id },
        data: { riskLevel: risk },
      });
      backfilled++;
    } catch (e) {
      console.error(`  Failed for order ${order.id}: ${e.message}`);
      backfillErrors++;
    }
  }
  console.log(`  Done: ${backfilled} backfilled, ${backfillErrors} errors\n`);

  // Summary
  const riskBreakdown = await prisma.order.groupBy({
    by: ['riskLevel'],
    _count: { id: true },
  });
  console.log('=== Summary ===');
  console.log('Order risk distribution:');
  for (const r of riskBreakdown) {
    console.log(`  ${r.riskLevel || 'null'}: ${r._count.id}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
