import { createAuthClient } from 'better-auth/react';

// Talks to /api/auth on the current origin
export const authClient = createAuthClient();
