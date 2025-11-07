import type { ReactNode } from "react";

import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-muted/10">
      <Sidebar />
      <MobileSidebar />
      <div className="flex flex-1 flex-col">
        <TopNav />
        <main className="flex-1 space-y-6 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
