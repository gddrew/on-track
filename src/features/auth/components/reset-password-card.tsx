'use client';

import { z } from 'zod';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DottedSeparator } from '@/components/dotted-separator';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PasswordInput } from '@/components/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { resetPasswordSchema } from '../schema';
import { useResetPassword } from '../api/use-reset-password';

interface ResetPasswordCardProps {
  // Better Auth adds ?token=… for a valid link, or ?error=INVALID_TOKEN
  token?: string;
}

export const ResetPasswordCard = ({ token }: ResetPasswordCardProps) => {
  const { mutate, isPending } = useResetPassword();

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = (values: z.infer<typeof resetPasswordSchema>) => {
    if (!token) return;

    mutate({ json: { ...values, token } });
  };

  return (
    <Card className='w-full h-full md:-w-[487px] border-none shadow-none'>
      <CardHeader className='flex items-center justify-center text-center p-7'>
        <CardTitle className='text-2xl'>Choose a new password</CardTitle>
        {!token && (
          <CardDescription>
            This reset link is invalid or has expired.
          </CardDescription>
        )}
      </CardHeader>
      <div className='px-7'>
        <DottedSeparator />
      </div>
      {token ? (
        <CardContent className='p-7'>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
              <FormField
                name='password'
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        autoComplete='new-password'
                        placeholder='Enter a new password'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                name='confirmPassword'
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <PasswordInput
                        {...field}
                        autoComplete='new-password'
                        placeholder='Confirm new password'
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                disabled={isPending}
                type='submit'
                size='lg'
                className='w-full'
              >
                Change password
              </Button>
            </form>
          </Form>
        </CardContent>
      ) : (
        <CardContent className='p-7 flex items-center justify-center'>
          <Button asChild size='lg' className='w-full'>
            <Link href='/forgot-password'>Send a new link</Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
};
