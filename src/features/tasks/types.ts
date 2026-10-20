import type { PopulatedMember } from '@/features/members/types';
import type { Project } from '@/features/projects/types';

export enum TaskStatus {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  CANCELLED = 'CANCELLED',
  DONE = 'DONE',
}

// The assignee filter's value for tasks with nobody assigned
export const UNASSIGNED = 'unassigned';

// The API shape of a task (see src/db/api-shape.ts)
export type Task = {
  $id: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  workspaceId: string;
  projectId: string;
  assigneeId: string | null;
  position: number;
  dueDate: string;
  $createdAt: string;
  $updatedAt: string;
};

// A task with its project and assignee, as the list and detail routes return it
export type PopulatedTask = Task & {
  project: Project;
  assignee: PopulatedMember | null;
};
