'use client';

import { Header } from '@/components/layout';
import { WorkQueue } from '@/components/work-orders/work-queue';

/** Biomedical engineering's work queue (problem reports and scheduled work). */
export default function MaintenancePage() {
  return (
    <>
      <Header title="Work orders" />
      <WorkQueue />
    </>
  );
}
