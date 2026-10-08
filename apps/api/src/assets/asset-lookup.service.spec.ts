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
});
