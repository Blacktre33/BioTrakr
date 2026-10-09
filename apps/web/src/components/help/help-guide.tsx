'use client';

import type { Route } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ExternalLink,
  LifeBuoy,
  ScanLine,
  Server,
  UserCog,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { Card } from '@/components/ui';

/** The install guide, for whoever runs the server. Also in the install folder (docs/). */
export const DEPLOY_GUIDE_URL = 'https://github.com/Blacktre33/BioTrakr/blob/main/docs/DEPLOY-ONPREM.md';

interface Task {
  title: string;
  href: string;
  icon: LucideIcon;
  body: string;
}

const tasks: Task[] = [
  {
    title: 'Scan a device',
    href: '/scan',
    icon: ScanLine,
    body: 'Point your phone at the label on the device. You will see OK to use, OK to use but note, or Do not use.',
  },
  {
    title: 'Report a problem',
    href: '/scan',
    icon: AlertTriangle,
    body: 'Scan the device, then tap Report a problem. If it is not safe, tick Take it out of use now. Biomed sees it in their work queue, and you get a notification when it is fixed.',
  },
  {
    title: 'Work queue',
    href: '/maintenance',
    icon: Wrench,
    body: 'For biomed: problem reports from the wards and scheduled work, urgent first.',
  },
  {
    title: 'PM schedule',
    href: '/maintenance/schedule',
    icon: CalendarClock,
    body: 'For biomed: preventive maintenance that is due, done and overdue.',
  },
];

/** Points staff at the right page for each job, and says who to ask. */
export function HelpGuide() {
  return (
    <div className="max-w-4xl space-y-8 p-4 md:p-8">
      <section aria-labelledby="help-tasks">
        <h2 id="help-tasks" className="mb-3 text-lg font-semibold text-white">
          How do I…
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <li key={task.title}>
                <Link href={task.href as Route} className="block h-full">
                  <Card variant="interactive" className="h-full p-4">
                    <p className="flex items-center gap-2 font-medium text-gray-100">
                      <Icon className="h-5 w-5 text-primary-400" aria-hidden="true" />
                      {task.title}
                      <ArrowRight className="ml-auto h-4 w-4 text-gray-500" aria-hidden="true" />
                    </p>
                    <p className="mt-2 text-sm text-gray-400">{task.body}</p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="help-contact">
        <h2 id="help-contact" className="mb-3 text-lg font-semibold text-white">
          Who to contact
        </h2>
        <Card className="divide-y divide-white/5 p-0">
          <div className="flex gap-3 p-4">
            <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-critical-500" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-100">A device is unsafe right now</p>
              <p className="mt-1 text-sm text-gray-400">
                Stop using it, report it from the scan page with Take it out of use now ticked, then phone biomedical
                engineering. Do not wait for a reply in BioTrakr.
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <UserCog className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-100">Cannot sign in, forgot your password, or need a different role</p>
              <p className="mt-1 text-sm text-gray-400">
                Ask your BioTrakr administrator. They can reset passwords and change roles under Settings, People.
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-4">
            <Server className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden="true" />
            <div>
              <p className="font-medium text-gray-100">BioTrakr is down or slow (for IT)</p>
              <p className="mt-1 text-sm text-gray-400">
                Installing, updating, backups and restoring are in the{' '}
                <a
                  href={DEPLOY_GUIDE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary-400 underline-offset-4 hover:underline"
                >
                  install guide (docs/DEPLOY-ONPREM.md)
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                , also in the install folder on the server.
              </p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
