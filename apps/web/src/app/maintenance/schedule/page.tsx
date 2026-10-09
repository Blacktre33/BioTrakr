'use client';

import { useState } from 'react';

import { Header } from '@/components/layout';
import { FacilityPicker } from '@/components/layout/facility-picker';
import { PmScheduleView } from '@/components/pm/pm-schedule';
import { MaintenanceTabs } from '@/components/work-orders/maintenance-tabs';

/** Preventive maintenance calendar: what is due, done and overdue. */
export default function PmSchedulePage() {
  const [facilityId, setFacilityId] = useState('');
  return (
    <>
      <Header
        title="PM schedule"
        subtitle="Preventive maintenance due, done and overdue"
        actions={<FacilityPicker value={facilityId} onChange={setFacilityId} />}
      />
      <MaintenanceTabs className="max-w-6xl" />
      <PmScheduleView facilityId={facilityId || undefined} />
    </>
  );
}
