// The API shape of a project (see src/db/api-shape.ts)
export type Project = {
  $id: string;
  name: string;
  imageUrl: string | null;
  workspaceId: string;
  $createdAt: string;
  $updatedAt: string;
};
