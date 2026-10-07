import { z } from 'zod';

export const createWorkspaceShema = z.object({
  name: z.string().trim().min(1, 'Required'),
});
