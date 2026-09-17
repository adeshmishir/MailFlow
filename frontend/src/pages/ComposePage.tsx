import { useEffect, useState, useRef, type ChangeEvent } from "react";
import type { SenderItem } from "../types";
import {
  AttachmentIcon,
  BackArrowIcon,
  BoldIcon,
  ClockIcon,
  ItalicIcon,
  ListBulletIcon,
  ListOrderedIcon,
  PlusIcon,
  QuoteIcon,
  RedoIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
  UploadIcon,
  XIcon,
} from "../components/Icons";
import SendLaterModal from "../components/SendLaterModal";
import { createSender, getSenders, scheduleEmailsApi } from "../services/api";

interface ComposePageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function ComposePage({ onBack, onSuccess }: ComposePageProps) {
  const [senders, setSenders] = useState<SenderItem[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState<string>("");
  const [loadingSenders, setLoadingSenders] = useState(true);

  // New Sender creation inline
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [newSenderName, setNewSenderName] = useState("");
  const [newSenderEmail, setNewSenderEmail] = useState("");
  const [createSenderLoading, setCreateSenderLoading] = useState(false);

  // Recipients
  const [recipients, setRecipients] = useState<string[]>([]);
  const [recipientInput, setRecipientInput] = useState("");
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Email Content
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Configuration
  const [delayBetweenEmails, setDelayBetweenEmails] = useState(0);
  const [hourlyLimit, setHourlyLimit] = useState(100);

  // Schedule Time (default: 5 minutes in future)
  const [scheduledAt, setScheduledAt] = useState<string>(
    new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  );
  const [showSendLaterModal, setShowSendLaterModal] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSendersList = async () => {
    try {
      setLoadingSenders(true);
      const list = await getSenders();
      setSenders(list);
      if (list.length > 0 && !selectedSenderId) {
        setSelectedSenderId(list[0].id);
      }
    } catch {
      // Handled silently
    } finally {
      setLoadingSenders(false);
    }
  };

  useEffect(() => {
    loadSendersList();
  }, []);

  const handleCreateSender = async () => {
    if (!newSenderName.trim() || !newSenderEmail.trim()) {
      setError("Please fill in both Sender Name and Email.");
      return;
    }
    try {
      setCreateSenderLoading(true);
      setError(null);
      const created = await createSender(newSenderName.trim(), newSenderEmail.trim());
      setSenders((prev) => [created, ...prev]);
      setSelectedSenderId(created.id);
      setShowAddSenderModal(false);
      setNewSenderName("");
      setNewSenderEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sender");
    } finally {
      setCreateSenderLoading(false);
    }
  };

  const addRecipient = (emailToValidate: string) => {
    const trimmed = emailToValidate.trim().toLowerCase();
    if (!trimmed) return;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!isValid) {
      setError(`Invalid email address format: "${trimmed}"`);
      return;
    }
    if (recipients.includes(trimmed)) {
      setRecipientInput("");
      return;
    }
    setRecipients((prev) => [...prev, trimmed]);
    setRecipientInput("");
    setError(null);
  };

  const removeRecipient = (emailToRemove: string) => {
    setRecipients((prev) => prev.filter((r) => r !== emailToRemove));
  };

  // CSV/Text File Upload Handler
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      // Extract emails using regex
      const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      const uniqueNew = Array.from(new Set(matches.map((m) => m.toLowerCase())));

      const added = uniqueNew.filter((m) => !recipients.includes(m));
      if (added.length === 0) {
        setUploadFeedback("No new valid email addresses found in file.");
      } else {
        setRecipients((prev) => [...prev, ...added]);
        setUploadFeedback(`Successfully imported ${added.length} recipient email(s).`);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  // Formatting helper for body
  const applyFormatting = (prefix: string, suffix = prefix) => {
    setBody((prev) => `${prev}${prefix}formatted text${suffix}`);
  };

  const handleSubmit = async () => {
    if (!selectedSenderId) {
      setError("Please select or add a Sender Email.");
      return;
    }
    if (recipients.length === 0) {
      setError("Please add at least one recipient.");
      return;
    }
    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }
    if (!body.trim()) {
      setError("Email body content is required.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      await scheduleEmailsApi({
        senderId: selectedSenderId,
        recipients,
        subject: subject.trim(),
        body: body.trim(),
        scheduledAt,
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule email execution.");
    } finally {
      setSubmitting(false);
    }
  };

  const scheduledDateLabel = new Date(scheduledAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex-1 flex flex-col bg-white min-h-screen">
      {/* Top Header */}
      <div className="py-4 px-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
            title="Back"
          >
            <BackArrowIcon className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-900">Compose New Email</h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
            title="Attachments"
          >
            <AttachmentIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setShowSendLaterModal(true)}
            className="p-2 text-gray-400 hover:text-emerald-700 transition-colors cursor-pointer"
            title="Pick Send Time"
          >
            <ClockIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-full font-bold px-6 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <ClockIcon className="w-4 h-4 text-emerald-600" />
            <span>{submitting ? "Scheduling..." : `Send Later (${scheduledDateLabel})`}</span>
          </button>
        </div>
      </div>

      {/* Main Form Content */}
      <div className="p-8 max-w-4xl space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
            {error}
          </div>
        )}

        {uploadFeedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex justify-between items-center">
            <span>{uploadFeedback}</span>
            <button
              onClick={() => setUploadFeedback(null)}
              className="text-emerald-600 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* FROM Field */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="w-20 text-sm font-bold text-gray-700 shrink-0">From</label>
          <div className="flex-1 flex items-center gap-2">
            {loadingSenders ? (
              <span className="text-xs text-gray-400">Loading senders...</span>
            ) : senders.length > 0 ? (
              <select
                value={selectedSenderId}
                onChange={(e) => setSelectedSenderId(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-gray-900"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} &lt;{s.email}&gt;
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-amber-600 font-medium">No sender identity found</span>
            )}

            <button
              type="button"
              onClick={() => setShowAddSenderModal(true)}
              className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Add Sender</span>
            </button>
          </div>
        </div>

        {/* TO Field with Chips and CSV Upload */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <label className="w-20 text-sm font-bold text-gray-700 shrink-0 pt-2">To</label>
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50/70 border border-gray-200 rounded-xl min-h-[44px]">
              {recipients.map((r) => (
                <span
                  key={r}
                  className="border border-emerald-500 text-emerald-800 bg-emerald-50/70 rounded-full text-xs px-3 py-1 flex items-center gap-1.5 font-medium"
                >
                  <span>{r}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(r)}
                    className="hover:text-red-600 cursor-pointer"
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}

              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addRecipient(recipientInput);
                  }
                }}
                onBlur={() => {
                  if (recipientInput.trim()) addRecipient(recipientInput);
                }}
                placeholder={recipients.length === 0 ? "recipient@example.com (Press Enter)" : "Add more..."}
                className="flex-1 min-w-[200px] bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none px-2 py-1"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{recipients.length} recipient(s) added</span>

              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.txt"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <UploadIcon className="w-3.5 h-3.5" />
                  <span>Upload List (.csv / .txt)</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* SUBJECT Field */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="w-20 text-sm font-bold text-gray-700 shrink-0">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 border-b border-gray-200 focus:border-emerald-600 text-base py-2 px-1 focus:outline-none font-medium text-gray-900 placeholder-gray-400"
          />
        </div>

        {/* CONFIGURATION Fields (Horizontal Desktop / Stacked Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">Delay between 2 emails (ms)</label>
            <input
              type="number"
              min={0}
              value={delayBetweenEmails}
              onChange={(e) => setDelayBetweenEmails(Number(e.target.value))}
              className="w-24 px-2 py-1 bg-white border border-gray-300 rounded-lg text-sm text-right font-mono"
            />
          </div>

          <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-3 flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700">Hourly Limit</label>
            <input
              type="number"
              min={1}
              value={hourlyLimit}
              onChange={(e) => setHourlyLimit(Number(e.target.value))}
              className="w-24 px-2 py-1 bg-white border border-gray-300 rounded-lg text-sm text-right font-mono"
            />
          </div>
        </div>

        {/* RICH TEXT EDITOR */}
        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-xs">
          {/* Toolbar */}
          <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-1 text-gray-600">
            <button
              type="button"
              onClick={() => applyFormatting("**")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Bold"
            >
              <BoldIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("*")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Italic"
            >
              <ItalicIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("<u>", "</u>")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Underline"
            >
              <UnderlineIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("~~")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Strikethrough"
            >
              <StrikethroughIcon className="w-4 h-4" />
            </button>

            <div className="h-4 border-r border-gray-300 mx-1" />

            <button
              type="button"
              onClick={() => applyFormatting("\n1. ")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Ordered List"
            >
              <ListOrderedIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => applyFormatting("\n- ")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Unordered List"
            >
              <ListBulletIcon className="w-4 h-4" />
            </button>

            <div className="h-4 border-r border-gray-300 mx-1" />

            <button
              type="button"
              onClick={() => applyFormatting("\n> ")}
              className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              title="Quote"
            >
              <QuoteIcon className="w-4 h-4" />
            </button>

            <div className="h-4 border-r border-gray-300 mx-1" />

            <button
              type="button"
              className="p-1.5 text-gray-400 cursor-not-allowed"
              title="Undo"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1.5 text-gray-400 cursor-not-allowed"
              title="Redo"
            >
              <RedoIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Writing Area */}
          <textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            className="w-full p-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none resize-y min-h-[220px]"
          />
        </div>
      </div>

      {/* Send Later Modal */}
      <SendLaterModal
        isOpen={showSendLaterModal}
        onClose={() => setShowSendLaterModal(false)}
        initialScheduledAt={scheduledAt}
        onSelectTime={(newIso) => setScheduledAt(newIso)}
      />

      {/* Add Sender Inline Modal */}
      {showAddSenderModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-base font-bold text-gray-900">Add Sending Identity</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Sender Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={newSenderName}
                  onChange={(e) => setNewSenderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Sender Email
                </label>
                <input
                  type="email"
                  placeholder="e.g. john@company.com"
                  value={newSenderEmail}
                  onChange={(e) => setNewSenderEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddSenderModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSender}
                disabled={createSenderLoading}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs"
              >
                {createSenderLoading ? "Creating..." : "Save Sender"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
