'use client';

import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';

import { Header } from '@/components/layout';
import { NoticeRow } from '@/components/notifications/notice-row';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import type { Notice } from '@/lib/api/notifications';
import { useMarkNotificationsRead, useNotifications } from '@/lib/hooks/use-notifications';

/** Everything the bell shows, on a page of its own (the last 30 days). */
export default function NotificationsPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useNotifications(50);
  const shownUnread = (data?.items ?? []).filter((n) => !n.readAt).map((n) => n.id);
  const markRead = useMarkNotificationsRead();

  const open = (n: Notice) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    if (n.link) router.push(n.link as never);
  };

  return (
    <>
      <Header
        title="Notifications"
        subtitle="Problem reports, device faults and work for you"
        actions={
          data && data.unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" />}
              onClick={() => markRead.mutate({ ids: shownUnread })}
              disabled={shownUnread.length === 0}
            >
              Mark these read
            </Button>
          ) : null
        }
      />
      <div className="p-4 md:p-8">
        {isLoading && <Skeleton className="h-40 w-full" />}
        {isError && !data && (
          <p role="alert" className="text-sm text-critical-500">
            Could not load notifications. It will try again shortly.
          </p>
        )}
        {data && data.items.length === 0 && (
          <EmptyState
            icon={<Bell className="h-8 w-8" />}
            title="Nothing yet"
            description="Problem reports on your devices and work assigned to you will show up here."
          />
        )}
        {data && data.unread > shownUnread.length && (
          <p className="mb-3 text-sm text-gray-400">
            Showing the latest {shownUnread.length} of {data.unread} unread. Mark these read to see the rest.
          </p>
        )}
        {data && data.items.length > 0 && (
          <Card className="divide-y divide-white/5 p-0">
            <ul>
              {data.items.map((n) => (
                <li key={n.id}>
                  <NoticeRow notice={n} onOpen={open} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
