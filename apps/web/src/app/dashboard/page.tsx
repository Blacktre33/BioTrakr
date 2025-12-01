'use client';

import { motion } from 'framer-motion';
import { Header } from '@/components/layout';
import {
  MetricCards,
  UtilizationChart,
  StatusChart,
  DepartmentChart,
  MaintenanceChart,
  AlertsWidget,
  MaintenanceWidget,
} from '@/components/dashboard';
import { useAlertStore } from '@/stores';
import {
  mockDashboardMetrics,
  mockAlerts,
  mockMaintenanceOrders,
  generateUtilizationTrend,
  generateAssetsByStatus,
  generateDepartmentAssets,
  generateMaintenanceByCategory,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { acknowledgeAlert } = useAlertStore();

  const utilizationData = generateUtilizationTrend();
  const statusData = generateAssetsByStatus();
  const departmentData = generateDepartmentAssets();
  const maintenanceData = generateMaintenanceByCategory();

  return (
    <>
      <Header title="Dashboard" subtitle="Real-time overview of your healthcare assets" />

      <div className="p-6 space-y-6">
        <MetricCards metrics={mockDashboardMetrics} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <UtilizationChart data={utilizationData} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <StatusChart data={statusData} />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <motion.div className="lg:col-span-2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <DepartmentChart data={departmentData} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <MaintenanceChart data={maintenanceData} />
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
            <AlertsWidget alerts={mockAlerts} onAcknowledge={acknowledgeAlert} onViewAll={() => {}} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <MaintenanceWidget orders={mockMaintenanceOrders} onViewAll={() => {}} />
          </motion.div>
        </div>
      </div>
    </>
  );
}
