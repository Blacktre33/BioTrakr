'use client';

import { Header } from '@/components/layout';
import { TrainingPage } from '@/components/training/training-page';

/** Training on medical equipment, and who attended. */
export default function Training() {
  return (
    <>
      <Header title="Training" subtitle="Who is trained on which equipment" />
      <TrainingPage />
    </>
  );
}
