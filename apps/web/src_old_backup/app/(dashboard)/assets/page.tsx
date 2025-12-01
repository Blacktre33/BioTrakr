import type { Metadata } from "next";
import { AssetsPageClient } from "@/components/features/assets/assets-page-client";

export const metadata: Metadata = {
  title: "Assets",
  description: "Search, filter, and review all tracked medical devices.",
};

export default function AssetsPage() {
  return <AssetsPageClient />;
}
