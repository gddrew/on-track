// The API shape of a workspace (see src/db/api-shape.ts)
export type Workspace = {
  $id: string;
  name: string;
  imageUrl: string | null;
  inviteCode: string;
  createdBy: string | null;
  $createdAt: string;
  $updatedAt: string;
};
