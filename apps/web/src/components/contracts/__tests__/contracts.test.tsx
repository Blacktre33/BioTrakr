import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Contract, DeviceCover, Vendor } from "@/lib/api/contracts";

import { statusBadge } from "../contract-card";
import { contractErrors, initialValues, toContractInput } from "../contract-dialog";
import { ContractsPage } from "../contracts-page";
import { ServiceCoverSection } from "../service-cover-section";

const saveContract = jest.fn();
const saveVendor = jest.fn();
const terminate = jest.fn();
const useContracts = jest.fn();
let contracts: Contract[] = [];
let vendors: Vendor[] = [];
let cover: DeviceCover;
let role = "engineer";
let searchParams = new URLSearchParams();

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));
jest.mock("@/lib/auth/session", () => ({ getSession: () => ({ user: { id: "u1", role } }) }));
jest.mock("@/lib/hooks/use-contracts", () => ({
  useContracts: (filter: string) => {
    useContracts(filter);
    return { isPending: false, isError: false, data: contracts };
  },
  useDeviceCover: () => ({ isPending: false, isError: false, data: cover }),
  useVendors: () => ({ isPending: false, isError: false, data: vendors }),
  useSaveContract: () => ({ mutateAsync: saveContract, isPending: false }),
  useSaveVendor: () => ({ mutateAsync: saveVendor, isPending: false }),
  useTerminateContract: () => ({ mutateAsync: terminate, isPending: false }),
}));
jest.mock("@/lib/hooks/use-assets", () => ({
  useAssets: ({ search }: { search: string }) => ({
    isPending: false,
    data: {
      total: 2,
      items: [
        { id: "a1", assetTagNumber: "MON-1", equipmentName: "Patient monitor" },
        { id: "a2", assetTagNumber: "VENT-7", equipmentName: "ICU ventilator" },
      ].filter((a) => !search || `${a.assetTagNumber} ${a.equipmentName}`.toLowerCase().includes(search.toLowerCase())),
    },
  }),
}));

const philips: Vendor = {
  id: "v1",
  vendorName: "Philips Healthcare India",
  vendorType: "SERVICE_PROVIDER",
  contactPerson: "Rajesh Kumar",
  phone: "1800 102 2929",
  email: "service@example.in",
  address: null,
  contracts: 1,
};

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const cmc = (over: Partial<Contract> = {}): Contract => ({
  id: "c1",
  contractType: "CMC",
  contractNumber: "PH/CMC/2026/12",
  startDate: day(-345),
  endDate: day(20),
  annualValue: 132000,
  pmVisitsPerYear: 4,
  responseTimeHours: 24,
  uptimeGuaranteePercent: 95,
  notes: null,
  renewsId: "c0",
  terminatedAt: null,
  terminationReason: null,
  vendor: philips,
  devices: [{ id: "a1", assetTagNumber: "MON-1", equipmentName: "Patient monitor", assetStatus: "ACTIVE" }],
  status: "active",
  daysLeft: 20,
  renewedById: null,
  previous: { id: "c0", contractNumber: "PH/CMC/2025/09", annualValue: 120000 },
  ...over,
});

describe("contract rules", () => {
  it("renews from the day after the current contract ends, for a year", () => {
    const values = initialValues("renew", cmc({ endDate: "2027-03-31T06:30:00.000Z" }));
    expect(values).toMatchObject({
      vendorId: "v1",
      contractNumber: "",
      startDate: "2027-04-01",
      endDate: "2028-03-31",
      annualValue: "132000",
      devices: [{ id: "a1", assetTagNumber: "MON-1", equipmentName: "Patient monitor" }],
    });
  });

  it("puts each problem next to its field", () => {
    expect(
      contractErrors({
        ...initialValues("create"),
        startDate: "2026-04-01",
        endDate: "2026-03-31",
        responseTimeHours: "2.5",
        uptimeGuaranteePercent: "120",
      }),
    ).toEqual({
      vendorId: "Choose the vendor",
      contractNumber: "Enter the contract or PO number",
      endDate: "Must be on or after the start date",
      responseTimeHours: "Whole number of hours, 1 to 720",
      uptimeGuaranteePercent: "A percentage, 0 to 100",
      devices: "Choose at least one device",
    });
  });

  it("sends numbers as numbers and leaves blanks out", () => {
    const input = toContractInput({
      ...initialValues("create"),
      vendorId: "v1",
      contractNumber: " AMC-1 ",
      annualValue: "1,20,000",
      devices: [{ id: "a1", assetTagNumber: "MON-1", equipmentName: "Patient monitor" }],
    });
    expect(input).toMatchObject({ contractNumber: "AMC-1", annualValue: 120000, deviceIds: ["a1"] });
    expect(input.responseTimeHours).toBeUndefined();
  });

  it("says plainly how a contract stands", () => {
    expect(statusBadge(cmc()).label).toBe("In force, ends in 20 days");
    expect(statusBadge(cmc({ renewedById: "c2" })).label).toBe("In force, renewal arranged");
    expect(statusBadge(cmc({ status: "expired", daysLeft: -3 })).label).toBe("Expired, 3 days ago");
    expect(statusBadge(cmc({ status: "terminated" })).label).toBe("Ended early");
  });
});

describe("ContractsPage", () => {
  beforeEach(() => {
    role = "engineer";
    searchParams = new URLSearchParams();
    contracts = [cmc()];
    vendors = [philips];
    useContracts.mockReset();
    saveContract.mockReset().mockResolvedValue(cmc({ id: "c2", contractNumber: "PH/CMC/2027/04" }));
    saveVendor.mockReset();
    terminate.mockReset().mockResolvedValue({});
  });

  it("shows each contract with the vendor to call and the change in cost", () => {
    render(<ContractsPage />);
    const card = screen.getByRole("listitem");
    expect(within(card).getByText("In force, ends in 20 days")).toBeInTheDocument();
    expect(within(card).getByText(/₹1,32,000 a year/)).toBeInTheDocument();
    expect(within(card).getByText(/\+10% on the year before/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /1800 102 2929/ })).toHaveAttribute("href", "tel:18001022929");
    expect(within(card).getByRole("link", { name: "Patient monitor" })).toHaveAttribute("href", "/assets/a1");
    expect(useContracts).toHaveBeenLastCalledWith("current");
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<ContractsPage />);
    await user.click(screen.getByRole("button", { name: "Ending in 90 days" }));
    expect(useContracts).toHaveBeenLastCalledWith("ending");
    expect(screen.getByRole("button", { name: "Ending in 90 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows every contract when a notice links to one, and scrolls to it", () => {
    const scroll = jest.fn();
    // jsdom does not lay out the page.
    Element.prototype.scrollIntoView = scroll;
    searchParams = new URLSearchParams("id=c1");
    render(<ContractsPage />);
    expect(useContracts).toHaveBeenLastCalledWith("all");
    expect(scroll).toHaveBeenCalledWith({ block: "center" });
    expect(document.getElementById("contract-c1")).toHaveClass("border-primary-500/60");
  });

  it("renews with the next period filled in, and the new number required", async () => {
    const user = userEvent.setup();
    render(<ContractsPage />);
    await user.click(screen.getByRole("button", { name: "Renew" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/Contract or PO number/)).toHaveAttribute("placeholder", "Last year: PH/CMC/2026/12");
    await user.click(within(dialog).getByRole("button", { name: "Renew" }));
    expect(saveContract).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Enter the contract or PO number")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Contract or PO number/), "PH/CMC/2027/04");
    const cost = within(dialog).getByLabelText(/Cost per year/);
    await user.clear(cost);
    await user.type(cost, "145200");
    expect(within(dialog).getByText("+10% on last year (₹1,32,000)")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Renew" }));
    expect(saveContract).toHaveBeenCalledWith({
      mode: "renew",
      id: "c1",
      body: expect.objectContaining({ contractNumber: "PH/CMC/2027/04", annualValue: 145200, deviceIds: ["a1"] }),
    });
  });

  it("adds a contract: devices found by search, every server problem listed", async () => {
    const user = userEvent.setup();
    saveContract.mockRejectedValueOnce(
      Object.assign(new Error("x"), {
        details: { message: ["ICU ventilator (VENT-7) is already covered by AMC GE-1 (GE)", "Choose a vendor from the list"] },
      }),
    );
    render(<ContractsPage />);
    await user.click(screen.getByRole("button", { name: "New contract" }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText(/^Vendor/), "v1");
    await user.type(within(dialog).getByLabelText(/Contract or PO number/), "CMC-77");
    await user.type(within(dialog).getByLabelText(/Devices covered/), "vent");
    await user.click(await within(dialog).findByRole("button", { name: /Add ICU ventilator/ }));
    expect(within(dialog).getByRole("list", { name: "Devices covered" })).toHaveTextContent("ICU ventilator");
    await user.click(within(dialog).getByRole("button", { name: "Add contract" }));
    expect(saveContract).toHaveBeenCalledWith({
      mode: "create",
      id: undefined,
      body: expect.objectContaining({ vendorId: "v1", contractNumber: "CMC-77", deviceIds: ["a2"] }),
    });
    const alert = within(dialog).getByRole("alert");
    expect(within(alert).getAllByRole("listitem")).toHaveLength(2);
  });

  it("ends a contract early only with a reason", async () => {
    const user = userEvent.setup();
    render(<ContractsPage />);
    await user.click(screen.getByRole("button", { name: "End early…" }));
    await user.click(screen.getByRole("button", { name: "End contract" }));
    expect(terminate).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Why/), "Vendor stopped servicing this model");
    await user.click(screen.getByRole("button", { name: "End contract" }));
    expect(terminate).toHaveBeenCalledWith({ id: "c1", reason: "Vendor stopped servicing this model" });
  });

  it("lets technicians look but not change", () => {
    role = "technician";
    render(<ContractsPage />);
    expect(screen.getByText("Philips Healthcare India")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New contract|Edit|Renew|End early/ })).not.toBeInTheDocument();
  });

  it("lists vendors with their contacts", async () => {
    const user = userEvent.setup();
    render(<ContractsPage />);
    await user.click(screen.getByRole("tab", { name: "Vendors" }));
    expect(screen.getByText("Service company · 1 contract")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /service@example.in/ })).toHaveAttribute("href", "mailto:service@example.in");
  });
});

describe("ServiceCoverSection", () => {
  const device = { id: "a1", assetTagNumber: "MON-1", equipmentName: "Patient monitor" };

  beforeEach(() => {
    saveContract.mockReset().mockResolvedValue(cmc());
    vendors = [philips];
    cover = {
      warranty: { startDate: null, endDate: day(-400), terms: null, daysLeft: -400, active: false },
      contracts: [
        cmc(),
        cmc({ id: "c0", contractNumber: "PH/CMC/2025/09", status: "expired", daysLeft: -345, renewedById: "c1", previous: null }),
      ],
      earlierAmc: { contractNumber: "AMC-OLD", startDate: null, endDate: day(-800), annualCost: 50000 },
    };
  });

  it("shows the warranty, the contract in force, and earlier ones on request", async () => {
    const user = userEvent.setup();
    render(<ServiceCoverSection device={device} canEdit />);
    expect(screen.getByText(/^Warranty ended /)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText(/Recorded on the device earlier: AMC AMC-OLD/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show earlier contracts (1)" }));
    expect(screen.getByText("PH/CMC/2025/09")).toBeInTheDocument();
  });

  it("starts a new contract with this device already chosen", async () => {
    const user = userEvent.setup();
    cover = { ...cover, contracts: [], earlierAmc: null };
    render(<ServiceCoverSection device={device} canEdit />);
    expect(screen.getByText(/Not covered by an AMC or CMC/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add contract" }));
    expect(within(screen.getByRole("list", { name: "Devices covered" })).getByText(/Patient monitor/)).toBeInTheDocument();
  });
});
