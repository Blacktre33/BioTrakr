// Asset Types
export type AssetStatus = 'operational' | 'maintenance' | 'critical' | 'offline' | 'decommissioned';
export type AssetCategory = 'diagnostic' | 'therapeutic' | 'monitoring' | 'surgical' | 'laboratory' | 'support';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';

export interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  category: AssetCategory;
  status: AssetStatus;
  riskLevel: RiskLevel;
  location: Location;
  purchaseDate: string;
  warrantyExpiry: string;
  lastMaintenance: string;
  nextMaintenance: string;
  utilizationRate: number;
  healthScore: number;
  tags: string[];
  assignedDepartment: string;
  lastScan?: AssetScan;
  createdAt: string;
  updatedAt: string;
}

export interface AssetScan {
  id: string;
  assetId: string;
  scannedBy: string;
  scannedAt: string;
  locationId: string;
  notes?: string;
}

export interface Location {
  id: string;
  name: string;
  building: string;
  floor: number;
  room: string;
  zone: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  mapPosition?: {
    x: number;
    y: number;
  };
}

export interface MaintenanceOrder {
  id: string;
  assetId: string;
  asset?: Asset;
  title: string;
  description: string;
  type: 'preventive' | 'corrective' | 'predictive' | 'emergency';
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  assignedTo: string;
  scheduledDate: string;
  completedDate?: string;
  estimatedDuration: number; // in minutes
  actualDuration?: number;
  parts?: MaintenancePart[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenancePart {
  id: string;
  name: string;
  partNumber: string;
  quantity: number;
  cost: number;
}

export interface ComplianceRecord {
  id: string;
  assetId: string;
  asset?: Asset;
  standard: string;
  requirement: string;
  status: 'compliant' | 'non_compliant' | 'pending_review' | 'exempted';
  lastAudit: string;
  nextAudit: string;
  evidence?: string[];
  notes?: string;
}

export interface TelemetryData {
  assetId: string;
  timestamp: string;
  location: {
    x: number;
    y: number;
    floor: number;
    zone: string;
  };
  battery?: number;
  signalStrength?: number;
  temperature?: number;
  humidity?: number;
  motion?: boolean;
}

export interface DashboardMetrics {
  totalAssets: number;
  assetsChange: number;
  operationalAssets: number;
  operationalChange: number;
  maintenanceDue: number;
  maintenanceChange: number;
  complianceRate: number;
  complianceChange: number;
  averageUtilization: number;
  utilizationChange: number;
  criticalAlerts: number;
  alertsChange: number;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  category?: string;
}

export interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  assetId?: string;
  asset?: Asset;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'technician' | 'viewer';
  department: string;
  avatar?: string;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

// Filter types
export interface AssetFilters {
  search?: string;
  status?: AssetStatus[];
  category?: AssetCategory[];
  department?: string[];
  riskLevel?: RiskLevel[];
  location?: string[];
}

export interface MaintenanceFilters {
  search?: string;
  status?: MaintenanceStatus[];
  priority?: MaintenancePriority[];
  type?: string[];
  assignedTo?: string[];
  dateRange?: {
    start: string;
    end: string;
  };
}
