"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronRight, DoorOpen, Layers, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import type { FacilityNode } from "@/lib/api/admin";
import { useLocations, useSaveLocation } from "@/lib/hooks/use-admin";

import { LocationDialog, type LocationDialogTarget } from "./location-dialog";

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-gray-400 hover:bg-surface-200/60 hover:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
    >
      {children}
    </button>
  );
}

function FacilityCard({ facility, edit }: { facility: FacilityNode; edit: (t: LocationDialogTarget) => void }) {
  const [open, setOpen] = useState(facility.isActive);
  const save = useSaveLocation();
  const where = `in ${facility.facilityName}`;

  const toggleActive = async () => {
    try {
      await save.mutateAsync({ kind: "facilities", id: facility.id, body: { isActive: !facility.isActive } });
      toast.success(facility.isActive ? `${facility.facilityName} is now inactive` : `${facility.facilityName} is active again`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };

  const roomCount = facility.buildings.reduce(
    (n, b) => n + b.floors.reduce((m, f) => m + f.rooms.length, 0),
    0,
  );

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
          <span className="truncate font-semibold text-gray-100">{facility.facilityName}</span>
          <Badge size="sm">{facility.facilityCode}</Badge>
          {!facility.isActive && (
            <Badge size="sm" variant="warning">
              Inactive
            </Badge>
          )}
        </button>
        <span className="text-xs text-gray-400">
          {facility.departments.length} departments · {roomCount} rooms
        </span>
        <IconButton
          label={`Edit ${facility.facilityName}`}
          onClick={() => edit({ kind: "facilities", id: facility.id, initial: { ...facility } })}
        >
          <Pencil className="h-4 w-4" />
        </IconButton>
      </div>

      {open && (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <section aria-label={`Departments in ${facility.facilityName}`}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-300">Departments</h4>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => edit({ kind: "departments", parentId: facility.id, context: where })}
              >
                Department
              </Button>
            </div>
            {facility.departments.length === 0 ? (
              <p className="text-sm text-gray-500">None yet. Add the wards and units that hold equipment.</p>
            ) : (
              <ul className="divide-y divide-white/5 rounded-xl border border-white/5">
                {facility.departments.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 truncate text-gray-200">{d.departmentName}</span>
                    <span className="text-xs text-gray-500">{d.departmentCode}</span>
                    <IconButton
                      label={`Edit ${d.departmentName}`}
                      onClick={() => edit({ kind: "departments", id: d.id, initial: { ...d }, context: where })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label={`Buildings and rooms in ${facility.facilityName}`}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-300">Buildings, floors and rooms</h4>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => edit({ kind: "buildings", parentId: facility.id, context: where })}
              >
                Building
              </Button>
            </div>
            {facility.buildings.length === 0 && (
              <p className="text-sm text-gray-500">None yet. Rooms let you record exactly where a device lives.</p>
            )}
            <ul className="space-y-3">
              {facility.buildings.map((b) => (
                <li key={b.id} className="rounded-xl border border-white/5 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-gray-400" aria-hidden />
                    <span className="flex-1 truncate font-medium text-gray-200">{b.buildingName}</span>
                    <IconButton
                      label={`Edit ${b.buildingName}`}
                      onClick={() => edit({ kind: "buildings", id: b.id, initial: { ...b } })}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Add a floor to ${b.buildingName}`}
                      onClick={() => edit({ kind: "floors", parentId: b.id, context: `in ${b.buildingName}` })}
                    >
                      <Plus className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <ul className="mt-2 space-y-2 pl-4">
                    {b.floors.map((f) => {
                      const floorLabel = f.floorName || `Floor ${f.floorNumber}`;
                      return (
                        <li key={f.id}>
                          <div className="flex items-center gap-2 text-sm">
                            <Layers className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                            <span className="flex-1 truncate text-gray-300">{floorLabel}</span>
                            <IconButton
                              label={`Edit ${floorLabel}`}
                              onClick={() => edit({ kind: "floors", id: f.id, initial: { ...f } })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </IconButton>
                            <IconButton
                              label={`Add a room on ${floorLabel}`}
                              onClick={() =>
                                edit({ kind: "rooms", parentId: f.id, context: `on ${floorLabel}, ${b.buildingName}` })
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </IconButton>
                          </div>
                          {f.rooms.length > 0 && (
                            <ul className="mt-1 flex flex-wrap gap-1.5 pl-5">
                              {f.rooms.map((r) => (
                                <li key={r.id}>
                                  <button
                                    type="button"
                                    onClick={() => edit({ kind: "rooms", id: r.id, initial: { ...r } })}
                                    className="inline-flex items-center gap-1 rounded-lg bg-surface-200/50 px-2 py-1 text-xs text-gray-300 hover:bg-surface-300"
                                    title={`Edit ${r.roomName}`}
                                  >
                                    <DoorOpen className="h-3 w-3" aria-hidden />
                                    {r.roomCode} · {r.roomName}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </section>

          <div className="md:col-span-2">
            <Button size="sm" variant="ghost" onClick={toggleActive} isLoading={save.isPending}>
              {facility.isActive ? "Mark facility inactive" : "Make facility active again"}
            </Button>
            <span className="ml-2 text-xs text-gray-500">
              {facility.isActive
                ? "Inactive facilities stay in history but are hidden from pickers and imports."
                : "Hidden from pickers and imports."}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** The hospital's facilities, departments, buildings, floors and rooms. */
export function LocationsAdmin() {
  const { data, isLoading, error, refetch } = useLocations();
  const [target, setTarget] = useState<LocationDialogTarget | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          Set these up before importing devices: every device belongs to a facility and department, and can be placed
          in a room.
        </p>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setTarget({ kind: "facilities" })}>
          Add facility
        </Button>
      </div>

      {isLoading && <Skeleton className="h-32 w-full" />}
      {error && (
        <Card className="p-4">
          <p role="alert" className="text-sm text-critical-500">
            Could not load locations: {(error as Error).message}
          </p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      )}
      {data && data.length === 0 && (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No facilities yet"
          description="Start with your hospital or clinic, then add its departments and rooms."
        />
      )}
      {data?.map((f) => <FacilityCard key={f.id} facility={f} edit={setTarget} />)}

      <LocationDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
