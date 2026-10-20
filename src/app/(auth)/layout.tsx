'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { safeCallbackUrl, withCallbackUrl } from '@/features/auth/utils';

interface AuthLayoutProps {
  children: React.ReactNode;
}

// Switches between sign-in and sign-up, keeping where to go afterwards (e.g. an invite)
const AuthSwitchButton = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSignIn = pathname === '/sign-in';
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  return (
    <Button asChild variant="secondary">
      <Link
        href={withCallbackUrl(isSignIn ? '/sign-up' : '/sign-in', callbackUrl)}
      >
        {isSignIn ? 'Sign Up' : 'Login'}
      </Link>
    </Button>
  );
};

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <main className="bg-neutral-100 min-h-screen">
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4">
        <nav className="flex justify-between items-center">
          <Image src="/logo.svg" alt="logo" width={152} height={56} />
          <Suspense>
            <AuthSwitchButton />
          </Suspense>
        </nav>
        <div className="flex flex-col items-center justify-center pt-4 md:pt-14">
          {children}
        </div>
      </div>
    </main>
  );
};

export default AuthLayout;
