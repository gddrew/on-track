import { inArray } from 'drizzle-orm';
import { Query, type Databases } from 'node-appwrite';

import { db } from '@/db';
import { user } from '@/db/schema';
import { DATABASE_ID, MEMBERS_ID } from '@/config';

interface GetMemberProps {
  databases: Databases;
  workspaceId: string;
  userId: string;
}

export const getMember = async ({
  databases,
  workspaceId,
  userId,
}: GetMemberProps) => {
  const members = await databases.listDocuments(DATABASE_ID, MEMBERS_ID, [
    Query.equal('workspaceId', workspaceId),
    Query.equal('userId', userId),
  ]);

  return members.documents[0];
};

// Adds each member's name and email from the user table, in one query
export const populateMembers = async <T extends { userId: string }>(
  members: T[],
) => {
  if (members.length === 0) {
    return [];
  }

  const users = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      inArray(
        user.id,
        members.map((member) => member.userId),
      ),
    );

  return members.map((member) => {
    const memberUser = users.find((u) => u.id === member.userId);

    return {
      ...member,
      name: memberUser?.name || memberUser?.email || 'Unknown user',
      email: memberUser?.email ?? '',
    };
  });
};
