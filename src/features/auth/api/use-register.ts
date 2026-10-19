import { z } from 'zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

import { registerSchema } from '../schema';

type RequestType = { json: z.infer<typeof registerSchema> };

export const useRegister = () => {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation<void, Error, RequestType>({
    mutationFn: async ({ json }) => {
      // Signs the new user in as well
      const { error } = await authClient.signUp.email(json);

      if (error) {
        throw new Error(error.message ?? 'Failed to register');
      }
    },
    onSuccess: () => {
      toast.success('Registered');
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ['current'] });
    },
    onError: () => {
      toast.error('Failed to register');
    },
  });

  return mutation;
};
