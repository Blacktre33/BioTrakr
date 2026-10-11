import { BadRequestException } from '@nestjs/common';

import { assetAlerts, parseScanCode } from './asset-lookup.service';

const ID = '11111111-1111-4111-8111-111111111111';

describe('parseScanCode', () => {
  it.each([
    ['BME-2024-001', { kind: 'tag', tag: 'BME-2024-001' }],
    ['  bme-2024-001\r\n', { kind: 'tag', tag: 'bme-2024-001' }],
    ['VENT:7', { kind: 'tag', tag: 'VENT:7' }],
    [ID, { kind: 'id', id: ID }],
    [ID.toUpperCase(), { kind: 'id', id: ID }],
    [`biotrakr://asset/${ID}`, { kind: 'id', id: ID }],
    [`https://biotrakr.example/assets/${ID}`, { kind: 'id', id: ID }],
    ['https://biotrakr.example/scan?code=BME-7', { kind: 'tag', tag: 'BME-7' }],
    [`https://biotrakr.example/scan?code=${ID}`, { kind: 'id', id: ID }],
  ])('%j -> %j', (raw, expected) => {
    expect(parseScanCode(raw)).toEqual(expected);
  });

  it.each(['', '   ', undefined, 'x'.repeat(501), 'https://example.com/menu'])(
    'rejects %j',
    (raw) => {
      expect(() => parseScanCode(raw)).toThrow(BadRequestException);
    },
  );
});

describe('assetAlerts', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const ok = {
    assetStatus: 'ACTIVE' as const,
    recallStatus: 'NONE' as const,
    nextPmDueDate: new Date('2026-12-01'),
  };

  it('has nothing to say about a healthy, in-date device', () => {
    expect(assetAlerts(ok, now)).toEqual([]);
  });

  it('tells staff not to use a quarantined device', () => {
    expect(assetAlerts({ ...ok, assetStatus: 'QUARANTINED' }, now)).toEqual([
      { level: 'stop', message: 'Quarantined. Do not use on patients.' },
    ]);
  });

  it('treats a Class I recall as stop and lower classes as caution', () => {
    expect(assetAlerts({ ...ok, recallStatus: 'CLASS_I' }, now)[0].level).toBe(
      'stop',
    );
    expect(
      assetAlerts({ ...ok, recallStatus: 'CLASS_III' }, now)[0].level,
    ).toBe('caution');
  });

  it('flags overdue PM as a caution and lists stops first', () => {
    const alerts = assetAlerts(
      {
        assetStatus: 'IN_MAINTENANCE',
        recallStatus: 'NONE',
        nextPmDueDate: new Date('2026-10-01'),
      },
      now,
    );
    expect(alerts.map((a) => a.level)).toEqual(['stop', 'caution']);
    expect(alerts[1].message).toMatch(/overdue/);
  });

  describe('calibration', () => {
    const inProgramme = {
      ...ok,
      requiresCalibration: true,
      nextCalibrationDue: new Date('2026-12-01'),
      lastCalibrationResult: 'PASS' as const,
    };

    it('is quiet while calibration is in date', () => {
      expect(assetAlerts(inProgramme, now)).toEqual([]);
    });

    it('cautions when calibration is overdue', () => {
      const alerts = assetAlerts(
        { ...inProgramme, nextCalibrationDue: new Date('2026-10-01') },
        now,
      );
      expect(alerts).toEqual([
        {
          level: 'caution',
          message:
            'Calibration is overdue. Readings may be off; let biomedical engineering know.',
        },
      ]);
    });

    it('says nothing about devices outside the calibration programme', () => {
      expect(
        assetAlerts(
          {
            ...inProgramme,
            requiresCalibration: false,
            nextCalibrationDue: new Date('2026-10-01'),
          },
          now,
        ),
      ).toEqual([]);
    });

    it('stops use after a failed calibration, even if the status says active', () => {
      const alerts = assetAlerts(
        {
          ...inProgramme,
          lastCalibrationResult: 'FAIL',
          nextCalibrationDue: new Date('2026-10-01'),
        },
        now,
      );
      expect(alerts).toEqual([
        {
          level: 'stop',
          message:
            'Failed its last calibration. Do not use until biomedical engineering recalibrates it.',
        },
      ]);
    });
  });

  describe('electrical safety tests', () => {
    const inProgramme = {
      ...ok,
      requiresSafetyTest: true,
      nextSafetyInspectionDue: new Date('2026-12-01'),
      lastSafetyTestPassed: true,
    };

    it('is quiet while the test is in date', () => {
      expect(assetAlerts(inProgramme, now)).toEqual([]);
    });

    it('cautions when the test is overdue', () => {
      expect(
        assetAlerts(
          { ...inProgramme, nextSafetyInspectionDue: new Date('2026-10-01') },
          now,
        ),
      ).toEqual([
        {
          level: 'caution',
          message:
            'Electrical safety test is overdue. Let biomedical engineering know.',
        },
      ]);
    });

    it('says nothing about devices outside the programme', () => {
      expect(
        assetAlerts(
          {
            ...inProgramme,
            requiresSafetyTest: false,
            nextSafetyInspectionDue: new Date('2026-10-01'),
          },
          now,
        ),
      ).toEqual([]);
    });

    it('stops use after a failed test, even if the status says active', () => {
      expect(
        assetAlerts(
          {
            ...inProgramme,
            lastSafetyTestPassed: false,
            nextSafetyInspectionDue: new Date('2026-10-01'),
          },
          now,
        ),
      ).toEqual([
        {
          level: 'stop',
          message:
            'Failed its last electrical safety test. Do not use until biomedical engineering retests it.',
        },
      ]);
    });

    it('has nothing to say before the first test is recorded', () => {
      expect(
        assetAlerts({ ...inProgramme, lastSafetyTestPassed: null }, now),
      ).toEqual([]);
    });
  });
});
