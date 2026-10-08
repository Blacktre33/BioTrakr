import type { Asset as ApiAsset } from '@/lib/api/assets';
import type { Asset as UiAsset, AssetStatus, AssetCategory, RiskLevel } from '@/types';

/**
 * Map API asset status to UI asset status
 */
function mapAssetStatus(apiStatus: string): AssetStatus {
  // Keys are the database AssetStatus values. Quarantined and condemned
  // devices must stand out as unsafe, never blend in as merely "offline".
  const statusMap: Record<string, AssetStatus> = {
    ACTIVE: 'operational',
    IN_SERVICE: 'operational',
    IN_MAINTENANCE: 'maintenance',
    QUARANTINED: 'critical',
    CONDEMNED: 'critical',
    RETIRED: 'decommissioned',
    DISPOSED: 'decommissioned',
  };
  return statusMap[apiStatus] ?? 'offline';
}

/**
 * Map API device category to UI asset category
 */
function mapDeviceCategory(apiCategory: string): AssetCategory {
  // Keys are the database DeviceCategory values.
  const categoryMap: Record<string, AssetCategory> = {
    IMAGING: 'diagnostic',
    DIAGNOSTIC: 'diagnostic',
    LABORATORY: 'laboratory',
    PATIENT_MONITORING: 'monitoring',
    SURGICAL: 'surgical',
    ANESTHESIA: 'surgical',
    THERAPEUTIC: 'therapeutic',
    LIFE_SUPPORT: 'therapeutic',
    STERILIZATION: 'support',
    SUPPORT_EQUIPMENT: 'support',
    IT_MEDICAL: 'support',
    OTHER: 'support',
  };
  return categoryMap[apiCategory] ?? 'support';
}

/**
 * Map API criticality level to UI risk level
 */
function mapRiskLevel(apiCriticality: string): RiskLevel {
  const riskMap: Record<string, RiskLevel> = {
    'LOW': 'low',
    'MEDIUM': 'medium',
    'HIGH': 'high',
    'CRITICAL': 'critical',
  };
  return riskMap[apiCriticality] ?? 'medium';
}

/**
 * Convert API Asset to UI Asset format
 */
export function adaptApiAssetToUi(apiAsset: ApiAsset): UiAsset {
  return {
    id: apiAsset.id,
    name: apiAsset.equipmentName,
    serialNumber: apiAsset.serialNumber,
    manufacturer: apiAsset.manufacturer,
    model: apiAsset.modelNumber,
    category: mapDeviceCategory(apiAsset.deviceCategory),
    status: mapAssetStatus(apiAsset.assetStatus),
    riskLevel: mapRiskLevel(apiAsset.criticalityLevel),
    location: {
      id: apiAsset.currentFacilityId,
      name: apiAsset.currentFacility?.facilityName || 'Unknown',
      building: apiAsset.currentRoom?.roomNumber || 'Unknown',
      floor: 0, // Not available in API response
      room: apiAsset.currentRoom?.roomNumber || 'Unknown',
      zone: '', // Not available in API response
    },
    purchaseDate: apiAsset.purchaseDate,
    warrantyExpiry: apiAsset.warrantyEndDate ?? '',
    lastMaintenance: apiAsset.lastPmDate ?? '',
    nextMaintenance: apiAsset.nextPmDueDate ?? '',
    // Not computed yet: shown as "—" rather than a made-up number.
    utilizationRate: null,
    healthScore: null,
    tags: [apiAsset.assetTagNumber],
    assignedDepartment: '', // Not directly available, would need to join with department
    createdAt: apiAsset.createdAt,
    updatedAt: apiAsset.updatedAt,
  };
}

/**
 * Convert multiple API assets to UI assets
 */
export function adaptApiAssetsToUi(apiAssets: ApiAsset[]): UiAsset[] {
  return apiAssets.map(adaptApiAssetToUi);
}

