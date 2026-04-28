const cron = require('node-cron');

const BASE_URL = process.env.APP_URL || 'http://localhost:64554';
const CRON_SECRET = process.env.CRON_SECRET || 'elIpvaUVOuHiIeNEqSTGcMainhXqFgHTqdaBBuDQ9ig=';

// In-memory lock to prevent overlapping jobs on same instance
const locks = {
  abandonedCarts: false,
  draftOrders: false,
  fulfillmentSync: false,
  courierifySync: false,
};

async function runJob(jobName, endpoint) {
  if (locks[jobName]) {
    console.log(`[${new Date().toISOString()}] ${jobName}: Skipped (previous job still running)`);
    return;
  }

  locks[jobName] = true;
  console.log(`[${new Date().toISOString()}] ${jobName}: Starting...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    const headers = {
      'Content-Type': 'application/json',
    };

    // Add secret header if configured
    if (CRON_SECRET) {
      headers['X-Cron-Secret'] = CRON_SECRET;
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const result = await response.json();
    console.log(`[${new Date().toISOString()}] ${jobName}: Completed`, JSON.stringify(result, null, 2));
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[${new Date().toISOString()}] ${jobName}: Timeout after 2 minutes`);
    } else {
      console.error(`[${new Date().toISOString()}] ${jobName}: Failed -`, error.message);
    }
  } finally {
    locks[jobName] = false;
  }
}

// ============================================
// CRON SCHEDULES
// ============================================

// Job 1: Abandoned Cart Detection - Every 5 minutes
cron.schedule('*/1 * * * *', () => {
  runJob('abandonedCarts', '/proxy/cron-abandoned-carts');
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

// Job 2: Draft Order Creation - Every 30 minutes
cron.schedule('*/2 * * * *', () => {
  runJob('draftOrders', '/proxy/abandoned-carts-create-draft');
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

// Job 3: Fulfillment Sync - Every 3 hours
cron.schedule('0 */3 * * *', () => {
  runJob('fulfillmentSync', '/proxy/cron-fulfillment-sync');
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

// Job 4: Courierify Data Sync - Daily at 02:00 PKT
cron.schedule('0 2 * * *', () => {
  runJob('courierifySync', '/proxy/cron-courierify-sync');
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

// ============================================
// STARTUP
// ============================================

console.log('========================================');
console.log('Preventify Cron Worker Started');
console.log('========================================');
console.log(`Base URL: ${BASE_URL}`);
console.log(`Cron Secret: ${CRON_SECRET ? 'Configured' : 'Not configured (local dev mode)'}`);
console.log('Jobs:');
console.log('  - Abandoned cart detection: Every 5 minutes');
console.log('  - Draft order creation: Every 30 minutes');
console.log('  - Fulfillment sync: Every 3 hours');
console.log('  - Courierify data sync: Daily at 02:00 PKT');
console.log('========================================');

// Run jobs immediately on startup for testing (optional - comment out in production)
// Uncomment the lines below to run jobs immediately when the worker starts
// console.log('Running initial jobs...');
// runJob('abandonedCarts', '/proxy/cron-abandoned-carts');
// setTimeout(() => runJob('draftOrders', '/proxy/abandoned-carts-create-draft'), 5000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nCron worker shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nCron worker shutting down...');
  process.exit(0);
});
