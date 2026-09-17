import { useEffect, useState } from "react";
import StatusBadge from "./StatusBadge";

export interface IndexedEmail {
  id: string;
  recipient: string;
  subject: string;
  senderEmail: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  error: string | null;
}

interface SearchResponse {
  emails: IndexedEmail[];
  total: number;
  page: number;
  pageSize: number;
  unavailable?: boolean;
}

export default function EmailSearchCard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSearchResults = async (query: string, status: string, currentPage: number) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      params.set("page", String(currentPage));
      params.set("pageSize", "10");

      const res = await fetch(`/api/emails/search?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const responseData = await res.json();
        setData(responseData);
      } else {
        setError("Failed to execute search query");
      }
    } catch {
      setError("Error connecting to search service");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSearchResults(searchTerm, statusFilter, page);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter, page]);

  const statusToneMap: Record<string, "green" | "red" | "neutral"> = {
    SENT: "green",
    FAILED: "red",
    PROCESSING: "neutral",
    SCHEDULED: "neutral",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4 text-left">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Email Search (Elasticsearch)</h2>
        <p className="text-sm text-gray-500">
          Search indexed emails by recipient, subject, body, sender, or status.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search recipient, subject, body, or sender..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {data?.unavailable && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
          ⚠️ Elasticsearch is currently unavailable. Full text search is limited.
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs text-left text-gray-600">
          <thead className="bg-gray-50 text-gray-700 uppercase font-semibold border-b border-gray-200">
            <tr>
              <th className="px-4 py-3">Recipient</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Sender</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scheduled At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Searching index...
                </td>
              </tr>
            ) : data?.emails && data.emails.length > 0 ? (
              data.emails.map((email) => (
                <tr key={email.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{email.recipient}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{email.subject}</td>
                  <td className="px-4 py-3">{email.senderEmail}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={email.status}
                      tone={statusToneMap[email.status] || "neutral"}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(email.scheduledAt).toLocaleString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No matching emails found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
          <span>
            Showing {data.emails.length} of {data.total} results
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Previous
            </button>
            <span className="py-1 px-2 font-medium">{page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * data.pageSize >= data.total}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
