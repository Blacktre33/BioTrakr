import { render, screen } from "@testing-library/react";

import { DEPLOY_GUIDE_URL, HelpGuide } from "../help-guide";

describe("HelpGuide", () => {
  it("points staff at the pages for each everyday job", () => {
    render(<HelpGuide />);

    const href = (name: RegExp) => screen.getByRole("link", { name }).getAttribute("href");
    expect(href(/^scan a device/i)).toBe("/scan");
    expect(href(/^report a problem/i)).toBe("/scan");
    expect(href(/^work queue/i)).toBe("/maintenance");
    expect(href(/^pm schedule/i)).toBe("/maintenance/schedule");
  });

  it("says who to contact and links IT to the install guide", () => {
    render(<HelpGuide />);

    expect(screen.getByRole("heading", { name: /who to contact/i })).toBeInTheDocument();
    expect(screen.getByText(/phone biomedical engineering/i)).toBeInTheDocument();
    expect(screen.getByText(/ask your biotrakr administrator/i)).toBeInTheDocument();
    const guide = screen.getByRole("link", { name: /install guide/i });
    expect(guide).toHaveAttribute("href", DEPLOY_GUIDE_URL);
    expect(DEPLOY_GUIDE_URL).toMatch(/docs\/DEPLOY-ONPREM\.md$/);
  });
});
