/**
 * Pass/fail limits for recurrent electrical safety tests of medical
 * equipment under IEC 62353 (adopted in India as IS/IEC 62353), as
 * summarised in Rigel Medical's "A Practical Guide to IEC 62353":
 *
 * - Protective earth resistance (Class I, including a power cord up to
 *   3 m): 0.3 Ω; 0.5 Ω for a medical system of several items.
 * - Equipment leakage, direct or differential method: Class I 500 µA,
 *   Class II 100 µA (mobile X-ray generators 2000 µA); alternative method:
 *   Class I 1000 µA, Class II 500 µA (mobile X-ray 5000 µA).
 * - Applied part leakage (direct and alternative): BF 5000 µA, CF 50 µA
 *   (CF defibrillation paddles 100 µA); not applicable to type B.
 * - Insulation resistance: the standard gives commonly accepted minimums
 *   (the manufacturer's figure applies when it differs): mains to
 *   protective earth (Class I) 2 MΩ, mains to the enclosure (Class II)
 *   7 MΩ; mains to applied parts 70 MΩ for BF and CF, and for type B 2 MΩ
 *   (Class I) or 7 MΩ (Class II). The insulation test is optional here.
 *
 * Readings exactly at a limit pass.
 */

export type ElectricalClass = 'CLASS_I' | 'CLASS_II' | 'INTERNALLY_POWERED';
export type AppliedPartType = 'NONE' | 'B' | 'BF' | 'CF';
export type LeakageMethod = 'DIRECT' | 'DIFFERENTIAL' | 'ALTERNATIVE';

export interface SafetyMeasurements {
  electricalClass: ElectricalClass;
  appliedPartType: AppliedPartType;
  leakageMethod: LeakageMethod;
  /** Several items connected as one medical system (earth limit 0.5 Ω). */
  medicalSystem?: boolean;
  mobileXray?: boolean;
  /** CF applied parts that are defibrillation paddles (100 µA). */
  defibrillationPaddles?: boolean;
  visualInspectionPassed: boolean;
  functionalTestPassed: boolean;
  earthResistanceOhm?: number | null;
  insulationMainsMOhm?: number | null;
  insulationAppliedMOhm?: number | null;
  equipmentLeakageUa?: number | null;
  appliedPartLeakageUa?: number | null;
}

export type CheckKey =
  | 'visualInspection'
  | 'functionalTest'
  | 'earthResistance'
  | 'insulationMains'
  | 'insulationApplied'
  | 'equipmentLeakage'
  | 'appliedPartLeakage';

export interface SafetyCheck {
  key: CheckKey;
  label: string;
  /** The reading; for visual and functional checks, 1 = passed, 0 = failed. */
  value: number | null;
  unit: string | null;
  /** max: the reading must not exceed the limit; min: must not fall below. */
  rule: 'max' | 'min' | 'pass';
  limit: number | null;
  required: boolean;
  /** null when not measured and not required. */
  passed: boolean | null;
}

export interface SafetyEvaluation {
  passed: boolean;
  checks: SafetyCheck[];
  /** One sentence per failed check, for the record and the notice. */
  failures: string[];
  /** Required readings that were not given: the test is incomplete. */
  missing: string[];
}

const measured = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** The equipment leakage limit, in µA, for this class and method. */
export function equipmentLeakageLimit(m: SafetyMeasurements): number | null {
  if (m.electricalClass === 'INTERNALLY_POWERED') return null;
  const alternative = m.leakageMethod === 'ALTERNATIVE';
  if (m.mobileXray) return alternative ? 5000 : 2000;
  if (m.electricalClass === 'CLASS_I') return alternative ? 1000 : 500;
  return alternative ? 500 : 100;
}

/** The applied part leakage limit, in µA; null for type B or no applied parts. */
export function appliedPartLeakageLimit(m: SafetyMeasurements): number | null {
  if (m.appliedPartType === 'BF') return 5000;
  if (m.appliedPartType === 'CF') return m.defibrillationPaddles ? 100 : 50;
  return null;
}

export function evaluateSafetyTest(m: SafetyMeasurements): SafetyEvaluation {
  const checks: SafetyCheck[] = [];
  const mains = m.electricalClass !== 'INTERNALLY_POWERED';
  const hasAppliedParts = m.appliedPartType !== 'NONE';

  checks.push({
    key: 'visualInspection',
    label: 'Visual inspection',
    value: m.visualInspectionPassed ? 1 : 0,
    unit: null,
    rule: 'pass',
    limit: null,
    required: true,
    passed: m.visualInspectionPassed,
  });
  checks.push({
    key: 'functionalTest',
    label: 'Functional test',
    value: m.functionalTestPassed ? 1 : 0,
    unit: null,
    rule: 'pass',
    limit: null,
    required: true,
    passed: m.functionalTestPassed,
  });

  const reading = (
    key: CheckKey,
    label: string,
    value: number | null | undefined,
    unit: string,
    rule: 'max' | 'min',
    limit: number | null,
    required: boolean,
  ) => {
    if (limit === null) return;
    const v = measured(value) ? value : null;
    checks.push({
      key,
      label,
      value: v,
      unit,
      rule,
      limit,
      required,
      passed: v === null ? null : rule === 'max' ? v <= limit : v >= limit,
    });
  };

  if (m.electricalClass === 'CLASS_I') {
    reading(
      'earthResistance',
      'Protective earth resistance',
      m.earthResistanceOhm,
      'Ω',
      'max',
      m.medicalSystem ? 0.5 : 0.3,
      true,
    );
  }
  if (mains) {
    reading(
      'insulationMains',
      m.electricalClass === 'CLASS_I'
        ? 'Insulation, mains to protective earth'
        : 'Insulation, mains to enclosure',
      m.insulationMainsMOhm,
      'MΩ',
      'min',
      m.electricalClass === 'CLASS_I' ? 2 : 7,
      false,
    );
    if (hasAppliedParts) {
      reading(
        'insulationApplied',
        'Insulation, mains to applied parts',
        m.insulationAppliedMOhm,
        'MΩ',
        'min',
        m.appliedPartType === 'B'
          ? m.electricalClass === 'CLASS_I'
            ? 2
            : 7
          : 70,
        false,
      );
    }
    reading(
      'equipmentLeakage',
      'Equipment leakage current',
      m.equipmentLeakageUa,
      'µA',
      'max',
      equipmentLeakageLimit(m),
      true,
    );
  }
  reading(
    'appliedPartLeakage',
    'Applied part leakage current',
    m.appliedPartLeakageUa,
    'µA',
    'max',
    appliedPartLeakageLimit(m),
    // Battery-only equipment is tested as the manufacturer says.
    mains,
  );

  const missing = checks
    .filter((c) => c.required && c.passed === null)
    .map((c) => `Enter the ${c.label.toLowerCase()}`);
  const failures = checks
    .filter((c) => c.passed === false)
    .map((c) =>
      c.rule === 'pass'
        ? `${c.label} failed`
        : `${c.label} ${c.value} ${c.unit} is ${
            c.rule === 'max' ? 'above the' : 'below the minimum'
          } ${c.limit} ${c.unit}${c.rule === 'max' ? ' limit' : ''}`,
    );
  return {
    passed: missing.length === 0 && failures.length === 0,
    checks,
    failures,
    missing,
  };
}
