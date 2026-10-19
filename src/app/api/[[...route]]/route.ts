import { Hono } from 'hono';
import { handle } from 'hono/vercel';

import { auth } from '@/lib/auth';
import members from '@/features/members/server/route';
import workspaces from '@/features/workspaces/server/route';
import projects from '@/features/projects/server/route';
import tasks from '@/features/tasks/server/route';

const app = new Hono().basePath('/api');

// Better Auth handles sign-up, sign-in, sign-out and sessions under /api/auth
app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const routes = app
  .route('/workspaces', workspaces)
  .route('/members', members)
  .route('/projects', projects)
  .route('/tasks', tasks);

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
