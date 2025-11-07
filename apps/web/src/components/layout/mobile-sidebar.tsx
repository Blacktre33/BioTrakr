"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUiStore } from "@/lib/stores/ui-store";
import { NAV_LINKS } from "./sidebar";
import { cn } from "@/lib/utils";

export function MobileSidebar() {
  const pathname = usePathname();
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebar = useUiStore((state) => state.setSidebar);

  useEffect(() => {
    setSidebar(false);
  }, [pathname, setSidebar]);

  return (
    <Dialog open={sidebarOpen} onOpenChange={setSidebar}>
      <DialogContent className="inset-y-0 left-0 flex h-full w-64 translate-x-0 flex-col gap-0 border-r bg-card p-0 shadow-lg data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
        <div className="px-6 py-6">
          <span className="text-lg font-semibold">MedAsset Pro</span>
          <p className="text-sm text-muted-foreground">Device Operations</p>
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(buttonVariants({ variant: pathname === href ? "default" : "ghost", size: "sm" }), "flex w-full justify-start gap-2")}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
