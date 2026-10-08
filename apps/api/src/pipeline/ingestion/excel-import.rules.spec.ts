import {
  checkRow,
  mapHeaders,
  matchCategory,
  matchRiskClass,
  matchStatus,
  parseDateCell,
  parsePrice,
  type ImportReference,
  type SheetRow,
} from './excel-import.rules';

const reference: ImportReference = {
  facilities: [
    { id: 'f1', facilityCode: 'CG', facilityName: 'City General' },
    { id: 'f2', facilityCode: 'NW', facilityName: 'North Wing' },
  ],
  departments: [
    {
      id: 'd1',
      facilityId: 'f1',
      departmentCode: 'ICU',
      departmentName: 'Intensive Care',
    },
    {
      id: 'd2',
      facilityId: 'f2',
      departmentCode: 'OT',
      departmentName: 'Theatres',
    },
  ],
};

const TODAY = new Date('2026-10-08T12:00:00Z');

const validRow: SheetRow = {
  row: 2,
  values: {
    assetTag: 'VENT-7',
    equipmentName: 'ICU ventilator',
    manufacturer: 'Dräger',
    modelNumber: 'V500',
    serialNumber: 'SN1',
    category: 'Life Support',
    criticality: 'critical',
    riskClass: 'Class II',
    status: 'Available',
    facilityCode: 'cg',
    departmentCode: 'ICU',
    purchaseDate: '2024-01-15',
    purchasePrice: '1.25 lakh',
  },
};

describe('mapHeaders', () => {
  it('reads the current template, with or without asterisks', () => {
    const { missing, ignored } = mapHeaders([
      'Asset Tag*',
      'Equipment Name*',
      'Manufacturer',
      'Model Number*',
      'Category*',
      'Criticality*',
      'Risk Class*',
      'Status*',
      'Facility Code*',
      'Department Code*',
      'Purchase Date*',
    ]);
    expect(missing).toEqual([]);
    expect(ignored).toEqual([]);
  });

  it('names what an old template is missing and which columns it ignores', () => {
    const { missing, ignored, columns } = mapHeaders([
      'Asset Tag*',
      'Asset Type*',
      'Asset Category*',
      'Manufacturer*',
      'Model Number*',
      'Facility Code*',
      'Department Code',
      'Status*',
      'Condition*',
      'Acquisition Date',
      'Lot Number',
    ]);
    expect(missing.map((c) => c.header)).toEqual(['Criticality', 'Risk Class']);
    expect(ignored).toEqual(['Condition*', 'Lot Number']);
    expect(columns.get(1)).toBe('equipmentName');
    expect(columns.get(9)).toBe('purchaseDate');
  });

  it('flags a field that appears twice instead of letting the last one win', () => {
    const { duplicates } = mapHeaders(['Asset Tag', 'Status', 'Asset Status']);
    expect(duplicates).toEqual(['Status']);
  });
});

describe('value matching', () => {
  it.each(['Life Support', 'life_support', 'LIFE_SUPPORT', ' life support '])(
    'category %j',
    (raw) => expect(matchCategory(raw)).toBe('LIFE_SUPPORT'),
  );
  it('maps old template words to real statuses', () => {
    expect(matchStatus('Available')).toBe('ACTIVE');
    expect(matchStatus('In_Use')).toBe('IN_SERVICE');
    expect(matchStatus('Repair')).toBe('IN_MAINTENANCE');
    expect(matchStatus('Quarantine')).toBe('QUARANTINED');
    expect(matchStatus('Decommissioned')).toBe('RETIRED');
  });
  it.each([
    ['Class II', 'CLASS_II'],
    ['II', 'CLASS_II'],
    ['2', 'CLASS_II'],
    ['class 3', 'CLASS_III'],
  ])('risk class %j -> %s', (raw, expected) => {
    expect(matchRiskClass(raw)).toBe(expected);
  });
  it('refuses to guess', () => {
    expect(matchCategory('Medical Equipment')).toBeNull();
    expect(matchRiskClass('IIb')).toBeNull();
    expect(matchStatus('Fine')).toBeNull();
  });
});

describe('parseDateCell', () => {
  it('reads ISO dates and Excel date serials as UTC calendar dates', () => {
    expect(parseDateCell('2024-01-15')).toEqual(
      new Date('2024-01-15T00:00:00Z'),
    );
    expect(parseDateCell(45306)).toEqual(new Date('2024-01-15T00:00:00Z'));
    expect(parseDateCell('')).toBeNull();
  });
  it('rejects ambiguous or impossible dates', () => {
    expect(parseDateCell('05/01/2024')).toBe('invalid');
    expect(parseDateCell('2024-02-30')).toBe('invalid');
  });
  it('rejects a bare year typed into a date column', () => {
    // As an Excel date, 2024 is 1905-07-16.
    expect(parseDateCell(2024)).toBe('invalid');
    expect(parseDateCell('1905-07-16')).toBe('invalid');
  });
  it('reads dates from workbooks that count from 1904', () => {
    expect(parseDateCell(43844, true)).toEqual(
      new Date('2024-01-15T00:00:00Z'),
    );
  });
});

describe('parsePrice', () => {
  it.each([
    ['1.25 lakh', 125000],
    ['₹1,25,000', 125000],
    ['2 crore', 20000000],
    ['Rs. 500', 500],
    [0, 0],
    [12.5, 12.5],
  ])('%j -> %d', (raw, expected) => expect(parsePrice(raw)).toBe(expected));
  it('rejects amounts too large for the database', () => {
    expect(parsePrice('2000 crore')).toBe('invalid');
    expect(parsePrice(9_999_999_999.99)).toBe(9_999_999_999.99);
  });
  it('rejects negative and non-numeric amounts', () => {
    expect(parsePrice('-5')).toBe('invalid');
    expect(parsePrice(-5)).toBe('invalid');
    expect(parsePrice('about 5k')).toBe('invalid');
    expect(parsePrice(null)).toBeNull();
  });
});

describe('checkRow', () => {
  it('turns a valid row into a draft', () => {
    const { draft, errors, warnings } = checkRow(validRow, reference, TODAY);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(draft).toMatchObject({
      assetTagNumber: 'VENT-7',
      deviceCategory: 'LIFE_SUPPORT',
      criticalityLevel: 'CRITICAL',
      riskClassification: 'CLASS_II',
      assetStatus: 'ACTIVE',
      currentFacilityId: 'f1',
      custodianDepartmentId: 'd1',
      purchaseCost: 125000,
      usefulLifeYears: 10,
      purchaseDate: new Date('2024-01-15T00:00:00Z'),
    });
  });

  it('does not create facilities or departments from what was typed', () => {
    const unknownFacility = checkRow(
      { row: 3, values: { ...validRow.values, facilityCode: 'CITY GEN' } },
      reference,
      TODAY,
    );
    expect(unknownFacility.errors).toEqual([
      expect.objectContaining({
        row: 3,
        field: 'Facility Code',
        message: expect.stringContaining('Known codes: CG, NW'),
      }),
    ]);

    const wrongFacilityDept = checkRow(
      { row: 4, values: { ...validRow.values, departmentCode: 'OT' } },
      reference,
      TODAY,
    );
    expect(wrongFacilityDept.errors[0]).toMatchObject({
      field: 'Department Code',
      message: 'No department with this code in City General',
    });
  });

  it('reports every problem in a row at once', () => {
    const { draft, errors } = checkRow(
      {
        row: 5,
        values: {
          ...validRow.values,
          equipmentName: '',
          riskClass: 'IIb',
          purchaseDate: '2027-01-01',
          usefulLifeYears: 0,
        },
      },
      reference,
      TODAY,
    );
    expect(draft).toBeUndefined();
    expect(errors.map((e) => [e.field, e.message])).toEqual([
      ['Equipment Name', 'Required'],
      [
        'Risk Class',
        expect.stringContaining('Use one of: Class I, Class II, Class III'),
      ],
      ['Purchase Date', "Can't be in the future"],
      ['Useful Life (Years)', 'Whole number of years, 1 to 50'],
    ]);
  });

  it('warns, but accepts, a missing price or serial number', () => {
    const { draft, warnings } = checkRow(
      {
        row: 6,
        values: { ...validRow.values, purchasePrice: null, serialNumber: '' },
      },
      reference,
      TODAY,
    );
    expect(draft?.purchaseCost).toBe(0);
    expect(warnings.map((w) => w.message)).toEqual([
      'No purchase price; recorded as 0',
      'No serial number',
    ]);
  });
});
