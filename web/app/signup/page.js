import { Suspense } from 'react';
import { AsciiLogo, EmailSignup } from 'thepopebot/auth/components';

export default function SignupPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <AsciiLogo />
      <Suspense>
        <EmailSignup />
      </Suspense>
    </main>
  );
}
