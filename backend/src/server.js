require('dotenv').config();

const app = require('./app');
const pool = require('./config/db');
const { validateProductionEnvironment } = require('./config/env');

const port = Number(process.env.PORT || 5000);
let server;

async function start() {
  validateProductionEnvironment();
  await pool.query('SELECT 1');

  server = app.listen(port, '0.0.0.0', () => {
    console.log(`InternGuide API listening on port ${port}`);
  });
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down InternGuide API.`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM').catch((error) => {
  console.error('Graceful shutdown failed:', error);
  process.exit(1);
}));

process.on('SIGINT', () => shutdown('SIGINT').catch((error) => {
  console.error('Graceful shutdown failed:', error);
  process.exit(1);
}));

start().catch((error) => {
  console.error('Failed to start server:', error.stack || error.message || error);
  process.exit(1);
});
