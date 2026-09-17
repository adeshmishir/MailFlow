import { useEffect, useState, useCallback } from "react";
import type { EmailItem } from "../types";
import { ClockIcon, StarIcon } from "../components/Icons";
import TopSearchBar from "../components/TopSearchBar";
import { getScheduledEmails, searchEmails } from "../services/api";

interface ScheduledPageProps {
  onSelectEmail: (emailId: string) => void;
}

export default function ScheduledPage({ onSelectEmail }: ScheduledPageProps) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({});

  const loadScheduledEmails = useCallback(async (query = "") => {
    try {
      setLoading(true);
      setError(null);

      if (query.trim()) {
        const searchRes = await searchEmails(query, "SCHEDULED");
        setEmails(searchRes.emails);
      } else {
        const res = await getScheduledEmails();
        setEmails(res.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scheduled emails.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScheduledEmails(searchQuery);
  }, [searchQuery, loadScheduledEmails]);

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setStarredMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatScheduledTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const isTomorrow =
      new Date(now.setDate(now.getDate() + 1)).toDateString() === d.toDateString();

    const timeString = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (isToday) return `Today, ${timeString}`;
    if (isTomorrow) return `Tomorrow, ${timeString}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${timeString}`;
  };

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen">
      <TopSearchBar
        onSearch={setSearchQuery}
        onRefresh={() => loadScheduledEmails(searchQuery)}
        placeholder="Search scheduled emails..."
        loading={loading}
      />

      <div className="flex-1">
        {loading && (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="py-4 px-6 flex items-center gap-4 animate-pulse">
                <div className="w-36 h-4 bg-gray-200 rounded" />
                <div className="w-32 h-6 bg-amber-100/60 rounded-full" />
                <div className="w-48 h-4 bg-gray-200 rounded" />
                <div className="flex-1 h-4 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => loadScheduledEmails(searchQuery)}
              className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && emails.length === 0 && (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
              <ClockIcon className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No scheduled emails</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Emails scheduled for delivery will appear here before they are sent out.
            </p>
          </div>
        )}

        {!loading && !error && emails.length > 0 && (
          <div className="divide-y divide-gray-100 border-b border-gray-100">
            {emails.map((email) => (
              <div
                key={email.id}
                onClick={() => onSelectEmail(email.id)}
                className="py-3.5 px-6 flex items-center gap-4 hover:bg-gray-50/80 transition-colors cursor-pointer group"
              >
                {/* Recipient */}
                <span className="text-sm font-medium text-gray-900 w-44 shrink-0 truncate">
                  To: {email.recipient}
                </span>

                {/* Scheduled Time Badge */}
                <div className="bg-amber-50 text-amber-800 border border-amber-200/90 rounded-full text-xs px-3 py-1 font-medium inline-flex items-center gap-1.5 shrink-0">
                  <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
                  <span>{formatScheduledTime(email.scheduledAt)}</span>
                </div>

                {/* Subject */}
                <span className="text-sm font-semibold text-gray-900 shrink-0 max-w-xs truncate">
                  {email.subject || "(No Subject)"}
                </span>

                {/* Body Preview */}
                <span className="text-sm text-gray-500 font-normal flex-1 truncate">
                  — {email.body || "No email body preview"}
                </span>

                {/* Star Icon */}
                <button
                  type="button"
                  onClick={(e) => toggleStar(e, email.id)}
                  className="p-1 text-gray-300 hover:text-amber-400 transition-colors shrink-0 cursor-pointer"
                >
                  <StarIcon
                    className={`w-4 h-4 ${starredMap[email.id] ? "text-amber-400" : ""}`}
                    filled={starredMap[email.id]}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
