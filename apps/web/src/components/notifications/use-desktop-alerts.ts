"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Notice } from "@/lib/api/notifications";

const PREF_KEY = "biotrakr.desktopAlerts";

type Support = "unsupported" | "denied" | "off" | "on";

function readPref(): boolean {
  try {
    return window.localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}

function currentSupport(): Support {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && readPref() ? "on" : "off";
}

/**
 * Pops up an operating-system notification for each new urgent notice
 * while BioTrakr is open in a tab, so biomed at a desk notices it even in
 * another window. Off until the person turns it on (the browser asks).
 * Notices already there when the page loads are not popped up again.
 */
export function useDesktopAlerts(
  items: Notice[] | undefined,
  open: (notice: Notice) => void,
): { support: Support; enable: () => Promise<void>; disable: () => void } {
  const [support, setSupport] = useState<Support>("off");
  const seen = useRef<Set<string> | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => setSupport(currentSupport()), []);

  useEffect(() => {
    if (!items) return;
    if (seen.current === null) {
      seen.current = new Set(items.map((n) => n.id));
      return;
    }
    const fresh = items.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    if (currentSupport() !== "on") return;
    for (const notice of fresh) {
      if (notice.readAt || notice.severity !== "critical") continue;
      try {
        // No details on the pop-up: shared ward computers show these on the
        // lock screen. The title names the device; the rest is in BioTrakr.
        const popup = new Notification(notice.title, {
          body: "Open BioTrakr for details",
          tag: notice.id,
          requireInteraction: true,
        });
        popup.onclick = () => {
          window.focus();
          openRef.current(notice);
          popup.close();
        };
      } catch {
        // Some browsers (e.g. Android Chrome) only allow this from a service worker.
      }
    }
  }, [items]);

  const enable = useCallback(async () => {
    if (!("Notification" in window)) return;
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    writePref(permission === "granted");
    setSupport(currentSupport());
  }, []);

  const disable = useCallback(() => {
    writePref(false);
    setSupport(currentSupport());
  }, []);

  return { support, enable, disable };
}

/**
 * "(3) Work orders": the tab shows how many notices are unread. Next.js
 * rewrites the title when a page re-renders, so the count is put back
 * whenever that happens.
 */
export function useUnreadTitle(unread: number | undefined) {
  useEffect(() => {
    const strip = (t: string) => t.replace(/^\(\d+\+?\) /, "");
    const apply = () => {
      const wanted = unread ? `(${unread > 99 ? "99+" : unread}) ${strip(document.title)}` : strip(document.title);
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = strip(document.title);
    };
  }, [unread]);
}
