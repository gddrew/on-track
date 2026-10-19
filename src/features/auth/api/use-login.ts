import { z } from 'zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

import { loginSchema } from '../schema';

type RequestType = { json: z.infer<typeof loginSchema> };

export const useLogin = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation<void, Error, RequestType>({
    mutationFn: async ({ json }) => {
      const { error } = await authClient.signIn.email(json);

      if (error) {
        throw new Error(error.message ?? 'Failed to login');
      }
    },
    onSuccess: () => {
      toast.success('Logged in');
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ['current'] });
    },
    onError: () => {
      toast.error('Failed to log in');
    },
  });

  return mutation;
};
