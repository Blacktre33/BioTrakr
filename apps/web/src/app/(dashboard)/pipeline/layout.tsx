import type { ReactNode } from "react";

export default function PipelineLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6 p-6">{children}</div>;
}

