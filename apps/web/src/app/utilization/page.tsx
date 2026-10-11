'use client';

import { TrendingUp } from 'lucide-react';

import { NotAvailable } from '@/components/layout';

/** Nothing records device usage yet, so every figure here would be empty. */
export default function UtilizationPage() {
  return (
    <NotAvailable
      title="Utilization"
      icon={<TrendingUp className="h-8 w-8" />}
      heading="Usage figures are not available yet"
      description="BioTrakr does not collect how long devices are in use yet, so there is nothing to show here."
      link={{ href: '/dashboard', label: 'Go to the dashboard' }}
    />
  );
}
