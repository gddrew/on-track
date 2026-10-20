import { redirect } from 'next/navigation';

import { getCurrent } from '@/features/auth/queries';
import { safeCallbackUrl } from '@/features/auth/utils';
import { SignInCard } from '@/features/auth/components/sign-in-card';

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

const SignInPage = async ({ searchParams }: SignInPageProps) => {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  const user = await getCurrent();

  // Also runs after a successful sign-in, when the form refreshes the page
  if (user) redirect(callbackUrl);

  return <SignInCard callbackUrl={callbackUrl} />;
};

export default SignInPage;
