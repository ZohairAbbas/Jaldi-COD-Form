const cron = require('node-cron');

// Load .env so the worker still targets the right app when started outside PM2.
// Note: dotenv does not override variables that are already set, and PM2 can
// inject a stale *empty* value (CRON_SECRET='') that counts as "set" while
// being useless. So resolve explicitly, treating blank as absent.
const fileEnv = require('dotenv').config({ path: __dirname + '/.env' }).parsed || {};

const envOr = (key, fallback) => {
  const fromProcess = (process.env[key] || '').trim();
  if (fromProcess) return fromProcess;
  const fromFile = (fileEnv[key] || '').trim();
  return fromFile || fallback;
};

// Fall back to the app's own PORT rather than a fixed guess, so the worker
// follows the app if the port ever changes.
const PORT = Number(envOr('PORT', 3001)) || 3001;
const BASE_URL = envOr('APP_URL', `http://localhost:${PORT}`);
const CRON_SECRET = envOr('CRON_SECRET', '');

// In-memory lock to prevent overlapping jobs on same instance
const locks = {
  abandonedCarts: false,
  draftOrders: false,
  fulfillmentSync: false,
  courierifySync: false,
  googleSheetsSync: false,
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
cron.schedule('*/5 * * * *', () => {
  runJob('abandonedCarts', '/proxy/cron-abandoned-carts');
}, {
  scheduled: true,
  timezone: 'Asia/Karachi'
});

// Job 2: Draft Order Creation - Every 30 minutes
cron.schedule('*/30 * * * *', () => {
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

// Job 5: Google Sheets Sync - Every 2 minutes (cursor-based, only new orders)
cron.schedule('*/2 * * * *', () => {
  runJob('googleSheetsSync', '/proxy/cron-google-sheets-sync');
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
console.log('  - Google Sheets sync: Every 2 minutes');
console.log('========================================');

// Preflight: confirm the app is actually reachable and the secret is accepted.
// A silent misconfiguration here once broke every job for four weeks, so this
// fails loudly at startup instead of drip-feeding "fetch failed" into the logs.
(async function preflight() {
  try {
    const res = await fetch(`${BASE_URL}/proxy/cron-google-sheets-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CRON_SECRET ? { 'X-Cron-Secret': CRON_SECRET } : {}),
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 401) {
      console.error(`PREFLIGHT FAILED: ${BASE_URL} rejected the cron secret (401).`);
      console.error('CRON_SECRET in .env must match the value the app validates. Jobs will not run.');
      return;
    }
    if (!res.ok) {
      console.error(`PREFLIGHT WARNING: ${BASE_URL} returned HTTP ${res.status}.`);
      return;
    }
    console.log(`Preflight OK: app reachable at ${BASE_URL}`);
  } catch (error) {
    console.error(`PREFLIGHT FAILED: cannot reach the app at ${BASE_URL} - ${error.message}`);
    console.error('Check that PORT in .env matches the port the app is listening on.');
  }
})();

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
