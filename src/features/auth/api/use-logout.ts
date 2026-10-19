import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

export const useLogout = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error>({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.message ?? 'Failed to logout');
      }
    },
    onSuccess: () => {
      toast.success('Logged out');
      router.refresh();

      queryClient.invalidateQueries();
    },
    onError: () => {
      toast.error('Failed to log out');
    },
  });

  return mutation;
};
