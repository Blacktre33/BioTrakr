import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ChecklistsAdmin, draftProblems } from "@/components/settings/checklists-admin";
import type { Checklist, PmRecord } from "@/lib/api/checklists";
import { checklistErrors, itemResult, outcomeOf, rangeText } from "@/lib/checklists";

import { PmRecordsSection } from "../pm-records-section";

const saveChecklist = jest.fn();
let checklists: Checklist[] = [];
let records: PmRecord[] = [];

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hooks/use-checklists", () => ({
  useChecklists: () => ({ isPending: false, isError: false, data: { checklists, suggested: null } }),
  useSaveChecklist: () => ({ mutateAsync: saveChecklist, isPending: false }),
  usePmRecords: () => ({ isPending: false, isError: false, data: records }),
}));

const spo2 = { key: "spo2", text: "SpO2 at 97%", kind: "reading" as const, unit: "%", min: 95, max: 99 };
const monitor: Checklist = {
  key: "builtin:patient-monitor",
  name: "Patient monitor",
  keywords: ["monitor"],
  builtIn: true,
  active: true,
  items: [{ key: "housing", text: "Housing intact", kind: "check" }, spo2],
};

describe("checklist rules (as the API applies them)", () => {
  it("lets a reading with limits decide, keeping a flag within them", () => {
    expect(itemResult(spo2, { key: "spo2", reading: 97 })).toBe("PASS");
    expect(itemResult(spo2, { key: "spo2", reading: 92, result: "PASS" })).toBe("FAIL");
    expect(itemResult(spo2, { key: "spo2", reading: 96, result: "FLAG" })).toBe("FLAG");
    expect(itemResult(spo2, { key: "spo2", result: "NA" })).toBe("NA");
    expect(outcomeOf(["PASS", "FLAG", undefined])).toBe("FLAG");
    expect(rangeText({ ...spo2, min: undefined })).toBe("at most 99 %");
  });

  it("asks for what is missing, item by item", () => {
    expect(
      checklistErrors(monitor.items, {
        housing: { key: "housing", result: "FAIL" },
      }),
    ).toEqual({ housing: "Say what was found", spo2: "Enter the reading" });
  });
});

describe("ChecklistsAdmin", () => {
  beforeEach(() => {
    saveChecklist.mockReset().mockResolvedValue({});
    checklists = [
      { ...monitor },
      {
        key: "c1",
        name: "Philips IntelliVue",
        keywords: ["intellivue"],
        builtIn: false,
        active: true,
        items: [{ key: "item-1", text: "Housing intact", kind: "check" }],
      },
    ];
  });

  it("copies a built-in checklist so its limits can be changed", async () => {
    const user = userEvent.setup();
    render(<ChecklistsAdmin />);
    const card = screen.getByText("Patient monitor").closest("li")!;
    expect(within(card).getByText(/For devices named: monitor · 2 items · 1 readings with limits/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Copy to change" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Patient monitor (our copy)");
    const max = within(dialog).getByLabelText("Highest allowed");
    await user.clear(max);
    await user.type(max, "98");
    await user.click(within(dialog).getByRole("button", { name: "Add checklist" }));
    expect(saveChecklist).toHaveBeenCalledWith({
      id: undefined,
      body: {
        name: "Patient monitor (our copy)",
        keywords: ["monitor"],
        items: [
          { key: "housing", text: "Housing intact", kind: "check" },
          { key: "spo2", text: "SpO2 at 97%", kind: "reading", unit: "%", min: 95, max: 98 },
        ],
      },
    });
  });

  it("stops offering one of ours, and catches mistakes before saving", async () => {
    const user = userEvent.setup();
    render(<ChecklistsAdmin />);
    const card = screen.getByText("Philips IntelliVue").closest("li")!;
    await user.click(within(card).getByRole("button", { name: "Stop offering" }));
    expect(saveChecklist).toHaveBeenCalledWith({
      id: "c1",
      body: expect.objectContaining({ name: "Philips IntelliVue", active: false }),
    });
    expect(
      draftProblems("", [{ key: "a", text: "Flow", kind: "reading", unit: "", min: "9", max: "1" }]),
    ).toEqual(["Name the checklist", "Item 1: give the unit", "Item 1: the lowest value is above the highest"]);
  });
});

describe("PmRecordsSection", () => {
  it("shows each PM's outcome and findings, and every item on request", async () => {
    const user = userEvent.setup();
    records = [
      {
        id: "r1",
        workOrderId: "wo-1",
        checklistKey: "builtin:patient-monitor",
        checklistName: "Patient monitor",
        outcome: "FAIL",
        testEquipment: "Fluke ProSim 8",
        recordedAt: "2026-10-12T09:00:00.000Z",
        recordedBy: "Tara Tech",
        items: [
          { key: "housing", text: "Housing intact", kind: "check", result: "PASS", reading: null, note: null },
          { ...spo2, result: "FAIL", reading: 91, note: "Probe worn" },
        ],
      },
    ];
    render(<PmRecordsSection assetId="a1" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Fail: SpO2 at 97%: Probe worn")).toBeInTheDocument();
    expect(screen.getByText("Test equipment: Fluke ProSim 8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show every item (2)" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("91 %")).toBeInTheDocument();
    expect(within(table).getByText("limit 95 to 99 %")).toBeInTheDocument();
  });
});
