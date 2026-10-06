import { redirect } from 'next/navigation';

import { getCurrent } from '@/features/auth/actions';

export default async function Home() {
  const user = await getCurrent();

  console.log({ user });

  if (!user) redirect('/sign-in');

  return <div>This is a home page</div>;
}
