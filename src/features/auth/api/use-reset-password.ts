import { z } from 'zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

import { resetPasswordSchema } from '../schema';

type RequestType = {
  json: z.infer<typeof resetPasswordSchema> & { token: string };
};

export const useResetPassword = () => {
  const router = useRouter();

  const mutation = useMutation<void, Error, RequestType>({
    mutationFn: async ({ json }) => {
      const { error } = await authClient.resetPassword({
        newPassword: json.password,
        token: json.token,
      });

      if (error) {
        throw new Error(error.message ?? 'Failed to reset password');
      }
    },
    onSuccess: () => {
      toast.success('Password changed. Please sign in.');
      router.push('/sign-in');
    },
    onError: () => {
      toast.error('This reset link is invalid or has expired');
    },
  });

  return mutation;
};
