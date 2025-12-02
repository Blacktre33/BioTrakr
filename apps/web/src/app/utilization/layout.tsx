'use client';

import { motion } from 'framer-motion';
import { useSidebarStore } from '@/stores';
import { Sidebar } from '@/components/layout';

import { cn } from '@/lib/utils';

export default function UtilizationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCollapsed } = useSidebarStore();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <motion.main
        className={cn(
          'min-h-screen transition-all duration-300',
          isCollapsed ? 'ml-[80px]' : 'ml-[280px]'
        )}
        animate={{
          marginLeft: isCollapsed ? 80 : 280,
        }}
      >
        {children}
      </motion.main>
    </div>
  );
}

