import 'server-only';

import { createMiddleware } from 'hono/factory';

import { auth } from '@/lib/auth';

type SessionUser = typeof auth.$Infer.Session.user;

export type AdditionalContext = {
  Variables: {
    user: SessionUser;
  };
};

// Every route checks workspace membership itself (see requireMember)
export const sessionMiddleware = createMiddleware<AdditionalContext>(
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('user', session.user);

    await next();
  },
);
