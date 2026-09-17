import { useEffect, useState } from "react";
import type { EmailDetail, User } from "../types";
import {
  ArchiveIcon,
  AttachmentIcon,
  BackArrowIcon,
  ChevronDownIcon,
  StarIcon,
  TrashIcon,
} from "../components/Icons";
import { getEmailById } from "../services/api";

interface EmailDetailPageProps {
  emailId: string;
  onBack: () => void;
  currentUser: User | null;
}

export default function EmailDetailPage({
  emailId,
  onBack,
  currentUser,
}: EmailDetailPageProps) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    async function loadEmail() {
      try {
        setLoading(true);
        setError(null);
        const data = await getEmailById(emailId);
        setEmail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load email details.");
      } finally {
        setLoading(false);
      }
    }
    loadEmail();
  }, [emailId]);

  const senderInitial = email?.sender.name ? email.sender.name.charAt(0).toUpperCase() : "S";

  const formattedTime = email
    ? new Date(email.sentAt || email.scheduledAt).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen">
      {/* Top Header Bar */}
      <div className="py-4 px-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            title="Back"
          >
            <BackArrowIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900 truncate">
            {email?.subject || (loading ? "Loading email..." : "Email Detail")}
          </h2>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setStarred(!starred)}
            className="p-2 text-gray-400 hover:text-amber-400 transition-colors cursor-pointer"
            title="Star"
          >
            <StarIcon className="w-5 h-5" filled={starred} />
          </button>
          <button
            className="p-2 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            title="Archive"
          >
            <ArchiveIcon className="w-5 h-5" />
          </button>
          <button
            className="p-2 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
            title="Delete"
          >
            <TrashIcon className="w-5 h-5" />
          </button>

          <div className="h-5 border-r border-gray-200 mx-1" />

          {currentUser?.avatar ? (
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
              {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
            </div>
          )}
        </div>
      </div>

      {/* Main Detail Content */}
      <div className="p-8 max-w-4xl space-y-6">
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-200" />
              <div className="space-y-2">
                <div className="w-48 h-4 bg-gray-200 rounded" />
                <div className="w-32 h-3 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-40 bg-gray-100 rounded-xl" />
          </div>
        )}

        {error && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm space-y-3">
            <p>{error}</p>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-white border border-red-200 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-100 cursor-pointer"
            >
              Back to List
            </button>
          </div>
        )}

        {!loading && !error && email && (
          <>
            {/* Sender Info Row */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold text-base flex items-center justify-center shrink-0">
                  {senderInitial}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-base">{email.sender.name}</span>
                    <span className="text-xs text-gray-500 font-mono">&lt;{email.sender.email}&gt;</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                    <span>to {email.recipient}</span>
                    <ChevronDownIcon className="w-3 h-3 text-gray-400" />
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs text-gray-400">{formattedTime}</span>
                <div className="mt-1">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      email.status === "SENT"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {email.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Email Body */}
            <div className="pt-4 space-y-4 text-sm text-gray-800 leading-relaxed font-sans border-t border-gray-100">
              <div className="whitespace-pre-wrap">{email.body}</div>

              {/* Highlighted Callout Box (Figma Match) */}
              <div className="bg-amber-50/90 border-l-4 border-amber-400 p-4 rounded-r-xl text-sm text-gray-800 space-y-1">
                <p className="font-semibold text-amber-900 flex items-center gap-2">
                  <span>💡 Note / Highlight</span>
                </p>
                <p className="text-amber-800 text-xs leading-normal">
                  This email was dispatched via MailFlow&apos;s automated rate-limited sending engine.
                </p>
              </div>
            </div>

            {/* Attachments Section if needed */}
            <div className="pt-6 border-t border-gray-100 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                System Metadata
              </p>
              <div className="flex flex-wrap gap-4">
                <div className="border border-gray-200 bg-gray-50 rounded-xl p-3 flex items-center gap-3 text-xs text-gray-700 min-w-[240px]">
                  <div className="p-2 bg-white rounded-lg border border-gray-200 text-emerald-600">
                    <AttachmentIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Email ID</p>
                    <p className="text-[11px] font-mono text-gray-500 truncate max-w-[160px]">
                      {email.id}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
