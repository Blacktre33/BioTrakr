import type { CalibrationInputDto } from './calibration.dto';
import {
  calibrationDueAfter,
  calibrationProblems,
  DEFAULT_CALIBRATION_INTERVAL_DAYS,
} from './calibration';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-11T10:00:00Z');

const input = (
  over: Partial<CalibrationInputDto> = {},
): CalibrationInputDto => ({
  calibratedAt: '2026-10-10T09:00:00Z',
  provider: 'EXTERNAL_LAB',
  providerName: 'Precise Calibration Labs',
  labAccreditationNumber: 'CC-2345',
  certificateNumber: 'PCL/2026/0412',
  measurementUncertainty: '±0.5 mmHg (k=2)',
  result: 'PASS',
  ...over,
});

describe('calibrationProblems', () => {
  it('accepts a complete certificate from a NABL laboratory', () => {
    expect(calibrationProblems(input(), now)).toEqual([]);
  });

  it('lists everything an outside laboratory certificate is missing', () => {
    expect(
      calibrationProblems(
        input({
          providerName: ' ',
          labAccreditationNumber: undefined,
          certificateNumber: '',
          measurementUncertainty: undefined,
        }),
        now,
      ),
    ).toEqual([
      'Name the laboratory',
      "Enter the laboratory's NABL accreditation number",
      'Enter the calibration certificate number',
      'Enter the measurement uncertainty stated on the certificate',
    ]);
  });

  it('asks a vendor only for its name, and in-house work for its reference', () => {
    expect(
      calibrationProblems(
        { calibratedAt: now.toISOString(), provider: 'VENDOR', result: 'PASS' },
        now,
      ),
    ).toEqual(['Name the manufacturer or vendor']);
    expect(
      calibrationProblems(
        {
          calibratedAt: now.toISOString(),
          provider: 'IN_HOUSE',
          result: 'PASS',
        },
        now,
      ),
    ).toEqual([
      'Say which reference equipment was used, and its own calibration',
    ]);
  });

  it('refuses dates in the future and validity that ends before it starts', () => {
    expect(
      calibrationProblems(
        input({
          calibratedAt: new Date(now.getTime() + 2 * DAY).toISOString(),
        }),
        now,
      ),
    ).toEqual(['The calibration date cannot be in the future']);
    expect(
      calibrationProblems(input({ validUntil: '2026-10-10T08:00:00Z' }), now),
    ).toEqual(['"Valid until" must be after the calibration date']);
  });

  it('needs a note saying what failed', () => {
    expect(calibrationProblems(input({ result: 'FAIL' }), now)).toEqual([
      'Say what was out of tolerance',
    ]);
    expect(
      calibrationProblems(
        input({ result: 'FAIL', notes: 'Reads 8 mmHg high' }),
        now,
      ),
    ).toEqual([]);
  });
});

describe('calibrationDueAfter', () => {
  const calibratedAt = new Date('2026-10-10T00:00:00Z');

  it('uses the certificate expiry when there is one', () => {
    const validUntil = new Date('2027-04-10T00:00:00Z');
    expect(
      calibrationDueAfter({ calibratedAt, validUntil, result: 'PASS' }, 90),
    ).toEqual(validUntil);
  });

  it("falls back to the device's interval, then a year", () => {
    expect(
      calibrationDueAfter(
        { calibratedAt, validUntil: null, result: 'ADJUSTED' },
        180,
      ),
    ).toEqual(new Date(calibratedAt.getTime() + 180 * DAY));
    expect(
      calibrationDueAfter(
        { calibratedAt, validUntil: null, result: 'PASS' },
        null,
      ),
    ).toEqual(
      new Date(
        calibratedAt.getTime() + DEFAULT_CALIBRATION_INTERVAL_DAYS * DAY,
      ),
    );
  });

  it('makes a failed calibration due again at once', () => {
    expect(
      calibrationDueAfter(
        {
          calibratedAt,
          validUntil: new Date('2027-10-10T00:00:00Z'),
          result: 'FAIL',
        },
        365,
      ),
    ).toEqual(calibratedAt);
  });
});
