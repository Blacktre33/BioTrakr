"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";

import type { Notice } from "@/lib/api/notifications";
import { useMarkNotificationsRead, useNotifications } from "@/lib/hooks/use-notifications";
import { cn } from "@/lib/utils";

import { NoticeRow } from "./notice-row";

import { useDesktopAlerts, useUnreadTitle } from "./use-desktop-alerts";


/** The header bell: unread count, the latest notices, and desktop alerts. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { data, isError } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;
  // Only what is on screen: something that arrived since the last check
  // must not be marked read unseen.
  const shownUnread = (data?.items ?? []).filter((n) => !n.readAt).map((n) => n.id);
  const moreUnread = unread - shownUnread.length;

  const openNotice = (notice: Notice) => {
    if (!notice.readAt) markRead.mutate({ ids: [notice.id] });
    setOpen(false);
    if (notice.link) router.push(notice.link as never);
  };
  const desktop = useDesktopAlerts(data?.items, openNotice);
  useUnreadTitle(unread);

  // Focus moves into the panel; Escape (focus back to the bell) or a click outside closes it.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className={cn(
          "relative rounded-xl p-2.5 transition-all duration-200",
          open
            ? "bg-primary-500/20 text-primary-400"
            : unread > 0
              ? "text-primary-400 hover:bg-surface-200/50"
              : "text-gray-400 hover:bg-surface-200/50 hover:text-gray-200",
        )}
      >
        <Bell className="h-5 w-5" fill={unread > 0 ? "currentColor" : "none"} aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-critical-500 px-1 text-[10px] font-bold text-white"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          tabIndex={-1}
          className="fixed inset-x-4 top-16 z-50 overflow-hidden focus:outline-none rounded-2xl border border-white/10 bg-surface-100 shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <h3 className="font-semibold text-white">Notifications</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate({ ids: shownUnread })}
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark these read
              </button>
            )}
          </div>

          <ul className="max-h-[60vh] overflow-y-auto">
            {isError && !data && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">Could not load notifications. Retrying…</li>
            )}
            {data && data.items.length === 0 && (
              <li className="px-4 py-8 text-center text-gray-500">
                <Bell className="mx-auto mb-2 h-8 w-8 opacity-50" aria-hidden />
                <p className="text-sm">Nothing yet. Problem reports and work for you will show up here.</p>
              </li>
            )}
            {data?.items.map((n) => (
              <li key={n.id} className="border-b border-white/5 last:border-0">
                <NoticeRow notice={n} onOpen={openNotice} />
              </li>
            ))}
          </ul>
          {moreUnread > 0 && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/alerts" as never);
              }}
              className="w-full border-t border-white/5 px-4 py-2 text-left text-xs text-primary-400 hover:text-primary-300"
            >
              {moreUnread} more unread · See all notifications
            </button>
          )}

          {desktop.support !== "unsupported" && (
            <div className="border-t border-white/5 px-4 py-3 text-xs text-gray-400">
              {desktop.support === "on" ? (
                <button type="button" onClick={desktop.disable} className="flex items-center gap-1 hover:text-gray-200">
                  <BellRing className="h-3.5 w-3.5 text-primary-400" aria-hidden />
                  Desktop alerts for urgent notices are on · Turn off
                </button>
              ) : desktop.support === "denied" ? (
                <span>Desktop alerts are blocked in this browser&apos;s site settings.</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void desktop.enable()}
                  className="flex items-center gap-1 text-primary-400 hover:text-primary-300"
                >
                  <BellRing className="h-3.5 w-3.5" aria-hidden />
                  Get a desktop alert for urgent notices while BioTrakr is open
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
