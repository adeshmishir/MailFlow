import type { HealthResponse } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}