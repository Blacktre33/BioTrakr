import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AuditEvent } from "@/lib/api/audit";

import { EditHistorySection } from "../edit-history-section";

const useDeviceHistory = jest.fn();
jest.mock("@/lib/hooks/use-audit", () => ({
  useDeviceHistory: (...args: unknown[]) => useDeviceHistory(...args),
}));

const event = (over: Partial<AuditEvent>): AuditEvent => ({
  id: "e1",
  seq: 1,
  occurredAt: "2026-10-12T09:30:00.000Z",
  actor: { id: "u1", name: "Ada Admin" },
  actorRole: "admin",
  action: "asset.updated",
  entityType: "asset",
  entityId: "a1",
  assetId: "a1",
  device: "VENT-7 · ICU ventilator",
  subject: null,
  summary: "Edited VENT-7: Room",
  changes: [],
  reason: null,
  ...over,
});

describe("EditHistorySection", () => {
  beforeEach(() => {
    useDeviceHistory.mockReset().mockReturnValue({
      isPending: false,
      isError: false,
      isFetching: false,
      data: {
        total: 23,
        items: [
          event({
            id: "e3",
            seq: 3,
            actor: null,
            actorRole: "system",
            action: "work_order.opened",
            summary: "Preventive maintenance due 2026-10-20: opened by the schedule for VENT-7",
          }),
          event({
            id: "e2",
            seq: 2,
            action: "asset.status_changed",
            summary: "VENT-7: Active → Quarantined",
            reason: "Occlusion alarm at every start",
          }),
          event({
            changes: [
              { field: "currentRoomId", label: "Room", from: "ICU bay 3 (ICU-3)", to: "Theatre 2 (OT-2)" },
              { field: "notes", label: "Notes", from: null, to: "Moved for the transplant list" },
            ],
          }),
        ],
      },
    });
  });

  it("shows who changed what, from and to, and why", () => {
    render(<EditHistorySection assetId="a1" />);
    expect(screen.getByText("Room: ICU bay 3 (ICU-3) → Theatre 2 (OT-2)")).toBeInTheDocument();
    expect(screen.getByText("Notes: (blank) → Moved for the transplant list")).toBeInTheDocument();
    expect(screen.getByText("“Occlusion alarm at every start”")).toBeInTheDocument();
    expect(screen.getByText(/BioTrakr \(automatic\) · entry 3$/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ada Admin \(admin\)/)).toHaveLength(2);
  });

  it("loads older entries on request", async () => {
    const user = userEvent.setup();
    render(<EditHistorySection assetId="a1" />);
    expect(useDeviceHistory).toHaveBeenLastCalledWith("a1", 20);
    await user.click(screen.getByRole("button", { name: "Show older (20 more)" }));
    expect(useDeviceHistory).toHaveBeenLastCalledWith("a1", 40);
  });

  it("says when nothing is recorded yet", () => {
    useDeviceHistory.mockReturnValue({ isPending: false, isError: false, data: { total: 0, items: [] } });
    render(<EditHistorySection assetId="a1" />);
    expect(screen.getByText("Nothing recorded yet.")).toBeInTheDocument();
  });
});
