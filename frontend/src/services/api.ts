import type {
  EmailDetail,
  EmailListPage,
  HealthResponse,
  ScheduleEmailsPayload,
  SearchResult,
  SenderItem,
  SlackStatus,
  User,
} from "../types";

const API_BASE = "/api";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  return handleResponse<HealthResponse>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
      else if (data.message) errorMsg = data.message;
    } catch {
      // json parse failed
    }
    const err = new Error(errorMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (res.status === 401 || res.status === 403) return null;
    const data = await handleResponse<{ user: User }>(res);
    return data.user;
  } catch {
    return null;
  }
}

export async function logoutUser(): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  await handleResponse<{ ok: boolean }>(res);
}

export async function getAuthStatus(): Promise<{ googleConfigured: boolean }> {
  const res = await fetch(`${API_BASE}/auth/status`);
  return handleResponse<{ googleConfigured: boolean }>(res);
}

export async function getSenders(): Promise<SenderItem[]> {
  const res = await fetch(`${API_BASE}/senders`, { credentials: "include" });
  const data = await handleResponse<{ senders: SenderItem[] }>(res);
  return data.senders;
}

export async function createSender(name: string, email: string): Promise<SenderItem> {
  const res = await fetch(`${API_BASE}/senders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
    credentials: "include",
  });
  const data = await handleResponse<{ sender: SenderItem }>(res);
  return data.sender;
}

export async function getScheduledEmails(cursor?: string, limit?: number): Promise<EmailListPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));

  const res = await fetch(`${API_BASE}/emails/scheduled?${params.toString()}`, {
    credentials: "include",
  });
  return handleResponse<EmailListPage>(res);
}

export async function getSentEmails(cursor?: string, limit?: number): Promise<EmailListPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));

  const res = await fetch(`${API_BASE}/emails/sent?${params.toString()}`, {
    credentials: "include",
  });
  return handleResponse<EmailListPage>(res);
}

export async function getEmailById(id: string): Promise<EmailDetail> {
  const res = await fetch(`${API_BASE}/emails/${id}`, { credentials: "include" });
  const data = await handleResponse<{ email: EmailDetail }>(res);
  return data.email;
}

export async function searchEmails(
  q?: string,
  status?: string,
  page = 1,
  pageSize = 20,
): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (status) params.set("status", status);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const res = await fetch(`${API_BASE}/emails/search?${params.toString()}`, {
    credentials: "include",
  });
  return handleResponse<SearchResult>(res);
}

export async function scheduleEmailsApi(
  payload: ScheduleEmailsPayload,
): Promise<{ campaignId: string; scheduledCount: number; queueName: string }> {
  const res = await fetch(`${API_BASE}/emails/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  return handleResponse<{ campaignId: string; scheduledCount: number; queueName: string }>(res);
}

export async function getSlackStatus(): Promise<SlackStatus> {
  const res = await fetch(`${API_BASE}/slack/status`, { credentials: "include" });
  return handleResponse<SlackStatus>(res);
}

export async function disconnectSlack(): Promise<void> {
  const res = await fetch(`${API_BASE}/slack/disconnect`, {
    method: "POST",
    credentials: "include",
  });
  await handleResponse<{ success: boolean }>(res);
}