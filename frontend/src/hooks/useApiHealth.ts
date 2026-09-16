import { useEffect, useState } from "react";
import { fetchHealth } from "../services/api";
import type { HealthResponse } from "../types";

type Status = "checking" | "ok" | "unreachable";

export function useApiHealth() {
  const [status, setStatus] = useState<Status>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((data) => {
        if (!cancelled) {
          setHealth(data);
          setStatus("ok");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setStatus("unreachable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { status, health, error };
}