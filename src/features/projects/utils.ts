import type { Context } from 'hono';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { db } from '@/db';
import { projects } from '@/db/schema';
import { isUuid, toApi } from '@/db/api-shape';
import { requireMember } from '@/features/members/utils';
import type { MemberRole } from '@/features/members/types';
import type { AdditionalContext } from '@/lib/session-middleware';

import type { Project } from './types';

export const findProject = async (projectId: string) => {
  if (!isUuid(projectId)) {
    return undefined;
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return project ? toApi(project) : undefined;
};

// A project the signed-in user can reach. A missing project and another
// workspace's project get the same 404, so ids can't be probed.
export const requireProject = async (
  c: Context<AdditionalContext>,
  projectId: string,
  { role }: { role?: MemberRole } = {},
) => {
  const project = await findProject(projectId);

  if (!project) {
    throw new HTTPException(404, { message: 'Not found' });
  }

  const member = await requireMember(c, project.workspaceId, {
    role,
    orNotFound: true,
  });

  return { project, member };
};

// A workspace's projects, newest first, optionally only the given ids
export const listProjects = async (
  workspaceId: string,
  projectIds?: (string | null | undefined)[],
): Promise<Project[]> => {
  const ids = projectIds?.filter(isUuid);

  if (!isUuid(workspaceId) || (ids && ids.length === 0)) {
    return [];
  }

  const rows = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        ids ? inArray(projects.id, ids) : undefined,
      ),
    )
    .orderBy(desc(projects.createdAt));

  return rows.map(toApi);
};
