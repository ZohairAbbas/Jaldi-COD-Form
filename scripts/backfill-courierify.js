/**
 * Backfill Script: Import Courierify Shipment Outcomes into Preventify
 *
 * Syncs ALL terminal (+ non-terminal) Courierify shipments for phones that exist
 * in GlobalBuyer, then recalculates risk for every affected buyer.
 *
 * Idempotent — safe to re-run. Skips shipments already imported via
 * @@unique([sourceApp, externalId]) constraint.
 *
 * Prerequisites:
 *   - COURIERIFY_DATABASE_URL must be set in .env
 *   - Run after: npx prisma migrate dev (ExternalDeliveryRecord table must exist)
 *
 * Run: node scripts/backfill-courierify.js
 */

import { syncCourierifyData } from '../app/lib/courierify-sync.server.js';

async function main() {
  console.log('========================================');
  console.log('Courierify Backfill');
  console.log('========================================');

  if (!process.env.COURIERIFY_DATABASE_URL) {
    console.error('[error] COURIERIFY_DATABASE_URL is not set in .env');
    process.exit(1);
  }

  console.log('Starting sync...');
  const startTime = Date.now();

  const result = await syncCourierifyData();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  if (result.skipped) {
    console.log(`\nSkipped: ${result.reason}`);
  } else {
    console.log('\n========================================');
    console.log(`Done in ${duration}s`);
    console.log(`  Records imported : ${result.recordsImported}`);
    console.log(`  Buyers enriched  : ${result.phonesEnriched}`);
    console.log(`  Errors           : ${result.errors}`);
    console.log('========================================');
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
