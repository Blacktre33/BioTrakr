import { api } from "./client";

export interface FormOption {
  value: string;
  label: string;
  /** One short line explaining the choice, for values staff may confuse. */
  hint?: string;
}

export interface AssetFormReference {
  /** Built by the API from the database enums, so every value is accepted. */
  enums: {
    assetStatus: FormOption[];
    deviceCategory: FormOption[];
    criticalityLevel: FormOption[];
    riskClassification: FormOption[];
  };
  facilities: Array<{ id: string; name: string; code: string }>;
  departments: Array<{ id: string; name: string; facilityId: string }>;
  custodians: Array<{
    id: string;
    name: string;
    jobTitle: string | null;
    facilityId: string | null;
    departmentId: string | null;
  }>;
}

export async function getAssetFormReference(): Promise<AssetFormReference> {
  const { data } = await api.get<AssetFormReference>("/reference/asset-form");
  return data;
}
