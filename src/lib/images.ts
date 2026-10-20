import { z } from 'zod';

// Workspace and project images are stored as data URLs in the database (Phase 6
// may move them to file storage later). No SVG: it can carry scripts.

export const MAX_IMAGE_BYTES = 1024 * 1024;

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// For <input type='file' accept=…>
export const IMAGE_ACCEPT = '.png, .jpg, .jpeg, .gif, .webp';

// A newly chosen file, or '' when the form has no new file (keep the current image)
export const imageField = z
  .union([
    z
      .instanceof(File)
      .refine((file) => IMAGE_TYPES.includes(file.type), {
        message: 'Use a PNG, JPEG, GIF or WebP image',
      })
      .refine((file) => file.size <= MAX_IMAGE_BYTES, {
        message: 'Image must be 1 MB or smaller',
      }),
    z.string().transform((value) => (value === '' ? undefined : value)),
  ])
  .optional();

export const fileToDataUrl = async (file: File) => {
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  return `data:${file.type};base64,${base64}`;
};
