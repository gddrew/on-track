import { useQuery } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

export const useCurrent = () => {
  const query = useQuery({
    queryKey: ['current'],
    queryFn: async () => {
      const { data } = await authClient.getSession();

      return data?.user ?? null;
    },
  });

  return query;
};
