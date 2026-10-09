import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Asset } from "@/lib/api/assets";

import { ChangeStatusDialog } from "../change-status-dialog";
import { changedPayload, validateEdit, valuesFromAsset } from "../edit-asset-dialog";

const mutateAsync = jest.fn();
jest.mock("@/lib/hooks/use-asset-status", () => ({
  useChangeAssetStatusMutation: () => ({ mutateAsync, isPending: false }),
}));
jest.mock("sonner", () => ({ toast: { success: jest.fn() } }));

const statusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "IN_MAINTENANCE", label: "In Maintenance", hint: "With biomedical engineering" },
  { value: "QUARANTINED", label: "Quarantined", hint: "Do not use on patients" },
];

describe("ChangeStatusDialog", () => {
  beforeEach(() => mutateAsync.mockReset().mockResolvedValue({ changed: true }));

  const renderDialog = (currentStatus: string) =>
    render(
      <ChangeStatusDialog
        open
        onOpenChange={jest.fn()}
        assetId="a1"
        equipmentName="ICU ventilator"
        currentStatus={currentStatus}
        statusOptions={statusOptions}
      />,
    );

  it("needs a reason and an explicit safety confirmation to release a device", async () => {
    const user = userEvent.setup();
    renderDialog("QUARANTINED");

    await user.selectOptions(screen.getByLabelText(/new status/i), "ACTIVE");
    await user.click(screen.getByRole("button", { name: "Release to service" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Say why (at least a few words)")).toBeInTheDocument();
    expect(screen.getByText("Confirm the device is safe before releasing it")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/reason/i), "Replaced flow sensor; passed safety test");
    await user.click(screen.getByRole("checkbox", { name: /safe to use on patients/i }));
    await user.click(screen.getByRole("button", { name: "Release to service" }));

    expect(mutateAsync).toHaveBeenCalledWith({
      status: "ACTIVE",
      reason: "Replaced flow sensor; passed safety test",
      expectedStatus: "QUARANTINED",
      confirmSafe: true,
    });
  });

  it("does not ask for the safety confirmation when taking a device out of use", async () => {
    const user = userEvent.setup();
    renderDialog("ACTIVE");

    await user.selectOptions(screen.getByLabelText(/new status/i), "QUARANTINED");
    await user.type(screen.getByLabelText(/reason/i), "Alarm keeps sounding");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change status" }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: "QUARANTINED", expectedStatus: "ACTIVE" }));
  });

  it("shows why the server refused", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error("Someone else changed this device’s status just now."));
    renderDialog("ACTIVE");

    await user.selectOptions(screen.getByLabelText(/new status/i), "QUARANTINED");
    await user.type(screen.getByLabelText(/reason/i), "Alarm keeps sounding");
    await user.click(screen.getByRole("button", { name: "Change status" }));

    expect(await screen.findByText(/Someone else changed/)).toBeInTheDocument();
  });
});

describe("edit details", () => {
  const asset = {
    id: "a1",
    assetTagNumber: "VENT-7",
    equipmentName: "Ventilator",
    manufacturer: "Dräger",
    modelNumber: "V500",
    serialNumber: "SN1",
    deviceCategory: "LIFE_SUPPORT",
    criticalityLevel: "CRITICAL",
    riskClassification: "CLASS_III",
    currentFacilityId: "f1",
    custodianDepartmentId: "d1",
    primaryCustodianId: "u1",
    usefulLifeYears: 10,
    pmFrequencyDays: null,
    warrantyEndDate: "2027-01-31T00:00:00.000Z",
    notes: null,
  } as unknown as Asset;
  const departments = [
    { id: "d1", name: "ICU", facilityId: "f1" },
    { id: "d2", name: "OT", facilityId: "f2" },
  ];

  it("sends only what changed, with numbers as numbers", () => {
    const before = valuesFromAsset(asset);
    expect(before.warrantyEndDate).toBe("2027-01-31");
    expect(changedPayload(before, { ...before, pmFrequencyDays: "180", notes: "Moved to ICU-2" })).toEqual({
      pmFrequencyDays: 180,
      notes: "Moved to ICU-2",
    });
    expect(changedPayload(before, before)).toEqual({});
  });

  it("checks PM interval, useful life and department/facility", () => {
    const v = valuesFromAsset(asset);
    expect(validateEdit({ ...v, pmFrequencyDays: "0", usefulLifeYears: "2.5", custodianDepartmentId: "d2" }, departments)).toEqual({
      pmFrequencyDays: "Whole number of days, 1 to 3650",
      usefulLifeYears: "Whole number of years, 1 to 50",
      custodianDepartmentId: "Pick a department in the selected facility",
    });
    expect(validateEdit(v, departments)).toEqual({});
  });
});
