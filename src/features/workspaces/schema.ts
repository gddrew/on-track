import { z } from 'zod';

import { imageField } from '@/lib/images';

export const createWorkspaceShema = z.object({
  name: z.string().trim().min(1, 'Required'),
  image: imageField,
});

export const updateWorkspaceShema = z.object({
  name: z.string().trim().min(1, 'Must be 1 or more characters'),
  image: imageField,
});
