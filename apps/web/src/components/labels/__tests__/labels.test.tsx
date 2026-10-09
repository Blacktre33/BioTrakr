import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Asset } from "@/lib/api/assets";

import { chunk, LabelSheet, PER_SHEET, scanUrl, tagFontPt } from "../label-sheet";
import { qrPath } from "../qr-code";

// @zxing/library comes with @zxing/browser (the in-app scanner); load it from there.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const zx = require(require.resolve("@zxing/library", { paths: [require.resolve("@zxing/browser")] }));

/** Rasterises our SVG path (not the library's matrix) and decodes it like a phone would. */
function decode(text: string): string {
  const { size, d } = qrPath(text);
  const scale = 4;
  const quiet = 4;
  const width = (size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width).fill(255);
  for (const [, xs, ys] of d.matchAll(/M(\d+) (\d+)/g)) {
    const x = Number(xs);
    const y = Number(ys);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        pixels[((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx] = 0;
      }
    }
  }
  const source = new zx.RGBLuminanceSource(pixels, width, width);
  const bitmap = new zx.BinaryBitmap(new zx.HybridBinarizer(source));
  return new zx.QRCodeReader().decode(bitmap).getText();
}

const getAsset = jest.fn();
const listAssets = jest.fn();
jest.mock("@/lib/api/assets", () => ({
  getAsset: (...a: unknown[]) => getAsset(...a),
  listAssets: (...a: unknown[]) => listAssets(...a),
}));
jest.mock("@/lib/hooks/use-asset-form-reference", () => ({
  useAssetFormReference: () => ({
    data: { facilities: [{ id: "f1", name: "City General", code: "CG" }], departments: [] },
  }),
}));
let searchParams = new URLSearchParams();
const replace = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/labels",
  useSearchParams: () => searchParams,
}));

const device = (n: number): Asset =>
  ({
    id: `a${n}`,
    assetTagNumber: `BME-${String(n).padStart(4, "0")}`,
    equipmentName: `Infusion pump ${n}`,
    currentFacility: { id: "f1", facilityName: "City General" },
    custodianDepartment: { id: "d1", departmentName: "ICU" },
  }) as Asset;

function renderSheet() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LabelSheet />
    </QueryClientProvider>,
  );
}

describe("QR labels", () => {
  beforeEach(() => {
    getAsset.mockReset();
    listAssets.mockReset();
    replace.mockReset();
  });

  it("encodes a link to the scan page that a phone can read back exactly", () => {
    const url = scanUrl("https://biotrakr.citygeneral.example/", "ICU/VENT 7&8");
    expect(url).toBe("https://biotrakr.citygeneral.example/scan?code=ICU%2FVENT%207%268");
    expect(decode(url)).toBe(url);
  });

  it("sizes the tag to stay on one line, down to a readable floor", () => {
    expect(tagFontPt("BME-2024-001", "sheet")).toBe(11);
    expect(tagFontPt("BME-2024-001", "roll")).toBe(8);
    expect(tagFontPt("CG-ICU-VENT-2019-00045", "sheet")).toBeLessThan(11);
    expect(tagFontPt("X".repeat(60), "sheet")).toBe(6);
  });

  it("splits A4 labels into sheets of 21", () => {
    expect(chunk(Array.from({ length: 43 }, (_, i) => i), PER_SHEET).map((p) => p.length)).toEqual([21, 21, 1]);
  });

  it("prints one device's label from its page, and warns that localhost codes won't open on a phone", async () => {
    searchParams = new URLSearchParams("id=a7");
    getAsset.mockResolvedValue(device(7));
    renderSheet();
    expect(await screen.findByRole("img", { name: "QR code for BME-0007" })).toBeInTheDocument();
    expect(screen.getByText("Infusion pump 7")).toBeInTheDocument();
    expect(screen.getByText("ICU · City General")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print 1 label" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/phones on the ward cannot open/);
    expect(listAssets).not.toHaveBeenCalled();
  });

  it("fetches every page of a filtered list and lets people leave devices out", async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams("facility=f1&status=ACTIVE");
    const all = Array.from({ length: 130 }, (_, i) => device(i + 1));
    listAssets.mockImplementation(async ({ skip, take }: { skip: number; take: number }) => ({
      total: all.length,
      items: all.slice(skip, skip + take),
    }));
    renderSheet();
    expect(await screen.findByRole("button", { name: "Print 130 labels" })).toBeInTheDocument();
    expect(listAssets).toHaveBeenCalledTimes(2);
    expect(listAssets).toHaveBeenCalledWith(expect.objectContaining({ facilityId: "f1", status: ["ACTIVE"], take: 100 }));

    await user.click(screen.getByText(/Choose devices/));
    await user.click(screen.getByRole("checkbox", { name: /BME-0002/ }));
    expect(screen.getByRole("button", { name: "Print 129 labels" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for BME-0002" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select none" }));
    expect(screen.getByRole("button", { name: "Print 0 labels" })).toBeDisabled();
  });
});
