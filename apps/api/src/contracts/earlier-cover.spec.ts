import { earlierCover, trackedInNotes } from './earlier-cover';

/** What the old device form wrote into the notes. */
const OLD_NOTES = `Bought under the NHM grant.

[CONTRACT_TRACKING]
{
  "amc": {
    "initialCost": 40000
  },
  "cmc": {
    "costAnnual": 85000,
    "contractNumber": "CMC/2024/17",
    "startDate": "2024-04-01T00:00:00.000Z",
    "endDate": "2027-03-31T00:00:00.000Z"
  }
}`;

const device = (over: Record<string, unknown> = {}) => ({
  amcContractNumber: null,
  amcStartDate: null,
  amcEndDate: null,
  amcCostAnnual: null,
  amcProvider: null,
  cmcProvider: { id: 'v1', vendorName: 'Medserve' },
  notes: OLD_NOTES,
  ...over,
});

describe('trackedInNotes', () => {
  it('reads the block the old form appended, ignoring text typed after it', () => {
    expect(trackedInNotes(OLD_NOTES)?.cmc).toMatchObject({
      contractNumber: 'CMC/2024/17',
    });
    expect(
      trackedInNotes(`${OLD_NOTES}\n\nMoved to the OT {room 3} in May.`)?.cmc,
    ).toMatchObject({ costAnnual: 85000 });
  });

  it('finds nothing in ordinary notes, or a block that is not JSON', () => {
    expect(trackedInNotes(null)).toBeNull();
    expect(trackedInNotes('Ordinary notes')).toBeNull();
    expect(trackedInNotes('[CONTRACT_TRACKING]\nnot json')).toBeNull();
    expect(trackedInNotes('[CONTRACT_TRACKING]\n{"cmc": ')).toBeNull();
  });
});

describe('earlierCover', () => {
  it('offers the CMC from the notes and the AMC from the device columns', () => {
    const found = earlierCover(
      device({
        amcContractNumber: 'AMC-9',
        amcEndDate: new Date('2023-03-31'),
        amcCostAnnual: '45,000',
        amcProvider: { id: 'v2', vendorName: 'Old vendor' },
      }),
      [],
    );
    expect(found).toEqual([
      {
        contractType: 'AMC',
        vendor: { id: 'v2', vendorName: 'Old vendor' },
        contractNumber: 'AMC-9',
        startDate: null,
        endDate: new Date('2023-03-31'),
        annualValue: 45000,
      },
      {
        contractType: 'CMC',
        vendor: { id: 'v1', vendorName: 'Medserve' },
        contractNumber: 'CMC/2024/17',
        startDate: new Date('2024-04-01T00:00:00.000Z'),
        endDate: new Date('2027-03-31T00:00:00.000Z'),
        annualValue: 85000,
      },
    ]);
  });

  it('leaves out what is already a contract: same kind and number, or same end date', () => {
    const cmc = {
      contractType: 'CMC' as const,
      contractNumber: 'cmc/2024/17 ',
      endDate: new Date('2026-01-01'),
    };
    expect(earlierCover(device(), [cmc])).toEqual([]);
    expect(
      earlierCover(device(), [
        {
          ...cmc,
          contractNumber: 'PO 5512',
          endDate: new Date('2027-03-31T10:00:00.000Z'),
        },
      ]),
    ).toEqual([]);
    // An AMC with that number is something else.
    expect(
      earlierCover(device(), [{ ...cmc, contractType: 'AMC' }]),
    ).toHaveLength(1);
  });

  it('offers nothing when the device has no earlier details', () => {
    expect(earlierCover(device({ notes: 'Ordinary notes' }), [])).toEqual([]);
  });
});
