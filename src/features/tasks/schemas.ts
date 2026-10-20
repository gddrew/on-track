import { z } from 'zod';

import { TaskStatus } from './types';

// Show 'Required' for missing fields instead of zod's default type error
const requiredError = {
  error: (issue: { input?: unknown }) =>
    issue.input === undefined ? 'Required' : undefined,
};

export const createTaskSchema = z.object({
  name: z.string(requiredError).trim().min(1, 'Required'),
  status: z.enum(TaskStatus, requiredError),
  workspaceId: z.string(requiredError).trim().min(1, 'Required'),
  projectId: z.string(requiredError).trim().min(1, 'Required'),
  dueDate: z.coerce.date<Date>({ error: 'Invalid date' }),
  // null (or left out) means nobody is assigned
  assigneeId: z.string().trim().min(1).nullish(),
  description: z.string().nullish(),
});
