module.exports = {
  apps: [
    {
      name: 'preventify-app',
      script: 'npm',
      args: 'run start',
      cwd: '/root/Jaldi-COD-Form', // Update this path for your production server
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
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
      cwd: '/root/Jaldi-COD-Form', // Update this path for your production server
      instances: 1, // CRITICAL: Only 1 instance to prevent duplicate jobs
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        APP_URL: 'http://localhost:3000', // Internal URL for cron requests
        CRON_SECRET: '', // Set this in production
      },
      error_file: './logs/cron-err.log',
      out_file: './logs/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
