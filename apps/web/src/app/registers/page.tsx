'use client';

import { Header } from '@/components/layout';
import { RegistersPage } from '@/components/registers/registers-page';

/** Printable registers for NABH assessment and the NHSRC formats. */
export default function Registers() {
  return (
    <>
      <div className="print:hidden">
        <Header title="Registers" subtitle="Print for NABH assessment, or take to Excel" />
      </div>
      <RegistersPage />
    </>
  );
}
