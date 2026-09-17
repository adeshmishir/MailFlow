export interface User {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatar?: string | null;
}

export interface SenderItem {
  id: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface EmailItem {
  id: string;
  recipient: string;
  scheduledAt: string;
  sentAt: string | null;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";
  error: string | null;
  subject?: string;
  body?: string;
  senderEmail?: string;
  senderName?: string;
}

export interface EmailDetail {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: "SCHEDULED" | "PROCESSING" | "SENT" | "FAILED";
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  error: string | null;
  sender: {
    id: string;
    name: string;
    email: string;
  };
}

export interface EmailListPage {
  items: EmailItem[];
  nextCursor: string | null;
}

export interface SearchResult {
  emails: EmailItem[];
  total: number;
  page: number;
  pageSize: number;
  unavailable?: boolean;
}

export interface ScheduleEmailsPayload {
  senderId: string;
  subject: string;
  body: string;
  recipients: string[];
  scheduledAt: string;
}

export interface SlackStatus {
  connected: boolean;
  configured: boolean;
  teamName: string | null;
  teamId: string | null;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
}

export type ActiveTab = "scheduled" | "sent" | "compose" | "detail" | "integrations" | "login";