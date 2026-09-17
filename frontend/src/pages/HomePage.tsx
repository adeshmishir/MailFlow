import StatusBadge from "../components/StatusBadge";
import SlackConnectionCard from "../components/SlackConnectionCard";
import EmailSearchCard from "../components/EmailSearchCard";
import { useApiHealth } from "../hooks/useApiHealth";

const statusConfig: Record<string, { label: string; tone: "green" | "red" | "neutral" }> = {
  checking: { label: "Checking...", tone: "neutral" },
  ok: { label: "API Connected", tone: "green" },
  unreachable: { label: "API Unreachable", tone: "red" },
};

export default function HomePage() {
  const { status, health, error } = useApiHealth();

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">MailFlow</h1>
            <p className="text-sm text-gray-500 mt-1">
              Production-grade email scheduling, search index & notifications.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge {...statusConfig[status]} />
            {health && (
              <span className="text-xs text-gray-400 font-mono">({health.service})</span>
            )}
          </div>
        </header>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <section className="space-y-6">
          <SlackConnectionCard />
          <EmailSearchCard />
        </section>

        <footer className="text-center text-xs text-gray-400 pt-8 border-t border-gray-200">
          MailFlow &copy; {new Date().getFullYear()} — Built with Express, Prisma, BullMQ, Redis, Elasticsearch & React.
        </footer>
      </div>
    </div>
  );
}