'use client';

import { Header } from '@/components/layout';
import { HelpGuide } from '@/components/help/help-guide';

/** Where to go in BioTrakr for the everyday jobs, and who to ask. */
export default function HelpPage() {
  return (
    <>
      <Header title="Help" subtitle="Where to go for the everyday jobs" />
      <HelpGuide />
    </>
  );
}
