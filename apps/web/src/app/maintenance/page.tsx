'use client';

import { Header } from '@/components/layout';
import { MaintenanceTabs } from '@/components/work-orders/maintenance-tabs';
import { WorkQueue } from '@/components/work-orders/work-queue';

/** Biomedical engineering's work queue (problem reports and scheduled work). */
export default function MaintenancePage() {
  return (
    <>
      <Header title="Work orders" />
      <MaintenanceTabs className="max-w-4xl" />
      <WorkQueue />
    </>
  );
}
