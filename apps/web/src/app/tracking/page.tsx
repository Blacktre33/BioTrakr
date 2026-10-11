'use client';

import { MapPin } from 'lucide-react';

import { NotAvailable } from '@/components/layout';

/** No location feed is connected yet, so there is nothing real to map. */
export default function TrackingPage() {
  return (
    <NotAvailable
      title="Tracking"
      icon={<MapPin className="h-8 w-8" />}
      heading="Location tracking is not available yet"
      description="BioTrakr does not receive live device locations yet. Each device's recorded location is on the asset list, and scanning its label shows it too."
      link={{ href: '/assets', label: 'Go to the asset list' }}
    />
  );
}
