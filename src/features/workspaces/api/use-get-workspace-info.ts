import { useQuery } from '@tanstack/react-query';

import { client } from '@/lib/rpc';

interface UseGetWorkspaceInfoProps {
  workspaceId: string;
  inviteCode: string;
}

export const useGetWorkspaceInfo = ({
  workspaceId,
  inviteCode,
}: UseGetWorkspaceInfoProps) => {
  const query = useQuery({
    queryKey: ['workspace-info', workspaceId, inviteCode],
    queryFn: async () => {
      const response = await client.api.workspaces[':workspaceId']['info'].$get(
        {
          param: { workspaceId },
          query: { inviteCode },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace info');
      }

      const { data } = await response.json();

      return data;
    },
  });

  return query;
};
