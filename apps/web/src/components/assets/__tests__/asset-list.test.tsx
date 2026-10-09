import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AssetList, paramsFromUrl } from "../asset-list";

const replace = jest.fn();
let search = new URLSearchParams();
const useAssets = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/assets",
  useSearchParams: () => search,
}));
jest.mock("@/lib/hooks/use-assets", () => ({ useAssets: (p: unknown) => useAssets(p) }));
jest.mock("@/lib/hooks/use-asset-form-reference", () => ({
  useAssetFormReference: () => ({
    data: {
      enums: {
        assetStatus: [
          { value: "ACTIVE", label: "Active" },
          { value: "QUARANTINED", label: "Quarantined" },
        ],
        deviceCategory: [{ value: "LIFE_SUPPORT", label: "Life Support" }],
        criticalityLevel: [{ value: "CRITICAL", label: "Critical" }],
        riskClassification: [],
      },
    },
  }),
}));

const device = (over: Record<string, unknown>) => ({
  id: "a1",
  assetTagNumber: "VENT-7",
  equipmentName: "ICU ventilator",
  assetStatus: "ACTIVE",
  deviceCategory: "LIFE_SUPPORT",
  nextPmDueDate: "2099-01-01T00:00:00Z",
  currentRoom: { id: "r", roomName: "Bay 3", roomCode: "B3" },
  custodianDepartment: { id: "d", departmentName: "ICU" },
  currentFacility: { id: "f", facilityName: "City General" },
  ...over,
});

describe("AssetList", () => {
  beforeEach(() => {
    replace.mockReset();
    search = new URLSearchParams();
    useAssets.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        total: 60,
        items: [
          device({}),
          device({ id: "a2", assetTagNumber: "PUMP-1", equipmentName: "Infusion pump", assetStatus: "QUARANTINED", nextPmDueDate: "2020-01-01T00:00:00Z" }),
        ],
      },
    });
  });

  it("reads filters and page from the URL and asks the server for that page", () => {
    search = new URLSearchParams("q=vent&status=QUARANTINED&pmOverdue=1&sort=nextPm&page=2");
    render(<AssetList />);
    expect(useAssets).toHaveBeenCalledWith({
      search: "vent",
      status: ["QUARANTINED"],
      category: [],
      criticality: [],
      pmOverdue: true,
      sort: "nextPm",
      order: "asc",
      skip: 50,
      take: 25,
    });
  });

  it("makes out-of-use devices and overdue PM stand out, and links to each device", () => {
    render(<AssetList />);
    const row = screen.getByRole("link", { name: "Infusion pump" }).closest("tr")!;
    expect(within(row).getByText("Quarantined")).toHaveClass("text-critical-500");
    expect(within(row).getByText(/Overdue/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ICU ventilator" })).toHaveAttribute("href", "/assets/a1");
    expect(screen.getByText("60 devices")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("puts filter changes in the URL and goes back to page 1", async () => {
    const user = userEvent.setup();
    search = new URLSearchParams("page=2");
    render(<AssetList />);
    await user.selectOptions(screen.getByLabelText("Status"), "QUARANTINED");
    expect(replace).toHaveBeenCalledWith("/assets?status=QUARANTINED", { scroll: false });
  });

  it("ignores unknown sort values in the URL", () => {
    expect(paramsFromUrl(new URLSearchParams("sort=price&page=-4")).sort).toBe("tag");
    expect(paramsFromUrl(new URLSearchParams("page=-4")).page).toBe(0);
  });
});
