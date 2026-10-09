import { Suspense } from "react";
import Link from "next/link";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { ScanDevice } from "@/components/scan/scan-device";

export const metadata = { title: "Scan a device · BioTrakr" };

/** Phone-first page: no sidebar, big targets, works one-handed on the ward. */
export default function ScanPage() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h1 className="text-lg font-semibold text-white">Scan a device</h1>
        <div className="flex items-center gap-2">
          {/* Reporters hear here when their device is fixed. */}
          <NotificationBell />
          <Link href="/dashboard" className="text-sm text-gray-400 underline-offset-4 hover:underline">
            Dashboard
          </Link>
        </div>
      </header>
      <Suspense>
        <ScanDevice />
      </Suspense>
    </div>
  );
}
