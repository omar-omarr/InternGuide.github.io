require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../../src/config/db');

const relativeFile = process.argv[2];

if (!relativeFile) {
  console.error('Usage: node db/scripts/run_sql_file.js <sql-file>');
  process.exit(1);
}

const backendRoot = path.resolve(__dirname, '..', '..');
const sqlFile = path.resolve(backendRoot, relativeFile);

if (!sqlFile.startsWith(backendRoot + path.sep) || path.extname(sqlFile) !== '.sql') {
  console.error('SQL file must be a .sql file inside the backend directory.');
  process.exit(1);
}

async function run() {
  const sql = fs.readFileSync(sqlFile, 'utf8');
  await pool.query(sql);
  console.log(`Applied ${path.relative(backendRoot, sqlFile)}`);
  await pool.end();
}

run().catch(async (error) => {
  console.error(error.stack || error.message || error);
  await pool.end().catch(() => {});
  process.exit(1);
});
