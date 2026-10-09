import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Notice, NoticeList } from "@/lib/api/notifications";

import { NotificationBell } from "../notification-bell";

let list: NoticeList = { unread: 0, items: [] };
const getNotifications = jest.fn(async () => list);
const markNotificationsRead = jest.fn(async (_body: unknown) => ({ updated: 1 }));
jest.mock("@/lib/api/notifications", () => ({
  getNotifications: () => getNotifications(),
  markNotificationsRead: (body: unknown) => markNotificationsRead(body),
}));
const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const notice = (over: Partial<Notice>): Notice => ({
  id: "n1",
  kind: "problem_reported",
  severity: "info",
  title: "Infusion pump (PUMP-1) reported faulty",
  body: "Label peeling\nReported by Nia Nurse",
  link: "/maintenance",
  assetId: "a1",
  workOrderId: "w1",
  createdAt: new Date().toISOString(),
  readAt: null,
  ...over,
});

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = jest.fn(async () => "granted" as NotificationPermission);
  static shown: Array<{ title: string; options?: NotificationOptions }> = [];
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.shown.push({ title, options });
  }
  close() {}
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
  return client;
}

describe("NotificationBell", () => {
  beforeEach(() => {
    getNotifications.mockClear();
    markNotificationsRead.mockClear();
    push.mockClear();
    FakeNotification.shown = [];
    Object.assign(window, { Notification: FakeNotification });
    window.localStorage.clear();
    document.title = "Work orders";
  });

  it("shows the unread count, in the tab title too, and opens a notice where it points", async () => {
    const user = userEvent.setup();
    list = { unread: 1, items: [notice({}), notice({ id: "n0", title: "Older", readAt: new Date().toISOString() })] };
    renderBell();
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    expect(document.title).toBe("(1) Work orders");

    await user.click(bell);
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    await user.click(within(panel).getByRole("button", { name: /PUMP-1/ }));
    expect(markNotificationsRead).toHaveBeenCalledWith({ ids: ["n1"] });
    expect(push).toHaveBeenCalledWith("/maintenance");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks everything read at once, and closes on Escape", async () => {
    const user = userEvent.setup();
    list = { unread: 2, items: [notice({}), notice({ id: "n2" })] };
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
    list = { unread: 0, items: list.items.map((n) => ({ ...n, readAt: new Date().toISOString() })) };
    await user.click(screen.getByRole("button", { name: "Mark all read" }));
    expect(markNotificationsRead).toHaveBeenCalledWith({ all: true });
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(document.title).toBe("Work orders");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pops a desktop alert only for new urgent notices, once turned on", async () => {
    const user = userEvent.setup();
    list = { unread: 1, items: [notice({ id: "old", severity: "critical", title: "Already there" })] };
    const client = renderBell();
    await user.click(await screen.findByRole("button", { name: /Notifications/ }));
    await user.click(screen.getByRole("button", { name: /Get a desktop alert/ }));
    expect(screen.getByText(/Desktop alerts for urgent notices are on/)).toBeInTheDocument();

    list = {
      unread: 3,
      items: [
        notice({ id: "new-urgent", severity: "critical", title: "Urgent: ICU ventilator (VENT-7) reported faulty" }),
        notice({ id: "new-info", severity: "info", title: "Assigned to you" }),
        ...list.items,
      ],
    };
    await act(() => client.invalidateQueries());
    await waitFor(() => expect(FakeNotification.shown).toHaveLength(1));
    expect(FakeNotification.shown[0].title).toBe("Urgent: ICU ventilator (VENT-7) reported faulty");

    // The same notice is not popped again on the next poll.
    await act(() => client.invalidateQueries());
    expect(FakeNotification.shown).toHaveLength(1);
  });

  it("explains when the browser has blocked desktop alerts", async () => {
    const user = userEvent.setup();
    FakeNotification.permission = "denied";
    list = { unread: 0, items: [] };
    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(screen.getByText(/blocked in this browser/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
    FakeNotification.permission = "granted";
  });
});
