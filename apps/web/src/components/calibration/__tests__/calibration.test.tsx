import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { CalibrationRecord } from "@/lib/api/calibration";

import { calibrationErrors, emptyCalibration, toCalibrationInput } from "../calibration-fields";
import { CalibrationSection } from "../calibration-section";

const record = jest.fn();
const correct = jest.fn();
let records: CalibrationRecord[] = [];

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hooks/use-calibration", () => ({
  useCalibrations: () => ({ isPending: false, data: records }),
  useRecordCalibration: () => ({ mutateAsync: record, isPending: false }),
  useCorrectCalibration: () => ({ mutateAsync: correct, isPending: false }),
}));

const cert = (over: Partial<CalibrationRecord> = {}): CalibrationRecord => ({
  id: "c1",
  assetId: "a1",
  workOrderId: "wo-1",
  calibratedAt: "2026-04-10T06:30:00.000Z",
  provider: "EXTERNAL_LAB",
  providerName: "Precise Calibration Labs",
  labAccreditationNumber: "CC-2345",
  certificateNumber: "PCL/2026/0412",
  validUntil: "2027-04-10T06:30:00.000Z",
  measurementUncertainty: "±0.5 mmHg (k=2)",
  referenceStandards: null,
  result: "PASS",
  notes: null,
  recordedAt: "2026-04-10T08:00:00.000Z",
  recordedBy: "Tara Tech",
  supersedesId: null,
  correctionReason: null,
  correctedBy: null,
  ...over,
});

describe("calibration form rules", () => {
  it("sends only the fields that apply to who did the work", () => {
    const values = {
      ...emptyCalibration(),
      provider: "IN_HOUSE" as const,
      providerName: "left over from the lab",
      labAccreditationNumber: "CC-1",
      referenceStandards: "Fluke ProSim 8, SN 1",
      validUntil: "2027-01-01",
    };
    const input = toCalibrationInput(values);
    expect(input).toMatchObject({ provider: "IN_HOUSE", referenceStandards: "Fluke ProSim 8, SN 1" });
    expect(input.providerName).toBeUndefined();
    expect(input.labAccreditationNumber).toBeUndefined();
    expect(input.validUntil).toBeDefined();
    // A failed calibration is due again at once, so its validity is not sent.
    expect(toCalibrationInput({ ...values, result: "FAIL", notes: "Drifted" }).validUntil).toBeUndefined();
  });

  it("puts each problem next to its field", () => {
    expect(calibrationErrors({ ...emptyCalibration(), provider: "VENDOR" })).toEqual({
      providerName: "Name the manufacturer or vendor",
    });
  });
});

describe("CalibrationSection", () => {
  beforeEach(() => {
    record.mockReset().mockResolvedValue({});
    correct.mockReset().mockResolvedValue({});
    records = [
      cert({ id: "c2", supersedesId: "c1", correctionReason: "Valid-until date was misread", validUntil: "2027-10-10T06:30:00.000Z" }),
      cert({ correctedBy: "c2" }),
    ];
  });

  const calibration = {
    lastCalibrationDate: "2026-04-10T06:30:00.000Z",
    nextCalibrationDue: "2027-10-10T06:30:00.000Z",
    lastResult: "PASS" as const,
    overdue: false,
  };

  it("lists certificates with the corrected one marked and the reason shown", () => {
    render(<CalibrationSection assetId="a1" equipmentName="BP monitor" calibration={calibration} canRecord={false} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText(/Correction: Valid-until date was misread/)).toBeInTheDocument();
    expect(within(items[1]).getByText("Corrected")).toBeInTheDocument();
    expect(within(items[1]).getByText(/NABL CC-2345 · Certificate PCL\/2026\/0412/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record calibration|Correct/ })).not.toBeInTheDocument();
  });

  it("lets biomed correct only the latest version, with a reason", async () => {
    const user = userEvent.setup();
    render(<CalibrationSection assetId="a1" equipmentName="BP monitor" calibration={calibration} canRecord />);
    const correctButtons = screen.getAllByRole("button", { name: "Correct" });
    expect(correctButtons).toHaveLength(1);

    await user.click(correctButtons[0]);
    expect(screen.getByLabelText(/^Laboratory/)).toHaveValue("Precise Calibration Labs");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).not.toHaveBeenCalled();
    expect(screen.getByText("Say why the record is being corrected")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Why is this being corrected/), "Certificate number had a typo");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).toHaveBeenCalledWith({
      id: "c2",
      body: expect.objectContaining({
        certificateNumber: "PCL/2026/0412",
        correctionReason: "Certificate number had a typo",
      }),
    });
  });

  it("records a certificate for a device without a work order", async () => {
    const user = userEvent.setup();
    records = [];
    render(<CalibrationSection assetId="a1" equipmentName="BP monitor" calibration={null} canRecord />);
    expect(screen.getByText(/Not in the calibration programme/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record calibration" }));
    await user.selectOptions(screen.getByLabelText(/Calibrated by/), "VENDOR");
    await user.type(screen.getByLabelText(/Manufacturer or vendor/), "Philips Healthcare");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Record calibration" }));
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ provider: "VENDOR", providerName: "Philips Healthcare" }));
  });
});
