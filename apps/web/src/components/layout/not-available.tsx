'use client';

import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Header } from './header';
import { Card, EmptyState } from '@/components/ui';

interface NotAvailableProps {
  title: string;
  icon: ReactNode;
  heading: string;
  description: string;
  link: { href: Route; label: string };
}

/**
 * Stands in for a page that is not built yet. Placeholder figures on a
 * hospital screen could be mistaken for real readings, so say so plainly
 * and point to where the real information is.
 */
export function NotAvailable({ title, icon, heading, description, link }: NotAvailableProps) {
  return (
    <>
      <Header title={title} />
      <div className="p-4 md:p-8">
        <Card className="max-w-2xl">
          <EmptyState
            icon={icon}
            title={heading}
            description={description}
            action={
              <Link href={link.href} className="text-sm text-primary-400 underline-offset-4 hover:underline">
                {link.label}
              </Link>
            }
          />
        </Card>
      </div>
    </>
  );
}
