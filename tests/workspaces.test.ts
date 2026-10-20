import { beforeAll, describe, expect, test } from 'bun:test';

import {
  createUser,
  createWorkspace,
  joinWorkspace,
  listMembersOf,
  MISSING_ID,
  request,
  resetDatabase,
  tinyPng,
  type TestUser,
} from './helpers';

// Alice runs workspace A. Bob runs workspace B and never joins A.
let alice: TestUser;
let bob: TestUser;
let workspaceA: Awaited<ReturnType<typeof createWorkspace>>;
let workspaceB: Awaited<ReturnType<typeof createWorkspace>>;

beforeAll(async () => {
  await resetDatabase();
  alice = await createUser('alice');
  bob = await createUser('bob');
  workspaceA = await createWorkspace(alice, 'Food Bank');
  workspaceB = await createWorkspace(bob, 'Animal Shelter');
});

describe('creating and listing', () => {
  test('signed out gets 401', async () => {
    expect((await request(null, 'GET', '/workspaces')).status).toBe(401);
  });

  test('the creator is the admin', async () => {
    const members = await listMembersOf(alice, workspaceA.$id);

    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: alice.id, role: 'ADMIN' });
  });

  test('each user lists only their own workspaces', async () => {
    const { data } = await request(alice, 'GET', '/workspaces');

    expect(data.total).toBe(1);
    expect(data.documents.map((w: { $id: string }) => w.$id)).toEqual([
      workspaceA.$id,
    ]);
  });

  test('invite codes are 6 letters or digits', () => {
    expect(workspaceA.inviteCode).toMatch(/^[A-Za-z0-9]{6}$/);
  });
});

describe('images', () => {
  test('a PNG is stored as a data URL', async () => {
    const { status, data } = await request(alice, 'POST', '/workspaces', {
      form: { name: 'With image', image: tinyPng() },
    });

    expect(status).toBe(200);
    expect(data.imageUrl).toStartWith('data:image/png;base64,');
  });

  test('SVG is refused', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.svg', {
      type: 'image/svg+xml',
    });
    const { status } = await request(alice, 'POST', '/workspaces', {
      form: { name: 'SVG', image: svg },
    });

    expect(status).toBe(400);
  });

  test('images over 1 MB are refused', async () => {
    const big = new File([new Uint8Array(1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });
    const { status } = await request(alice, 'POST', '/workspaces', {
      form: { name: 'Big', image: big },
    });

    expect(status).toBe(400);
  });

  test('editing without a new file keeps the image', async () => {
    const { data: created } = await request(alice, 'POST', '/workspaces', {
      form: { name: 'Keep image', image: tinyPng() },
    });
    const { data: updated } = await request(alice, 'PATCH', `/workspaces/${created.$id}`, {
      form: { name: 'Renamed', image: '' },
    });

    expect(updated.name).toBe('Renamed');
    expect(updated.imageUrl).toBe(created.imageUrl);
  });
});

describe("another workspace can't be reached", () => {
  test.each([
    ['read it', 'GET', ''],
    ['rename it', 'PATCH', ''],
    ['delete it', 'DELETE', ''],
    ['reset its invite code', 'POST', '/reset-invite-code'],
  ])('Bob cannot %s (403)', async (_, method, suffix) => {
    const { status } = await request(bob, method, `/workspaces/${workspaceA.$id}${suffix}`, {
      form: method === 'PATCH' ? { name: 'Hacked' } : undefined,
    });

    expect(status).toBe(403);
  });

  test('a made-up or malformed id gets 403, not an error', async () => {
    expect((await request(bob, 'GET', `/workspaces/${MISSING_ID}`)).status).toBe(403);
    expect((await request(bob, 'GET', '/workspaces/not-a-uuid')).status).toBe(403);
  });
});

describe('invite page info', () => {
  test('requires the invite code', async () => {
    const path = `/workspaces/${workspaceA.$id}/info`;

    expect((await request(bob, 'GET', path)).status).toBe(400);
    expect((await request(bob, 'GET', `${path}?inviteCode=WRONG1`)).status).toBe(404);
  });

  test('a missing workspace looks the same as a wrong code', async () => {
    const { status } = await request(bob, 'GET', `/workspaces/${MISSING_ID}/info?inviteCode=WRONG1`);

    expect(status).toBe(404);
    expect((await request(bob, 'GET', '/workspaces/not-a-uuid/info?inviteCode=x')).status).toBe(404);
  });

  test('with the right code shows only id, name and image', async () => {
    const { status, data } = await request(
      bob,
      'GET',
      `/workspaces/${workspaceA.$id}/info?inviteCode=${workspaceA.inviteCode}`,
    );

    expect(status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(['$id', 'imageUrl', 'name']);
  });
});

describe('joining and roles', () => {
  let carol: TestUser;

  beforeAll(async () => {
    carol = await createUser('carol');
  });

  test('a wrong code is refused', async () => {
    const { status } = await request(carol, 'POST', `/workspaces/${workspaceA.$id}/join`, {
      json: { code: 'WRONG1' },
    });

    expect(status).toBe(400);
  });

  test('the right code makes a regular member', async () => {
    await joinWorkspace(carol, workspaceA);

    const members = await listMembersOf(carol, workspaceA.$id);
    expect(members.find((m) => m.userId === carol.id)?.role).toBe('MEMBER');

    const { data } = await request(carol, 'GET', '/workspaces');
    expect(data.documents.map((w: { $id: string }) => w.$id)).toContain(workspaceA.$id);
  });

  test('joining twice is refused', async () => {
    const { status } = await request(carol, 'POST', `/workspaces/${workspaceA.$id}/join`, {
      json: { code: workspaceA.inviteCode },
    });

    expect(status).toBe(400);
  });

  test.each([
    ['rename it', 'PATCH', ''],
    ['delete it', 'DELETE', ''],
    ['reset its invite code', 'POST', '/reset-invite-code'],
  ])('a regular member cannot %s (403)', async (_, method, suffix) => {
    const { status } = await request(carol, method, `/workspaces/${workspaceA.$id}${suffix}`, {
      form: method === 'PATCH' ? { name: 'Renamed by member' } : undefined,
    });

    expect(status).toBe(403);
  });

  test('a member can read the workspace', async () => {
    const { status, data } = await request(carol, 'GET', `/workspaces/${workspaceA.$id}`);

    expect(status).toBe(200);
    expect(data.name).toBe('Food Bank');
  });

  test('resetting the invite code stops the old link working', async () => {
    const { data } = await request(alice, 'POST', `/workspaces/${workspaceA.$id}/reset-invite-code`);
    const dave = await createUser('dave');

    expect(data.inviteCode).not.toBe(workspaceA.inviteCode);
    expect(
      (await request(dave, 'POST', `/workspaces/${workspaceA.$id}/join`, {
        json: { code: workspaceA.inviteCode },
      })).status,
    ).toBe(400);

    workspaceA.inviteCode = data.inviteCode;
  });
});

describe('deleting', () => {
  test('an admin deletes the workspace and its memberships', async () => {
    const erin = await createUser('erin');
    const workspace = await createWorkspace(erin, 'Short-lived');

    expect((await request(erin, 'DELETE', `/workspaces/${workspace.$id}`)).status).toBe(200);
    expect((await request(erin, 'GET', '/workspaces')).data.total).toBe(0);
    expect((await request(erin, 'GET', `/members?workspaceId=${workspace.$id}`)).status).toBe(403);
  });

  test("Bob's workspace was never affected", async () => {
    const { status, data } = await request(bob, 'GET', `/workspaces/${workspaceB.$id}`);

    expect(status).toBe(200);
    expect(data.name).toBe('Animal Shelter');
  });
});
