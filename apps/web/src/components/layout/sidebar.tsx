'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Box,
  Wrench,
  MapPin,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  LogOut,
  HelpCircle,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore, useAlertStore } from '@/stores';
import { Avatar, Badge } from '@/components/ui';

const navigationItems = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview & analytics',
  },
  {
    name: 'Assets',
    href: '/assets',
    icon: Box,
    description: 'Asset inventory',
  },
  {
    name: 'Maintenance',
    href: '/maintenance',
    icon: Wrench,
    description: 'Work orders',
    badge: 5,
  },
  {
    name: 'Tracking',
    href: '/tracking',
    icon: MapPin,
    description: 'Real-time location',
  },
  {
    name: 'Utilization',
    href: '/utilization',
    icon: TrendingUp,
    description: 'Usage analytics',
  },
  {
    name: 'Compliance',
    href: '/compliance',
    icon: Shield,
    description: 'Regulatory status',
  },
];

const bottomNavItems = [
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
  },
  {
    name: 'Help',
    href: '/help',
    icon: HelpCircle,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const { unreadCount } = useAlertStore();

  return (
    <motion.aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-surface-50/80 backdrop-blur-xl border-r border-white/5 z-50',
        'flex flex-col'
      )}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Logo Section */}
      <div className="p-4 border-b border-white/5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/30">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-success-500 border-2 border-surface-50 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">✓</span>
            </div>
          </div>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-lg font-bold text-white">BioTrakr</h1>
                <p className="text-xs text-gray-500">Healthcare Management</p>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Search (expanded only) */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="px-4 py-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search assets, orders..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface-200/50 border border-white/5 rounded-xl text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const query = (e.target as HTMLInputElement).value.trim();
                    if (query) {
                      // Navigate to assets page with search query
                      window.location.href = `/assets?search=${encodeURIComponent(query)}`;
                    }
                  }
                }}
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-surface-300 rounded text-[10px] text-gray-500 font-mono">
                ⌘K
              </kbd>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-1">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={cn(
                    'group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                    isActive
                      ? 'bg-primary-500/10 text-primary-400'
                      : 'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200'
                  )}
                >
                  <div className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-lg transition-colors',
                    isActive ? 'bg-primary-500/20' : 'bg-surface-200/50 group-hover:bg-surface-300/50'
                  )}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        className="flex-1 flex items-center justify-between"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500">{item.description}</p>
                        </div>
                        {item.badge && (
                          <Badge variant="warning" size="sm">
                            {item.badge}
                          </Badge>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Alerts Section */}
      <div className="px-3 py-2">
        <Link href="/alerts">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
            'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200'
          )}>
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-surface-200/50">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-critical-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-sm font-medium">Alerts</p>
                  <p className="text-xs text-gray-500">{unreadCount} unread</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Link>
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-white/5 px-3 py-2">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link key={item.name} href={item.href}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-primary-500/10 text-primary-400'
                  : 'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200'
              )}>
                <div className="flex items-center justify-center w-9 h-9">
                  <Icon className="w-5 h-5" />
                </div>
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.span
                      className="text-sm font-medium"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                    >
                      {item.name}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </Link>
          );
        })}
      </div>

      {/* User Section */}
      <div className="border-t border-white/5 p-4">
        <div className="flex items-center gap-3">
          <Avatar name="Dr. Sarah Chen" size="md" />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                className="flex-1 min-w-0"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
              >
                <p className="text-sm font-medium text-gray-200 truncate">Dr. Sarah Chen</p>
                <p className="text-xs text-gray-500 truncate">Admin • ICU</p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!isCollapsed && (
              <motion.button
                className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <LogOut className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggleCollapsed}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface-200 border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-surface-300 transition-colors shadow-lg"
      >
        {isCollapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>
    </motion.aside>
  );
}
