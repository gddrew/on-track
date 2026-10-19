import { Query } from 'node-appwrite';

import { createAdminClient } from '@/lib/appwrite';
import { DATABASE_ID, MEMBERS_ID, WORKSPACES_ID } from '@/config';

export const getWorkspaces = async (userId: string) => {
  const { databases } = await createAdminClient();

  const members = await databases.listDocuments(DATABASE_ID, MEMBERS_ID, [
    Query.equal('userId', userId),
  ]);

  if (members.total === 0) {
    return { documents: [], total: 0 };
  }

  const workspaceIds = members.documents.map((member) => member.workspaceId);

  const workspaces = await databases.listDocuments(DATABASE_ID, WORKSPACES_ID, [
    Query.orderDesc('$createdAt'),
    Query.contains('$id', workspaceIds),
  ]);

  return workspaces;
};
