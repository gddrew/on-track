import 'server-only';

import { Client, Databases, Storage } from 'node-appwrite';

// Temporary until Phase 4: users sign in with Better Auth, so Appwrite is only
// reached with the admin key. Callers must check workspace membership.
export async function createAdminClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
    .setKey(process.env.NEXT_APPWRITE_KEY!);

  return {
    get databases() {
      return new Databases(client);
    },
    get storage() {
      return new Storage(client);
    },
  };
}
