// Load .env so PM2 and the app agree on one set of values.
// .env is the single source of truth for PORT / CRON_SECRET — do not hardcode
// them here, or a `pm2 restart` will silently move the app off the port nginx
// proxies to (see logs/cron-err.log, 2026-07-07: cron pointed at :3000 while
// the app ran on :3001, and every job failed for four weeks).
require('dotenv').config({ path: __dirname + '/.env' });

const PORT = Number(process.env.PORT) || 3001;

// Derived, never hardcoded: the cron worker must follow the app's port.
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

module.exports = {
  apps: [
    {
      name: 'preventify-app',
      script: 'npm',
      args: 'run start',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT,
      },
      error_file: './logs/app-err.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
    {
      name: 'preventify-cron',
      script: 'cron-worker.cjs',
      cwd: __dirname,
      instances: 1, // CRITICAL: Only 1 instance to prevent duplicate jobs
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        APP_URL, // Internal URL for cron requests — derived from PORT above
        CRON_SECRET: process.env.CRON_SECRET || '',
      },
      error_file: './logs/cron-err.log',
      out_file: './logs/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
