"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";

import type { Notice } from "@/lib/api/notifications";
import { cn, formatRelativeTime } from "@/lib/utils";

const ICON = {
  critical: <AlertTriangle className="h-4 w-4 text-critical-500" aria-hidden />,
  warning: <AlertCircle className="h-4 w-4 text-warning-500" aria-hidden />,
  info: <Info className="h-4 w-4 text-primary-400" aria-hidden />,
};
const SEVERITY_WORD = { critical: "Urgent", warning: "Needs attention", info: "For your information" };

/** One notice; opening it marks it read and goes where it points. */
export function NoticeRow({ notice: n, onOpen }: { notice: Notice; onOpen: (n: Notice) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-200/30",
        !n.readAt && "bg-surface-200/20",
      )}
    >
      <span className="mt-0.5">{ICON[n.severity] ?? ICON.info}</span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{SEVERITY_WORD[n.severity] ?? ""}: </span>
        <span className={cn("block text-sm text-white", !n.readAt && "font-semibold")}>{n.title}</span>
        {n.body && <span className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-gray-400">{n.body}</span>}
        <span className="mt-1 block text-xs text-gray-500">
          {formatRelativeTime(n.createdAt)}
          {!n.readAt && <span className="sr-only"> · unread</span>}
        </span>
      </span>
      {!n.readAt && <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" />}
    </button>
  );
}
