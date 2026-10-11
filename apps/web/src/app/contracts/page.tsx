'use client';

import { Suspense } from 'react';

import { ContractsPage } from '@/components/contracts/contracts-page';
import { Header } from '@/components/layout';

/** AMC/CMC contracts, renewals and vendors. */
export default function Contracts() {
  return (
    <>
      <Header title="Contracts" subtitle="AMC and CMC cover, renewals and vendors" />
      {/* Reads ?id= from a notice link. */}
      <Suspense>
        <ContractsPage />
      </Suspense>
    </>
  );
}
