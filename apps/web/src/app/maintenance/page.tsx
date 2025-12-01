'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, Calendar, Clock, User, Wrench, Eye, Edit, CheckCircle } from 'lucide-react';
import { Header } from '@/components/layout';
import { Card, Button, Badge, Input } from '@/components/ui';
import { mockMaintenanceOrders } from '@/lib/mock-data';
import { cn, formatDate, formatDuration } from '@/lib/utils';
import type { MaintenanceStatus, MaintenancePriority } from '@/types';

export default function MaintenancePage() {
  const [selectedStatus, setSelectedStatus] = useState<MaintenanceStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOrders = mockMaintenanceOrders.filter(order => {
    if (selectedStatus !== 'all' && order.status !== selectedStatus) return false;
    if (searchQuery && !order.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusBadge = (status: MaintenanceStatus) => {
    const config: Record<MaintenanceStatus, { variant: 'success' | 'warning' | 'critical' | 'primary' | 'accent' | 'neutral'; label: string }> = {
      scheduled: { variant: 'primary', label: 'Scheduled' },
      in_progress: { variant: 'accent', label: 'In Progress' },
      completed: { variant: 'success', label: 'Completed' },
      overdue: { variant: 'critical', label: 'Overdue' },
      cancelled: { variant: 'neutral', label: 'Cancelled' },
    };
    return <Badge variant={config[status].variant} size="sm" dot>{config[status].label}</Badge>;
  };

  const getPriorityBadge = (priority: MaintenancePriority) => {
    const config: Record<MaintenancePriority, { variant: 'success' | 'primary' | 'warning' | 'critical'; label: string }> = {
      low: { variant: 'success', label: 'Low' },
      medium: { variant: 'primary', label: 'Medium' },
      high: { variant: 'warning', label: 'High' },
      urgent: { variant: 'critical', label: 'Urgent' },
    };
    return <Badge variant={config[priority].variant} size="sm">{config[priority].label}</Badge>;
  };

  const statusTabs: { value: MaintenanceStatus | 'all'; label: string; count: number }[] = [
    { value: 'all', label: 'All Orders', count: mockMaintenanceOrders.length },
    { value: 'scheduled', label: 'Scheduled', count: mockMaintenanceOrders.filter(o => o.status === 'scheduled').length },
    { value: 'in_progress', label: 'In Progress', count: mockMaintenanceOrders.filter(o => o.status === 'in_progress').length },
    { value: 'completed', label: 'Completed', count: mockMaintenanceOrders.filter(o => o.status === 'completed').length },
  ];

  return (
    <>
      <Header title="Maintenance" subtitle="Work orders and preventive maintenance scheduling" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { label: 'Open Orders', value: 12, change: '+3', color: 'primary' },
              { label: 'In Progress', value: 5, change: '+2', color: 'accent' },
              { label: 'Overdue', value: 3, change: '-1', color: 'critical' },
              { label: 'Completed Today', value: 8, change: '+5', color: 'success' },
            ].map((stat, index) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
                <Card className="p-4">
                  <p className="text-sm text-gray-400 mb-1">{stat.label}</p>
                  <div className="flex items-end justify-between">
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <span className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded',
                      stat.color === 'critical' ? 'bg-critical-500/20 text-critical-500' :
                      stat.color === 'success' ? 'bg-success-500/20 text-success-500' : 'bg-primary-500/20 text-primary-400'
                    )}>{stat.change}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                {statusTabs.map(tab => (
                  <button
                    key={tab.value}
                    onClick={() => setSelectedStatus(tab.value)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                      selectedStatus === tab.value
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : 'text-gray-400 hover:bg-surface-200/50 border border-transparent'
                    )}
                  >
                    {tab.label}
                    <span className={cn('px-1.5 py-0.5 rounded-full text-xs', selectedStatus === tab.value ? 'bg-primary-500/30' : 'bg-surface-300/50')}>{tab.count}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Search orders..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-64" />
                <Button variant="ghost" size="sm" leftIcon={<Filter className="w-4 h-4" />}>Filters</Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="divide-y divide-white/5">
              {filteredOrders.map((order, index) => (
                <motion.div key={order.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="p-5 hover:bg-surface-200/30 transition-colors group">
                  <div className="flex items-start gap-4">
                    <div className={cn('p-3 rounded-xl', order.status === 'in_progress' ? 'bg-accent-500/20' : order.status === 'completed' ? 'bg-success-500/20' : 'bg-surface-200/50')}>
                      <Wrench className={cn('w-5 h-5', order.status === 'in_progress' ? 'text-accent-400' : order.status === 'completed' ? 'text-success-500' : 'text-gray-400')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h3 className="text-base font-semibold text-white group-hover:text-primary-400 transition-colors">{order.title}</h3>
                          {order.asset && <p className="text-sm text-gray-500 mt-0.5">{order.asset.name}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(order.status)}
                          {getPriorityBadge(order.priority)}
                        </div>
                      </div>
                      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{order.description}</p>
                      <div className="flex items-center flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-gray-500"><Calendar className="w-4 h-4" /><span>{formatDate(order.scheduledDate, 'MMM d, yyyy')}</span></div>
                        <div className="flex items-center gap-1.5 text-gray-500"><Clock className="w-4 h-4" /><span>{formatDuration(order.estimatedDuration)}</span></div>
                        <div className="flex items-center gap-1.5 text-gray-500"><User className="w-4 h-4" /><span>{order.assignedTo}</span></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-200/50 rounded-lg"><Eye className="w-4 h-4" /></button>
                      <button className="p-2 text-gray-500 hover:text-gray-300 hover:bg-surface-200/50 rounded-lg"><Edit className="w-4 h-4" /></button>
                      {order.status !== 'completed' && <button className="p-2 text-gray-500 hover:text-success-500 hover:bg-success-500/10 rounded-lg"><CheckCircle className="w-4 h-4" /></button>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
      </div>
    </>
  );
}