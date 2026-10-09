import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AssetLookup } from "@/lib/api/assets";

import { AssetBedsideCard } from "../asset-bedside-card";
import { ScanDevice } from "../scan-device";

const push = jest.fn();
let searchParams = new URLSearchParams();
const mutateAsync = jest.fn();
let lookupState: Record<string, unknown> = {};

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hooks/use-asset-scan-logs", () => ({
  useCreateAssetScanMutation: () => ({ mutateAsync, isPending: false }),
}));
const reportProblem = jest.fn();
jest.mock("@/lib/hooks/use-work-orders", () => ({
  useReportProblemMutation: () => ({ mutateAsync: reportProblem, isPending: false }),
}));
jest.mock("@/lib/hooks/use-asset-lookup", () => ({
  useAssetLookup: () => lookupState,
}));
jest.mock("@/lib/auth/session", () => ({
  getSession: () => ({ user: { role: "clinical_staff" } }),
}));
// The camera is not available in jsdom.
jest.mock("@/components/assets/asset-qr-scanner", () => ({ AssetQrScanner: () => null }));

const asset: AssetLookup = {
  id: "a1",
  assetTagNumber: "VENT-7",
  equipmentName: "ICU ventilator",
  manufacturer: "Dräger",
  modelNumber: "V500",
  serialNumber: "SN1",
  deviceCategory: "LIFE_SUPPORT",
  criticalityLevel: "CRITICAL",
  riskClassification: "CLASS_III",
  assetStatus: "ACTIVE",
  recallStatus: "NONE",
  lastSeenTimestamp: null,
  safeToUse: true,
  alerts: [],
  location: { facility: "City General", room: "ICU Bay 3 (ICU-3)" },
  department: "ICU",
  pm: { lastPmDate: "2026-07-01T00:00:00Z", nextPmDueDate: "2099-01-01T00:00:00Z", overdue: false },
  recentMaintenance: [],
  recentScans: [],
  recentStatusChanges: [],
  pmFrequencyDays: 180,
  openWorkOrders: 0,
};

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

describe("AssetBedsideCard", () => {
  beforeEach(() => mutateAsync.mockReset().mockResolvedValue({}));

  it("says plainly when a device must not be used", () => {
    render(
      wrap(
        <AssetBedsideCard
          asset={{
            ...asset,
            safeToUse: false,
            assetStatus: "QUARANTINED",
            alerts: [{ level: "stop", message: "Quarantined. Do not use on patients." }],
          }}
          scannedCode="VENT-7"
          role="clinical_staff"
        />,
      ),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Do not use");
    expect(alert).toHaveTextContent("Quarantined. Do not use on patients.");
  });

  it("shows OK to use, with cautions when there are any", () => {
    const { rerender } = render(wrap(<AssetBedsideCard asset={asset} scannedCode="VENT-7" role="clinical_staff" />));
    expect(screen.getByRole("status")).toHaveTextContent("OK to use");

    rerender(
      wrap(
        <AssetBedsideCard
          asset={{
            ...asset,
            alerts: [{ level: "caution", message: "Preventive maintenance is overdue. Let biomedical engineering know." }],
          }}
          scannedCode="VENT-7"
          role="clinical_staff"
        />,
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("OK to use, but note");
    expect(screen.getByRole("status")).toHaveTextContent(/overdue/);
  });

  it("lets ward staff log a sighting in one tap, with the room pre-filled", async () => {
    const user = userEvent.setup();
    render(wrap(<AssetBedsideCard asset={asset} scannedCode="VENT-7" role="clinical_staff" />));

    await user.click(screen.getByRole("button", { name: /log that i've seen it here/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      assetId: "a1",
      payload: { qrPayload: "VENT-7", locationHint: "ICU Bay 3 (ICU-3)" },
    });
    expect(await screen.findByText(/Logged at ICU Bay 3/)).toBeInTheDocument();
  });

  it("keeps detail folded for ward staff and open for biomed", () => {
    const { container, rerender } = render(
      wrap(<AssetBedsideCard asset={asset} scannedCode="VENT-7" role="clinical_staff" />),
    );
    expect(container.querySelector("details")).not.toHaveAttribute("open");

    rerender(wrap(<AssetBedsideCard asset={asset} scannedCode="VENT-7" role="technician" />));
    expect(container.querySelector("details")).toHaveAttribute("open");
  });

  it("lets ward staff report a problem and take the device out of use", async () => {
    const user = userEvent.setup();
    reportProblem.mockResolvedValue({ workOrderId: "w1", takenOutOfUse: true, outOfUse: true });
    render(wrap(<AssetBedsideCard asset={{ ...asset, openWorkOrders: 1 }} scannedCode="VENT-7" role="clinical_staff" />));

    expect(screen.getByText("Biomed has 1 open work order for this device.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /report a problem/i }));
    // Out of use is the default: when in doubt, the next scan says "Do not use".
    expect(screen.getByRole("checkbox", { name: /take it out of use now/i })).toBeChecked();
    await user.type(screen.getByLabelText(/what's wrong/i), "Alarm keeps sounding");
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(reportProblem).toHaveBeenCalledWith({
      assetId: "a1",
      description: "Alarm keeps sounding",
      takeOutOfUse: true,
      locationHint: "ICU Bay 3 (ICU-3)",
    });
  });

  it("still offers to take a recalled but ACTIVE device out of use", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <AssetBedsideCard
          asset={{
            ...asset,
            safeToUse: false,
            alerts: [{ level: "stop", message: "Under a Class I recall. Check with biomedical engineering." }],
          }}
          scannedCode="VENT-7"
          role="clinical_staff"
        />,
      ),
    );
    await user.click(screen.getByRole("button", { name: /report a problem/i }));
    expect(screen.getByRole("checkbox", { name: /take it out of use now/i })).toBeChecked();
  });

  it("does not offer logging to view-only users", () => {
    render(wrap(<AssetBedsideCard asset={asset} scannedCode="VENT-7" role="viewer" />));
    expect(screen.queryByRole("button", { name: /log that/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /report a problem/i })).not.toBeInTheDocument();
  });
});

describe("ScanDevice", () => {
  beforeEach(() => {
    push.mockReset();
    searchParams = new URLSearchParams();
    lookupState = {};
  });

  it("opens the device for a typed tag, ready for keyboard-style barcode scanners", async () => {
    const user = userEvent.setup();
    render(wrap(<ScanDevice />));

    const input = screen.getByLabelText(/scan a device, or type its tag number/i);
    expect(input).toHaveFocus();
    await user.type(input, " BME-1 {Enter}");

    expect(push).toHaveBeenCalledWith("/scan?code=BME-1");
  });

  it("explains when no device matches", () => {
    searchParams = new URLSearchParams("code=NOPE");
    lookupState = {
      isPending: false,
      isError: true,
      error: Object.assign(new Error('No device with tag "NOPE" in your organization. Check the label and try again.'), {
        statusCode: 404,
      }),
    };
    render(wrap(<ScanDevice />));

    expect(screen.getByRole("alert")).toHaveTextContent("Device not found");
    expect(screen.getByRole("alert")).toHaveTextContent(/Check the label/);
  });

  it("never shows an old answer next to a failed refresh", () => {
    searchParams = new URLSearchParams("code=VENT-7");
    lookupState = { isPending: false, isError: true, error: new Error("Network Error"), data: asset };
    render(wrap(<ScanDevice />));

    expect(screen.getByRole("alert")).toHaveTextContent("Network Error");
    expect(screen.getByRole("alert")).toHaveTextContent(/Do not assume it is safe/);
    expect(screen.queryByText("OK to use")).not.toBeInTheDocument();
  });

  it("shows the device for a code in the link", () => {
    searchParams = new URLSearchParams("code=VENT-7");
    lookupState = { isPending: false, isError: false, data: asset };
    render(wrap(<ScanDevice />));

    expect(screen.getByRole("heading", { name: "ICU ventilator" })).toBeInTheDocument();
  });
});
