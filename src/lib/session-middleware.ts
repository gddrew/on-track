import 'server-only';

import {
  type Databases as DatabaseType,
  type Storage as StorageType,
} from 'node-appwrite';
import { createMiddleware } from 'hono/factory';

import { auth } from '@/lib/auth';
import { createAdminClient } from '@/lib/appwrite';

type SessionUser = typeof auth.$Infer.Session.user;

type AdditionalContext = {
  Variables: {
    databases: DatabaseType;
    storage: StorageType;
    // $id keeps the routes' Appwrite-style user.$id working until Phase 4
    user: SessionUser & { $id: string };
  };
};

export const sessionMiddleware = createMiddleware<AdditionalContext>(
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Temporary bridge until Phase 4: the data still lives in Appwrite and is
    // reached with the admin key. Every route checks workspace membership itself.
    const { databases, storage } = await createAdminClient();

    c.set('databases', databases);
    c.set('storage', storage);
    c.set('user', { ...session.user, $id: session.user.id });

    await next();
  },
);
