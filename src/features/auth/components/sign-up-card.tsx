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
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/password-input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { registerSchema } from '../schema';
import { useRegister } from '../api/use-register';
import { withCallbackUrl } from '../utils';
import { SocialSignIn } from './social-sign-in';

interface SignUpCardProps {
  callbackUrl: string;
}

export const SignUpCard = ({ callbackUrl }: SignUpCardProps) => {
  const { mutate, isPending, isSuccess, variables } = useRegister({
    callbackUrl,
  });

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = (values: z.infer<typeof registerSchema>) => {
    mutate({ json: values });
  };

  if (isSuccess) {
    return (
      <Card className='w-full h-full md:-w-[487px] border-none shadow-none'>
        <CardHeader className='flex items-center justify-center text-center p-7'>
          <CardTitle className='text-2xl'>Check your email</CardTitle>
          <CardDescription>
            We&apos;ve sent a link to {variables.json.email}. Click it to
            verify your email and finish signing up. It expires in 1 hour.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className='w-full h-full md:-w-[487px] border-none shadow-none'>
      <CardHeader className='flex items-center justify-center text-center p-7'>
        <CardTitle className='text-2xl'>Sign Up</CardTitle>
        <CardDescription>
          By signing up, you agree to our{' '}
          <Link href='/privacy'>
            <span className='text-blue-700'>Privacy Policy</span>
          </Link>{' '}
          and{' '}
          <Link href='/terms'>
            <span className='text-blue-700'>Terms of Service</span>
          </Link>
        </CardDescription>
      </CardHeader>
      <div className='px-7'>
        <DottedSeparator />
      </div>
      <CardContent className='p-7'>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              name='name'
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      type='text'
                      placeholder='Enter your name'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name='email'
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      {...field}
                      type='email'
                      placeholder='Enter email address'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              name='password'
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <PasswordInput
                      {...field}
                      autoComplete='new-password'
                      placeholder='Create a password'
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
                      placeholder='Confirm password'
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
              Register
            </Button>
          </form>
        </Form>
      </CardContent>
      <div className='px-7'>
        <DottedSeparator />
      </div>
      <CardContent className='p-7 flex flex-col gap-y-4'>
        <SocialSignIn callbackUrl={callbackUrl} disabled={isPending} />
      </CardContent>
      <div className='px-7'>
        <DottedSeparator />
      </div>
      <CardContent className='p-7 flex items-center justify-center'>
        <p>
          Already have an account?
          <Link href={withCallbackUrl('/sign-in', callbackUrl)}>
            <span className='text-blue-700'>&nbsp;Sign In</span>
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};
