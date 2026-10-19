import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { MemberRole } from '@/features/members/types';
import { TaskStatus } from '@/features/tasks/types';

import { user } from './auth-schema';

export * from './auth-schema';

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const memberRole = pgEnum('member_role', MemberRole);
export const taskStatus = pgEnum('task_status', TaskStatus);

export const workspaces = pgTable('workspaces', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  imageUrl: text(),
  inviteCode: text().notNull().unique(),
  // Who created it; access is decided by members.role, so the workspace outlives its creator
  createdBy: text().references(() => user.id, { onDelete: 'set null' }),
  ...timestamps,
});

export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: memberRole().notNull(),
    ...timestamps,
  },
  (t) => [
    // Also serves lookups by workspace_id
    unique().on(t.workspaceId, t.userId),
    index().on(t.userId),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    imageUrl: text(),
    ...timestamps,
  },
  (t) => [index().on(t.workspaceId)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: uuid()
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Removing a member unassigns their tasks
    assigneeId: uuid().references(() => members.id, { onDelete: 'set null' }),
    name: text().notNull(),
    description: text(),
    status: taskStatus().notNull(),
    position: integer().notNull(),
    dueDate: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    // Kanban columns and new-task positioning
    index().on(t.workspaceId, t.status, t.position),
    index().on(t.projectId),
    index().on(t.assigneeId),
  ],
);

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(members),
  projects: many(projects),
  tasks: many(tasks),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [members.workspaceId],
    references: [workspaces.id],
  }),
  user: one(user, { fields: [members.userId], references: [user.id] }),
  assignedTasks: many(tasks),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(members, {
    fields: [tasks.assigneeId],
    references: [members.id],
  }),
}));
