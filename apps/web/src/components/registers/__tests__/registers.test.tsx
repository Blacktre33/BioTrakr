import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { csvFileName, registerCsv, type Register } from "@/lib/api/registers";

import { RegisterSheet } from "../register-sheet";
import { RegistersPage } from "../registers-page";

const getRegister = jest.fn();

jest.mock("@/lib/api/registers", () => ({
  ...jest.requireActual("@/lib/api/registers"),
  getRegister: (...args: unknown[]) => getRegister(...args),
}));
jest.mock("@/lib/hooks/use-asset-form-reference", () => ({
  useAssetFormReference: () => ({
    data: {
      facilities: [
        { id: "f1", name: "City General", code: "CG" },
        { id: "f2", name: "North Clinic", code: "NC" },
      ],
    },
  }),
}));
jest.mock("@/lib/hooks/use-assets", () => ({
  useAssets: () => ({
    isPending: false,
    data: { total: 1, items: [{ id: "a1", assetTagNumber: "SP-1", equipmentName: "Syringe pump" }] },
  }),
}));

const register = (over: Partial<Register> = {}): Register => ({
  kind: "calibration",
  title: "Calibration Register",
  basis: "NABH FMS.5; NHSRC calibration guidelines",
  organization: "City General Hospital",
  facility: null,
  period: { from: "12 Oct 2025", to: "11 Oct 2026" },
  device: null,
  generatedAt: "11 Oct 2026, 15:20",
  columns: [
    { key: "sl", label: "Sl. No.", align: "right" },
    { key: "device", label: "Equipment" },
    { key: "result", label: "Result" },
    { key: "file", label: "Certificate on file" },
  ],
  rows: [{ sl: 1, device: "SP-1 · Syringe pump", result: "Pass", file: "Yes" }],
  truncated: false,
  notes: ["The latest version of each record."],
  ...over,
});

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;
}

describe("registerCsv", () => {
  it("opens in Excel as the printed table, ₹ and all", () => {
    const csv = registerCsv(
      register({
        rows: [
          { sl: 1, device: 'Pump, "ICU"', result: "Pass", file: "Yes" },
          { sl: 2, device: "₹ cost", result: null, file: "No" },
        ],
      }),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "Sl. No.,Equipment,Result,Certificate on file",
      '1,"Pump, ""ICU""",Pass,Yes',
      "2,₹ cost,,No",
      "",
    ]);
  });

  it("never lets typed text run as a spreadsheet formula", () => {
    const csv = registerCsv(
      register({ rows: [{ sl: 1, device: '=HYPERLINK("http://x","click")', result: "-1+1", file: "@SUM(A1)" }] }),
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""click"")",'-1+1,'@SUM(A1)`);
  });

  it("names the file after the register and the day", () => {
    expect(csvFileName(register({ title: "AMC/CMC Register" }), new Date(2026, 9, 11))).toBe(
      "amc-cmc-register_2026-10-11.csv",
    );
  });
});

describe("RegisterSheet", () => {
  it("prints the heading, table, notes and sign-off", () => {
    render(<RegisterSheet register={register()} />);
    expect(screen.getByRole("heading", { name: "Calibration Register" })).toBeInTheDocument();
    expect(screen.getByText("City General Hospital")).toBeInTheDocument();
    expect(screen.getByText("12 Oct 2025 to 11 Oct 2026")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Calibration Register" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Sl. No.",
      "Equipment",
      "Result",
      "Certificate on file",
    ]);
    expect(within(table).getByRole("cell", { name: "SP-1 · Syringe pump" })).toBeInTheDocument();
    expect(screen.getByText("Checked by (Head, Biomedical Engineering)")).toBeInTheDocument();
  });

  it("says when nothing happened, and when the list was cut short", () => {
    const { rerender } = render(<RegisterSheet register={register({ rows: [] })} />);
    expect(screen.getByText("Nothing recorded in this period.")).toBeInTheDocument();
    rerender(<RegisterSheet register={register({ truncated: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Only the first 1 lines are shown/);
  });

  it("leaves room for the HEMC on the annual survey", () => {
    render(<RegisterSheet register={register({ kind: "survey", period: null })} />);
    expect(screen.getByText(/HEMC members/)).toBeInTheDocument();
    expect(screen.getByText("As of:")).toBeInTheDocument();
  });
});

describe("RegistersPage", () => {
  beforeEach(() => {
    getRegister.mockReset().mockImplementation(async (kind: string) => register({ kind: kind as Register["kind"] }));
  });

  it("shows the inventory first, and prints it", async () => {
    const user = userEvent.setup();
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    render(wrap(<RegistersPage />));
    await screen.findByRole("table");
    expect(getRegister).toHaveBeenLastCalledWith("inventory", {
      facilityId: undefined,
      from: undefined,
      to: undefined,
      assetId: undefined,
    });
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });

  it("asks for a period on event registers, and refuses one that runs backwards", async () => {
    const user = userEvent.setup();
    render(wrap(<RegistersPage />));
    await user.selectOptions(screen.getByLabelText("Register"), "calibration");
    await user.selectOptions(screen.getByLabelText("Facility"), "f2");
    await waitFor(() =>
      expect(getRegister).toHaveBeenLastCalledWith(
        "calibration",
        expect.objectContaining({ facilityId: "f2", from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
      ),
    );
    const from = screen.getByLabelText("From");
    await user.clear(from);
    await user.type(from, "2099-01-01");
    expect(screen.getByRole("alert")).toHaveTextContent("The period must start before it ends");
    // A period running backwards is never asked for.
    expect(getRegister.mock.calls.some(([, p]) => (p as { from?: string }).from === "2099-01-01")).toBe(false);
  });

  it("needs a device for a logbook", async () => {
    const user = userEvent.setup();
    render(wrap(<RegistersPage />));
    await user.selectOptions(screen.getByLabelText("Register"), "logbook");
    expect(screen.getByText("Choose the device whose logbook you want.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeDisabled();
    await user.type(screen.getByLabelText("Device"), "pump");
    await user.click(await screen.findByRole("button", { name: /Add Syringe pump/ }));
    await waitFor(() =>
      expect(getRegister).toHaveBeenLastCalledWith("logbook", expect.objectContaining({ assetId: "a1" })),
    );
  });

  it("downloads the register for Excel", async () => {
    const user = userEvent.setup();
    const createObjectURL = jest.fn(() => "blob:register");
    Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() });
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(wrap(<RegistersPage />));
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Download for Excel (CSV)" }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });
});
