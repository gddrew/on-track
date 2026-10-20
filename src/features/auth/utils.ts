// Where to go after signing in. Only paths on this site are allowed, so a crafted
// link like /sign-in?callbackUrl=https://evil.example can't send people elsewhere.
export const safeCallbackUrl = (value?: string | string[] | null) => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.startsWith('/\\')
  ) {
    return '/';
  }

  return value;
};

// Keeps the callback when moving between /sign-in and /sign-up
export const withCallbackUrl = (path: string, callbackUrl: string) =>
  callbackUrl === '/'
    ? path
    : `${path}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
