import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { fileProblem, formatSize, type StoredDocument } from "@/lib/api/documents";

import { Attachments } from "../attachments";
import { DocumentsSection } from "../documents-section";

const upload = jest.fn();
const withdraw = jest.fn();
const openDocument = jest.fn();
const useDocuments = jest.fn();
let docs: StoredDocument[] = [];

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/api/documents", () => ({
  ...jest.requireActual("@/lib/api/documents"),
  openDocument: (doc: unknown) => openDocument(doc),
}));
jest.mock("@/lib/hooks/use-documents", () => ({
  useDocuments: (type: string, id: string, enabled: boolean) => {
    useDocuments(type, id, enabled);
    // A disabled query has no data, as in react-query.
    return enabled ? { isPending: false, isError: false, data: docs } : { isPending: true, isError: false };
  },
  useUploadDocument: () => ({ mutateAsync: upload, isPending: false }),
  useWithdrawDocument: () => ({ mutateAsync: withdraw, isPending: false }),
}));

const doc = (over: Partial<StoredDocument> = {}): StoredDocument => ({
  id: "d1",
  assetId: "a1",
  calibrationRecordId: "c1",
  safetyTestRecordId: null,
  contractId: null,
  workOrderId: null,
  category: "CALIBRATION_CERTIFICATE",
  title: "Certificate PCL/2026/0412",
  fileName: "PCL-0412.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1_450_000,
  sha256: "ab".repeat(32),
  uploadedAt: "2026-04-10T08:00:00.000Z",
  uploadedBy: "Tara Tech",
  withdrawal: null,
  ...over,
});

const pdf = (name = "cert.pdf", size = 2048) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

describe("file rules", () => {
  it("say what is wrong before uploading", () => {
    expect(fileProblem(pdf())).toBeNull();
    expect(fileProblem(new File(["x"], "photo.JPG", { type: "" }))).toBeNull();
    expect(fileProblem(new File(["x"], "notes.docx", { type: "application/msword" }))).toBe(
      "Upload a PDF, JPEG or PNG file",
    );
    expect(fileProblem(new File([], "empty.pdf"))).toBe("The file is empty");
    expect(fileProblem(pdf("big.pdf", 10 * 1024 * 1024 + 1))).toBe("The file is larger than 10 MB");
  });

  it("show sizes plainly", () => {
    expect(formatSize(1_450_000)).toBe("1.4 MB");
    expect(formatSize(300)).toBe("1 KB");
    expect(formatSize(820 * 1024)).toBe("820 KB");
  });
});

describe("Attachments", () => {
  beforeEach(() => {
    docs = [doc()];
    upload.mockReset().mockResolvedValue(doc());
    withdraw.mockReset().mockResolvedValue(doc());
    openDocument.mockReset().mockResolvedValue(undefined);
    useDocuments.mockReset();
  });

  const certificate = { one: "Certificate", none: "No certificate on file" };

  it("says whether evidence is on file, and loads the list only when asked", async () => {
    const user = userEvent.setup();
    render(<Attachments targetType="calibration" targetId="c1" count={1} canUpload={false} label={certificate} />);
    expect(screen.getByText("Certificate on file (1)")).toBeInTheDocument();
    expect(useDocuments).toHaveBeenLastCalledWith("calibration", "c1", false);
    expect(screen.queryByText(/Attach a file/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show" }));
    expect(useDocuments).toHaveBeenLastCalledWith("calibration", "c1", true);
    expect(screen.getByText(/PCL-0412.pdf · 1.4 MB/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Certificate PCL/2026/0412" }));
    expect(openDocument).toHaveBeenCalledWith(expect.objectContaining({ id: "d1", mimeType: "application/pdf" }));
  });

  it("says plainly when nothing is on file", () => {
    render(<Attachments targetType="calibration" targetId="c1" count={0} canUpload label={certificate} />);
    expect(screen.getByText("No certificate on file")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show" })).not.toBeInTheDocument();
  });

  it("uploads a file with a title, refusing the wrong kind first", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(
      <Attachments
        targetType="calibration"
        targetId="c1"
        count={0}
        canUpload
        label={certificate}
        defaultTitle="Certificate PCL/2026/0412"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Attach a file" }));
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a file to upload");

    const input = screen.getByLabelText(/File \(PDF, JPEG or PNG/);
    await user.upload(input, new File(["x"], "notes.docx", { type: "application/msword" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Upload a PDF, JPEG or PNG file");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(upload).not.toHaveBeenCalled();

    const file = pdf("PCL-0412.pdf");
    await user.upload(input, file);
    expect(screen.getByLabelText(/Title/)).toHaveAttribute("placeholder", "Certificate PCL/2026/0412");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(upload).toHaveBeenCalledWith({
      targetType: "calibration",
      targetId: "c1",
      file,
      title: "Certificate PCL/2026/0412",
      category: undefined,
    });
  });

  it("withdraws a wrong file only with a reason, and shows it as withdrawn", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Attachments targetType="calibration" targetId="c1" count={1} canUpload label={certificate} />,
    );
    await user.click(screen.getByRole("button", { name: "Show" }));
    await user.click(screen.getByRole("button", { name: "Withdraw…" }));
    await user.click(screen.getByRole("button", { name: "Withdraw file" }));
    expect(withdraw).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Say why the file is withdrawn");
    await user.type(screen.getByLabelText(/Why withdraw it/), "Certificate for a different pump");
    await user.click(screen.getByRole("button", { name: "Withdraw file" }));
    expect(withdraw).toHaveBeenCalledWith({ id: "d1", reason: "Certificate for a different pump" });

    docs = [
      doc({
        withdrawal: {
          reason: "Certificate for a different pump",
          withdrawnAt: "2026-04-11T08:00:00.000Z",
          withdrawnBy: "Tara Tech",
        },
      }),
    ];
    rerender(<Attachments targetType="calibration" targetId="c1" count={0} canUpload label={certificate} />);
    expect(screen.getByText(/Withdrawn .* by Tara Tech: Certificate for a different pump/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw…" })).not.toBeInTheDocument();
  });
});

describe("DocumentsSection", () => {
  beforeEach(() => {
    upload.mockReset().mockResolvedValue(doc());
    docs = [
      doc(),
      doc({ id: "d2", category: "MANUAL", title: "Operator manual", calibrationRecordId: null, fileName: "manual.pdf" }),
    ];
  });

  it("lists every file about the device with what it is, and files new ones by kind", async () => {
    const user = userEvent.setup();
    render(<DocumentsSection assetId="a1" canUpload />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText(/^Manual · manual.pdf/)).toBeInTheDocument();
    expect(within(list).getByText(/^Calibration certificate · PCL-0412.pdf/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Attach a file" }));
    await user.upload(screen.getByLabelText(/File \(PDF/), pdf("install.pdf"));
    await user.selectOptions(screen.getByLabelText("What is it?"), "INSTALLATION_REPORT");
    await user.click(screen.getByRole("button", { name: "Upload" }));
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "asset", targetId: "a1", category: "INSTALLATION_REPORT" }),
    );
  });
});
