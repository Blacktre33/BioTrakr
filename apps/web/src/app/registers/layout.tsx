'use client';

import { motion } from 'framer-motion';
import { useSidebarStore } from '@/stores';
import { Sidebar } from '@/components/layout';

import { cn } from '@/lib/utils';

/** Like the other pages, but only the register reaches the printer. */
export default function RegistersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isCollapsed } = useSidebarStore();

  return (
    <div className="min-h-screen print:min-h-0">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <motion.main
        className={cn(
          'min-h-screen transition-all duration-300 print:!ml-0 print:min-h-0',
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
