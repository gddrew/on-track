import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { db } from '@/db';
import * as schema from '@/db/schema';
import { sendActionEmail } from '@/lib/email';

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    // Signs out every other device, in case someone else had access
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendActionEmail({
        to: user.email,
        name: user.name,
        subject: 'Reset your on-track password',
        intro: 'We received a request to reset your on-track password.',
        buttonLabel: 'Choose a new password',
        url,
        outro:
          "This link expires in 1 hour. If you didn't ask to reset your password, you can ignore this email.",
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Unverified users who try to sign in get a fresh link
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendActionEmail({
        to: user.email,
        name: user.name,
        subject: 'Verify your email for on-track',
        intro: 'Please confirm your email address to finish setting up your on-track account.',
        buttonLabel: 'Verify email',
        url,
        outro:
          "This link expires in 1 hour. If you didn't create an on-track account, you can ignore this email.",
      });
    },
  },
  // Callback URLs: <BETTER_AUTH_URL>/api/auth/callback/<provider>
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  telemetry: { enabled: false },
});
