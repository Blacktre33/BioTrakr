import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Asset, Alert, MaintenanceOrder, AssetFilters, MaintenanceFilters } from '@/types';

interface SidebarState {
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      toggleCollapsed: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
    }),
    {
      name: 'sidebar-storage',
    }
  )
);

interface AssetFilterState {
  filters: AssetFilters;
  setFilters: (filters: Partial<AssetFilters>) => void;
  resetFilters: () => void;
}

const defaultAssetFilters: AssetFilters = {
  search: '',
  status: [],
  category: [],
  department: [],
  riskLevel: [],
  location: [],
};

export const useAssetFilterStore = create<AssetFilterState>()(
  devtools(
    (set) => ({
      filters: defaultAssetFilters,
      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),
      resetFilters: () => set({ filters: defaultAssetFilters }),
    }),
    { name: 'asset-filters' }
  )
);

interface MaintenanceFilterState {
  filters: MaintenanceFilters;
  setFilters: (filters: Partial<MaintenanceFilters>) => void;
  resetFilters: () => void;
}

const defaultMaintenanceFilters: MaintenanceFilters = {
  search: '',
  status: [],
  priority: [],
  type: [],
  assignedTo: [],
};

export const useMaintenanceFilterStore = create<MaintenanceFilterState>()(
  devtools(
    (set) => ({
      filters: defaultMaintenanceFilters,
      setFilters: (newFilters) =>
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        })),
      resetFilters: () => set({ filters: defaultMaintenanceFilters }),
    }),
    { name: 'maintenance-filters' }
  )
);

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  setAlerts: (alerts: Alert[]) => void;
  acknowledgeAlert: (alertId: string) => void;
  dismissAlert: (alertId: string) => void;
}

export const useAlertStore = create<AlertState>()(
  devtools(
    (set) => ({
      alerts: [],
      unreadCount: 0,
      setAlerts: (alerts) =>
        set({
          alerts,
          unreadCount: alerts.filter((a) => !a.acknowledged).length,
        }),
      acknowledgeAlert: (alertId) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === alertId
              ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString() }
              : a
          ),
          unreadCount: state.unreadCount - 1,
        })),
      dismissAlert: (alertId) =>
        set((state) => ({
          alerts: state.alerts.filter((a) => a.id !== alertId),
          unreadCount: state.alerts.find((a) => a.id === alertId && !a.acknowledged)
            ? state.unreadCount - 1
            : state.unreadCount,
        })),
    }),
    { name: 'alerts' }
  )
);

interface SelectedAssetState {
  selectedAsset: Asset | null;
  setSelectedAsset: (asset: Asset | null) => void;
}

export const useSelectedAssetStore = create<SelectedAssetState>()(
  (set) => ({
    selectedAsset: null,
    setSelectedAsset: (asset) => set({ selectedAsset: asset }),
  })
);

interface TrackingViewState {
  selectedFloor: number;
  selectedZone: string | null;
  showBreadcrumbs: boolean;
  setSelectedFloor: (floor: number) => void;
  setSelectedZone: (zone: string | null) => void;
  toggleBreadcrumbs: () => void;
}

export const useTrackingViewStore = create<TrackingViewState>()(
  (set) => ({
    selectedFloor: 1,
    selectedZone: null,
    showBreadcrumbs: true,
    setSelectedFloor: (floor) => set({ selectedFloor: floor }),
    setSelectedZone: (zone) => set({ selectedZone: zone }),
    toggleBreadcrumbs: () => set((state) => ({ showBreadcrumbs: !state.showBreadcrumbs })),
  })
);

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      isDark: true,
      toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
    }),
    {
      name: 'theme-storage',
    }
  )
);
