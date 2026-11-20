import pg from 'pg';

const url = process.env.ADMIN_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';
const database = process.argv[2] ?? 'edtech';

const client = new pg.Client({ connectionString: url });
await client.connect();
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
if (existing.rowCount === 0) {
  await client.query(`CREATE DATABASE ${database}`);
  console.log(`created ${database}`);
} else {
  console.log(`${database} already exists`);
}
await client.end();
