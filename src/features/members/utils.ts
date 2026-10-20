import type { Context } from 'hono';
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db } from '@/db';
import { members, user } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import type { AdditionalContext } from '@/lib/session-middleware';

import { MemberRole, PopulatedMember } from './types';

export const getMember = async (workspaceId: string, userId: string) => {
  if (!isUuid(workspaceId)) {
    return undefined;
  }

  const [member] = await db
    .select()
    .from(members)
    .where(
      and(eq(members.workspaceId, workspaceId), eq(members.userId, userId)),
    )
    .limit(1);

  return member ? toApi(member) : undefined;
};

interface RequireMemberOptions {
  role?: MemberRole;
  // For routes that look a resource up by its own id: answer a non-member with the
  // same 404 as a missing resource, so other workspaces' ids can't be probed
  orNotFound?: boolean;
}

// The one access check for workspace data: returns the signed-in user's membership
// of this workspace, or stops the request with 403 (or 404, see orNotFound)
export const requireMember = async (
  c: Context<AdditionalContext>,
  workspaceId: string,
  { role, orNotFound }: RequireMemberOptions = {},
) => {
  const member = await getMember(workspaceId, c.get('user').id);

  if (!member) {
    throw orNotFound
      ? new HTTPException(404, { message: 'Not found' })
      : new HTTPException(403, { message: 'Forbidden' });
  }

  if (role && member.role !== role) {
    throw new HTTPException(403, { message: 'Forbidden' });
  }

  return member;
};

// A workspace's members with their name and email, optionally only the given ids
export const listMembers = async (
  workspaceId: string,
  memberIds?: (string | null | undefined)[],
): Promise<PopulatedMember[]> => {
  const ids = memberIds?.filter(isUuid);

  if (!isUuid(workspaceId) || (ids && ids.length === 0)) {
    return [];
  }

  const rows = await db
    .select({
      ...getTableColumns(members),
      name: user.name,
      email: user.email,
    })
    .from(members)
    .innerJoin(user, eq(user.id, members.userId))
    .where(
      and(
        eq(members.workspaceId, workspaceId),
        ids ? inArray(members.id, ids) : undefined,
      ),
    )
    .orderBy(asc(members.createdAt));

  return rows.map((row) => ({
    ...toApi(row),
    role: row.role as MemberRole,
    name: row.name || row.email,
  }));
};
