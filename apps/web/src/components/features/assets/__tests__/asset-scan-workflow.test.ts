import { extractAssetIdFromPayload, UUID_REGEX } from "../asset-scan-workflow";

describe("extractAssetIdFromPayload", () => {
  it("returns the UUID when the payload is a full medasset URL", () => {
    const assetId = "0f3d67ef-4a15-4f9b-92d4-2211f86af5c8";
    const payload = `medasset://asset/${assetId}`;

    expect(extractAssetIdFromPayload(payload)).toBe(assetId);
  });

  it("returns the UUID when the payload is a bare identifier", () => {
    const assetId = "3c1460f0-5f37-4366-93d8-8c71e62f5d7a";

    expect(UUID_REGEX.test(assetId)).toBe(true);
    expect(extractAssetIdFromPayload(assetId)).toBe(assetId);
  });

  it("returns null when no UUID is present", () => {
    expect(extractAssetIdFromPayload("invalid-payload")).toBeNull();
  });
});


