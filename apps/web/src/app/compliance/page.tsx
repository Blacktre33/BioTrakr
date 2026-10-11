'use client';

import { Shield } from 'lucide-react';

import { NotAvailable } from '@/components/layout';

/** Compliance records (calibration, electrical safety, contracts) are not built yet. */
export default function CompliancePage() {
  return (
    <NotAvailable
      title="Compliance"
      icon={<Shield className="h-8 w-8" />}
      heading="Compliance records are not available yet"
      description="Calibration, electrical-safety and contract records are not in BioTrakr yet. PM compliance is on the dashboard, and each device's history is on its page."
      link={{ href: '/dashboard', label: 'Go to the dashboard' }}
    />
  );
}
