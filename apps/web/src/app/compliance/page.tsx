'use client';

import { Shield } from 'lucide-react';

import { NotAvailable } from '@/components/layout';

/** A compliance report is not built yet; the records it would draw on are elsewhere. */
export default function CompliancePage() {
  return (
    <NotAvailable
      title="Compliance"
      icon={<Shield className="h-8 w-8" />}
      heading="A compliance report is not available yet"
      description="PM, calibration, electrical safety and contract cover are on the dashboard, AMC and CMC contracts are under Contracts, and each device's certificates, test readings and history are on its page."
      link={{ href: '/dashboard', label: 'Go to the dashboard' }}
    />
  );
}
