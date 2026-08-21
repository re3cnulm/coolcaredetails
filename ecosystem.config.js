/*
 * pm2 config for the Hostinger VPS.
 *   Start:  pm2 start ecosystem.config.js
 *   Reload: pm2 reload coolcaredetails
 *   Logs:   pm2 logs coolcaredetails
 * `pm2 save && pm2 startup` once, so it comes back after a reboot.
 */
module.exports = {
  apps: [{
    name: 'coolcaredetails',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: 3000
    },
    // 14 days of logs, one file per day.
    error_file: '/var/log/coolcaredetails/error.log',
    out_file: '/var/log/coolcaredetails/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
