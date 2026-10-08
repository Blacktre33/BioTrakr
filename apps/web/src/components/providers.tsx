'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { getSession, redirectToLogin } from '@/lib/auth/session';

interface ProvidersProps {
  children: ReactNode;
}

const PUBLIC_PATHS = ['/login'];

/**
 * Sends signed-out visitors to /login. This is a convenience only; the API
 * enforces authentication on every request.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);
  const [ready, setReady] = useState(isPublic);

  useEffect(() => {
    if (isPublic || getSession()) {
      setReady(true);
    } else {
      redirectToLogin();
    }
  }, [isPublic]);

  return ready ? <>{children}</> : null;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>{children}</AuthGate>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
