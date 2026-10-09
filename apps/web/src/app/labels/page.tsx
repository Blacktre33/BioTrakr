'use client';

import { Suspense } from 'react';

import { LabelSheet } from '@/components/labels/label-sheet';

/** Full-page (no sidebar) so only the labels reach the printer. */
export default function LabelsPage() {
  return (
    <main className="min-h-screen print:min-h-0 print:bg-white">
      <Suspense fallback={null}>
        <LabelSheet />
      </Suspense>
    </main>
  );
}
