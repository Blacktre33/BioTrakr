'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Bell, Shield, Database, Palette, Globe } from 'lucide-react';
import { Header } from '@/components/layout';
import { Card, Button, Input, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  const settingsSections = [
    {
      id: 'profile',
      title: 'Profile Settings',
      icon: User,
      description: 'Manage your account information',
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      description: 'Configure alert preferences',
    },
    {
      id: 'security',
      title: 'Security & Privacy',
      icon: Shield,
      description: 'Password and security settings',
    },
    {
      id: 'data',
      title: 'Data Management',
      icon: Database,
      description: 'Backup and export settings',
    },
    {
      id: 'appearance',
      title: 'Appearance',
      icon: Palette,
      description: 'Theme and display preferences',
    },
    {
      id: 'localization',
      title: 'Localization',
      icon: Globe,
      description: 'Language and region settings',
    },
  ];

  return (
    <>
      <Header
        title="Settings"
        subtitle="Manage your account and application preferences"
      />

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <Card
                  key={section.id}
                  variant="interactive"
                  className="p-6 cursor-pointer"
                  onClick={() => {
                    // In a real app, this would navigate to a detailed settings page
                    console.log(`Navigate to ${section.id} settings`);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary-500/20 rounded-xl">
                      <Icon className="w-6 h-6 text-primary-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-white mb-1">{section.title}</h3>
                      <p className="text-sm text-gray-400">{section.description}</p>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Notification Preferences */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="w-5 h-5 text-primary-400" />
              <h2 className="text-lg font-semibold text-white">Notification Preferences</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-surface-200/30 rounded-xl">
                <div>
                  <p className="font-medium text-white">Enable Notifications</p>
                  <p className="text-sm text-gray-400 mt-0.5">Receive system alerts and updates</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-200/30 rounded-xl">
                <div>
                  <p className="font-medium text-white">Email Notifications</p>
                  <p className="text-sm text-gray-400 mt-0.5">Receive alerts via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                    disabled={!notificationsEnabled}
                  />
                  <div className={cn(
                    "w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500",
                    !notificationsEnabled && "opacity-50 cursor-not-allowed"
                  )}></div>
                </label>
              </div>
              <div className="flex items-center justify-between p-4 bg-surface-200/30 rounded-xl">
                <div>
                  <p className="font-medium text-white">Push Notifications</p>
                  <p className="text-sm text-gray-400 mt-0.5">Receive browser push notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushNotifications}
                    onChange={(e) => setPushNotifications(e.target.checked)}
                    className="sr-only peer"
                    disabled={!notificationsEnabled}
                  />
                  <div className={cn(
                    "w-11 h-6 bg-surface-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500",
                    !notificationsEnabled && "opacity-50 cursor-not-allowed"
                  )}></div>
                </label>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
}

