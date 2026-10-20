import { redirect } from 'next/navigation';

import { getCurrent } from '@/features/auth/queries';
import { withCallbackUrl } from '@/features/auth/utils';

import { WorkspaceIdJoinClient } from './client';

interface WorkspaceIdJoinPageProps {
  params: Promise<{ workspaceId: string; inviteCode: string }>;
}

const WorkspaceIdJoinPage = async ({ params }: WorkspaceIdJoinPageProps) => {
  const user = await getCurrent();

  if (!user) {
    // Come back to this invite after signing in or signing up
    const { workspaceId, inviteCode } = await params;
    redirect(
      withCallbackUrl(
        '/sign-in',
        `/workspaces/${workspaceId}/join/${inviteCode}`,
      ),
    );
  }

  return <WorkspaceIdJoinClient />;
};

export default WorkspaceIdJoinPage;
