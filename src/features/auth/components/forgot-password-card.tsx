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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { forgotPasswordSchema } from '../schema';
import { useRequestPasswordReset } from '../api/use-request-password-reset';

export const ForgotPasswordCard = () => {
  const { mutate, isPending, isSuccess, variables } =
    useRequestPasswordReset();

  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = (values: z.infer<typeof forgotPasswordSchema>) => {
    mutate({ json: values });
  };

  return (
    <Card className='w-full h-full md:-w-[487px] border-none shadow-none'>
      <CardHeader className='flex items-center justify-center text-center p-7'>
        <CardTitle className='text-2xl'>Reset your password</CardTitle>
        <CardDescription>
          {isSuccess
            ? `If an account exists for ${variables.json.email}, we've sent a link to reset its password. It expires in 1 hour.`
            : "Enter your email and we'll send you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      {!isSuccess && (
        <>
          <div className='px-7'>
            <DottedSeparator />
          </div>
          <CardContent className='p-7'>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-4'
              >
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
                <Button
                  disabled={isPending}
                  type='submit'
                  size='lg'
                  className='w-full'
                >
                  Send reset link
                </Button>
              </form>
            </Form>
          </CardContent>
        </>
      )}
      <div className='px-7'>
        <DottedSeparator />
      </div>
      <CardContent className='p-7 flex items-center justify-center'>
        <p>
          Remembered it?
          <Link href='/sign-in'>
            <span className='text-blue-700'>&nbsp;Sign In</span>
          </Link>
        </p>
      </CardContent>
    </Card>
  );
};
