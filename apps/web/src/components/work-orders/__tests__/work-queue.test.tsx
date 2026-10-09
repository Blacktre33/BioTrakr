import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { WorkOrder } from "@/lib/api/work-orders";

import { WorkQueue } from "../work-queue";

const mutateAsync = jest.fn();
let items: WorkOrder[] = [];

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
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
});
