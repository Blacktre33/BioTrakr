import { api } from "./client";

export type RegisterKind =
  | "inventory"
  | "survey"
  | "logbook"
  | "calibration"
  | "safety"
  | "pm"
  | "breakdown"
  | "contracts"
  | "uptime"
  | "condemnation"
  | "audit";

export interface RegisterInfo {
  kind: RegisterKind;
  label: string;
  group: "NHSRC formats" | "NABH registers";
  /** Covers a period (otherwise: as of today). */
  period: boolean;
  /** For one device. */
  device?: boolean;
  /** Covers the whole hospital: no facility choice. */
  wholeHospital?: boolean;
}

export const REGISTERS: RegisterInfo[] = [
  { kind: "inventory", label: "Inventory master record (Annexure F)", group: "NHSRC formats", period: false },
  { kind: "survey", label: "Annual inventory survey (Annexure D)", group: "NHSRC formats", period: false },
  { kind: "logbook", label: "Equipment maintenance logbook (Annexure E)", group: "NHSRC formats", period: true, device: true },
  { kind: "calibration", label: "Calibration register", group: "NABH registers", period: true },
  { kind: "safety", label: "Electrical safety test register", group: "NABH registers", period: true },
  { kind: "pm", label: "Preventive maintenance register", group: "NABH registers", period: true },
  { kind: "breakdown", label: "Breakdown (complaint) register", group: "NABH registers", period: true },
  { kind: "contracts", label: "AMC/CMC register", group: "NABH registers", period: true },
  { kind: "uptime", label: "Equipment uptime and breakdowns", group: "NABH registers", period: true },
  { kind: "condemnation", label: "Condemnation register", group: "NABH registers", period: true },
  { kind: "audit", label: "Edit history (audit trail)", group: "NABH registers", period: true, wholeHospital: true },
];

export interface RegisterColumn {
  key: string;
  label: string;
  align?: "right";
  /** Left empty for a signature or remark on paper. */
  blank?: boolean;
}

export interface Register {
  kind: RegisterKind;
  title: string;
  basis: string;
  organization: string;
  facility: string | null;
  period: { from: string; to: string } | null;
  device: string | null;
  generatedAt: string;
  columns: RegisterColumn[];
  rows: Array<Record<string, string | number | null>>;
  truncated: boolean;
  notes: string[];
}

export async function getRegister(
  kind: RegisterKind,
  params: { facilityId?: string; from?: string; to?: string; assetId?: string },
): Promise<Register> {
  const query = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
  const { data } = await api.get<Register>(`/registers/${kind}`, { params: query });
  return data;
}

/**
 * A spreadsheet-safe value: text a spreadsheet would run as a formula
 * (starting =, +, -, @) is prefixed with an apostrophe.
 */
function cell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The register as CSV, with a byte-order mark so Excel reads ₹ and Hindi right. */
export function registerCsv(r: Register): string {
  const lines = [
    r.columns.map((c) => cell(c.label)).join(","),
    ...r.rows.map((row) => r.columns.map((c) => cell(row[c.key] ?? null)).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "calibration-register_2026-10-11.csv" */
export function csvFileName(r: Register, today = new Date()): string {
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const slug = r.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}_${day}.csv`;
}
