import type { Asset as ApiAsset } from '@/lib/api/assets';
import type { Asset as UiAsset, AssetStatus, AssetCategory, RiskLevel } from '@/types';

/**
 * Map API asset status to UI asset status
 */
function mapAssetStatus(apiStatus: string): AssetStatus {
  const statusMap: Record<string, AssetStatus> = {
    'ACTIVE': 'operational',
    'IN_SERVICE': 'operational',
    'MAINTENANCE': 'maintenance',
    'OUT_OF_SERVICE': 'offline',
    'DECOMMISSIONED': 'decommissioned',
    'RETIRED': 'decommissioned',
    'CRITICAL': 'critical',
  };
  return statusMap[apiStatus] || 'offline';
}

/**
 * Map API device category to UI asset category
 */
function mapDeviceCategory(apiCategory: string): AssetCategory {
  const categoryMap: Record<string, AssetCategory> = {
    'DIAGNOSTIC_IMAGING': 'diagnostic',
    'LABORATORY': 'laboratory',
    'MONITORING': 'monitoring',
    'SURGICAL': 'surgical',
    'THERAPEUTIC': 'therapeutic',
    'SUPPORT': 'support',
  };
  return categoryMap[apiCategory] || 'support';
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
  return riskMap[apiCriticality] || 'medium';
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
    warrantyExpiry: '', // Not available in API response
    lastMaintenance: '', // Not available in API response
    nextMaintenance: '', // Not available in API response
    utilizationRate: 0, // Would need to fetch from utilization API
    healthScore: 85, // Default value, would need to calculate from maintenance data
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

