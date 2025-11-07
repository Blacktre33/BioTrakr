"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMaintenanceTasks } from "@/lib/hooks/use-telemetry";

const STATUS_FILTERS = [
  { label: "All statuses", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

const PRIORITY_FILTERS = [
  { label: "All priorities", value: "all" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const USER_LOOKUP: Record<string, string> = {
  "user-admin": "Admin User",
  "user-tech": "Biomed Technician",
};

const ASSET_LOOKUP: Record<string, string> = {
  "asset-alaris": "Infusion Pump - Alaris",
  "asset-monitor": "Patient Monitor",
  "asset-wheelchair": "Wheelchair",
};

function statusVariant(status: string) {
  switch (status) {
    case "scheduled":
      return "secondary" as const;
    case "in_progress":
      return "default" as const;
    case "completed":
      return "success" as const;
    default:
      return "outline" as const;
  }
}

export function MaintenancePlanner() {
  const { data, isLoading, refetch, isRefetching } = useMaintenanceTasks();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");

  const tasks = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.filter((task) => {
      const matchesStatus = status === "all" ? true : task.status === status;
      const matchesPriority = priority === "all" ? true : task.priority === priority;
      const matchesSearch = search
        ? task.summary.toLowerCase().includes(search.toLowerCase()) ||
          (ASSET_LOOKUP[task.assetId]?.toLowerCase().includes(search.toLowerCase()) ?? false)
        : true;

      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [data, status, priority, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by asset or summary"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((option) => (
              <SelectItem key={option.label} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter priority" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_FILTERS.map((option) => (
              <SelectItem key={option.label} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="secondary" onClick={() => refetch()} disabled={isRefetching || isLoading}>
          Refresh
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Scheduled For</TableHead>
              <TableHead>Assigned Technician</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  Loading maintenance tasks...
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No maintenance tasks match your filters.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{ASSET_LOOKUP[task.assetId] ?? task.assetId}</TableCell>
                  <TableCell className="max-w-md">
                    <div className="text-sm font-medium">{task.summary}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{task.details}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(task.status)} className="capitalize">
                      {task.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={task.priority === "high" ? "destructive" : task.priority === "low" ? "outline" : "secondary"}>
                      {task.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {task.scheduledFor
                      ? new Date(task.scheduledFor).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </TableCell>
                  <TableCell>{(task.assignedToId && USER_LOOKUP[task.assignedToId]) ?? "Unassigned"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

