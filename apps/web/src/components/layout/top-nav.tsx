"use client";

import { Menu } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/stores/ui-store";

export function TopNav() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background/80 px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
          <span className="sr-only">Toggle navigation</span>
        </Button>
        <Link href="/" className="text-sm font-medium text-biotrakr-primary">
          BioTrakr
        </Link>
      </div>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Sarah Thompson</span>
        <div className="h-8 w-8 rounded-full bg-primary/10" aria-hidden />
      </div>
    </header>
  );
}
