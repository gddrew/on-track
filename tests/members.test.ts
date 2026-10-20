import { beforeAll, describe, expect, test } from 'bun:test';

import {
  createUser,
  createWorkspace,
  joinWorkspace,
  listMembersOf,
  MISSING_ID,
  request,
  resetDatabase,
  type TestUser,
} from './helpers';

// Workspace A: Alice (admin), Carol and Dan (members). Workspace B: Bob (admin).
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let dan: TestUser;
let workspaceA: Awaited<ReturnType<typeof createWorkspace>>;
let workspaceB: Awaited<ReturnType<typeof createWorkspace>>;

const memberIdOf = async (as: TestUser, workspaceId: string, who: TestUser) =>
  (await listMembersOf(as, workspaceId)).find((m) => m.userId === who.id)!.$id;

beforeAll(async () => {
  await resetDatabase();
  [alice, bob, carol, dan] = await Promise.all(
    ['alice', 'bob', 'carol', 'dan'].map(createUser),
  );
  workspaceA = await createWorkspace(alice, 'Food Bank');
  workspaceB = await createWorkspace(bob, 'Animal Shelter');
  await joinWorkspace(carol, workspaceA);
  await joinWorkspace(dan, workspaceA);
});

describe('listing', () => {
  test("shows names and emails of this workspace's members only", async () => {
    const members = await listMembersOf(carol, workspaceA.$id);

    expect(members.map((m) => m.email).sort()).toEqual(
      [alice.email, carol.email, dan.email].sort(),
    );
    expect(members.every((m) => m.name.startsWith('User '))).toBe(true);
  });

  test("Bob cannot list workspace A's members", async () => {
    expect((await request(bob, 'GET', `/members?workspaceId=${workspaceA.$id}`)).status).toBe(403);
  });
});

describe("another workspace's members can't be touched", () => {
  test("Bob gets 404 for A's member ids, the same as for ids that don't exist", async () => {
    const carolId = await memberIdOf(alice, workspaceA.$id, carol);

    for (const id of [carolId, MISSING_ID, 'not-a-uuid']) {
      expect((await request(bob, 'DELETE', `/members/${id}`)).status).toBe(404);
      expect(
        (await request(bob, 'PATCH', `/members/${id}`, { json: { role: 'ADMIN' } })).status,
      ).toBe(404);
    }
  });

  test("A's admin cannot touch B's members either", async () => {
    const bobId = await memberIdOf(bob, workspaceB.$id, bob);

    expect((await request(alice, 'DELETE', `/members/${bobId}`)).status).toBe(404);
    expect(
      (await request(alice, 'PATCH', `/members/${bobId}`, { json: { role: 'MEMBER' } })).status,
    ).toBe(404);
  });
});

describe('roles within a workspace', () => {
  test('a member cannot change roles', async () => {
    const aliceId = await memberIdOf(carol, workspaceA.$id, alice);
    const danId = await memberIdOf(carol, workspaceA.$id, dan);

    expect(
      (await request(carol, 'PATCH', `/members/${aliceId}`, { json: { role: 'MEMBER' } })).status,
    ).toBe(403);
    expect(
      (await request(carol, 'PATCH', `/members/${danId}`, { json: { role: 'ADMIN' } })).status,
    ).toBe(403);
  });

  test('a member cannot remove someone else', async () => {
    const danId = await memberIdOf(carol, workspaceA.$id, dan);

    expect((await request(carol, 'DELETE', `/members/${danId}`)).status).toBe(403);
  });

  test('an admin can change a role', async () => {
    const danId = await memberIdOf(alice, workspaceA.$id, dan);

    expect(
      (await request(alice, 'PATCH', `/members/${danId}`, { json: { role: 'ADMIN' } })).status,
    ).toBe(200);
    expect((await listMembersOf(alice, workspaceA.$id)).find((m) => m.$id === danId)?.role).toBe(
      'ADMIN',
    );
  });

  test('a member can leave', async () => {
    const carolId = await memberIdOf(carol, workspaceA.$id, carol);

    expect((await request(carol, 'DELETE', `/members/${carolId}`)).status).toBe(200);
    expect((await request(carol, 'GET', `/workspaces/${workspaceA.$id}`)).status).toBe(403);
  });

  test('an admin can remove a member', async () => {
    const danId = await memberIdOf(alice, workspaceA.$id, dan);

    expect((await request(alice, 'DELETE', `/members/${danId}`)).status).toBe(200);
  });

  test('the only member can be neither removed nor downgraded', async () => {
    const bobId = await memberIdOf(bob, workspaceB.$id, bob);

    expect((await request(bob, 'DELETE', `/members/${bobId}`)).status).toBe(400);
    expect(
      (await request(bob, 'PATCH', `/members/${bobId}`, { json: { role: 'MEMBER' } })).status,
    ).toBe(400);
  });
});
