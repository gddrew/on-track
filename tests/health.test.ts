import { expect, test } from 'bun:test';

import { request } from './helpers';

test('the health check answers without signing in', async () => {
  expect((await request(null, 'GET', '/health')).status).toBe(200);
});
