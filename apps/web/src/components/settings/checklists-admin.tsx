"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field, SELECT_CLASS, describedBy } from "@/components/forms/form-field";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
} from "@/components/ui";
import type { Checklist, ChecklistItem } from "@/lib/api/checklists";
import { rangeText } from "@/lib/checklists";
import { useChecklists, useSaveChecklist } from "@/lib/hooks/use-checklists";

interface ItemDraft {
  key: string;
  text: string;
  kind: "check" | "reading";
  unit: string;
  min: string;
  max: string;
}

const toDraft = (i: ChecklistItem): ItemDraft => ({
  key: i.key,
  text: i.text,
  kind: i.kind,
  unit: i.unit ?? "",
  min: i.min === undefined ? "" : String(i.min),
  max: i.max === undefined ? "" : String(i.max),
});

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** What is wrong with a draft, before it is sent; the API checks the same. */
export function draftProblems(name: string, items: ItemDraft[]): string[] {
  const problems: string[] = [];
  if (!name.trim()) problems.push("Name the checklist");
  if (items.length === 0) problems.push("Add at least one item");
  items.forEach((i, n) => {
    const where = `Item ${n + 1}`;
    if (!i.text.trim()) problems.push(`${where}: say what to check`);
    const [min, max] = [num(i.min), num(i.max)];
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
      problems.push(`${where}: limits are numbers`);
    } else if (i.kind === "reading") {
      if (!i.unit.trim()) problems.push(`${where}: give the unit`);
      if (min !== undefined && max !== undefined && min > max) {
        problems.push(`${where}: the lowest value is above the highest`);
      }
    }
  });
  return problems;
}

/** A key no other item uses: item-1, item-2… */
const freshKey = (items: ItemDraft[]) => {
  let n = items.length + 1;
  while (items.some((i) => i.key === `item-${n}`)) n++;
  return `item-${n}`;
};

function ChecklistDialog({
  checklist,
  copy,
  onClose,
}: {
  /** The checklist to edit, or to copy (built-in). */
  checklist?: Checklist;
  copy?: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(checklist ? (copy ? `${checklist.name} (our copy)` : checklist.name) : "");
  const [keywords, setKeywords] = useState(checklist?.keywords.join(", ") ?? "");
  const [items, setItems] = useState<ItemDraft[]>(checklist?.items.map(toDraft) ?? []);
  const [problems, setProblems] = useState<string[]>([]);
  const save = useSaveChecklist();
  const editing = checklist && !copy;

  const set = (n: number, patch: Partial<ItemDraft>) => setItems(items.map((i, k) => (k === n ? { ...i, ...patch } : i)));
  const move = (n: number, by: number) => {
    const next = [...items];
    [next[n], next[n + by]] = [next[n + by], next[n]];
    setItems(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = draftProblems(name, items);
    setProblems(found);
    if (found.length) return;
    try {
      await save.mutateAsync({
        id: editing ? checklist.key : undefined,
        body: {
          name: name.trim(),
          keywords: keywords
            .split(",")
            .map((w) => w.trim())
            .filter(Boolean),
          items: items.map((i) => ({
            key: i.key,
            text: i.text.trim(),
            kind: i.kind,
            ...(i.kind === "reading" && i.unit.trim() ? { unit: i.unit.trim() } : {}),
            ...(i.kind === "reading" && num(i.min) !== undefined ? { min: num(i.min) } : {}),
            ...(i.kind === "reading" && num(i.max) !== undefined ? { max: num(i.max) } : {}),
          })),
          ...(editing ? { active: checklist.active } : {}),
        },
      });
      toast.success(editing ? "Checklist saved" : "Checklist added");
      onClose();
    } catch (err) {
      const message = (err as { details?: { message?: string | string[] } }).details?.message;
      setProblems(Array.isArray(message) ? message : [(err as Error).message || "Could not save"]);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit checklist" : "New PM checklist"}</DialogTitle>
          <DialogDescription>
            Past PMs keep the items as they were answered; changes apply to the next PM.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field field="cl-name" label="Name" required>
              <Input {...describedBy("cl-name")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field
              field="cl-keywords"
              label="Used for devices named"
              hint="Words in the device name, separated by commas: monitor, intellivue"
            >
              <Input
                {...describedBy("cl-keywords", undefined, "hint")}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </Field>
          </div>

          <ol className="space-y-2" aria-label="Items">
            {items.map((item, n) => (
              <li key={item.key} className="rounded-xl border border-white/10 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm text-gray-400">{n + 1}.</span>
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_8rem]">
                    <label className="text-sm text-gray-300">
                      <span className="sr-only">Item {n + 1}: what to check</span>
                      <Input
                        value={item.text}
                        maxLength={300}
                        placeholder="What to check"
                        onChange={(e) => set(n, { text: e.target.value })}
                      />
                    </label>
                    <label className="text-sm text-gray-300">
                      <span className="sr-only">Item {n + 1}: kind</span>
                      <select
                        className={SELECT_CLASS}
                        value={item.kind}
                        onChange={(e) => set(n, { kind: e.target.value as ItemDraft["kind"] })}
                      >
                        <option value="check">Check</option>
                        <option value="reading">Reading</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Move item ${n + 1} up`}
                      disabled={n === 0}
                      onClick={() => move(n, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Move item ${n + 1} down`}
                      disabled={n === items.length - 1}
                      onClick={() => move(n, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove item ${n + 1}`}
                      onClick={() => setItems(items.filter((_, k) => k !== n))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {item.kind === "reading" && (
                  <div className="mt-2 grid grid-cols-3 gap-2 pl-6">
                    {(["unit", "min", "max"] as const).map((k) => (
                      <label key={k} className="text-xs text-gray-400">
                        {k === "unit" ? "Unit" : k === "min" ? "Lowest allowed" : "Highest allowed"}
                        <Input
                          className="mt-1 py-2"
                          inputMode={k === "unit" ? "text" : "decimal"}
                          value={item[k]}
                          onChange={(e) => set(n, { [k]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() =>
              setItems([...items, { key: freshKey(items), text: "", kind: "check", unit: "", min: "", max: "" }])
            }
          >
            Add item
          </Button>

          {problems.length > 0 && (
            <ul role="alert" className="list-disc space-y-0.5 pl-5 text-sm text-critical-500">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>
              Back
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save checklist" : "Add checklist"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The preventive maintenance checklists biomed works through: the built-in
 * ones, and the hospital's own, written or copied to match its equipment
 * and its manufacturers' specifications.
 */
export function ChecklistsAdmin() {
  const checklists = useChecklists();
  const save = useSaveChecklist();
  const [editing, setEditing] = useState<{ checklist?: Checklist; copy?: boolean } | null>(null);

  const toggle = async (c: Checklist) => {
    try {
      await save.mutateAsync({
        id: c.key,
        body: { name: c.name, keywords: c.keywords, items: c.items, active: !c.active },
      });
      toast.success(c.active ? `${c.name} is no longer offered` : `${c.name} is offered again`);
    } catch (err) {
      toast.error((err as Error).message || "Could not save");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-gray-400">
          A PM uses the first checklist whose words appear in the device&apos;s name: yours first, then the built-in ones,
          then the general one. Copy a built-in checklist to change its items or limits to your manufacturers&apos;
          specifications.
        </p>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({})}>
          New checklist
        </Button>
      </div>
      {checklists.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : checklists.isError ? (
        <p role="alert" className="text-critical-500">
          Couldn&apos;t load the checklists: {checklists.error.message}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {checklists.data.checklists.map((c) => (
            <li key={c.key}>
              <Card className={c.active ? "p-4" : "p-4 opacity-60"}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium text-gray-100">{c.name}</h3>
                  <Badge variant={c.builtIn ? "neutral" : "primary"} size="sm">
                    {c.builtIn ? "Built-in" : c.active ? "Ours" : "Ours, not offered"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {c.keywords.length ? `For devices named: ${c.keywords.join(", ")}` : "For any device"} ·{" "}
                  {c.items.length} items
                  {c.items.some((i) => rangeText(i))
                    ? ` · ${c.items.filter((i) => rangeText(i)).length} readings with limits`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.builtIn ? (
                    <Button size="sm" variant="secondary" onClick={() => setEditing({ checklist: c, copy: true })}>
                      Copy to change
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ checklist: c })}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(c)} disabled={save.isPending}>
                        {c.active ? "Stop offering" : "Offer again"}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <ChecklistDialog checklist={editing.checklist} copy={editing.copy} onClose={() => setEditing(null)} />}
    </div>
  );
}
