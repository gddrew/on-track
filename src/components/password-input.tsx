'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

// An Input with a button that shows or hides the password
const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(({ className, disabled, ...props }, ref) => {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <div className='relative'>
      <Input
        type={isVisible ? 'text' : 'password'}
        className={cn('pr-12', className)}
        disabled={disabled}
        ref={ref}
        {...props}
      />
      <button
        type='button'
        onClick={() => setIsVisible((visible) => !visible)}
        disabled={disabled}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        className='absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50'
      >
        {isVisible ? (
          <EyeOff className='size-4' />
        ) : (
          <Eye className='size-4' />
        )}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
