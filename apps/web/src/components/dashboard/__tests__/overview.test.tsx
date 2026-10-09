import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DashboardSummary } from "@/lib/api/dashboard";

import { DashboardOverview, formatHours } from "../overview";

const useDashboard = jest.fn();
let facilities: Array<{ id: string; name: string; code: string }> = [];

jest.mock("@/components/layout", () => ({
  Header: ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
    </header>
  ),
}));
jest.mock("@/lib/hooks/use-dashboard", () => ({ useDashboard: (id?: string) => useDashboard(id) }));
jest.mock("@/lib/hooks/use-asset-form-reference", () => ({
  useAssetFormReference: () => ({ data: { facilities } }),
}));
// Charts need a laid-out page; jsdom has none.
jest.mock("recharts", () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const Nothing = () => null;
  return {
    ResponsiveContainer: Pass,
    BarChart: Pass,
    Bar: Nothing,
    CartesianGrid: Nothing,
    Legend: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});

const summary: DashboardSummary = {
  generatedAt: new Date().toISOString(),
  devices: {
    total: 120,
    inUse: 112,
    outOfUse: 3,
    byStatus: {
      ACTIVE: 100,
      IN_SERVICE: 12,
      IN_MAINTENANCE: 2,
      QUARANTINED: 1,
      CONDEMNED: 0,
      RETIRED: 4,
      DISPOSED: 1,
    },
    outOfUseList: [
      {
        id: "a1",
        assetTagNumber: "VENT-7",
        equipmentName: "ICU ventilator",
        assetStatus: "QUARANTINED",
        criticalityLevel: "CRITICAL",
        location: "ICU, City General",
        since: new Date(Date.now() - 2 * 3600e3).toISOString(),
      },
    ],
  },
  pm: {
    scheduled: 100,
    overdue: 7,
    dueSoon: 12,
    dueSoonDays: 30,
    notScheduled: 20,
    compliancePercent: 93,
    overdueList: [
      {
        id: "a2",
        assetTagNumber: "DEF-1",
        equipmentName: "Defibrillator",
        criticalityLevel: "HIGH",
        location: "ED, City General",
        nextPmDueDate: "2026-09-01T00:00:00.000Z",
        daysOverdue: 38,
        openWorkOrder: null,
      },
      {
        id: "a3",
        assetTagNumber: "SP-1",
        equipmentName: "Syringe pump",
        criticalityLevel: "MEDIUM",
        location: "",
        nextPmDueDate: "2026-10-08T00:00:00.000Z",
        daysOverdue: 1,
        openWorkOrder: { id: "wo-1", workOrderStatus: "IN_PROGRESS" },
      },
    ],
  },
  workOrders: {
    open: 9,
    urgent: 2,
    unassigned: 4,
    awaitingParts: 1,
    weekly: [
      { weekStart: "2026-09-28T00:00:00.000Z", opened: 5, completed: 3 },
      { weekStart: "2026-10-05T00:00:00.000Z", opened: 4, completed: 6 },
    ],
  },
  repairs: { windowDays: 90, completed: 14, meanHours: 30.5, medianHours: 6 },
};

describe("DashboardOverview", () => {
  beforeEach(() => {
    facilities = [];
    useDashboard.mockReset().mockReturnValue({ data: summary, isPending: false, isError: false });
  });

  it("shows the key figures, each leading to the work behind it", () => {
    render(<DashboardOverview />);
    const tiles = screen.getByRole("list", { name: "Key figures" });
    const tile = (name: RegExp) => within(tiles).getByRole("link", { name });

    expect(tile(/In use 112 of 120 devices/)).toHaveAttribute("href", "/assets?status=ACTIVE,IN_SERVICE");
    expect(tile(/Out of use 3/)).toHaveAttribute("href", "/assets?status=QUARANTINED,IN_MAINTENANCE");
    expect(tile(/PM overdue 7 12 more due in the next 30 days/)).toHaveAttribute("href", "/maintenance/schedule");
    expect(tile(/PM compliance 93% 20 devices without a PM schedule/)).toBeInTheDocument();
    expect(tile(/Open work orders 9 2 urgent · 4 not assigned · 1 waiting for parts/)).toHaveAttribute(
      "href",
      "/maintenance",
    );
    expect(
      within(tiles).getByText("Average of 14 repairs, last 90 days (median 6 h)").previousSibling,
    ).toHaveTextContent("30.5 h");
  });

  it("lists devices out of use and PM overdue, highest risk marked", () => {
    render(<DashboardOverview />);
    const out = screen.getByRole("heading", { name: "Out of use now" }).closest("div")!.parentElement!;
    expect(within(out).getByRole("link", { name: "ICU ventilator" })).toHaveAttribute("href", "/assets/a1");
    expect(within(out).getByText("Critical risk")).toBeInTheDocument();
    expect(within(out).getByText("Quarantined")).toBeInTheDocument();
    expect(within(out).getByRole("link", { name: "All 3" })).toHaveAttribute(
      "href",
      "/assets?status=QUARANTINED,IN_MAINTENANCE",
    );

    const pm = screen.getByRole("heading", { name: "PM overdue" }).closest("div")!.parentElement!;
    const rows = within(pm).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Defibrillator");
    expect(rows[0]).toHaveTextContent("38 days overdue");
    expect(rows[0]).toHaveTextContent("No work order");
    expect(rows[1]).toHaveTextContent("1 day overdue");
    expect(rows[1]).toHaveTextContent("Work order in progress");
    expect(rows[1]).toHaveTextContent("Location not recorded");
  });

  it("gives screen readers the weekly numbers, and links each status to its devices", () => {
    render(<DashboardOverview />);
    const table = screen.getByRole("table", { name: "Work orders opened and completed per week" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Quarantined 1/ })).toHaveAttribute("href", "/assets?status=QUARANTINED");
  });

  it("says when there is nothing to worry about", () => {
    useDashboard.mockReturnValue({
      data: {
        ...summary,
        devices: { ...summary.devices, outOfUse: 0, outOfUseList: [] },
        pm: { ...summary.pm, overdue: 0, overdueList: [], compliancePercent: null, notScheduled: 0 },
        repairs: { windowDays: 90, completed: 0, meanHours: null, medianHours: null },
      },
      isPending: false,
      isError: false,
    });
    render(<DashboardOverview />);
    expect(screen.getByText("Every device is in use.")).toBeInTheDocument();
    expect(screen.getByText("No preventive maintenance is overdue.")).toBeInTheDocument();
    expect(screen.getByText("No repairs finished in 90 days")).toBeInTheDocument();
  });

  it("can narrow to one facility when there are several", async () => {
    const user = userEvent.setup();
    facilities = [
      { id: "f1", name: "City General", code: "CG" },
      { id: "f2", name: "North Clinic", code: "NC" },
    ];
    render(<DashboardOverview />);
    expect(useDashboard).toHaveBeenLastCalledWith(undefined);
    await user.selectOptions(screen.getByLabelText("Facility"), "f2");
    expect(useDashboard).toHaveBeenLastCalledWith("f2");
  });

  it("shows an error it cannot load", () => {
    useDashboard.mockReturnValue({ data: undefined, isPending: false, isError: true, error: new Error("Network down") });
    render(<DashboardOverview />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the dashboard: Network down");
  });
});

describe("formatHours", () => {
  it("picks a readable unit", () => {
    expect(formatHours(0.25)).toBe("15 min");
    expect(formatHours(7.46)).toBe("7.5 h");
    expect(formatHours(77)).toBe("3.2 days");
  });
});
