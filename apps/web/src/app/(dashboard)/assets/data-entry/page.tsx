import type { Metadata } from "next";
import AssetDataEntry from "@/components/features/assets/asset-data-entry";

export const metadata: Metadata = {
  title: "Asset Data Entry",
  description: "Import assets from Excel or enter manually",
};

export default function AssetDataEntryPage() {
  return <AssetDataEntry />;
}

