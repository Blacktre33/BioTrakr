import { api } from "./client";

export type NoticeSeverity = "critical" | "warning" | "info";

export interface Notice {
  id: string;
  kind: string;
  severity: NoticeSeverity;
  title: string;
  body: string | null;
  link: string | null;
  assetId: string | null;
  workOrderId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NoticeList {
  unread: number;
  items: Notice[];
}

export async function getNotifications(take = 20): Promise<NoticeList> {
  const { data } = await api.get<NoticeList>("/notifications", { params: { take } });
  return data;
}

export async function markNotificationsRead(body: { ids?: string[]; all?: boolean }): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>("/notifications/read", body);
  return data;
}
