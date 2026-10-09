'use client';

import type { Route } from 'next';
import { signOut } from '@/lib/api/client';
import { getSession } from '@/lib/auth/session';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Button, Avatar } from '@/components/ui';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [myName, setMyName] = useState('');
  useEffect(() => {
    const u = getSession()?.user;
    setMyName(u ? `${u.firstName} ${u.lastName}`.trim() : '');
  }, []);

  const quickAddOptions = [
    { label: 'New Asset', icon: Plus, href: '/assets', action: () => router.push('/assets?new=true') },
    { label: 'Work Order', icon: Plus, href: '/maintenance', action: () => router.push('/maintenance') },
  ];

  const handleQuickAddClick = (option: typeof quickAddOptions[0]) => {
    setShowQuickAdd(false);
    if (option.action) {
      option.action();
    } else {
      router.push(option.href as Route);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Left: Title */}
        <div>
          <h1 className="text-2xl font-bold text-white font-display">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {actions}

          {/* Quick Add */}
          <div className="relative">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowQuickAdd(!showQuickAdd)}
              leftIcon={<Plus className="w-4 h-4" />}
              rightIcon={<ChevronDown className={cn('w-4 h-4 transition-transform', showQuickAdd && 'rotate-180')} />}
            >
              Quick Add
            </Button>

            <AnimatePresence>
              {showQuickAdd && (
                <>
                  <motion.div
                    className="fixed inset-0 z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowQuickAdd(false)}
                  />
                  <motion.div
                    className="absolute right-0 mt-2 w-48 bg-surface-100 border border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {quickAddOptions.map((option) => (
                      <button
                        key={option.label}
                        onClick={() => handleQuickAddClick(option)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:bg-surface-200/50 hover:text-white transition-colors text-left"
                      >
                        <option.icon className="w-4 h-4" />
                        {option.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Notifications */}
          <NotificationBell />

          {/* User Avatar */}
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label={myName ? `Signed in as ${myName}. Sign out` : 'Sign out'}
            title="Sign out"
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-surface-200/50 transition-colors"
          >
            <Avatar name={myName || '?'} size="sm" />
          </button>
        </div>
      </div>
    </header>
  );
}
