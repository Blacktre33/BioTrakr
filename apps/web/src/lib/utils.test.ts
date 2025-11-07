import { cn } from "./utils";

describe("cn", () => {
  it("merges class names and deduplicates tailwind tokens", () => {
    expect(cn("px-2", "px-2", { hidden: false, flex: true })).toBe("px-2 flex");
  });
});
