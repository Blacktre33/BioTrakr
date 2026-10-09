import { DevicePage } from "@/components/assets/device/device-page";

export const metadata = { title: "Device · BioTrakr" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DevicePage assetId={id} />;
}
