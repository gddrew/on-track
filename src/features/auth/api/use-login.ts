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
      // callbackURL is where the verification link lands if the email isn't verified yet
      const { error } = await authClient.signIn.email({
        ...json,
        callbackURL: '/',
      });

      if (error) {
        throw new Error(error.code ?? 'Failed to login');
      }
    },
    onSuccess: () => {
      toast.success('Logged in');
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ['current'] });
    },
    onError: (error) => {
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        toast.error(
          "Please verify your email first. We've sent you a new link.",
        );
        return;
      }

      toast.error('Failed to log in');
    },
  });

  return mutation;
};
