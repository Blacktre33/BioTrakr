import {
  appliedPartLeakageLimit,
  equipmentLeakageLimit,
  evaluateSafetyTest,
  type SafetyMeasurements,
} from './iec62353';

/** A Class I monitor with BF applied parts that passes everything. */
const ok = (over: Partial<SafetyMeasurements> = {}): SafetyMeasurements => ({
  electricalClass: 'CLASS_I',
  appliedPartType: 'BF',
  leakageMethod: 'DIRECT',
  visualInspectionPassed: true,
  functionalTestPassed: true,
  earthResistanceOhm: 0.12,
  equipmentLeakageUa: 120,
  appliedPartLeakageUa: 30,
  ...over,
});

describe('IEC 62353 limits', () => {
  it.each([
    ['CLASS_I', 'DIRECT', false, 500],
    ['CLASS_I', 'DIFFERENTIAL', false, 500],
    ['CLASS_I', 'ALTERNATIVE', false, 1000],
    ['CLASS_II', 'DIRECT', false, 100],
    ['CLASS_II', 'DIFFERENTIAL', false, 100],
    ['CLASS_II', 'ALTERNATIVE', false, 500],
    ['CLASS_I', 'DIRECT', true, 2000],
    ['CLASS_I', 'ALTERNATIVE', true, 5000],
  ] as const)(
    'equipment leakage, %s by the %s method (mobile X-ray: %s): %i µA',
    (electricalClass, leakageMethod, mobileXray, limit) => {
      expect(
        equipmentLeakageLimit(
          ok({ electricalClass, leakageMethod, mobileXray }),
        ),
      ).toBe(limit);
    },
  );

  it('applied part leakage: BF 5000 µA, CF 50 µA, CF paddles 100 µA, B none', () => {
    expect(appliedPartLeakageLimit(ok({ appliedPartType: 'BF' }))).toBe(5000);
    expect(appliedPartLeakageLimit(ok({ appliedPartType: 'CF' }))).toBe(50);
    expect(
      appliedPartLeakageLimit(
        ok({ appliedPartType: 'CF', defibrillationPaddles: true }),
      ),
    ).toBe(100);
    expect(appliedPartLeakageLimit(ok({ appliedPartType: 'B' }))).toBeNull();
    expect(appliedPartLeakageLimit(ok({ appliedPartType: 'NONE' }))).toBeNull();
  });
});

describe('evaluateSafetyTest', () => {
  it('passes a device within every limit', () => {
    const e = evaluateSafetyTest(ok());
    expect(e).toMatchObject({ passed: true, failures: [], missing: [] });
    expect(e.checks.map((c) => c.key)).toEqual([
      'visualInspection',
      'functionalTest',
      'earthResistance',
      'insulationMains',
      'insulationApplied',
      'equipmentLeakage',
      'appliedPartLeakage',
    ]);
  });

  it('passes readings exactly at a limit and fails just beyond it', () => {
    expect(evaluateSafetyTest(ok({ earthResistanceOhm: 0.3 })).passed).toBe(
      true,
    );
    expect(
      evaluateSafetyTest(ok({ earthResistanceOhm: 0.301 })).failures,
    ).toEqual(['Protective earth resistance 0.301 Ω is above the 0.3 Ω limit']);
    expect(evaluateSafetyTest(ok({ equipmentLeakageUa: 500 })).passed).toBe(
      true,
    );
    expect(evaluateSafetyTest(ok({ equipmentLeakageUa: 501 })).passed).toBe(
      false,
    );
    expect(
      evaluateSafetyTest(
        ok({ appliedPartType: 'CF', appliedPartLeakageUa: 50 }),
      ).passed,
    ).toBe(true);
    expect(
      evaluateSafetyTest(
        ok({ appliedPartType: 'CF', appliedPartLeakageUa: 51 }),
      ).failures,
    ).toEqual(['Applied part leakage current 51 µA is above the 50 µA limit']);
    expect(
      evaluateSafetyTest(ok({ insulationMainsMOhm: 1.9 })).failures,
    ).toEqual([
      'Insulation, mains to protective earth 1.9 MΩ is below the minimum 2 MΩ',
    ]);
    expect(evaluateSafetyTest(ok({ insulationMainsMOhm: 2 })).passed).toBe(
      true,
    );
  });

  it('allows 0.5 Ω earth resistance for a medical system', () => {
    expect(
      evaluateSafetyTest(ok({ earthResistanceOhm: 0.45, medicalSystem: true }))
        .passed,
    ).toBe(true);
    expect(evaluateSafetyTest(ok({ earthResistanceOhm: 0.45 })).passed).toBe(
      false,
    );
  });

  it('holds CF applied parts to 70 MΩ insulation and type B to the class minimum', () => {
    expect(
      evaluateSafetyTest(
        ok({
          appliedPartType: 'CF',
          insulationAppliedMOhm: 60,
          appliedPartLeakageUa: 10,
        }),
      ).failures,
    ).toEqual([
      'Insulation, mains to applied parts 60 MΩ is below the minimum 70 MΩ',
    ]);
    expect(
      evaluateSafetyTest(
        ok({
          electricalClass: 'CLASS_II',
          appliedPartType: 'B',
          earthResistanceOhm: null,
          equipmentLeakageUa: 50,
          insulationAppliedMOhm: 6,
        }),
      ).failures,
    ).toEqual([
      'Insulation, mains to applied parts 6 MΩ is below the minimum 7 MΩ',
    ]);
  });

  it('fails a failed visual inspection or functional test whatever the readings', () => {
    expect(
      evaluateSafetyTest(
        ok({ visualInspectionPassed: false, functionalTestPassed: false }),
      ).failures,
    ).toEqual(['Visual inspection failed', 'Functional test failed']);
  });

  it('lists the readings a test cannot do without', () => {
    expect(
      evaluateSafetyTest(
        ok({
          earthResistanceOhm: null,
          equipmentLeakageUa: undefined,
          appliedPartLeakageUa: null,
        }),
      ),
    ).toMatchObject({
      passed: false,
      missing: [
        'Enter the protective earth resistance',
        'Enter the equipment leakage current',
        'Enter the applied part leakage current',
      ],
    });
  });

  it('needs no earth bond for Class II, and only visual and functional checks for battery-only equipment', () => {
    const classII = evaluateSafetyTest(
      ok({
        electricalClass: 'CLASS_II',
        earthResistanceOhm: null,
        equipmentLeakageUa: 80,
      }),
    );
    expect(classII.passed).toBe(true);
    expect(classII.checks.some((c) => c.key === 'earthResistance')).toBe(false);

    const battery = evaluateSafetyTest(
      ok({
        electricalClass: 'INTERNALLY_POWERED',
        earthResistanceOhm: null,
        equipmentLeakageUa: null,
        appliedPartLeakageUa: null,
      }),
    );
    expect(battery).toMatchObject({ passed: true, missing: [] });
    expect(battery.checks.map((c) => c.key)).toEqual([
      'visualInspection',
      'functionalTest',
      'appliedPartLeakage',
    ]);
  });
});
