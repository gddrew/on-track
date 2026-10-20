import { desc, eq, getTableColumns } from 'drizzle-orm';

import { db } from '@/db';
import { members, workspaces } from '@/db/schema';
import { toApiList } from '@/db/api-shape';

// The workspaces the user is a member of, newest first
export const getWorkspaces = async (userId: string) => {
  const rows = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(members, eq(members.workspaceId, workspaces.id))
    .where(eq(members.userId, userId))
    .orderBy(desc(workspaces.createdAt));

  return toApiList(rows);
};
