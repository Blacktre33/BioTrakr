import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { FacilityNode, StaffAccount } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/client";

import { ChangePasswordForm } from "../change-password-form";
import { PeopleAdmin } from "../people-admin";

const changeOwnPassword = jest.fn();
const setSession = jest.fn();
const createStaff = jest.fn();
const updateStaff = jest.fn();
const resetStaff = jest.fn();

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    statusCode?: number;
    details?: unknown;
    constructor(p: { message: string; statusCode?: number; details?: unknown }) {
      super(p.message);
      this.statusCode = p.statusCode;
      this.details = p.details;
    }
  }
  return { ApiError, api: {} };
});
jest.mock("@/lib/api/admin", () => ({ changeOwnPassword: (...a: unknown[]) => changeOwnPassword(...a) }));
jest.mock("@/lib/auth/session", () => ({
  setSession: (s: unknown) => setSession(s),
  getSession: () => ({ user: { id: "me", role: "admin" } }),
  ROLE_LABEL: { admin: "Administrator", clinical_staff: "Clinical staff", technician: "Biomedical technician" },
}));

const facilities: FacilityNode[] = [
  {
    id: "f1",
    facilityCode: "CG",
    facilityName: "City General",
    facilityType: null,
    city: null,
    timezone: "Asia/Kolkata",
    isActive: true,
    departments: [{ id: "d1", departmentCode: "ICU", departmentName: "Intensive Care", costCenter: null }],
    buildings: [],
  },
];
const person = (over: Partial<StaffAccount>): StaffAccount => ({
  id: "u1",
  email: "nia@a.test",
  firstName: "Nia",
  lastName: "Nurse",
  role: "clinical_staff",
  jobTitle: null,
  facilityId: "f1",
  departmentId: "d1",
  isActive: true,
  lastLoginAt: null,
  passwordChangeRequired: false,
  accountLockedUntil: null,
  createdAt: new Date().toISOString(),
  ...over,
});
let staff: StaffAccount[] = [];

jest.mock("@/lib/hooks/use-admin", () => ({
  useStaff: () => ({ data: staff, isLoading: false, error: null }),
  useLocations: () => ({ data: facilities }),
  useCreateStaff: () => ({ mutateAsync: createStaff, isPending: false }),
  useUpdateStaff: () => ({ mutateAsync: updateStaff, isPending: false }),
  useResetStaffPassword: () => ({ mutateAsync: resetStaff, isPending: false }),
}));

describe("ChangePasswordForm", () => {
  beforeEach(() => {
    changeOwnPassword.mockReset();
    setSession.mockReset();
  });

  it("checks length and that both new passwords match before sending", async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm onChanged={jest.fn()} />);
    await user.type(screen.getByLabelText(/Current password/), "old-one");
    await user.type(screen.getByLabelText(/^New password(?! again)/), "short");
    await user.type(screen.getByLabelText(/New password again/), "shorter");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(screen.getByText("The two new passwords are not the same")).toBeInTheDocument();
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("keeps this device signed in with the fresh session, and shows server errors on the right field", async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    changeOwnPassword.mockRejectedValueOnce(
      new ApiError({ message: "Your current password is not right", details: { fields: ["currentPassword"] } }),
    );
    const fresh = { accessToken: "a", refreshToken: "r", user: { id: "me" } };
    changeOwnPassword.mockResolvedValueOnce(fresh);
    render(<ChangePasswordForm onChanged={onChanged} />);

    await user.type(screen.getByLabelText(/Current password/), "wrong");
    await user.type(screen.getByLabelText(/^New password(?! again)/), "green tea at seven");
    await user.type(screen.getByLabelText(/New password again/), "green tea at seven");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Your current password is not right")).toBeInTheDocument();
    expect(screen.getByLabelText(/Current password/)).toHaveAttribute("aria-invalid", "true");

    await user.clear(screen.getByLabelText(/Current password/));
    await user.type(screen.getByLabelText(/Current password/), "right-one");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("button", { name: "Change password" })).toBeEnabled();
    expect(setSession).toHaveBeenCalledWith(fresh);
    expect(onChanged).toHaveBeenCalledWith(fresh);
  });
});

describe("PeopleAdmin", () => {
  beforeEach(() => {
    staff = [
      person({ id: "me", firstName: "Ada", lastName: "Admin", email: "ada@a.test", role: "admin" }),
      person({ accountLockedUntil: new Date(Date.now() + 60_000).toISOString() }),
    ];
    createStaff.mockReset();
    updateStaff.mockReset();
    resetStaff.mockReset();
  });

  it("shows who is locked out and never offers to deactivate yourself", () => {
    render(<PeopleAdmin />);
    const rows = screen.getAllByText(/@a\.test/).map((el) => el.closest("div.flex.flex-wrap") as HTMLElement);
    const [meRow, niaRow] = rows;
    expect(within(meRow).getByText("You")).toBeInTheDocument();
    expect(within(meRow).queryByRole("button", { name: /Deactivate/ })).not.toBeInTheDocument();
    expect(within(niaRow).getByText("Locked out")).toBeInTheDocument();
    expect(within(niaRow).getByText(/Intensive Care, City General/)).toBeInTheDocument();
  });

  it("adds a person and shows their one-time password once", async () => {
    const user = userEvent.setup();
    createStaff.mockResolvedValue({
      user: person({ id: "u2", firstName: "Tara", lastName: "Tech", email: "tara@a.test" }),
      temporaryPassword: "Abc23defGH45jk",
    });
    render(<PeopleAdmin />);
    await user.click(screen.getByRole("button", { name: "Add person" }));
    await user.click(screen.getByRole("button", { name: "Add and get password" }));
    expect(screen.getByText("Enter their work email")).toBeInTheDocument();
    expect(createStaff).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/First name/), "Tara");
    await user.type(screen.getByLabelText(/Last name/), "Tech");
    await user.type(screen.getByLabelText(/Work email/), "tara@a.test");
    await user.selectOptions(screen.getByLabelText(/Role/), "technician");
    await user.selectOptions(screen.getByLabelText(/Facility/), "f1");
    await user.selectOptions(screen.getByLabelText(/Department/), "d1");
    await user.click(screen.getByRole("button", { name: "Add and get password" }));

    expect(createStaff).toHaveBeenCalledWith(
      expect.objectContaining({ email: "tara@a.test", role: "technician", facilityId: "f1", departmentId: "d1" }),
    );
    expect(await screen.findByText("Abc23defGH45jk")).toBeInTheDocument();
    expect(screen.getByText(/It will not be shown again/)).toBeInTheDocument();
  });

  it("clearing a facility sends null so the API clears the department too", async () => {
    const user = userEvent.setup();
    updateStaff.mockResolvedValue({});
    render(<PeopleAdmin />);
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.selectOptions(screen.getByLabelText(/Facility/), "");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateStaff).toHaveBeenCalledWith({ id: "u1", body: { facilityId: null } });
  });

  it("resets a password only after confirming", async () => {
    const user = userEvent.setup();
    resetStaff.mockResolvedValue({ temporaryPassword: "Zz23yyXX45wwVV" });
    render(<PeopleAdmin />);
    await user.click(screen.getByRole("button", { name: "Unlock / reset" }));
    expect(resetStaff).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(resetStaff).toHaveBeenCalledWith("u1");
    expect(await screen.findByText("Zz23yyXX45wwVV")).toBeInTheDocument();
  });
});
