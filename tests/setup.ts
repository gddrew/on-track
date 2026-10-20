// Loaded before every test file (bunfig.toml). Points the app at the test database
// and makes sure nothing can leave this machine.
import { mock } from 'bun:test';
import { loadEnvConfig } from '@next/env';

// bun test sets NODE_ENV=test, so this reads .env.test.local
loadEnvConfig(process.cwd());

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'Set TEST_DATABASE_URL in .env.test.local (see .env.example). The tests delete all of its data.',
  );
}

// The tests empty every table, so never let them near a real database
const databaseName = new URL(url).pathname.slice(1);

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `TEST_DATABASE_URL points at "${databaseName}". Its name must end in _test, because the tests delete all of its data.`,
  );
}

Object.assign(process.env, {
  DATABASE_URL: url,
  BETTER_AUTH_SECRET: 'test-only-secret-not-used-anywhere-else-0123456789',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GITHUB_CLIENT_ID: 'test',
  GITHUB_CLIENT_SECRET: 'test',
  GOOGLE_CLIENT_ID: 'test',
  GOOGLE_CLIENT_SECRET: 'test',
  // No real email: the email module is replaced below, and if anything still
  // tried to send, it would hit a closed local port instead of Resend
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '9',
  SMTP_USER: 'test',
  SMTP_PASSWORD: 'test',
  EMAIL_FROM: 'test@example.org',
  // Until Phase 4 is finished, routes still build an Appwrite client; the tests
  // only cover routes that no longer use it
  NEXT_PUBLIC_APPWRITE_ENDPOINT: 'http://appwrite.invalid/v1',
  NEXT_PUBLIC_APPWRITE_PROJECT: 'test',
  NEXT_APPWRITE_KEY: 'test',
});

// server-only refuses to load outside Next.js's server build
mock.module('server-only', () => ({}));

// Until 4e removes Appwrite: node-appwrite's fetch layer doesn't load under Bun,
// and the tests only cover routes that have moved to Postgres. Any route that
// still reaches Appwrite fails loudly instead of quietly passing.
mock.module('node-appwrite', () => {
  const unavailable = new Proxy(
    {},
    {
      get: (_, name) => () => {
        throw new Error(`Appwrite is not available in tests (${String(name)})`);
      },
    },
  );
  class Client {
    setEndpoint() {
      return this;
    }
    setProject() {
      return this;
    }
    setKey() {
      return this;
    }
  }

  return {
    Client,
    Databases: class {
      constructor() {
        return unavailable;
      }
    },
    Storage: class {
      constructor() {
        return unavailable;
      }
    },
    Query: new Proxy({}, { get: () => () => '' }),
    ID: { unique: () => 'unique()' },
  };
});

export const sentEmails: { to: string; subject: string; url: string }[] = [];

mock.module('@/lib/email', () => ({
  sendEmail: async () => {},
  sendActionEmail: async ({
    to,
    subject,
    url,
  }: {
    to: string;
    subject: string;
    url: string;
  }) => {
    sentEmails.push({ to, subject, url });
  },
}));

// Bring the test database up to the current schema
const { default: postgres } = await import('postgres');
const { drizzle } = await import('drizzle-orm/postgres-js');
const { migrate } = await import('drizzle-orm/postgres-js/migrator');

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();
