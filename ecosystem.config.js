module.exports = {
  apps: [
    {
      name: 'jaldicod',
      script: 'npm',
      args: 'start',
      cwd: '/home/jaldicod/jaldi-cod-form',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};
