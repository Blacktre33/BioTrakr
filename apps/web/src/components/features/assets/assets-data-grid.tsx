"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AssetStatus, AssetSummary } from "@medasset/types";

import { useAssets } from "@/lib/hooks/use-assets";

const STATUS_FILTERS: { label: string; value: AssetStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Available", value: "available" },
  { label: "In Use", value: "in_use" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Retired", value: "retired" },
];

export function AssetsDataGrid() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AssetStatus | undefined>();

  const { data, isLoading, isError, refetch } = useAssets(search, status);

  const assets = useMemo<AssetSummary[]>(() => data ?? [], [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-1 gap-3">
          <Input
            placeholder="Search by name or asset tag"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-md"
          />
          <Select value={status ?? "all"} onValueChange={(value) => setStatus(value === "all" ? undefined : (value as AssetStatus))}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.label} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="secondary" onClick={() => refetch()}>
          Refresh
        </Button>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load assets right now. Please try again in a few moments.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Asset Tag</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Facility</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={`asset-skeleton-${index}`}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : assets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell>
                      <div className="font-medium">{asset.name}</div>
                    </TableCell>
                    <TableCell>{asset.assetTag}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(asset.status)} className=" capitalize">
                        {asset.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{asset.category}</TableCell>
                    <TableCell>{asset.facility}</TableCell>
                    <TableCell>{asset.lastSeen}</TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      )}

      {!isLoading && !isError && assets.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
          No assets matched your filters.
        </div>
      ) : null}
    </div>
  );
}

function statusVariant(status: AssetStatus) {
  switch (status) {
    case "available":
      return "success" as const;
    case "in_use":
      return "secondary" as const;
    case "maintenance":
      return "outline" as const;
    case "retired":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}
