"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getNotifications, markNotificationsRead, type NoticeList } from "@/lib/api/notifications";

const KEY = ["notifications"];
/** How often an open tab checks for new notices. */
export const POLL_MS = 30_000;

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => getNotifications(20),
    enabled,
    refetchInterval: POLL_MS,
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
      const before = queryClient.getQueryData<NoticeList>(KEY);
      if (before) {
        const now = new Date().toISOString();
        const hit = (id: string) => body.all || body.ids?.includes(id);
        const items = before.items.map((n) => (!n.readAt && hit(n.id) ? { ...n, readAt: now } : n));
        const newlyRead = before.items.filter((n) => !n.readAt && hit(n.id)).length;
        queryClient.setQueryData<NoticeList>(KEY, {
          items,
          unread: body.all ? 0 : Math.max(0, before.unread - newlyRead),
        });
      }
      return { before };
    },
    onError: (_e, _body, context) => {
      if (context?.before) queryClient.setQueryData(KEY, context.before);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
