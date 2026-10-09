"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/maintenance", label: "Work queue" },
  { href: "/maintenance/schedule", label: "PM schedule" },
];

/** Switches between the work queue and the PM calendar; `className` sets the width to match the page. */
export function MaintenanceTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Work order pages" className={cn("mx-auto flex gap-2 px-6 pt-6", className)}>
      {TABS.map((t) => {
        const current = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href as Route}
            aria-current={current ? "page" : undefined}
            className={cn(
              "rounded-xl px-4 py-2 text-sm",
              current ? "bg-primary-500/20 text-white" : "text-gray-400 hover:text-gray-200",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
