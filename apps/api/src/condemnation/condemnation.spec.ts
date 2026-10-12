import {
  ageYears,
  bookValue,
  clearanceFor,
  clearanceNeeded,
  reasonsText,
  repairShare,
} from './condemnation';

const YEAR = 365.25 * 24 * 60 * 60 * 1000;
const at = new Date('2026-10-12T00:00:00Z');
const ago = (years: number) => new Date(at.getTime() - years * YEAR);

describe('bookValue', () => {
  const device = (years: number, salvageValue = 10000) => ({
    purchaseCost: 110000,
    salvageValue,
    usefulLifeYears: 10,
    purchaseDate: ago(years),
  });

  it('takes an equal share of cost less salvage off each year', () => {
    expect(bookValue(device(0), at)).toBe(110000);
    expect(bookValue(device(4), at)).toBe(70000);
    expect(bookValue(device(2.5), at)).toBe(85000);
  });

  it('never goes below the salvage value', () => {
    expect(bookValue(device(10), at)).toBe(10000);
    expect(bookValue(device(14), at)).toBe(10000);
    expect(bookValue(device(14, 0), at)).toBe(0);
  });

  it('copes with a salvage value above cost, a future date and no life', () => {
    expect(bookValue(device(3, 500000), at)).toBe(110000);
    expect(bookValue(device(-1), at)).toBe(110000);
    expect(bookValue({ ...device(3), usefulLifeYears: 0 }, at)).toBe(10000);
  });
});

it('ageYears rounds to a tenth and never goes negative', () => {
  expect(ageYears(ago(9.04), at)).toBe(9);
  expect(ageYears(ago(2.46), at)).toBe(2.5);
  expect(ageYears(ago(-1), at)).toBe(0);
});

it('repairShare compares the repair with the value', () => {
  expect(repairShare(30000, 47500)).toBe(63);
  expect(repairShare(null, 47500)).toBeNull();
  expect(repairShare(30000, 0)).toBeNull();
});

it('reasonsText reads the reasons as people say them', () => {
  expect(reasonsText(['obsolete', 'unsafe'])).toBe(
    'Obsolete technology; Unsafe, and cannot be made safe',
  );
});

describe('clearanceFor', () => {
  it('knows radiation equipment from its name', () => {
    for (const name of [
      'Portable X-ray unit',
      'Xray machine 500 mA',
      'CT scanner 16 slice',
      'C-arm image intensifier',
      'Digital radiography system',
      'Mammography unit',
      'Cath lab',
      'OPG machine',
    ])
      expect([name, clearanceFor(name)]).toEqual([name, 'aerb']);
  });

  it('knows ultrasound machines, and leaves everything else alone', () => {
    expect(clearanceFor('Ultrasound machine')).toBe('pc-pndt');
    expect(clearanceFor('USG colour doppler')).toBe('pc-pndt');
    expect(clearanceFor('Echocardiography system')).toBe('pc-pndt');
    for (const name of [
      'ECG machine',
      'Ventilator',
      'Radiology PACS workstation',
      'Electrocautery unit',
      'Suction apparatus',
    ])
      expect([name, clearanceFor(name)]).toEqual([name, null]);
  });
});

it('clearanceNeeded: AERB always; PC-PNDT unless it is recycled', () => {
  expect(clearanceNeeded('aerb', 'E_WASTE_RECYCLER')).toBe(true);
  expect(clearanceNeeded('pc-pndt', 'AUCTION')).toBe(true);
  expect(clearanceNeeded('pc-pndt', 'TRANSFER')).toBe(true);
  expect(clearanceNeeded('pc-pndt', 'E_WASTE_RECYCLER')).toBe(false);
  expect(clearanceNeeded(null, 'AUCTION')).toBe(false);
});
