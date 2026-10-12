import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Condemnation, CondemnationFile } from "@/lib/api/condemnation";
import { amount, clearanceNeeded, evidenceText, proposalErrors } from "@/lib/condemnation";

import { CondemnationSection } from "../condemnation-section";

const step = jest.fn();
let file: CondemnationFile;
let session = { user: { id: "user-engineer", role: "engineer" } };

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/auth/session", () => ({ getSession: () => session }));
jest.mock("@/components/documents/attachments", () => ({
  Attachments: ({ count }: { count: number }) => <p>{count} papers</p>,
}));
jest.mock("@/lib/hooks/use-condemnation", () => ({
  useCondemnationFile: () => ({ isPending: false, isError: false, data: file }),
  useCondemnationStep: () => ({ mutateAsync: step, isPending: false }),
}));

const evidence = {
  ageYears: 9,
  usefulLifeYears: 10,
  purchaseCost: 250000,
  bookValue: 47500,
  breakdowns: 2,
  downtimeHours: 120,
};

const proposal = (fields: Partial<Condemnation> = {}): Condemnation => ({
  id: "c1",
  assetId: "a1",
  status: "PROPOSED",
  reasons: ["beyond_economic_repair"],
  justification: "Main board failed; no boards available.",
  repairEstimate: 30000,
  currentValue: null,
  repairShare: 63,
  evidence,
  proposedById: "user-engineer",
  proposedBy: "Eli Engineer",
  proposedAt: "2026-10-12T05:00:00Z",
  decidedBy: null,
  decidedAt: null,
  committee: null,
  decisionNote: null,
  withdrawnBy: null,
  withdrawnAt: null,
  withdrawalReason: null,
  disposedBy: null,
  disposedAt: null,
  disposalMethod: null,
  disposalNote: null,
  clearance: null,
  files: 0,
  ...fields,
});

const show = () => render(<CondemnationSection assetId="a1" equipmentName="ECG machine" assetStatus="ACTIVE" />);

describe("condemnation helpers", () => {
  it("sums up the device's record", () => {
    expect(evidenceText(evidence)).toBe(
      "9 of 10 years old · bought for ₹2,50,000 · book value ₹47,500 · 2 breakdowns, 5 days out of use in the last year",
    );
    expect(evidenceText({ ...evidence, breakdowns: 0 })).toMatch(/no breakdowns in the last year$/);
  });

  it("asks for the regulator's clearance as the API does", () => {
    expect(clearanceNeeded("aerb", "E_WASTE_RECYCLER")).toBe(true);
    expect(clearanceNeeded("pc-pndt", "AUCTION")).toBe(true);
    expect(clearanceNeeded("pc-pndt", "E_WASTE_RECYCLER")).toBe(false);
    expect(clearanceNeeded(null, "AUCTION")).toBe(false);
  });

  it("reads amounts in rupees and checks a proposal", () => {
    expect(amount("1,25,000")).toBe(125000);
    expect(amount("")).toBeNull();
    expect(amount("lots")).toBeUndefined();
    expect(proposalErrors({ reasons: [], justification: "Old", repairEstimate: "x", currentValue: "" })).toEqual({
      reasons: "Give at least one reason",
      justification: "Explain why the device should be condemned (a sentence or two)",
      repairEstimate: "Enter an amount in rupees",
    });
  });
});

describe("CondemnationSection", () => {
  beforeEach(() => {
    step.mockReset().mockResolvedValue({});
    session = { user: { id: "user-engineer", role: "engineer" } };
    file = { evidence, clearance: null, condemnations: [] };
  });

  it("lets biomed propose a device, with the reasons and the repair against its value", async () => {
    const user = userEvent.setup();
    show();
    expect(screen.getByText("Not proposed for condemnation.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Propose for condemnation…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/9 of 10 years old/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Propose" }));
    expect(step).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Give at least one reason")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("checkbox", { name: "Beyond economic repair" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Spares or service no longer available" }));
    await user.type(
      within(dialog).getByLabelText(/^Why/),
      "Main board failed; the manufacturer no longer supplies boards.",
    );
    await user.type(within(dialog).getByLabelText("Repair estimate (₹)"), "30,000");
    expect(within(dialog).getByText("The repair would cost 63% of what the device is worth.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Propose" }));
    expect(step).toHaveBeenCalledWith({
      kind: "propose",
      body: {
        assetId: "a1",
        reasons: ["beyond_economic_repair", "no_spares"],
        justification: "Main board failed; the manufacturer no longer supplies boards.",
        repairEstimate: 30000,
      },
    });
  });

  it("offers the committee's decision to another administrator only", async () => {
    file.condemnations = [proposal()];
    session = { user: { id: "user-admin", role: "admin" } };
    const user = userEvent.setup();
    const { unmount } = show();
    expect(screen.queryByRole("button", { name: "Propose for condemnation…" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record the committee's decision…" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("radio", { name: "Not approved" }));
    await user.type(within(dialog).getByLabelText(/^Committee meeting/), "Equipment committee, 14 Oct 2026, minute 6");
    await user.click(within(dialog).getByRole("button", { name: "Record decision" }));
    expect(within(dialog).getByText("Say why the committee didn't approve it")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Approved: condemn it" }));
    await user.click(within(dialog).getByRole("button", { name: "Record decision" }));
    expect(step).toHaveBeenCalledWith({
      kind: "decide",
      id: "c1",
      body: { decision: "APPROVED", committee: "Equipment committee, 14 Oct 2026, minute 6" },
    });
    unmount();

    // Whoever proposed it, administrator or not, can withdraw it but not decide it.
    file.condemnations = [proposal({ proposedById: "user-admin" })];
    show();
    expect(screen.queryByRole("button", { name: "Record the committee's decision…" })).not.toBeInTheDocument();
    expect(screen.getByText("Another administrator records the committee's decision.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw…" })).toBeInTheDocument();
  });

  it("records the disposal of an X-ray unit with AERB's approval", async () => {
    file = {
      evidence,
      clearance: { kind: "aerb", text: "Radiation equipment leaves the hospital only with AERB's decommissioning approval." },
      condemnations: [
        proposal({
          status: "APPROVED",
          decidedAt: "2026-10-01T05:00:00Z",
          decidedBy: "Ada Admin",
          committee: "Equipment committee, minute 6",
        }),
      ],
    };
    const user = userEvent.setup();
    show();
    expect(screen.getByText(/^Approved .* by Ada Admin: Equipment committee, minute 6/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reverse…" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record the disposal…" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/^Taken by/), "GreenTech Recyclers, certificate EW/118");
    await user.click(within(dialog).getByRole("button", { name: "Record disposal" }));
    expect(within(dialog).getByText("Give the reference and date")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^AERB decommissioning approval/), "DR-118/2026, 2 Oct 2026");
    await user.click(within(dialog).getByRole("button", { name: "Record disposal" }));
    expect(step).toHaveBeenCalledWith({
      kind: "dispose",
      id: "c1",
      body: expect.objectContaining({
        method: "E_WASTE_RECYCLER",
        note: "GreenTech Recyclers, certificate EW/118",
        clearance: "DR-118/2026, 2 Oct 2026",
      }),
    });
  });
});
