'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Lock, Mail } from 'lucide-react';

import { Button, Card, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api/client';
import { setSession, type Session } from '@/lib/auth/session';

/** Only allow redirects back into this app (no open redirects). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await api.post<Session>('/auth/login', { email, password });
      setSession(data);
      router.replace(safeNext(searchParams.get('next')) as never);
    } catch (err) {
      const status = err instanceof ApiError ? err.statusCode : undefined;
      setError(
        status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : status === 401
            ? 'That email and password combination was not recognised.'
            : err instanceof Error
              ? err.message
              : 'Sign-in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm p-8">
      <div className="mb-6 flex items-center gap-3">
        <Activity className="h-6 w-6 text-primary-400" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-gray-100">Sign in to BioTrakr</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" aria-hidden="true" />}
            aria-describedby={error ? 'login-error' : undefined}
          />
        </div>

        {error && (
          <p id="login-error" role="alert" className="text-sm text-critical-500">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full"
          isLoading={submitting}
          disabled={!email || !password}
        >
          Sign in
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
