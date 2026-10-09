import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/client";
import type { PmDevice, PmSchedule } from "@/lib/api/pm";

import { monthGrid, PmScheduleView } from "../pm-schedule";

const usePmSchedule = jest.fn();
const mutateAsync = jest.fn();

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/hooks/use-pm", () => ({
  usePmSchedule: (from: Date, to: Date, facilityId?: string) => usePmSchedule(from, to, facilityId),
  useOpenPmWorkOrder: () => ({ mutateAsync, isPending: false }),
}));

const device = (n: number, dueDate: string, fields: Partial<PmDevice> = {}): PmDevice => ({
  id: `a${n}`,
  assetTagNumber: `TAG-${n}`,
  equipmentName: `Device ${n}`,
  criticalityLevel: "MEDIUM",
  assetStatus: "ACTIVE",
  location: "ICU, City General",
  dueDate,
  intervalDays: 90,
  workOrder: null,
  ...fields,
});

const vent = device(1, "2026-09-20T09:00:00.000Z", { equipmentName: "Ventilator", criticalityLevel: "CRITICAL" });
const schedule: PmSchedule = {
  from: "2026-09-28T00:00:00.000Z",
  to: "2026-11-02T00:00:00.000Z",
  leadDays: 14,
  due: [
    device(2, "2026-10-14T09:00:00.000Z", {
      workOrder: { id: "wo-2", status: "ASSIGNED", scheduledDate: "2026-10-14T09:00:00.000Z", assignedTo: "Tara Tech" },
    }),
    device(3, "2026-10-28T09:00:00.000Z"),
    device(4, "2026-10-05T09:00:00.000Z"), // due earlier this month, not done
  ],
  overdue: {
    total: 2,
    items: [
      vent,
      device(4, "2026-10-05T09:00:00.000Z", {
        workOrder: { id: "wo-4", status: "IN_PROGRESS", scheduledDate: "2026-10-05T09:00:00.000Z", assignedTo: null },
      }),
    ],
  },
  done: [
    {
      id: "wo-done",
      completedAt: "2026-10-02T11:00:00.000Z",
      asset: { id: "a5", assetTagNumber: "TAG-5", equipmentName: "Device 5" },
      doneBy: "Tara Tech",
    },
  ],
  truncated: false,
};

describe("PmScheduleView", () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date("2026-10-09T10:00:00") });
  });
  afterAll(() => {
    jest.useRealTimers();
  });
  beforeEach(() => {
    usePmSchedule.mockReset().mockReturnValue({ data: schedule, isPending: false, isError: false });
    mutateAsync.mockReset().mockResolvedValue({ workOrderId: "wo-new" });
    jest.mocked(toast.info).mockClear();
  });
  const setup = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  it("asks for the whole weeks around this month", () => {
    render(<PmScheduleView />);
    const [from, to, facility] = usePmSchedule.mock.calls[0];
    expect(from).toEqual(new Date("2026-09-28T00:00:00"));
    expect(to).toEqual(new Date("2026-11-02T00:00:00"));
    expect(facility).toBeUndefined();
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByText(/3 due · 1 done\. Work orders open automatically 14 days before/)).toBeInTheDocument();
  });

  it("puts each device on its due day, marked by whether work is under way", () => {
    render(<PmScheduleView />);
    const day = (label: string) => screen.getByRole("listitem", { name: new RegExp(`^${label}`) });

    const oct14 = day("Wednesday 14 October, 1 item");
    expect(within(oct14).getByRole("link", { name: /TAG-2 Device 2, work order open/ })).toHaveAttribute("href", "/assets/a2");
    expect(within(day("Wednesday 28 October")).getByRole("link", { name: /TAG-3 Device 3, due, no work order yet/ })).toBeInTheDocument();
    expect(within(day("Monday 5 October")).getByRole("link", { name: /TAG-4 Device 4, overdue/ })).toBeInTheDocument();
    expect(within(day("Friday 2 October")).getByRole("link", { name: /TAG-5 Device 5, done/ })).toBeInTheDocument();
    expect(day("Thursday 15 October")).toHaveAccessibleName("Thursday 15 October");
  });

  it("lists overdue PM and opens a work order where there is none", async () => {
    const user = setup();
    render(<PmScheduleView />);
    const overdue = screen.getByRole("heading", { name: "Overdue (2)" }).parentElement!;
    const rows = within(overdue).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Ventilator");
    expect(rows[0]).toHaveTextContent("Critical risk");
    expect(rows[0]).toHaveTextContent("19 days overdue");
    expect(rows[1]).toHaveTextContent("Work order in progress");
    expect(rows[1]).toHaveTextContent("Not assigned");

    await user.click(within(rows[0]).getByRole("button", { name: "Open work order" }));
    expect(mutateAsync).toHaveBeenCalledWith("a1");
    expect(toast.success).toHaveBeenCalledWith("PM work order opened for Ventilator");
  });

  it("says so when someone else opened it first", async () => {
    const user = setup();
    mutateAsync.mockRejectedValue(
      new ApiError({ message: "A PM work order is already open for this device", statusCode: 409 }),
    );
    render(<PmScheduleView />);
    await user.click(screen.getByRole("button", { name: "Open work order" }));
    expect(toast.info).toHaveBeenCalledWith("A PM work order is already open for this device");
  });

  it("moves between months", async () => {
    const user = setup();
    render(<PmScheduleView facilityId="f2" />);
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    const [from, to, facility] = usePmSchedule.mock.calls.at(-1)!;
    expect(from).toEqual(new Date("2026-10-26T00:00:00"));
    expect(to).toEqual(new Date("2026-12-07T00:00:00"));
    expect(facility).toBe("f2");

    await user.click(screen.getByRole("button", { name: "This month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
  });
});

describe("monthGrid", () => {
  it("runs Monday to Sunday and covers the month", () => {
    const { from, to, days } = monthGrid(new Date("2026-02-15T12:00:00"));
    // Feb 1 2026 is a Sunday, so its week starts in January.
    expect(from).toEqual(new Date("2026-01-26T00:00:00"));
    expect(days[0].getDay()).toBe(1);
    expect(days.at(-1)!.getDay()).toBe(0);
    expect(days).toHaveLength(35);
    expect(to).toEqual(new Date("2026-03-02T00:00:00"));
  });
});
