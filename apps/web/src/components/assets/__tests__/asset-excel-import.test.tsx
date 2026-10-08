import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ImportCheck } from "@/lib/api/assets";

import { AssetExcelImport } from "../asset-excel-import";

const validateExcelFile = jest.fn();
const mutateAsync = jest.fn();

jest.mock("@/lib/api/assets", () => ({
  validateExcelFile: (file: File) => validateExcelFile(file),
  downloadAssetTemplate: jest.fn(),
}));
jest.mock("@/lib/hooks/use-assets", () => ({
  useImportAssetsMutation: () => ({ mutateAsync, isPending: false }),
}));

const xlsx = () =>
  new File(["x"], "devices.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

const validCheck: ImportCheck = {
  valid: true,
  totalRows: 2,
  toCreate: 1,
  toUpdate: 1,
  errors: [],
  warnings: [{ row: 3, message: "No serial number" }],
  preview: [
    { row: 2, action: "create", assetTagNumber: "PUMP-1", equipmentName: "Infusion pump", facility: "City General", department: "ICU", status: "Active", category: "Therapeutic" },
    { row: 3, action: "update", assetTagNumber: "PUMP-OLD", equipmentName: "Infusion pump", facility: "City General", department: "ICU", status: "Active", category: "Therapeutic" },
  ],
};

async function openAndChoose(user: ReturnType<typeof userEvent.setup>, file: File) {
  render(<AssetExcelImport />);
  await user.click(screen.getByRole("button", { name: /import/i }));
  await user.upload(screen.getByLabelText(/choose an excel file/i), file);
}

describe("AssetExcelImport", () => {
  beforeEach(() => {
    validateExcelFile.mockReset();
    mutateAsync.mockReset();
  });

  it("checks the file as soon as it is chosen and lists problems by row", async () => {
    const user = userEvent.setup();
    validateExcelFile.mockResolvedValue({
      ...validCheck,
      valid: false,
      toCreate: 0,
      toUpdate: 0,
      preview: [],
      errors: [{ row: 4, field: "Risk Class", message: "Not a recognised value. Use one of: Class I, Class II, Class III", value: "IIb" }],
    });

    await openAndChoose(user, xlsx());

    expect(await screen.findByText(/1 problem to fix/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Risk Class" })).toBeInTheDocument();
    expect(screen.getByText("You entered: IIb")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^import$/i })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("previews a valid file and imports it in one go", async () => {
    const user = userEvent.setup();
    validateExcelFile.mockResolvedValue(validCheck);
    mutateAsync.mockResolvedValue({ success: true, totalRows: 2, imported: 2, created: 1, updated: 1, failed: 0, errors: [], warnings: [] });

    await openAndChoose(user, xlsx());

    expect(await screen.findByText(/Ready to import 2 devices/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "PUMP-OLD" })).toBeInTheDocument();
    expect(screen.getByText(/1 note/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import 2 devices" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Imported 2 devices \(1 new,/)).toBeInTheDocument();
  });

  it("rejects files that are not .xlsx before uploading", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await openAndChoose(user, new File(["a,b"], "devices.csv", { type: "text/csv" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/choose an Excel file \(\.xlsx\)/i);
    expect(validateExcelFile).not.toHaveBeenCalled();
  });
});
