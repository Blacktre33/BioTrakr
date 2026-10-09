"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getNotifications, markNotificationsRead, type NoticeList } from "@/lib/api/notifications";

const KEY = ["notifications"];
/** How often an open tab checks for new notices. */
export const POLL_MS = 30_000;

/** The latest notices, unread first. The bell shows 20; the page 50. */
export function useNotifications(take = 20) {
  return useQuery({
    queryKey: [...KEY, take],
    queryFn: () => getNotifications(take),
    refetchInterval: POLL_MS,
    // Keep checking in a background tab: that is when a desktop alert matters.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    // A failed poll keeps showing what we had; the next poll tries again.
    retry: false,
  });
}

/** Marks notices read at once on screen, then on the server. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationsRead,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const before = queryClient.getQueriesData<NoticeList>({ queryKey: KEY });
      const now = new Date().toISOString();
      const hit = (id: string) => body.all || body.ids?.includes(id);
      // Every cached list (bell and page) shows the change at once.
      queryClient.setQueriesData<NoticeList>({ queryKey: KEY }, (list) => {
        if (!list) return list;
        const newlyRead = new Set(list.items.filter((n) => !n.readAt && hit(n.id)).map((n) => n.id));
        return {
          items: list.items.map((n) => (newlyRead.has(n.id) ? { ...n, readAt: now } : n)),
          unread: body.all ? 0 : Math.max(0, list.unread - newlyRead.size),
        };
      });
      return { before };
    },
    onError: (_e, _body, context) => {
      context?.before.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
