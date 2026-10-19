import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

import { forgotPasswordSchema } from '../schema';

type RequestType = { json: z.infer<typeof forgotPasswordSchema> };

// Succeeds whether or not the email has an account, so it doesn't reveal who signed up
export const useRequestPasswordReset = () => {
  const mutation = useMutation<void, Error, RequestType>({
    mutationFn: async ({ json }) => {
      const { error } = await authClient.requestPasswordReset({
        email: json.email,
        redirectTo: '/reset-password',
      });

      if (error) {
        throw new Error(error.message ?? 'Failed to request password reset');
      }
    },
    onError: () => {
      toast.error('Failed to send reset email');
    },
  });

  return mutation;
};
