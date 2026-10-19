import { z } from 'zod';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';

import { registerSchema } from '../schema';

type RequestType = { json: z.infer<typeof registerSchema> };

// The user is signed in once they click the link in the verification email
export const useRegister = () => {
  const mutation = useMutation<void, Error, RequestType>({
    mutationFn: async ({ json }) => {
      const { error } = await authClient.signUp.email({
        name: json.name,
        email: json.email,
        password: json.password,
        callbackURL: '/',
      });

      if (error) {
        throw new Error(error.message ?? 'Failed to register');
      }
    },
    onError: () => {
      toast.error('Failed to register');
    },
  });

  return mutation;
};
