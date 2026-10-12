import {
  BUILT_IN_CHECKLISTS,
  checklistFor,
  checklistProblems,
  evaluateChecklist,
  rangeText,
  type ChecklistAnswer,
  type ChecklistDef,
} from './checklists';

const builtIn = (key: string) =>
  BUILT_IN_CHECKLISTS.find((c) => c.key === `builtin:${key}`)!;

/** Every item answered with a pass (readings in range). */
const allPass = (c: ChecklistDef): ChecklistAnswer[] =>
  c.items.map((i) =>
    i.kind === 'reading'
      ? {
          key: i.key,
          reading:
            i.min !== undefined && i.max !== undefined
              ? (i.min + i.max) / 2
              : (i.min ?? i.max ?? 0),
        }
      : { key: i.key, result: 'PASS' },
  );

describe('checklistFor', () => {
  it('picks a checklist from words in the device name, most specific first', () => {
    expect(checklistFor('ICU Ventilator', []).key).toBe('builtin:ventilator');
    expect(checklistFor('Defibrillator monitor', []).key).toBe(
      'builtin:defibrillator',
    );
    expect(checklistFor('Digital BP monitor', []).key).toBe(
      'builtin:bp-apparatus',
    );
    expect(checklistFor('Patient Monitor', []).key).toBe(
      'builtin:patient-monitor',
    );
    expect(checklistFor('Syringe pump', []).key).toBe('builtin:infusion-pump');
    expect(checklistFor('Autoclave', []).key).toBe('builtin:general');
  });

  it("prefers the hospital's own checklist", () => {
    const own: ChecklistDef = {
      key: 'c1',
      name: 'Philips IntelliVue',
      keywords: ['intellivue', 'monitor'],
      items: [],
      builtIn: false,
    };
    expect(checklistFor('Patient monitor', [own]).key).toBe('c1');
  });
});

describe('evaluateChecklist', () => {
  const monitor = builtIn('patient-monitor');

  it('passes when every item passes and every reading is in range', () => {
    const r = evaluateChecklist(monitor, allPass(monitor));
    expect(r.problems).toEqual([]);
    expect(r.outcome).toBe('PASS');
    expect(r.items.find((i) => i.key === 'spo2')).toMatchObject({
      result: 'PASS',
      reading: 97,
      unit: '%',
      text: 'SpO2 with the simulator at 97%',
    });
  });

  it('works out a reading itself: out of range fails, whatever was ticked', () => {
    const answers = allPass(monitor).map((a) =>
      a.key === 'nibp-static'
        ? {
            key: a.key,
            reading: 207,
            result: 'PASS' as const,
            note: 'Reads high',
          }
        : a,
    );
    const r = evaluateChecklist(monitor, answers);
    expect(r.outcome).toBe('FAIL');
    expect(r.items.find((i) => i.key === 'nibp-static')?.result).toBe('FAIL');
  });

  it('needs every item answered, readings entered and findings described', () => {
    const answers = allPass(monitor)
      .filter((a) => a.key !== 'labels')
      .map((a) =>
        a.key === 'spo2'
          ? { key: a.key }
          : a.key === 'battery'
            ? { key: a.key, result: 'FLAG' as const }
            : a,
      );
    expect(evaluateChecklist(monitor, answers).problems).toEqual([
      'Say what was found: Battery charges and runs the device without mains',
      'Answer: Labels, warnings and the asset tag legible',
      'Enter the reading for: SpO2 with the simulator at 97%',
    ]);
  });

  it('counts a flag as the outcome when nothing failed, and allows not applicable', () => {
    const answers = allPass(monitor).map((a) =>
      a.key === 'battery'
        ? { key: a.key, result: 'NA' as const }
        : a.key === 'labels'
          ? {
              key: a.key,
              result: 'FLAG' as const,
              note: 'Asset tag faded; replaced',
            }
          : a,
    );
    const r = evaluateChecklist(monitor, answers);
    expect(r.problems).toEqual([]);
    expect(r.outcome).toBe('FLAG');
  });

  it('refuses answers to items that are not on the checklist, or twice', () => {
    const answers = [
      ...allPass(monitor),
      { key: 'oil', result: 'PASS' as const },
      { key: 'housing', result: 'PASS' as const },
    ];
    expect(evaluateChecklist(monitor, answers).problems).toEqual([
      '"oil" is not on the Patient monitor checklist',
      '"housing" is answered twice',
    ]);
  });
});

describe('checklistProblems', () => {
  it('needs a name, items with text, units for readings and sensible limits', () => {
    expect(
      checklistProblems({
        name: ' ',
        items: [
          { key: 'a', text: 'Flow', kind: 'reading', min: 10, max: 5 },
          { key: 'a', text: '', kind: 'check', max: 3 },
        ],
      }),
    ).toEqual([
      'Name the checklist',
      'Item 1: give the unit',
      'Item 1: the lowest value is above the highest',
      'Item 2: say what to check',
      'Item 2: repeats another item',
      'Item 2: only readings have limits',
    ]);
  });

  it('accepts every built-in checklist', () => {
    for (const c of BUILT_IN_CHECKLISTS)
      expect(checklistProblems(c)).toEqual([]);
  });
});

describe('rangeText', () => {
  it('says the limits as people say them', () => {
    expect(
      rangeText(
        builtIn('patient-monitor').items.find((i) => i.key === 'spo2')!,
      ),
    ).toBe('95 to 99 %');
    expect(
      rangeText(
        builtIn('defibrillator').items.find((i) => i.key === 'charge-time')!,
      ),
    ).toBe('at most 15 s');
    expect(
      rangeText(
        builtIn('oxygen-concentrator').items.find((i) => i.key === 'purity')!,
      ),
    ).toBe('at least 82 %');
  });
});
