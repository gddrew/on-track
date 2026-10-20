import { Hono } from 'hono';

import { auth } from '@/lib/auth';
import members from '@/features/members/server/route';
import workspaces from '@/features/workspaces/server/route';
import projects from '@/features/projects/server/route';
import tasks from '@/features/tasks/server/route';

// The whole API. src/app/api/[[...route]]/route.ts serves it through Next.js, and
// the tests in tests/ call it directly.
export const app = new Hono().basePath('/api');

// Better Auth handles sign-up, sign-in, sign-out and sessions under /api/auth
app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .route('/workspaces', workspaces)
  .route('/members', members)
  .route('/projects', projects)
  .route('/tasks', tasks);

export type AppType = typeof routes;
