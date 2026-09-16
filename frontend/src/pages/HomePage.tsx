import StatusBadge from "../components/StatusBadge";
import { useApiHealth } from "../hooks/useApiHealth";

const statusConfig: Record<string, { label: string; tone: "green" | "red" | "neutral" }> = {
  checking: { label: "Checking...", tone: "neutral" },
  ok: { label: "API Connected", tone: "green" },
  unreachable: { label: "API Unreachable", tone: "red" },
};

export default function HomePage() {
  const { status, health, error } = useApiHealth();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">MailFlow</h1>
        <p className="text-gray-500">
          Production-grade email scheduling and delivery system.
        </p>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">System Status</h2>

          <div className="flex justify-center">
            <StatusBadge {...statusConfig[status]} />
          </div>

          {health && (
            <p className="text-sm text-gray-500">
              Service: <span className="font-mono text-gray-700">{health.service}</span>
            </p>
          )}

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <p className="text-sm text-gray-400">
          Frontend foundation ready. Dashboard UI coming in later phases.
        </p>
      </div>
    </div>
  );
}