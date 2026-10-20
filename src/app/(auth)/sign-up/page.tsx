import { redirect } from 'next/navigation';

import { getCurrent } from '@/features/auth/queries';
import { safeCallbackUrl } from '@/features/auth/utils';
import { SignUpCard } from '@/features/auth/components/sign-up-card';

interface SignUpPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

const SignUpPage = async ({ searchParams }: SignUpPageProps) => {
  const callbackUrl = safeCallbackUrl((await searchParams).callbackUrl);
  const user = await getCurrent();

  if (user) redirect(callbackUrl);

  return <SignUpCard callbackUrl={callbackUrl} />;
};

export default SignUpPage;
