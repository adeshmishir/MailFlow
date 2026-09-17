import { useEffect, useState, useCallback } from "react";
import type { EmailItem } from "../types";
import { PaperPlaneIcon, StarIcon } from "../components/Icons";
import TopSearchBar from "../components/TopSearchBar";
import { getSentEmails, searchEmails } from "../services/api";

interface SentPageProps {
  onSelectEmail: (emailId: string) => void;
}

export default function SentPage({ onSelectEmail }: SentPageProps) {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({});

  const loadSentEmails = useCallback(async (query = "") => {
    try {
      setLoading(true);
      setError(null);

      if (query.trim()) {
        const searchRes = await searchEmails(query, "SENT");
        setEmails(searchRes.emails);
      } else {
        const res = await getSentEmails();
        setEmails(res.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sent emails.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSentEmails(searchQuery);
  }, [searchQuery, loadSentEmails]);

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setStarredMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatSentTime = (dateStr: string | null) => {
    if (!dateStr) return "Sent";
    const d = new Date(dateStr);
    return `Sent ${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const isTestDelivery = (email: EmailItem) => email.deliveryProvider === "ethereal";

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen">
      <TopSearchBar
        onSearch={setSearchQuery}
        onRefresh={() => loadSentEmails(searchQuery)}
        placeholder="Search sent emails..."
        loading={loading}
      />

      <div className="flex-1">
        {loading && (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="py-4 px-6 flex items-center gap-4 animate-pulse">
                <div className="w-36 h-4 bg-gray-200 rounded" />
                <div className="w-24 h-6 bg-gray-100 rounded-full" />
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
              onClick={() => loadSentEmails(searchQuery)}
              className="px-4 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && emails.length === 0 && (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 mx-auto flex items-center justify-center">
              <PaperPlaneIcon className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">No sent emails</h3>
            <p className="text-sm text-gray-400 max-w-sm mx-auto">
              Emails that have been successfully processed and sent will appear here.
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

                {/* Delivery badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <div
                    className={`rounded-full text-xs px-3 py-0.5 font-medium inline-flex items-center gap-1.5 border ${
                      isTestDelivery(email)
                        ? "bg-amber-50 text-amber-800 border-amber-200"
                        : "bg-gray-100 text-gray-700 border-gray-200/80"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isTestDelivery(email) ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                    <span>
                      {isTestDelivery(email)
                        ? "Test inbox (Ethereal)"
                        : formatSentTime(email.sentAt)}
                    </span>
                  </div>

                  {isTestDelivery(email) && email.deliveryPreviewUrl && (
                    <a
                      href={email.deliveryPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-3 py-0.5"
                    >
                      Open preview ↗
                    </a>
                  )}
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
