"use client";

import type { Register } from "@/lib/api/registers";
import { cn } from "@/lib/utils";

/** Who signs each register on paper. */
const SIGNATURES = ["Prepared by", "Checked by (Head, Biomedical Engineering)", "Approved by (Quality / Medical Superintendent)"];

/**
 * A register as it is printed: the hospital, what it is and for when, the
 * table, and the sign-off. On paper it is black on white, A4 landscape,
 * with the column headings repeated on every page.
 */
export function RegisterSheet({ register: r }: { register: Register }) {
  return (
    <article aria-labelledby="register-title" className="register-sheet space-y-4 rounded-2xl border border-white/10 p-6 print:rounded-none print:border-0 print:p-0">
      <style>{`@media print {
  @page { size: A4 landscape; margin: 12mm; }
  html, body { background: #fff !important; }
  .register-sheet, .register-sheet * { color: #000 !important; background: transparent !important; border-color: #000 !important; }
  .register-sheet tr { break-inside: avoid; }
}`}</style>

      <header className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{r.organization}</p>
        <h2 id="register-title" className="text-xl font-semibold text-white">
          {r.title}
        </h2>
        <p className="text-xs text-gray-400">Format: {r.basis}</p>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-300">
          <div className="flex gap-1">
            <dt>Facility:</dt>
            <dd className="font-medium">{r.facility ?? "All facilities"}</dd>
          </div>
          <div className="flex gap-1">
            <dt>{r.period ? "Period:" : "As of:"}</dt>
            <dd className="font-medium">{r.period ? `${r.period.from} to ${r.period.to}` : r.generatedAt.split(",")[0]}</dd>
          </div>
          {r.device && (
            <div className="flex gap-1">
              <dt>Equipment:</dt>
              <dd className="font-medium">{r.device}</dd>
            </div>
          )}
          <div className="flex gap-1">
            <dt>Printed from BioTrakr:</dt>
            <dd>{r.generatedAt}</dd>
          </div>
        </dl>
      </header>

      {r.truncated && (
        <p role="status" className="rounded-lg bg-warning-500/10 p-3 text-sm text-warning-500 print:border print:p-2">
          Only the first {r.rows.length.toLocaleString("en-IN")} lines are shown. Choose a shorter period or one facility
          for the full register.
        </p>
      )}

      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-sm print:text-[8.5pt]">
          <caption className="sr-only">{r.title}</caption>
          <thead>
            <tr>
              {r.columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "border border-white/15 bg-surface-200/40 px-2 py-1.5 align-bottom font-semibold text-gray-100",
                    c.align === "right" ? "text-right" : "text-left",
                    c.blank && "min-w-[8rem]",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.length === 0 ? (
              <tr>
                <td colSpan={r.columns.length} className="border border-white/15 px-2 py-4 text-center text-gray-400">
                  {r.period ? "Nothing recorded in this period." : "No devices."}
                </td>
              </tr>
            ) : (
              r.rows.map((row, i) => (
                <tr key={i} className="even:bg-white/[0.02]">
                  {r.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border border-white/10 px-2 py-1 align-top text-gray-200",
                        c.align === "right" && "text-right tabular-nums",
                      )}
                    >
                      {row[c.key] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {r.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-gray-400">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {r.kind === "survey" && (
        <p className="text-sm text-gray-300">
          Facility level: ______________________ &nbsp; HEMC members: ______________________________________________
        </p>
      )}

      <footer className="grid gap-6 pt-6 sm:grid-cols-3 print:grid-cols-3">
        {SIGNATURES.map((s) => (
          <div key={s} className="space-y-6 text-sm text-gray-300">
            <p className="font-medium">{s}</p>
            <p className="border-t border-white/20 pt-1 text-xs text-gray-400">Name, signature and date</p>
          </div>
        ))}
      </footer>
    </article>
  );
}
