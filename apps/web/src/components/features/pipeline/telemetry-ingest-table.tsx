"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTelemetryIngestEvents } from "@/lib/hooks/use-telemetry";

const STATUS_FILTERS = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Processed", value: "processed" },
  { label: "Failed", value: "failed" },
];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "processed":
      return "success" as const;
    case "failed":
      return "destructive" as const;
    case "pending":
    default:
      return "secondary" as const;
  }
}

export function TelemetryIngestTable() {
  const { data, isLoading, refetch, isRefetching } = useTelemetryIngestEvents();
  const [status, setStatus] = useState("all");
  const [deviceSearch, setDeviceSearch] = useState("");

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.filter((event) => {
      const matchesStatus = status === "all" ? true : event.status === status;
      const matchesDevice = deviceSearch ? event.deviceId.toLowerCase().includes(deviceSearch.toLowerCase()) : true;
      return matchesStatus && matchesDevice;
    });
  }, [data, status, deviceSearch]);

  return (
    <Card>
      <CardHeader className="space-y-2 md:flex md:items-center md:justify-between md:space-y-0">
        <CardTitle>Telemetry Ingest Events</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search device"
            value={deviceSearch}
            onChange={(event) => setDeviceSearch(event.target.value)}
            className="w-48"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((option) => (
                <SelectItem key={option.label} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="secondary" onClick={() => refetch()} disabled={isLoading || isRefetching}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Asset</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Processed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Loading ingest events...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No ingest events match your filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.deviceId}</TableCell>
                  <TableCell>{event.assetId ?? "Unresolved"}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(event.status)} className="capitalize">
                      {event.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(event.receivedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    {event.processedAt
                      ? new Date(event.processedAt).toLocaleString([], { hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

