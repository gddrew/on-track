import { beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { projects } from '@/db/schema';

import {
  createProject,
  createUser,
  createWorkspace,
  joinWorkspace,
  MISSING_ID,
  request,
  resetDatabase,
  tinyPng,
  type TestUser,
} from './helpers';

// Alice runs workspace A and Carol is a plain member of it.
// Bob runs workspace B and never joins A.
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let workspaceA: Awaited<ReturnType<typeof createWorkspace>>;
let workspaceB: Awaited<ReturnType<typeof createWorkspace>>;

beforeAll(async () => {
  await resetDatabase();
  alice = await createUser('alice');
  bob = await createUser('bob');
  carol = await createUser('carol');
  workspaceA = await createWorkspace(alice, 'Food Bank');
  workspaceB = await createWorkspace(bob, 'Animal Shelter');
  await joinWorkspace(carol, workspaceA);
});

describe('creating', () => {
  test('signed out gets 401', async () => {
    const { status } = await request(null, 'POST', '/projects', {
      form: { name: 'X', workspaceId: workspaceA.$id },
    });

    expect(status).toBe(401);
  });

  test('a plain member can create a project', async () => {
    const project = await createProject(carol, workspaceA.$id, 'Pantry');

    expect(project).toMatchObject({
      name: 'Pantry',
      workspaceId: workspaceA.$id,
      imageUrl: null,
    });
  });

  test("can't create a project in someone else's workspace", async () => {
    const { status } = await request(bob, 'POST', '/projects', {
      form: { name: 'Sneaky', workspaceId: workspaceA.$id },
    });

    expect(status).toBe(403);
  });

  test('a PNG is stored as a data URL', async () => {
    const project = await createProject(alice, workspaceA.$id, 'Logo', tinyPng());

    expect(project.imageUrl).toStartWith('data:image/png;base64,');
  });

  test('SVG is refused', async () => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.svg', {
      type: 'image/svg+xml',
    });
    const { status } = await request(alice, 'POST', '/projects', {
      form: { name: 'SVG', workspaceId: workspaceA.$id, image: svg },
    });

    expect(status).toBe(400);
  });
});

describe('reading', () => {
  test("lists only the workspace's own projects", async () => {
    const own = await createProject(alice, workspaceA.$id, 'Listed');
    const other = await createProject(bob, workspaceB.$id, 'Not listed');

    const { status, data } = await request(
      alice,
      'GET',
      `/projects?workspaceId=${workspaceA.$id}`,
    );
    const ids = data.documents.map((p: { $id: string }) => p.$id);

    expect(status).toBe(200);
    expect(ids).toContain(own.$id);
    expect(ids).not.toContain(other.$id);
    expect(data.total).toBe(ids.length);
  });

  test("can't list another workspace's projects", async () => {
    const { status } = await request(
      bob,
      'GET',
      `/projects?workspaceId=${workspaceA.$id}`,
    );

    expect(status).toBe(403);
  });

  test('a member can get a project', async () => {
    const project = await createProject(alice, workspaceA.$id, 'Get me');
    const { status, data } = await request(carol, 'GET', `/projects/${project.$id}`);

    expect(status).toBe(200);
    expect(data.$id).toBe(project.$id);
  });

  test("another workspace's project looks the same as a missing one", async () => {
    const project = await createProject(alice, workspaceA.$id, 'Hidden');

    for (const path of [
      `/projects/${project.$id}`,
      `/projects/${MISSING_ID}`,
      '/projects/not-a-uuid',
    ]) {
      expect((await request(bob, 'GET', path)).status).toBe(404);
    }
  });
});

describe('editing', () => {
  test('a plain member can rename a project and the image is kept', async () => {
    const project = await createProject(alice, workspaceA.$id, 'Old', tinyPng());
    const { status, data } = await request(carol, 'PATCH', `/projects/${project.$id}`, {
      form: { name: 'New', image: '' },
    });

    expect(status).toBe(200);
    expect(data.name).toBe('New');
    expect(data.imageUrl).toBe(project.imageUrl);
  });

  test("can't edit another workspace's project", async () => {
    const project = await createProject(alice, workspaceA.$id, 'Mine');
    const { status } = await request(bob, 'PATCH', `/projects/${project.$id}`, {
      form: { name: 'Taken' },
    });

    expect(status).toBe(404);
    expect((await request(alice, 'GET', `/projects/${project.$id}`)).data.name).toBe(
      'Mine',
    );
  });
});

describe('deleting', () => {
  test("a plain member can't delete a project", async () => {
    const project = await createProject(alice, workspaceA.$id, 'Keep');
    const { status } = await request(carol, 'DELETE', `/projects/${project.$id}`);

    expect(status).toBe(403);
  });

  test("can't delete another workspace's project", async () => {
    const project = await createProject(alice, workspaceA.$id, 'Keep too');
    const { status } = await request(bob, 'DELETE', `/projects/${project.$id}`);

    expect(status).toBe(404);
    expect((await request(alice, 'GET', `/projects/${project.$id}`)).status).toBe(200);
  });

  test('an admin can delete a project', async () => {
    const project = await createProject(carol, workspaceA.$id, 'Gone');
    const { status } = await request(alice, 'DELETE', `/projects/${project.$id}`);

    expect(status).toBe(200);
    expect((await request(alice, 'GET', `/projects/${project.$id}`)).status).toBe(404);
  });

  test("deleting a workspace removes its projects", async () => {
    const workspace = await createWorkspace(alice, 'Short-lived');
    const project = await createProject(alice, workspace.$id, 'Goes with it');

    await request(alice, 'DELETE', `/workspaces/${workspace.$id}`);

    const rows = await db.select().from(projects).where(eq(projects.id, project.$id));

    expect(rows).toHaveLength(0);
  });
});

describe('tasks', () => {
  test("a task can't use another workspace's project", async () => {
    const otherProject = await createProject(bob, workspaceB.$id, 'Elsewhere');
    const [member] = (
      await request(alice, 'GET', `/members?workspaceId=${workspaceA.$id}`)
    ).data.documents;

    const { status } = await request(alice, 'POST', '/tasks', {
      json: {
        name: 'Cross-workspace',
        status: 'TODO',
        workspaceId: workspaceA.$id,
        projectId: otherProject.$id,
        assigneeId: member.$id,
        dueDate: new Date().toISOString(),
      },
    });

    expect(status).toBe(400);
  });
});
