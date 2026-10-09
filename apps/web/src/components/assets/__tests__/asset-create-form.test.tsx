import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AssetCreateForm } from "../asset-create-form";

const mutateAsync = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hooks/use-assets", () => ({
  useCreateAssetMutation: () => ({ mutateAsync, isPending: false }),
}));
jest.mock("@/lib/auth/session", () => ({
  getSession: () => ({ user: { id: "u-me" } }),
}));
jest.mock("@/lib/hooks/use-asset-form-reference", () => ({
  useAssetFormReference: () => ({
    isError: false,
    refetch: jest.fn(),
    data: {
      enums: {
        assetStatus: [
          { value: "ACTIVE", label: "Active" },
          { value: "QUARANTINED", label: "Quarantined", hint: "Do not use on patients" },
        ],
        deviceCategory: [
          { value: "LIFE_SUPPORT", label: "Life Support" },
          { value: "IMAGING", label: "Imaging" },
        ],
        criticalityLevel: [{ value: "CRITICAL", label: "Critical" }],
        riskClassification: [{ value: "CLASS_III", label: "Class III", hint: "High risk" }],
      },
      facilities: [{ id: "f1", name: "City General", code: "CG" }],
      departments: [
        { id: "d1", name: "ICU", facilityId: "f1" },
        { id: "d9", name: "Elsewhere", facilityId: "f9" },
      ],
      custodians: [
        { id: "u-me", name: "Me Myself", jobTitle: null, facilityId: "f1", departmentId: "d1" },
        { id: "u2", name: "Nia Nurse", jobTitle: "Charge Nurse", facilityId: "f1", departmentId: "d1" },
      ],
    },
  }),
}));

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/asset tag/i), "BME-001");
  await user.type(screen.getByLabelText(/equipment name/i), "Ventilator");
  await user.type(screen.getByLabelText(/manufacturer/i), "Dräger");
  await user.type(screen.getByLabelText(/^model/i), "V500");
  await user.type(screen.getByLabelText(/serial number/i), "SN1");
  await user.selectOptions(screen.getByLabelText(/category/i), "LIFE_SUPPORT");
  await user.selectOptions(screen.getByLabelText(/criticality/i), "CRITICAL");
  await user.selectOptions(screen.getByLabelText(/risk class/i), "CLASS_III");
  await user.type(screen.getByLabelText(/purchase date/i), "2024-01-15");
  await user.type(screen.getByLabelText(/purchase cost/i), "0");
}

describe("AssetCreateForm", () => {
  beforeEach(() => mutateAsync.mockReset());

  it("offers only the values the API accepts, with hints for risky ones", () => {
    render(<AssetCreateForm open />);
    const category = screen.getByLabelText(/category/i);
    expect(within(category).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual([
      "",
      "LIFE_SUPPORT",
      "IMAGING",
    ]);
    expect(screen.getByRole("option", { name: "Quarantined — Do not use on patients" })).toBeInTheDocument();
  });

  it("pre-fills the only facility, its only department and the signed-in custodian", () => {
    render(<AssetCreateForm open />);
    expect(screen.getByLabelText(/facility/i)).toHaveValue("f1");
    expect(screen.getByLabelText(/department/i)).toHaveValue("d1");
    expect(screen.getByLabelText(/custodian/i)).toHaveValue("u-me");
    // Departments of other facilities are not offered.
    expect(screen.queryByRole("option", { name: "Elsewhere" })).not.toBeInTheDocument();
  });

  it("shows a message under a required field once the user leaves it empty", async () => {
    const user = userEvent.setup();
    render(<AssetCreateForm open />);
    const serial = screen.getByLabelText(/serial number/i);

    await user.click(serial);
    await user.tab();

    expect(serial).toHaveAttribute("aria-invalid", "true");
    expect(serial).toHaveAccessibleDescription("Required");
  });

  it("does not submit an incomplete form and moves focus to the first problem", async () => {
    const user = userEvent.setup();
    render(<AssetCreateForm open />);

    await user.click(screen.getByRole("button", { name: /add device/i }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/asset tag/i)).toHaveFocus();
    expect(screen.getByText(/fields need attention/i)).toBeInTheDocument();
  });

  it("submits a valid form and puts a duplicate-tag error under the tag", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce({ statusCode: 409, message: "This asset tag number is already in use" });
    render(<AssetCreateForm open />);

    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /add device/i }));

    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        assetTagNumber: "BME-001",
        deviceCategory: "LIFE_SUPPORT",
        purchaseCost: 0,
        currentFacilityId: "f1",
        custodianDepartmentId: "d1",
        primaryCustodianId: "u-me",
      }),
    );
    const tag = screen.getByLabelText(/asset tag/i);
    expect(tag).toHaveAccessibleDescription(/already in use/);
    expect(tag).toHaveFocus();
  });
});
