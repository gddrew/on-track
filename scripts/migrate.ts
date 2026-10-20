// Brings the database up to the current schema. The container runs it before
// starting the app (see Containerfile); in development use `bun run db:migrate`.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(url, { max: 1, onnotice: () => {} });

await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();

console.log('Database schema is up to date');
