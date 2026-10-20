'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { FcGoogle } from 'react-icons/fc';
import { FaGithub } from 'react-icons/fa';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

type Provider = 'google' | 'github';

interface SocialSignInProps {
  callbackUrl: string;
  disabled?: boolean;
}

// Works for both sign-in and sign-up: the provider account creates the user on first use
export const SocialSignIn = ({ callbackUrl, disabled }: SocialSignInProps) => {
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(
    null,
  );

  const onClick = async (provider: Provider) => {
    setPendingProvider(provider);

    // Redirects the browser to the provider on success
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: callbackUrl,
      errorCallbackURL: '/sign-in',
    });

    if (error) {
      setPendingProvider(null);
      toast.error('Failed to log in');
    }
  };

  const isDisabled = disabled || pendingProvider !== null;

  return (
    <>
      <Button
        onClick={() => onClick('google')}
        disabled={isDisabled}
        variant='secondary'
        size='lg'
        className='w-full'
      >
        <FcGoogle className='mr-2 size-5' />
        Login with Google
      </Button>
      <Button
        onClick={() => onClick('github')}
        disabled={isDisabled}
        variant='secondary'
        size='lg'
        className='w-full'
      >
        <FaGithub className='mr-2 size-5' />
        Login with Github
      </Button>
    </>
  );
};
