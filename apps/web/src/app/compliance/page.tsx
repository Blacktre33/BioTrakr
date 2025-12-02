'use client';

import { motion } from 'framer-motion';
import { Shield, CheckCircle, AlertTriangle, Clock, FileText } from 'lucide-react';
import { Header } from '@/components/layout';
import { Card, Badge } from '@/components/ui';

export default function CompliancePage() {
  const complianceItems = [
    {
      id: '1',
      title: 'FDA 510(k) Clearance',
      status: 'compliant',
      asset: 'GE Optima MR360',
      expiryDate: '2026-12-15',
      lastAudit: '2024-11-01',
    },
    {
      id: '2',
      title: 'ISO 13485 Certification',
      status: 'compliant',
      asset: 'Alaris Infusion Pump',
      expiryDate: '2025-06-30',
      lastAudit: '2024-10-15',
    },
    {
      id: '3',
      title: 'CE Marking',
      status: 'warning',
      asset: 'Philips IntelliVue MX800',
      expiryDate: '2025-03-20',
      lastAudit: '2024-09-01',
    },
    {
      id: '4',
      title: 'Health Canada License',
      status: 'expired',
      asset: 'Baxter Infusion Pump',
      expiryDate: '2024-10-31',
      lastAudit: '2024-08-15',
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="w-5 h-5 text-success-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-warning-500" />;
      case 'expired':
        return <Clock className="w-5 h-5 text-critical-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'compliant':
        return <Badge variant="success">Compliant</Badge>;
      case 'warning':
        return <Badge variant="warning">Expiring Soon</Badge>;
      case 'expired':
        return <Badge variant="critical">Expired</Badge>;
      default:
        return <Badge variant="neutral">Unknown</Badge>;
    }
  };

  return (
    <>
      <Header
        title="Compliance"
        subtitle="Regulatory status and certification tracking"
      />

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card variant="metric" accentColor="success" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Compliant</p>
                  <p className="text-2xl font-bold text-white mt-1">24</p>
                </div>
                <CheckCircle className="w-8 h-8 text-success-500" />
              </div>
            </Card>
            <Card variant="metric" accentColor="warning" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Expiring Soon</p>
                  <p className="text-2xl font-bold text-white mt-1">3</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-warning-500" />
              </div>
            </Card>
            <Card variant="metric" accentColor="critical" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Expired</p>
                  <p className="text-2xl font-bold text-white mt-1">1</p>
                </div>
                <Clock className="w-8 h-8 text-critical-500" />
              </div>
            </Card>
            <Card variant="metric" accentColor="primary" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Certifications</p>
                  <p className="text-2xl font-bold text-white mt-1">28</p>
                </div>
                <Shield className="w-8 h-8 text-primary-500" />
              </div>
            </Card>
          </div>

          {/* Compliance List */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Compliance Items</h2>
            <div className="space-y-4">
              {complianceItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 bg-surface-200/30 rounded-xl border border-white/5 hover:bg-surface-200/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {getStatusIcon(item.status)}
                    <div>
                      <h3 className="font-medium text-white">{item.title}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">{item.asset}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last audit: {item.lastAudit} • Expires: {item.expiryDate}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}

