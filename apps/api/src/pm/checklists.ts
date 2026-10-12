/**
 * Preventive maintenance checklists: what to check on each kind of device,
 * and how the answers add up. Built-in checklists follow common inspection
 * and preventive maintenance procedures; a hospital copies one to change
 * it (its own manufacturers' specifications come first).
 */

export type ItemResult = 'PASS' | 'FLAG' | 'FAIL' | 'NA';
export type PmOutcome = 'PASS' | 'FLAG' | 'FAIL';

export interface ChecklistItem {
  /** Stable within a checklist; answers refer to it. */
  key: string;
  text: string;
  /** A yes/no check, or a measured reading. */
  kind: 'check' | 'reading';
  unit?: string;
  /** A reading outside these fails. */
  min?: number;
  max?: number;
}

export interface ChecklistDef {
  /** "builtin:patient-monitor", or a hospital checklist's id. */
  key: string;
  name: string;
  /** Words in a device's name that pick this checklist. */
  keywords: string[];
  items: ChecklistItem[];
  builtIn: boolean;
}

export interface ChecklistAnswer {
  key: string;
  result?: ItemResult;
  reading?: number;
  note?: string;
}

/** An item as answered, kept with the record whatever later edits change. */
export interface AnsweredItem extends ChecklistItem {
  result: ItemResult;
  reading: number | null;
  note: string | null;
}

const check = (key: string, text: string): ChecklistItem => ({
  key,
  text,
  kind: 'check',
});
const reading = (
  key: string,
  text: string,
  unit: string,
  min?: number,
  max?: number,
): ChecklistItem => ({ key, text, kind: 'reading', unit, min, max });

/** Every electrical medical device: the physical and basic checks first. */
const PHYSICAL: ChecklistItem[] = [
  check(
    'housing',
    'Housing, knobs and mounts intact; no cracks, spills or loose parts',
  ),
  check('power-cord', 'Power cord, plug and strain relief intact'),
  check('fuses', 'Fuses or circuit breaker of the rated value'),
  check('cables', 'Patient cables, leads, hoses and accessories intact'),
  check('controls', 'Switches, controls and touchscreen respond correctly'),
  check('display', 'Display, indicators and audible signals work'),
  check('battery', 'Battery charges and runs the device without mains'),
  check('labels', 'Labels, warnings and the asset tag legible'),
];
const CLOSE: ChecklistItem[] = [
  check(
    'functional',
    "Works as intended in the manufacturer's functional test",
  ),
  check('clean', 'Cleaned and disinfected; left ready for use'),
];

/** Most specific first: a "defibrillator monitor" is a defibrillator. */
export const BUILT_IN_CHECKLISTS: ChecklistDef[] = [
  {
    key: 'builtin:defibrillator',
    name: 'Defibrillator',
    keywords: ['defib', 'aed'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      reading(
        'energy',
        'Energy delivered into the analyser at the 200 J setting',
        'J',
        170,
        230,
      ),
      reading(
        'charge-time',
        'Time to charge to maximum energy',
        's',
        undefined,
        15,
      ),
      reading('sync', 'Synchronised cardioversion delay', 'ms', undefined, 60),
      check(
        'paddles',
        'Paddles or pads, cables and connectors intact; pads in date',
      ),
      check('recorder', 'Recorder prints; event log reads'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:bp-apparatus',
    name: 'Blood pressure apparatus',
    keywords: ['sphygmo', 'bp apparatus', 'blood pressure', 'bp monitor'],
    builtIn: true,
    items: [
      check('cuff', 'Cuff, bladder, tubing and bulb free of leaks'),
      reading(
        'accuracy',
        'Reading against a reference gauge at 200 mmHg',
        'mmHg',
        197,
        203,
      ),
      check('zero', 'Reads zero with the cuff open'),
      check('labels', 'Labels and the asset tag legible'),
      check('clean', 'Cleaned and disinfected; left ready for use'),
    ],
  },
  {
    key: 'builtin:ventilator',
    name: 'Ventilator',
    keywords: ['ventilator'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      reading(
        'tidal',
        'Tidal volume delivered at a 500 mL setting',
        'mL',
        450,
        550,
      ),
      reading('o2', 'Oxygen concentration at a 60% setting', '%', 57, 63),
      reading('peep', 'PEEP at a 5 cmH2O setting', 'cmH2O', 3, 7),
      check(
        'alarms',
        'Disconnect, high pressure, low supply and power failure alarms work',
      ),
      check('filters', 'Filters, valves and sensors replaced as scheduled'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:infusion-pump',
    name: 'Infusion or syringe pump',
    keywords: ['infusion', 'syringe', 'volumetric'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      reading(
        'flow',
        'Flow rate accuracy against the analyser (deviation from set rate)',
        '%',
        -5,
        5,
      ),
      check('occlusion', 'Occlusion alarm sounds at the set pressure'),
      check('air', 'Air-in-line or empty syringe alarm sounds'),
      check('door', 'Door, clamp or plunger holder alarm works'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:oxygen-concentrator',
    name: 'Oxygen concentrator',
    keywords: ['concentrator'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      reading(
        'purity',
        'Oxygen concentration at the highest rated flow',
        '%',
        82,
      ),
      reading(
        'flow',
        'Flow at the flowmeter setting of 5 L/min',
        'L/min',
        4.5,
        5.5,
      ),
      check('filters', 'Inlet and cabinet filters cleaned or replaced'),
      check('alarms', 'Low purity and power failure alarms work'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:suction',
    name: 'Suction apparatus',
    keywords: ['suction', 'aspirator'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      check(
        'vacuum',
        'Reaches its rated vacuum and holds it with the tube closed',
      ),
      check('regulator', 'Vacuum regulator and gauge read correctly'),
      check('overflow', 'Overflow protection and bacterial filter in place'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:patient-monitor',
    name: 'Patient monitor',
    keywords: ['patient monitor', 'monitor', 'multipara'],
    builtIn: true,
    items: [
      ...PHYSICAL,
      reading(
        'ecg-hr',
        'ECG heart rate with the simulator at 80 bpm',
        'bpm',
        76,
        84,
      ),
      reading('spo2', 'SpO2 with the simulator at 97%', '%', 95, 99),
      reading(
        'nibp-static',
        'NIBP pressure check against a reference at 200 mmHg',
        'mmHg',
        197,
        203,
      ),
      check('alarms', 'Alarms sound and show at their set limits'),
      ...CLOSE,
    ],
  },
  {
    key: 'builtin:general',
    name: 'General electrical equipment',
    keywords: [],
    builtIn: true,
    items: [...PHYSICAL, ...CLOSE],
  },
];

export const GENERAL_CHECKLIST = BUILT_IN_CHECKLISTS.at(-1)!;

/**
 * The checklist for a device: the first whose keywords appear in its
 * name, the hospital's own before the built-in ones; otherwise the
 * general checklist.
 */
export function checklistFor(
  equipmentName: string,
  hospital: ChecklistDef[],
): ChecklistDef {
  const name = equipmentName.toLowerCase();
  const hits = (c: ChecklistDef) =>
    c.keywords.some((k) => k.trim() && name.includes(k.trim().toLowerCase()));
  return (
    hospital.find(hits) ?? BUILT_IN_CHECKLISTS.find(hits) ?? GENERAL_CHECKLIST
  );
}

const inRange = (item: ChecklistItem, value: number) =>
  (item.min === undefined || value >= item.min) &&
  (item.max === undefined || value <= item.max);

/** "95 to 99 %", "at most 15 s", "at least 82 %". */
export function rangeText(item: ChecklistItem): string | null {
  const unit = item.unit ? ` ${item.unit}` : '';
  if (item.min !== undefined && item.max !== undefined) {
    return `${item.min} to ${item.max}${unit}`;
  }
  if (item.max !== undefined) return `at most ${item.max}${unit}`;
  if (item.min !== undefined) return `at least ${item.min}${unit}`;
  return null;
}

/**
 * Checks the answers against the checklist and works out each reading's
 * result from its range. Every item needs an answer; anything flagged or
 * failed needs a note saying what was found. The outcome is the worst
 * result.
 */
export function evaluateChecklist(
  checklist: ChecklistDef,
  answers: ChecklistAnswer[],
): { items: AnsweredItem[]; outcome: PmOutcome; problems: string[] } {
  const problems: string[] = [];
  const byKey = new Map<string, ChecklistAnswer>();
  for (const a of answers) {
    if (!checklist.items.some((i) => i.key === a.key)) {
      problems.push(`"${a.key}" is not on the ${checklist.name} checklist`);
    } else if (byKey.has(a.key)) {
      problems.push(`"${a.key}" is answered twice`);
    } else {
      byKey.set(a.key, a);
    }
  }

  const items: AnsweredItem[] = checklist.items.map((item) => {
    const a = byKey.get(item.key);
    const note = a?.note?.trim() || null;
    let result: ItemResult | undefined = a?.result;
    let value: number | null = null;
    let missing = false;
    if (item.kind === 'reading' && result !== 'NA') {
      if (typeof a?.reading !== 'number' || !Number.isFinite(a.reading)) {
        problems.push(`Enter the reading for: ${item.text}`);
        missing = true;
      } else {
        value = a.reading;
        const limited = item.min !== undefined || item.max !== undefined;
        // A reading with limits decides for itself; a flag stays a flag
        // when it is within them.
        if (limited) {
          result = !inRange(item, value)
            ? 'FAIL'
            : result === 'FLAG'
              ? 'FLAG'
              : 'PASS';
        }
      }
    }
    if (!result && !missing) problems.push(`Answer: ${item.text}`);
    else if (
      (result === 'FLAG' || result === 'FAIL') &&
      (note?.length ?? 0) < 3
    ) {
      problems.push(`Say what was found: ${item.text}`);
    }
    return { ...item, result: result ?? 'NA', reading: value, note };
  });

  const outcome: PmOutcome = items.some((i) => i.result === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.result === 'FLAG')
      ? 'FLAG'
      : 'PASS';
  return { items, outcome, problems };
}

/** A checklist a hospital wrote: sensible items with unique keys. */
export function checklistProblems(def: {
  name: string;
  items: ChecklistItem[];
}): string[] {
  const problems: string[] = [];
  if (!def.name.trim()) problems.push('Name the checklist');
  if (def.items.length === 0) problems.push('Add at least one item');
  const keys = new Set<string>();
  def.items.forEach((item, n) => {
    const where = `Item ${n + 1}`;
    if (!item.text.trim()) problems.push(`${where}: say what to check`);
    if (keys.has(item.key)) problems.push(`${where}: repeats another item`);
    keys.add(item.key);
    if (item.kind === 'reading') {
      if (!item.unit?.trim()) problems.push(`${where}: give the unit`);
      if (
        item.min !== undefined &&
        item.max !== undefined &&
        item.min > item.max
      ) {
        problems.push(`${where}: the lowest value is above the highest`);
      }
    } else if (item.min !== undefined || item.max !== undefined) {
      problems.push(`${where}: only readings have limits`);
    }
  });
  return problems;
}
