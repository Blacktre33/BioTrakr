import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SafetyTestRecord } from "@/lib/api/safety-tests";
import { evaluateSafetyTest, type SafetyMeasurements } from "@/lib/iec62353";

// The API's copy of the limits: the form must judge readings as the API will.
import { evaluateSafetyTest as apiEvaluate } from "../../../../../api/src/safety-tests/iec62353";
import { emptySafetyTest, expectedResult, safetyTestErrors, toSafetyTestInput } from "../safety-test-fields";
import { SafetyTestSection } from "../safety-test-section";

const record = jest.fn();
const correct = jest.fn();
let records: SafetyTestRecord[] = [];

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hooks/use-safety-tests", () => ({
  useSafetyTests: () => ({ isPending: false, data: records }),
  useRecordSafetyTest: () => ({ mutateAsync: record, isPending: false }),
  useCorrectSafetyTest: () => ({ mutateAsync: correct, isPending: false }),
}));

describe("IEC 62353 limits", () => {
  it("are the same as the API's for every class, applied part, method and reading", () => {
    const classes = ["CLASS_I", "CLASS_II", "INTERNALLY_POWERED"] as const;
    const parts = ["NONE", "B", "BF", "CF"] as const;
    const methods = ["DIRECT", "DIFFERENTIAL", "ALTERNATIVE"] as const;
    const readings = [undefined, 0, 0.3, 0.31, 2, 7, 50, 51, 100, 500, 501, 1000, 5000, 5001];
    let compared = 0;
    for (const electricalClass of classes)
      for (const appliedPartType of parts)
        for (const leakageMethod of methods)
          for (const flag of [false, true])
            for (const value of readings) {
              const m: SafetyMeasurements = {
                electricalClass,
                appliedPartType,
                leakageMethod,
                medicalSystem: flag,
                mobileXray: flag,
                defibrillationPaddles: flag,
                visualInspectionPassed: !flag,
                functionalTestPassed: true,
                earthResistanceOhm: value,
                insulationMainsMOhm: value,
                insulationAppliedMOhm: value,
                equipmentLeakageUa: value,
                appliedPartLeakageUa: value,
              };
              expect(evaluateSafetyTest(m)).toEqual(apiEvaluate(m));
              compared++;
            }
    expect(compared).toBe(3 * 4 * 3 * 2 * 14);
  });
});

describe("safety test form rules", () => {
  const complete = {
    ...emptySafetyTest({ electricalClass: "CLASS_I", appliedPartType: "BF" }),
    analyzer: "Rigel 288+, SN 1",
    visualInspection: "pass" as const,
    functionalTest: "pass" as const,
    earthResistanceOhm: "0.12",
    equipmentLeakageUa: "85",
    appliedPartLeakageUa: "12",
  };

  it("sends only the readings that apply to the class and applied parts", () => {
    const input = toSafetyTestInput({ ...complete, electricalClass: "CLASS_II", medicalSystem: true });
    expect(input.earthResistanceOhm).toBeUndefined();
    expect(input.medicalSystem).toBe(false);
    expect(input).toMatchObject({ equipmentLeakageUa: 85, appliedPartLeakageUa: 12 });

    const battery = toSafetyTestInput({ ...complete, electricalClass: "INTERNALLY_POWERED" });
    expect(battery.equipmentLeakageUa).toBeUndefined();
    expect(battery.appliedPartLeakageUa).toBe(12);
  });

  it("puts each problem next to its field, and accepts a decimal comma", () => {
    expect(safetyTestErrors(complete)).toEqual({});
    expect(safetyTestErrors({ ...complete, earthResistanceOhm: "0,12" })).toEqual({});
    expect(safetyTestErrors({ ...complete, earthResistanceOhm: "low", provider: "EXTERNAL_LAB" })).toEqual({
      earthResistanceOhm: "Enter a number, e.g. 0.12",
      providerName: "Name the laboratory",
    });
  });

  it("predicts the result only once the test is complete", () => {
    expect(expectedResult({ ...complete, visualInspection: "" })).toBeNull();
    expect(expectedResult(complete)).toEqual({ passed: true, failures: [] });
    expect(expectedResult({ ...complete, functionalTest: "fail" })).toEqual({
      passed: false,
      failures: ["Functional test failed"],
    });
    // A failing reading shows at once, before the rest is filled in.
    expect(expectedResult({ ...complete, visualInspection: "", earthResistanceOhm: "0.5" })).toEqual({
      passed: false,
      failures: ["Protective earth resistance 0.5 Ω is above the 0.3 Ω limit"],
    });
  });
});

const safetyRecord = (over: Partial<SafetyTestRecord> = {}): SafetyTestRecord => {
  const base = {
    electricalClass: "CLASS_I" as const,
    appliedPartType: "BF" as const,
    leakageMethod: "DIRECT" as const,
    medicalSystem: false,
    mobileXray: false,
    defibrillationPaddles: false,
    visualInspectionPassed: true,
    functionalTestPassed: true,
    earthResistanceOhm: 0.12,
    insulationMainsMOhm: null,
    insulationAppliedMOhm: null,
    equipmentLeakageUa: 85,
    appliedPartLeakageUa: 12,
    ...over,
  };
  const evaluation = evaluateSafetyTest(base);
  return {
    id: "t1",
    assetId: "a1",
    workOrderId: "wo-1",
    testedAt: "2026-04-10T06:30:00.000Z",
    reason: "ROUTINE",
    provider: "IN_HOUSE",
    providerName: null,
    analyzer: "Rigel 288+, SN 12345",
    notes: null,
    recordedAt: "2026-04-10T08:00:00.000Z",
    recordedBy: "Tara Tech",
    supersedesId: null,
    correctionReason: null,
    correctedBy: null,
    ...base,
    passed: evaluation.passed,
    checks: evaluation.checks,
  };
};

describe("SafetyTestSection", () => {
  const device = {
    equipmentName: "Patient monitor",
    electricalClass: "CLASS_I" as const,
    appliedPartType: "BF" as const,
    safetyTest: {
      lastTestDate: "2026-04-10T06:30:00.000Z",
      nextTestDue: "2027-04-10T06:30:00.000Z",
      lastPassed: true,
      overdue: false,
    },
  };

  beforeEach(() => {
    record.mockReset().mockResolvedValue({ passed: true });
    correct.mockReset().mockResolvedValue({});
    records = [
      safetyRecord({ id: "t2", supersedesId: "t1", correctionReason: "Earth resistance was 0.045 Ω, typed as 4.5", earthResistanceOhm: 0.045 }),
      safetyRecord({ correctedBy: "t2", earthResistanceOhm: 4.5 }),
    ];
  });

  it("lists tests with each reading against its limit, the corrected one marked", () => {
    render(<SafetyTestSection assetId="a1" device={device} canRecord={false} />);
    expect(screen.getByText(/Next due/)).toHaveTextContent("Class I (earthed), Type BF (floating)");
    const items = screen.getAllByRole("listitem").filter((li) => li.parentElement?.tagName === "OL");
    expect(within(items[0]).getByText("Passed")).toBeInTheDocument();
    expect(within(items[0]).getByText(/Correction: Earth resistance was 0.045 Ω/)).toBeInTheDocument();
    expect(within(items[1]).getByText("Failed")).toBeInTheDocument();
    expect(within(items[1]).getByText("Corrected")).toBeInTheDocument();
    expect(within(items[1]).getByText("Protective earth resistance: 4.5 Ω (≤ 0.3)")).toHaveClass("text-critical-500");
    expect(screen.queryByRole("button", { name: /Record safety test|Correct/ })).not.toBeInTheDocument();
  });

  it("lets biomed correct only the latest version, with a reason", async () => {
    const user = userEvent.setup();
    render(<SafetyTestSection assetId="a1" device={device} canRecord />);
    const correctButtons = screen.getAllByRole("button", { name: "Correct" });
    expect(correctButtons).toHaveLength(1);

    await user.click(correctButtons[0]);
    expect(screen.getByLabelText(/^Protective earth resistance/)).toHaveValue("0.045");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).not.toHaveBeenCalled();
    expect(screen.getByText("Say why the record is being corrected")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Why is this being corrected/), "Analyser serial number was wrong");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(correct).toHaveBeenCalledWith({
      id: "t2",
      body: expect.objectContaining({
        earthResistanceOhm: 0.045,
        correctionReason: "Analyser serial number was wrong",
      }),
    });
  });

  it("records a test after a repair for a device not yet in the programme", async () => {
    const user = userEvent.setup();
    records = [];
    render(
      <SafetyTestSection
        assetId="a1"
        device={{ ...device, safetyTest: null, electricalClass: null, appliedPartType: null }}
        canRecord
      />,
    );
    expect(screen.getByText(/Not in the electrical safety test programme/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Record safety test" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/Why tested/)).toHaveValue("AFTER_REPAIR");
    await user.selectOptions(within(dialog).getByLabelText(/Protection class/), "CLASS_II");
    expect(within(dialog).queryByLabelText(/^Protective earth resistance/)).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Safety analyser used/), "Fluke ESA615, SN 9");
    const [visual, functional] = within(dialog).getAllByRole("group");
    await user.click(within(visual).getByRole("radio", { name: "Passed" }));
    await user.click(within(functional).getByRole("radio", { name: "Passed" }));
    await user.type(within(dialog).getByLabelText(/^Equipment leakage/), "40");
    await user.type(within(dialog).getByLabelText(/^Applied part leakage/), "9");
    await user.click(within(dialog).getByRole("button", { name: "Record test" }));
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "AFTER_REPAIR",
        electricalClass: "CLASS_II",
        analyzer: "Fluke ESA615, SN 9",
        equipmentLeakageUa: 40,
      }),
    );
  });
});
