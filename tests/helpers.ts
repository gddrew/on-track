import { eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { app } from '@/server/app';

// Empties every table. Call in beforeAll so each test file starts clean.
export const resetDatabase = async () => {
  await db.execute(
    sql`truncate "user", session, account, verification, workspaces, members, projects, tasks cascade`,
  );
};

let userCount = 0;

// A verified email/password user with a signed-in session
export const createUser = async (label: string) => {
  userCount += 1;
  const email = `${label}-${userCount}@example.org`;
  const password = `password-${label}-${userCount}`;

  await auth.api.signUpEmail({
    body: { name: `User ${label}`, email, password },
  });
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email));

  const response = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const { user: signedIn } = await response.json();

  return { id: signedIn.id as string, email, cookie };
};

export type TestUser = Awaited<ReturnType<typeof createUser>>;

type Body = { json?: unknown; form?: Record<string, string | Blob> };

// Calls the API as a user (or signed out with null) and returns status + data
export const request = async (
  as: TestUser | null,
  method: string,
  path: string,
  { json, form }: Body = {},
) => {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (as) headers.Cookie = as.cookie;

  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) formData.append(key, value);
    body = formData;
  }

  const response = await app.request(`/api${path}`, { method, headers, body });
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text).data;
  } catch {
    data = undefined;
  }

  return { status: response.status, data };
};

export const createWorkspace = async (as: TestUser, name: string) => {
  const { status, data } = await request(as, 'POST', '/workspaces', {
    form: { name },
  });

  if (status !== 200) throw new Error(`createWorkspace failed: ${status}`);

  return data as { $id: string; inviteCode: string; name: string };
};

export const joinWorkspace = async (
  as: TestUser,
  workspace: { $id: string; inviteCode: string },
) => {
  const { status } = await request(as, 'POST', `/workspaces/${workspace.$id}/join`, {
    json: { code: workspace.inviteCode },
  });

  if (status !== 200) throw new Error(`joinWorkspace failed: ${status}`);
};

export const listMembersOf = async (as: TestUser, workspaceId: string) => {
  const { data } = await request(as, 'GET', `/members?workspaceId=${workspaceId}`);

  return data.documents as { $id: string; userId: string; role: string; name: string; email: string }[];
};

// A 1×1 PNG
export const tinyPng = () =>
  new File(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    'tiny.png',
    { type: 'image/png' },
  );

export const MISSING_ID = '00000000-0000-4000-8000-000000000000';
