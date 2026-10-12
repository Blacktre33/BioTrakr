import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { WorkOrder } from "@/lib/api/work-orders";

import { WorkQueue } from "../work-queue";

const mutateAsync = jest.fn();
const uploadAsync = jest.fn();
let items: WorkOrder[] = [];

jest.mock("@/lib/hooks/use-documents", () => ({
  useDocuments: () => ({ isPending: false, isError: false, data: [] }),
  useUploadDocument: () => ({ mutateAsync: uploadAsync, isPending: false }),
  useWithdrawDocument: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
const monitorChecklist = {
  key: "builtin:patient-monitor",
  name: "Patient monitor",
  keywords: ["monitor"],
  builtIn: true,
  active: true,
  items: [
    { key: "housing", text: "Housing intact", kind: "check" },
    { key: "battery", text: "Battery runs the device", kind: "check" },
    { key: "spo2", text: "SpO2 at 97%", kind: "reading", unit: "%", min: 95, max: 99 },
  ],
};
jest.mock("@/lib/hooks/use-checklists", () => ({
  useChecklists: () => ({
    isPending: false,
    isError: false,
    data: {
      suggested: "builtin:patient-monitor",
      checklists: [
        monitorChecklist,
        { key: "builtin:general", name: "General electrical equipment", keywords: [], builtIn: true, active: true, items: [] },
      ],
    },
  }),
}));
jest.mock("@/lib/auth/session", () => ({ getSession: () => ({ user: { id: "u-tech", role: "technician" } }) }));
jest.mock("@/lib/hooks/use-work-orders", () => ({
  useWorkOrders: () => ({ isPending: false, isError: false, data: { total: items.length, items } }),
  useTechnicians: () => ({ data: [{ id: "u-tech", name: "Tara Tech" }, { id: "u-eng", name: "Eli Eng" }] }),
  useUpdateWorkOrderMutation: () => ({ mutateAsync, isPending: false }),
}));

const base: WorkOrder = {
  id: "wo-1",
  workOrderType: "CORRECTIVE_MAINTENANCE",
  workOrderStatus: "PENDING",
  isEmergency: true,
  scheduledDate: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  createdAt: new Date().toISOString(),
  description: "Low-pressure alarm keeps sounding\n\nWhere: ICU bay 3",
  workPerformed: null,
  failureCategory: null,
  asset: {
    id: "a1",
    assetTagNumber: "VENT-7",
    equipmentName: "ICU ventilator",
    assetStatus: "QUARANTINED",
    criticalityLevel: "CRITICAL",
    location: "ICU, City General",
  },
  reportedBy: "Nia Nurse",
  assignedTo: null,
};

describe("WorkQueue", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ deviceReleased: true });
    items = [base];
  });

  it("shows what was reported, by whom, and that the device is out of use", () => {
    render(<WorkQueue />);
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Urgent")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "ICU ventilator" })).toHaveAttribute("href", "/assets/a1");
    expect(within(card).getByText(/Low-pressure alarm/)).toBeInTheDocument();
    expect(within(card).getByText(/Reported by Nia Nurse · Not assigned/)).toBeInTheDocument();
    expect(within(card).getByText("Quarantined")).toBeInTheDocument();
  });

  it("shows how long a breakdown has waited against its repair limit", () => {
    items = [
      {
        ...base,
        downtime: { open: true, hours: 80, attendHours: null, limitHours: 72, leftHours: -8, state: "over" },
      },
      {
        ...base,
        id: "wo-2",
        downtime: { open: true, hours: 130, attendHours: 2, limitHours: 168, leftHours: 38, state: "nearing" },
      },
      {
        ...base,
        id: "wo-3",
        workOrderStatus: "COMPLETED",
        downtime: { open: false, hours: 6.5, attendHours: 1, limitHours: 72, leftHours: 65.5, state: "within" },
      },
    ];
    render(<WorkQueue />);
    expect(screen.getByText("Over the 72 h repair limit by 8 h")).toHaveClass("text-critical-500");
    expect(screen.getByText("Open 5 days 10 h: 38 h left of 7 days")).toHaveClass("text-warning-500");
    expect(screen.getByText("Put right in 6.5 h (limit 72 h)")).toBeInTheDocument();
  });

  it("starts unassigned work and takes it on in one tap", async () => {
    const user = userEvent.setup();
    render(<WorkQueue />);
    await user.click(screen.getByRole("button", { name: "Start work" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      id: "wo-1",
      body: { expectedStatus: "PENDING", status: "IN_PROGRESS", assignedTechnicianId: "u-tech" },
    });
  });

  it("completes with a note and releases the device only after confirming it is safe", async () => {
    const user = userEvent.setup();
    items = [{ ...base, workOrderStatus: "IN_PROGRESS", assignedTo: { id: "u-tech", name: "Tara Tech" } }];
    render(<WorkQueue />);

    await user.click(screen.getByRole("button", { name: "Complete…" }));
    await user.type(screen.getByLabelText(/what was done/i), "Replaced pressure sensor; tested");
    await user.click(screen.getByRole("checkbox", { name: /put the device back into use/i }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Confirm the device is safe before releasing it")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /safe to use on patients/i }));
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(mutateAsync).toHaveBeenCalledWith({
      id: "wo-1",
      body: {
        expectedStatus: "IN_PROGRESS",
        status: "COMPLETED",
        workPerformed: "Replaced pressure sensor; tested",
        releaseDevice: true,
        confirmSafe: true,
      },
    });
  });

  describe("a calibration work order", () => {
    const calibrationOrder: WorkOrder = {
      ...base,
      id: "wo-cal",
      workOrderType: "CALIBRATION",
      workOrderStatus: "IN_PROGRESS",
      isEmergency: false,
      description: "Calibration due 2026-10-20",
      reportedBy: null,
      asset: { ...base.asset, equipmentName: "BP monitor", assetStatus: "ACTIVE" },
    };

    it("records the certificate, asking for what a NABL lab must state", async () => {
      const user = userEvent.setup();
      items = [calibrationOrder];
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("heading", { name: "Record calibration" })).toBeInTheDocument();

      await user.type(screen.getByLabelText(/what was done/i), "Calibrated by the lab on site");
      await user.type(screen.getByLabelText(/^Laboratory/), "Precise Calibration Labs");
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText("Enter the laboratory's NABL accreditation number")).toBeInTheDocument();
      expect(screen.getByText("Enter the measurement uncertainty stated on the certificate")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/NABL accreditation/), "CC-2345");
      await user.type(screen.getByLabelText(/Certificate no/), "PCL/2026/0412");
      await user.type(screen.getByLabelText(/Measurement uncertainty/), "±0.5 mmHg (k=2)");
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "wo-cal",
        body: {
          expectedStatus: "IN_PROGRESS",
          status: "COMPLETED",
          workPerformed: "Calibrated by the lab on site",
          calibration: expect.objectContaining({
            provider: "EXTERNAL_LAB",
            providerName: "Precise Calibration Labs",
            labAccreditationNumber: "CC-2345",
            certificateNumber: "PCL/2026/0412",
            measurementUncertainty: "±0.5 mmHg (k=2)",
            result: "PASS",
            calibratedAt: expect.any(String),
          }),
        },
      });
    });

    it("attaches the certificate to the calibration it records", async () => {
      const user = userEvent.setup();
      items = [calibrationOrder];
      mutateAsync.mockResolvedValue({ deviceReleased: false, record: { type: "calibration", id: "cal-9" } });
      uploadAsync.mockReset().mockResolvedValue({});
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      await user.type(screen.getByLabelText(/what was done/i), "Calibrated by the lab on site");
      await user.type(screen.getByLabelText(/^Laboratory/), "Precise Calibration Labs");
      await user.type(screen.getByLabelText(/NABL accreditation/), "CC-2345");
      await user.type(screen.getByLabelText(/Certificate no/), "PCL/2026/0412");
      await user.type(screen.getByLabelText(/Measurement uncertainty/), "±0.5 mmHg (k=2)");
      const pdf = new File(["%PDF-1.4"], "PCL-0412.pdf", { type: "application/pdf" });
      await user.upload(screen.getByLabelText(/^Certificate \(optional/), pdf);
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(uploadAsync).toHaveBeenCalledWith({
        targetType: "calibration",
        targetId: "cal-9",
        file: pdf,
        title: "Calibration certificate, VENT-7",
      });
    });

    it("never offers to release a device that failed, and warns it goes out of use", async () => {
      const user = userEvent.setup();
      items = [{ ...calibrationOrder, asset: { ...calibrationOrder.asset, assetStatus: "QUARANTINED" } }];
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("checkbox", { name: /put the device back into use/i })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText(/^Result/), "FAIL");
      expect(screen.queryByRole("checkbox", { name: /put the device back into use/i })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/taken out of use/);
      expect(screen.getByLabelText(/What was out of tolerance/)).toBeInTheDocument();
    });
  });

  describe("a preventive maintenance work order", () => {
    const pmOrder: WorkOrder = {
      ...base,
      id: "wo-pm",
      workOrderType: "PREVENTIVE_MAINTENANCE",
      workOrderStatus: "IN_PROGRESS",
      isEmergency: false,
      description: "Preventive maintenance due 2026-10-20",
      reportedBy: null,
      asset: { ...base.asset, equipmentName: "Patient monitor", assetStatus: "ACTIVE" },
    };

    it("works through the checklist the device's name suggests, with its readings", async () => {
      const user = userEvent.setup();
      items = [pmOrder];
      mutateAsync.mockResolvedValue({ deviceReleased: false, record: null, pmOutcome: "FLAG" });
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("heading", { name: "Complete preventive maintenance" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Checklist/)).toHaveValue("builtin:patient-monitor");

      await user.type(screen.getByLabelText(/what was done/i), "Quarterly PM");
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getAllByText("Choose pass, flag, fail or not applicable")).toHaveLength(2);
      expect(screen.getByText("Enter the reading")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Mark the remaining checks as passed" }));
      const battery = screen.getByRole("group", { name: "2. Battery runs the device" });
      await user.click(within(battery).getByText("Flag"));
      await user.type(within(battery).getByLabelText("What was found"), "Holds 40 min");
      const spo2 = screen.getByRole("group", { name: "3. SpO2 at 97%" });
      await user.type(within(spo2).getByLabelText("Reading in %"), "97");
      expect(within(spo2).getByText("Pass")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("1 item flagged");
      await user.type(screen.getByLabelText(/Test equipment used/), "Fluke ProSim 8");
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "wo-pm",
        body: expect.objectContaining({
          status: "COMPLETED",
          checklist: {
            checklistKey: "builtin:patient-monitor",
            testEquipment: "Fluke ProSim 8",
            items: [
              { key: "housing", result: "PASS" },
              { key: "battery", result: "FLAG", note: "Holds 40 min" },
              { key: "spo2", reading: 97 },
            ],
          },
        }),
      });
    });

    it("says a reading out of its limits fails the PM, and never offers release", async () => {
      const user = userEvent.setup();
      items = [{ ...pmOrder, asset: { ...pmOrder.asset, assetStatus: "QUARANTINED" } }];
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("checkbox", { name: /put the device back into use/i })).toBeInTheDocument();
      const spo2 = screen.getByRole("group", { name: "3. SpO2 at 97%" });
      await user.type(within(spo2).getByLabelText("Reading in %"), "91");
      expect(within(spo2).getByText("Fail")).toBeInTheDocument();
      expect(within(spo2).getByLabelText("What was found")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("This PM fails");
      expect(screen.queryByRole("checkbox", { name: /put the device back into use/i })).not.toBeInTheDocument();
    });
  });

  describe("an electrical safety test work order", () => {
    const testOrder: WorkOrder = {
      ...base,
      id: "wo-est",
      workOrderType: "ELECTRICAL_SAFETY_TEST",
      workOrderStatus: "IN_PROGRESS",
      isEmergency: false,
      description: "Electrical safety test (IS/IEC 62353) due 2026-10-20",
      reportedBy: null,
      asset: {
        ...base.asset,
        equipmentName: "Patient monitor",
        assetStatus: "QUARANTINED",
        electricalClass: "CLASS_I",
        appliedPartType: "CF",
      },
    };

    it("says the schedule opened it", () => {
      items = [testOrder];
      render(<WorkQueue />);
      expect(screen.getByText(/Opened by the maintenance schedule/)).toBeInTheDocument();
    });

    it("asks for the readings the device's class calls for, showing each limit", async () => {
      const user = userEvent.setup();
      items = [testOrder];
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("heading", { name: "Record electrical safety test" })).toBeInTheDocument();
      // Prefilled from the device: CF parts, so the 50 µA patient limit.
      expect(screen.getByRole("combobox", { name: /^Applied parts/ })).toHaveValue("CF");
      expect(screen.getByText("At most 50 µA")).toBeInTheDocument();
      expect(screen.getByText("At most 0.3 Ω")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/what was done/i), "Tested with the Rigel 288+");
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(screen.getByText("Say which safety analyser was used")).toBeInTheDocument();
      expect(screen.getByText("Say whether the visual inspection passed")).toBeInTheDocument();
      expect(screen.getByText("Enter the protective earth resistance")).toBeInTheDocument();

      await user.type(screen.getByLabelText(/Safety analyser used/), "Rigel 288+, SN 12345");
      const [visual, functional] = screen.getAllByRole("group");
      await user.click(within(visual).getByRole("radio", { name: "Passed" }));
      await user.click(within(functional).getByRole("radio", { name: "Passed" }));
      await user.type(screen.getByLabelText(/^Protective earth resistance/), "0.12");
      await user.type(screen.getByLabelText(/^Equipment leakage/), "80");
      await user.type(screen.getByLabelText(/^Applied part leakage/), "12");
      expect(screen.getByText("Passes IS/IEC 62353.")).toBeInTheDocument();

      await user.click(screen.getByRole("checkbox", { name: /put the device back into use/i }));
      await user.click(screen.getByRole("checkbox", { name: /safe to use on patients/i }));
      await user.click(screen.getByRole("button", { name: "Complete" }));
      expect(mutateAsync).toHaveBeenCalledWith({
        id: "wo-est",
        body: {
          expectedStatus: "IN_PROGRESS",
          status: "COMPLETED",
          workPerformed: "Tested with the Rigel 288+",
          releaseDevice: true,
          confirmSafe: true,
          safetyTest: expect.objectContaining({
            analyzer: "Rigel 288+, SN 12345",
            electricalClass: "CLASS_I",
            appliedPartType: "CF",
            visualInspectionPassed: true,
            functionalTestPassed: true,
            earthResistanceOhm: 0.12,
            equipmentLeakageUa: 80,
            appliedPartLeakageUa: 12,
          }),
        },
      });
      // Pass or fail is the API's to decide.
      expect(mutateAsync.mock.calls[0][0].body.safetyTest).not.toHaveProperty("passed");
    });

    it("shows a failing reading at once and does not offer release", async () => {
      const user = userEvent.setup();
      items = [testOrder];
      render(<WorkQueue />);
      await user.click(screen.getByRole("button", { name: "Complete…" }));
      expect(screen.getByRole("checkbox", { name: /put the device back into use/i })).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Applied part leakage/), "75");
      expect(screen.getByText("Fail")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /put the device back into use/i })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        "Applied part leakage current 75 µA is above the 50 µA limit",
      );
      expect(screen.getByRole("status")).toHaveTextContent(/taken out of use/);
    });
  });
});
