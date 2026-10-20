import { hc } from 'hono/client';

import type { AppType } from '@/server/app';

// Same origin as the page, so one build works at any address
export const client = hc<AppType>('/');
