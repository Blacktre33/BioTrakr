'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Plus, QrCode, ScanLine } from 'lucide-react';
import { toast } from 'sonner';

import { AssetCreateForm, AssetExcelImport } from '@/components/assets';
import { AssetList } from '@/components/assets/asset-list';
import { Header } from '@/components/layout';
import { Button } from '@/components/ui';
import { exportAssetsToExcel } from '@/lib/api/assets';
import { getSession } from '@/lib/auth/session';

/** Must match the API's ASSET_EDITOR_ROLES. */
const EDITOR_ROLES = ['admin', 'engineer'];

/** Labels for what the list is showing: same filters, no paging or form state. */
function labelQuery(searchParams: URLSearchParams | { toString(): string }): string {
  const next = new URLSearchParams(searchParams.toString());
  for (const key of ['page', 'new', 'sort', 'order']) next.delete(key);
  return next.toString();
}

function AssetsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = EDITOR_ROLES.includes(getSession()?.user.role ?? '');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportAssetsToExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `biotrakr_assets_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error((error as Error).message || 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Header
        title="Devices"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/scan">
              <Button variant="ghost" size="sm" leftIcon={<ScanLine className="w-4 h-4" />}>
                Scan
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download className="w-4 h-4" />}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
            {canEdit && (
              <>
                <Link href={`/labels?${labelQuery(searchParams)}` as never}>
                  <Button variant="ghost" size="sm" leftIcon={<QrCode className="w-4 h-4" />}>
                    Print labels
                  </Button>
                </Link>
                <AssetExcelImport
                  onImportComplete={(result) => toast.success(`Imported ${result.imported} devices`)}
                />
                <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/assets?new=true')}>
                  Add device
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="p-6">
        <AssetList />
      </div>
      {canEdit && <AssetCreateForm />}
    </>
  );
}

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetsPageContent />
    </Suspense>
  );
}
