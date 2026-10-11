"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";

import { DevicePicker, type PickedDevice } from "@/components/contracts/device-picker";
import { SELECT_CLASS } from "@/components/forms/form-field";
import { Button, Input, Label, Skeleton } from "@/components/ui";
import { csvFileName, getRegister, registerCsv, REGISTERS, type RegisterKind } from "@/lib/api/registers";
import { useAssetFormReference } from "@/lib/hooks/use-asset-form-reference";

import { RegisterSheet } from "./register-sheet";

const pad = (n: number) => String(n).padStart(2, "0");
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const yearAgo = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1);
  return toDay(d);
};

/** Choose a register and its period, then print it or take it to Excel. */
export function RegistersPage() {
  const [kind, setKind] = useState<RegisterKind>("inventory");
  const [facilityId, setFacilityId] = useState("");
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(() => toDay(new Date()));
  const [device, setDevice] = useState<PickedDevice[]>([]);
  const reference = useAssetFormReference();
  const facilities = reference.data?.facilities ?? [];

  const info = REGISTERS.find((r) => r.kind === kind)!;
  const periodProblem = info.period && from && to && from > to ? "The period must start before it ends" : null;
  const ready = (!info.device || device.length === 1) && !periodProblem;
  const register = useQuery({
    queryKey: ["registers", kind, facilityId, info.period ? from : null, info.period ? to : null, device[0]?.id ?? null],
    queryFn: () =>
      getRegister(kind, {
        facilityId: facilityId || undefined,
        from: info.period ? from : undefined,
        to: info.period ? to : undefined,
        assetId: info.device ? device[0]?.id : undefined,
      }),
    enabled: ready,
  });

  const download = () => {
    if (!register.data) return;
    const url = URL.createObjectURL(new Blob([registerCsv(register.data)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(register.data);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 print:max-w-none print:p-0">
      <section aria-label="Choose a register" className="space-y-4 print:hidden">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="register-kind">Register</Label>
            <select
              id="register-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as RegisterKind)}
              className={SELECT_CLASS}
            >
              {(["NHSRC formats", "NABH registers"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {REGISTERS.filter((r) => r.group === group).map((r) => (
                    <option key={r.kind} value={r.kind}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {facilities.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="register-facility">Facility</Label>
              <select
                id="register-facility"
                value={facilityId}
                onChange={(e) => setFacilityId(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">All facilities</option>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {info.period && (
          <div className="grid gap-4 sm:grid-cols-2 md:max-w-lg">
            <div className="space-y-1.5">
              <Label htmlFor="register-from">From</Label>
              <Input id="register-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-to">To</Label>
              <Input id="register-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        )}
        {periodProblem && (
          <p role="alert" className="text-sm text-critical-500">
            {periodProblem}
          </p>
        )}

        {info.device && (
          <div className="space-y-1.5 md:max-w-xl">
            <Label htmlFor="register-device">Device</Label>
            {/* One device: choosing another replaces it. */}
            <DevicePicker id="register-device" value={device} onChange={(list) => setDevice(list.slice(-1))} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button leftIcon={<Printer className="h-4 w-4" />} disabled={!register.data} onClick={() => window.print()}>
            Print
          </Button>
          <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} disabled={!register.data} onClick={download}>
            Download for Excel (CSV)
          </Button>
        </div>
      </section>

      {!ready && info.device ? (
        <p className="text-sm text-gray-400 print:hidden">Choose the device whose logbook you want.</p>
      ) : !ready ? null : register.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : register.isError ? (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load the register: {register.error.message}
        </p>
      ) : (
        <RegisterSheet register={register.data} />
      )}
    </div>
  );
}
