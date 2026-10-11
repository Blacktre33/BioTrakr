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
      description="PM, calibration and electrical safety compliance are on the dashboard, and each device's certificates, test readings and history are on its page. Contract (AMC/CMC) records are not in BioTrakr yet."
      link={{ href: '/dashboard', label: 'Go to the dashboard' }}
    />
  );
}
