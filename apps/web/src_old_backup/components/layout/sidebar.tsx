"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon, ActivitySquare, BarChart3, Boxes, Home, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useUiStore } from "@/lib/stores/ui-store";

interface NavLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV_LINKS: NavLink[] = [
  { label: "Overview", href: "/", icon: Home },
  { label: "Assets", href: "/assets", icon: Boxes },
  { label: "Maintenance", href: "/maintenance", icon: Wrench },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Pipeline", href: "/pipeline", icon: ActivitySquare },
];

export function Sidebar() {
  const pathname = usePathname();
  const setSidebar = useUiStore((state) => state.setSidebar);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card/40 lg:flex lg:flex-col">
      <div className="px-6 py-6">
        <span className="text-lg font-semibold text-biotrakr-primary">BioTrakr</span>
        <p className="text-sm text-muted-foreground">Device Operations</p>
      </div>
      <nav className="flex-1 space-y-1 px-4">
        {NAV_LINKS.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                buttonVariants({ variant: isActive ? "default" : "ghost", size: "sm" }),
                "flex w-full justify-start gap-2"
              )}
              onClick={() => setSidebar(false)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-6 py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} BioTrakr
      </div>
    </aside>
  );
}
