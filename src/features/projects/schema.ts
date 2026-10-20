import { z } from 'zod';

import { imageField } from '@/lib/images';

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Required'),
  image: imageField,
  workspaceId: z.string(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Minimum 1 character required').optional(),
  image: imageField,
});
