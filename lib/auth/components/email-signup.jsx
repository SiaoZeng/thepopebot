'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';

export function EmailSignup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [signingUp, setSigningUp] = useState(false);

  async function handleSignup() {
    setSigningUp(true);
    try {
      await fetch('https://app.convertkit.com/forms/9208367/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email_address=' + encodeURIComponent(email),
        redirect: 'manual',
      });
    } catch {
      // Never block the user
    }
    router.push('/login?created=1');
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
        <p className="text-sm font-medium text-green-500">
          Account created. Sign in with your new credentials.
        </p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Get urgent updates and features</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSignup}
              disabled={signingUp}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {signingUp ? 'Signing up...' : 'Sign Up'}
            </button>
            <button
              onClick={() => router.push('/login?created=1')}
              disabled={signingUp}
              className="px-3 py-1.5 text-sm font-medium rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Not Now
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
