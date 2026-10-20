export enum MemberRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

// The API shape of a member (see src/db/api-shape.ts)
export type Member = {
  $id: string;
  workspaceId: string;
  userId: string;
  role: MemberRole;
  $createdAt: string;
  $updatedAt: string;
};

// A member with the name and email from their user account
export type PopulatedMember = Member & {
  name: string;
  email: string;
};
