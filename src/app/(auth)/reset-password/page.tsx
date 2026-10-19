import { ResetPasswordCard } from '@/features/auth/components/reset-password-card';

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

const ResetPasswordPage = async ({ searchParams }: ResetPasswordPageProps) => {
  const { token, error } = await searchParams;

  return <ResetPasswordCard token={error ? undefined : token} />;
};

export default ResetPasswordPage;
