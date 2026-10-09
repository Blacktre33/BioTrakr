'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, LogOut, UserCircle, Users } from 'lucide-react';
import { toast } from 'sonner';

import { Header } from '@/components/layout';
import { ChangePasswordForm } from '@/components/settings/change-password-form';
import { LocationsAdmin } from '@/components/settings/locations-admin';
import { PeopleAdmin } from '@/components/settings/people-admin';
import { Button, Card } from '@/components/ui';
import { api, signOut } from '@/lib/api/client';
import { getSession, ROLE_LABEL, type SessionUser } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'account', label: 'My account', icon: UserCircle, adminOnly: false },
  { id: 'locations', label: 'Facilities & rooms', icon: Building2, adminOnly: true },
  { id: 'people', label: 'People', icon: Users, adminOnly: true },
] as const;
type TabId = (typeof TABS)[number]['id'];

function MyAccount({ me }: { me: SessionUser }) {
  const [ending, setEnding] = useState(false);

  const signOutEverywhere = async () => {
    setEnding(true);
    try {
      await api.post('/auth/logout-all');
    } catch {
      // Signing out here still happens below.
    }
    await signOut();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h3 className="mb-4 font-semibold text-gray-100">You</h3>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-gray-400">Name</dt>
            <dd className="text-gray-100">
              {me.firstName} {me.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Email (you sign in with this)</dt>
            <dd className="text-gray-100">{me.email}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Role</dt>
            <dd className="text-gray-100">{ROLE_LABEL[me.role] ?? me.role}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-gray-500">To change your name or role, ask an administrator.</p>
        <div className="mt-6 border-t border-white/5 pt-4">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<LogOut className="h-4 w-4" />}
            onClick={signOutEverywhere}
            isLoading={ending}
          >
            Sign out on every device
          </Button>
          <p className="mt-2 text-xs text-gray-500">Use this if you signed in on a shared or lost device.</p>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="mb-4 font-semibold text-gray-100">Change password</h3>
        <ChangePasswordForm
          onChanged={() => toast.success('Password changed. Other devices have been signed out.')}
        />
      </Card>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [me, setMe] = useState<SessionUser | null>(null);
  useEffect(() => setMe(getSession()?.user ?? null), []);

  if (!me) return null;
  const isAdmin = me.role === 'admin';
  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly);
  const requested = searchParams.get('tab') as TabId | null;
  const active: TabId = tabs.some((t) => t.id === requested) ? requested! : 'account';

  const select = (id: TabId) => router.replace(`${pathname}?tab=${id}` as never, { scroll: false });

  return (
    <div className="space-y-6 p-4 md:p-8">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => select(t.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                active === t.id
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'text-gray-400 hover:bg-surface-200/50 hover:text-gray-200',
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden="true" />
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'account' && <MyAccount me={me} />}
        {active === 'locations' && <LocationsAdmin />}
        {active === 'people' && <PeopleAdmin />}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <Header title="Settings" subtitle="Your account, and setting up your hospital" />
      <Suspense fallback={null}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
