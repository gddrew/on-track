import { beforeAll, describe, expect, test } from 'bun:test';

import {
  createProject,
  createUser,
  createWorkspace,
  joinWorkspace,
  listMembersOf,
  MISSING_ID,
  request,
  resetDatabase,
  type TestUser,
} from './helpers';

// Alice runs workspace A and Carol is a plain member of it.
// Bob runs workspace B and never joins A.
let alice: TestUser;
let bob: TestUser;
let carol: TestUser;
let workspaceA: Awaited<ReturnType<typeof createWorkspace>>;
let workspaceB: Awaited<ReturnType<typeof createWorkspace>>;
let projectA: { $id: string };
let projectB: { $id: string };
let aliceMemberId: string;
let carolMemberId: string;
let bobMemberId: string;

type ApiTask = {
  $id: string;
  name: string;
  status: string;
  position: number;
  dueDate: string;
  assigneeId: string | null;
  projectId: string;
  project: { $id: string; name: string };
  assignee: { $id: string; name: string } | null;
};

const DUE = '2026-11-02T05:00:00.000Z';

const createTask = async (
  as: TestUser,
  fields: Record<string, unknown> = {},
) => {
  const { status, data } = await request(as, 'POST', '/tasks', {
    json: {
      name: 'Task',
      status: 'TODO',
      workspaceId: workspaceA.$id,
      projectId: projectA.$id,
      dueDate: DUE,
      ...fields,
    },
  });

  if (status !== 200) throw new Error(`createTask failed: ${status}`);

  return data as ApiTask;
};

const listTasks = async (as: TestUser, query: Record<string, string> = {}) => {
  const params = new URLSearchParams({ workspaceId: workspaceA.$id, ...query });
  const { status, data } = await request(as, 'GET', `/tasks?${params}`);

  return { status, tasks: data?.documents as ApiTask[], total: data?.total };
};

const memberIdOf = async (as: TestUser, workspaceId: string, userId: string) =>
  (await listMembersOf(as, workspaceId)).find((m) => m.userId === userId)!.$id;

beforeAll(async () => {
  await resetDatabase();
  alice = await createUser('alice');
  bob = await createUser('bob');
  carol = await createUser('carol');
  workspaceA = await createWorkspace(alice, 'Food Bank');
  workspaceB = await createWorkspace(bob, 'Animal Shelter');
  await joinWorkspace(carol, workspaceA);
  projectA = await createProject(alice, workspaceA.$id, 'Pantry');
  projectB = await createProject(bob, workspaceB.$id, 'Kennels');
  aliceMemberId = await memberIdOf(alice, workspaceA.$id, alice.id);
  carolMemberId = await memberIdOf(alice, workspaceA.$id, carol.id);
  bobMemberId = await memberIdOf(bob, workspaceB.$id, bob.id);
});

describe('creating', () => {
  test('signed out gets 401', async () => {
    const { status } = await request(null, 'POST', '/tasks', { json: {} });

    expect(status).toBe(401);
  });

  test('a plain member can create an assigned task', async () => {
    const task = await createTask(carol, { name: 'Stock shelves', assigneeId: aliceMemberId });

    expect(task).toMatchObject({
      name: 'Stock shelves',
      assigneeId: aliceMemberId,
      projectId: projectA.$id,
      dueDate: DUE,
    });
  });

  test('a task can be left unassigned', async () => {
    const task = await createTask(alice, { name: 'Nobody yet' });

    expect(task.assigneeId).toBeNull();
  });

  test('new tasks go to the bottom of their column', async () => {
    const first = await createTask(alice, { status: 'IN_REVIEW' });
    const second = await createTask(alice, { status: 'IN_REVIEW' });

    expect(second.position).toBeGreaterThan(first.position);
  });

  test("can't create a task in someone else's workspace", async () => {
    const { status } = await request(bob, 'POST', '/tasks', {
      json: {
        name: 'Sneaky',
        status: 'TODO',
        workspaceId: workspaceA.$id,
        projectId: projectA.$id,
        dueDate: DUE,
      },
    });

    expect(status).toBe(403);
  });

  test("can't assign someone from another workspace", async () => {
    const { status } = await request(alice, 'POST', '/tasks', {
      json: {
        name: 'Wrong assignee',
        status: 'TODO',
        workspaceId: workspaceA.$id,
        projectId: projectA.$id,
        assigneeId: bobMemberId,
        dueDate: DUE,
      },
    });

    expect(status).toBe(400);
  });
});

describe('listing', () => {
  test('tasks come with their project and assignee', async () => {
    const assigned = await createTask(alice, { name: 'With people', assigneeId: carolMemberId });
    const unassigned = await createTask(alice, { name: 'Without people' });

    const { status, tasks } = await listTasks(alice);
    const byId = new Map(tasks.map((t) => [t.$id, t]));

    expect(status).toBe(200);
    expect(byId.get(assigned.$id)).toMatchObject({
      project: { $id: projectA.$id, name: 'Pantry' },
      assignee: { $id: carolMemberId, name: 'User carol' },
    });
    expect(byId.get(unassigned.$id)!.assignee).toBeNull();
  });

  test("lists only the workspace's own tasks", async () => {
    const other = await request(bob, 'POST', '/tasks', {
      json: {
        name: 'Walk dogs',
        status: 'TODO',
        workspaceId: workspaceB.$id,
        projectId: projectB.$id,
        dueDate: DUE,
      },
    });
    const { tasks } = await listTasks(alice);

    expect(other.status).toBe(200);
    expect(tasks.map((t) => t.$id)).not.toContain(other.data.$id);
  });

  test("can't list another workspace's tasks", async () => {
    expect((await listTasks(bob)).status).toBe(403);
  });

  test('filters by status, assignee and unassigned', async () => {
    const done = await createTask(alice, { status: 'DONE', assigneeId: carolMemberId });

    const byStatus = await listTasks(alice, { status: 'DONE' });
    const byAssignee = await listTasks(alice, { assigneeId: carolMemberId });
    const byNobody = await listTasks(alice, { assigneeId: 'unassigned' });

    expect(byStatus.tasks.every((t) => t.status === 'DONE')).toBe(true);
    expect(byStatus.tasks.map((t) => t.$id)).toContain(done.$id);
    expect(byAssignee.tasks.every((t) => t.assigneeId === carolMemberId)).toBe(true);
    expect(byNobody.tasks.length).toBeGreaterThan(0);
    expect(byNobody.tasks.every((t) => t.assigneeId === null)).toBe(true);
  });

  test('filters by project and due date', async () => {
    const otherProject = await createProject(alice, workspaceA.$id, 'Delivery');
    const task = await createTask(alice, {
      projectId: otherProject.$id,
      dueDate: '2026-12-24T06:00:00.000Z',
    });

    const byProject = await listTasks(alice, { projectId: otherProject.$id });
    const byDate = await listTasks(alice, { dueDate: '2026-12-24T06:00:00.000Z' });

    expect(byProject.tasks.map((t) => t.$id)).toEqual([task.$id]);
    expect(byDate.tasks.map((t) => t.$id)).toEqual([task.$id]);
  });

  test('search ignores case and treats % literally', async () => {
    const match = await createTask(alice, { name: 'Order 100% Juice' });
    await createTask(alice, { name: 'Order 1000 cans' });

    const { tasks } = await listTasks(alice, { search: '100% juice' });

    expect(tasks.map((t) => t.$id)).toEqual([match.$id]);
  });

  test("an id that can't exist matches nothing", async () => {
    const { status, tasks } = await listTasks(alice, { projectId: 'not-a-uuid' });

    expect(status).toBe(200);
    expect(tasks).toEqual([]);
  });
});

describe('reading one', () => {
  test('a member gets the task with its project and assignee', async () => {
    const task = await createTask(alice, { assigneeId: carolMemberId });
    const { status, data } = await request(carol, 'GET', `/tasks/${task.$id}`);

    expect(status).toBe(200);
    expect(data).toMatchObject({
      $id: task.$id,
      project: { $id: projectA.$id },
      assignee: { $id: carolMemberId },
    });
  });

  test("another workspace's task looks the same as a missing one", async () => {
    const task = await createTask(alice);

    for (const path of [`/tasks/${task.$id}`, `/tasks/${MISSING_ID}`, '/tasks/not-a-uuid']) {
      expect((await request(bob, 'GET', path)).status).toBe(404);
    }
  });
});

describe('editing', () => {
  test('a plain member can rename and unassign a task', async () => {
    const task = await createTask(alice, { assigneeId: aliceMemberId });
    const { status, data } = await request(carol, 'PATCH', `/tasks/${task.$id}`, {
      json: { name: 'Renamed', assigneeId: null },
    });

    expect(status).toBe(200);
    expect(data).toMatchObject({ name: 'Renamed', assigneeId: null, projectId: projectA.$id });
  });

  test('fields left out are kept', async () => {
    const task = await createTask(alice, { assigneeId: aliceMemberId });
    const { data } = await request(alice, 'PATCH', `/tasks/${task.$id}`, {
      json: { description: 'Notes' },
    });

    expect(data).toMatchObject({ description: 'Notes', assigneeId: aliceMemberId, name: 'Task' });
  });

  test("can't edit another workspace's task", async () => {
    const task = await createTask(alice, { name: 'Mine' });
    const { status } = await request(bob, 'PATCH', `/tasks/${task.$id}`, {
      json: { name: 'Taken' },
    });

    expect(status).toBe(404);
    expect((await request(alice, 'GET', `/tasks/${task.$id}`)).data.name).toBe('Mine');
  });

  test("can't move a task to another workspace's project", async () => {
    const task = await createTask(alice);
    const { status } = await request(alice, 'PATCH', `/tasks/${task.$id}`, {
      json: { projectId: projectB.$id },
    });

    expect(status).toBe(400);
  });
});

describe('deleting', () => {
  test("can't delete another workspace's task", async () => {
    const task = await createTask(alice);

    expect((await request(bob, 'DELETE', `/tasks/${task.$id}`)).status).toBe(404);
    expect((await request(alice, 'GET', `/tasks/${task.$id}`)).status).toBe(200);
  });

  test('a plain member can delete a task', async () => {
    const task = await createTask(alice);

    expect((await request(carol, 'DELETE', `/tasks/${task.$id}`)).status).toBe(200);
    expect((await request(alice, 'GET', `/tasks/${task.$id}`)).status).toBe(404);
  });

  test("deleting a project removes its tasks", async () => {
    const project = await createProject(alice, workspaceA.$id, 'Short-lived');
    const task = await createTask(alice, { projectId: project.$id });

    await request(alice, 'DELETE', `/projects/${project.$id}`);

    expect((await request(alice, 'GET', `/tasks/${task.$id}`)).status).toBe(404);
  });

  test('removing a member unassigns their tasks', async () => {
    const dave = await createUser('dave');
    await joinWorkspace(dave, workspaceA);
    const daveMemberId = await memberIdOf(alice, workspaceA.$id, dave.id);
    const task = await createTask(alice, { assigneeId: daveMemberId });

    await request(alice, 'DELETE', `/members/${daveMemberId}`);

    const { status, data } = await request(alice, 'GET', `/tasks/${task.$id}`);

    expect(status).toBe(200);
    expect(data.assignee).toBeNull();
  });
});

describe('kanban bulk update', () => {
  test('moves tasks between columns', async () => {
    const one = await createTask(alice, { status: 'BACKLOG' });
    const two = await createTask(alice, { status: 'BACKLOG' });

    const { status } = await request(carol, 'POST', '/tasks/bulk-update', {
      json: {
        tasks: [
          { $id: one.$id, status: 'IN_PROGRESS', position: 1000 },
          { $id: two.$id, status: 'BACKLOG', position: 1000 },
        ],
      },
    });
    const moved = (await request(alice, 'GET', `/tasks/${one.$id}`)).data;

    expect(status).toBe(200);
    expect(moved).toMatchObject({ status: 'IN_PROGRESS', position: 1000 });
  });

  test("can't move another workspace's tasks", async () => {
    const task = await createTask(alice, { status: 'TODO' });
    const { status } = await request(bob, 'POST', '/tasks/bulk-update', {
      json: { tasks: [{ $id: task.$id, status: 'DONE', position: 1000 }] },
    });

    expect(status).toBe(403);
    expect((await request(alice, 'GET', `/tasks/${task.$id}`)).data.status).toBe('TODO');
  });

  test('tasks from two workspaces are refused, and nothing changes', async () => {
    const mine = await createTask(alice, { status: 'TODO' });
    const theirs = await request(bob, 'POST', '/tasks', {
      json: {
        name: 'Theirs',
        status: 'TODO',
        workspaceId: workspaceB.$id,
        projectId: projectB.$id,
        dueDate: DUE,
      },
    });

    const { status } = await request(alice, 'POST', '/tasks/bulk-update', {
      json: {
        tasks: [
          { $id: mine.$id, status: 'DONE', position: 1000 },
          { $id: theirs.data.$id, status: 'DONE', position: 1000 },
        ],
      },
    });

    expect(status).toBe(400);
    expect((await request(alice, 'GET', `/tasks/${mine.$id}`)).data.status).toBe('TODO');
  });

  test('an unknown task id is refused', async () => {
    const task = await createTask(alice, { status: 'TODO' });

    for (const badId of [MISSING_ID, 'not-a-uuid']) {
      const { status } = await request(alice, 'POST', '/tasks/bulk-update', {
        json: {
          tasks: [
            { $id: task.$id, status: 'DONE', position: 1000 },
            { $id: badId, status: 'DONE', position: 2000 },
          ],
        },
      });

      expect(status).toBe(400);
    }
  });
});
