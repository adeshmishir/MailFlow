import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";

interface SlackStatus {
  connected: boolean;
  configured: boolean;
  teamName: string | null;
  teamId: string | null;
}

export default function SlackConnectionCard() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/slack/status", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else if (res.status === 401) {
        setStatus({ connected: false, configured: true, teamName: null, teamId: null });
      } else {
        setError("Unable to load Slack status");
      }
    } catch {
      setError("Failed to connect to API server");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/slack/connect";
  };

  const handleDisconnect = async () => {
    try {
      setActionLoading(true);
      const res = await fetch("/api/slack/disconnect", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        await fetchStatus();
      } else {
        setError("Failed to disconnect Slack");
      }
    } catch {
      setError("Error disconnecting Slack");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4 text-left">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Slack Notifications</h2>
          <p className="text-sm text-gray-500">
            Receive real-time alerts when email hourly rate limits are reached.
          </p>
        </div>
        {loading ? (
          <StatusBadge label="Loading..." tone="neutral" />
        ) : status?.connected ? (
          <StatusBadge label="Connected" tone="green" />
        ) : (
          <StatusBadge label="Disconnected" tone="neutral" />
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {!loading && status && (
        <div className="flex items-center justify-between pt-2">
          <div className="min-w-0">
            {status.connected ? (
              <p className="text-sm font-medium text-gray-700">
                Workspace:{" "}
                <span className="text-emerald-700 font-semibold">{status.teamName}</span>
              </p>
            ) : status.configured ? (
              <p className="text-xs text-gray-400">
                No Slack workspace connected to your account.
              </p>
            ) : (
              <p className="text-xs text-amber-700">
                Slack is not configured. Add SLACK_CLIENT_ID and
                SLACK_CLIENT_SECRET to the backend environment to enable it.
              </p>
            )}
          </div>

          <div className="shrink-0 ml-3">
            {status.connected ? (
              <button
                onClick={handleDisconnect}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Disconnecting..." : "Disconnect Slack"}
              </button>
            ) : status.configured ? (
              <button
                onClick={handleConnect}
                className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
              >
                Connect Slack
              </button>
            ) : (
              <button
                disabled
                className="px-4 py-2 text-xs font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
              >
                Connect Slack
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
