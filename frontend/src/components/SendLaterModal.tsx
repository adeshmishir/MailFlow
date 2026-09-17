import { useState } from "react";
import { ClockIcon, XIcon } from "./Icons";

interface SendLaterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTime: (isoDateString: string) => void;
  initialScheduledAt?: string;
}

export default function SendLaterModal({
  isOpen,
  onClose,
  onSelectTime,
  initialScheduledAt,
}: SendLaterModalProps) {
  if (!isOpen) return null;

  const defaultDate = initialScheduledAt
    ? new Date(initialScheduledAt)
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // Tomorrow

  const [dateVal, setDateVal] = useState(
    defaultDate.toISOString().split("T")[0],
  );
  const [timeVal, setTimeVal] = useState("10:00");
  const [error, setError] = useState<string | null>(null);

  const getTomorrowPreset = (hour: number, minute: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const handleApplyPreset = (presetDate: Date) => {
    const dateStr = presetDate.toISOString().split("T")[0];
    const timeStr = `${String(presetDate.getHours()).padStart(2, "0")}:${String(
      presetDate.getMinutes(),
    ).padStart(2, "0")}`;
    setDateVal(dateStr);
    setTimeVal(timeStr);
    setError(null);
  };

  const handleDone = () => {
    try {
      const selected = new Date(`${dateVal}T${timeVal}`);
      if (isNaN(selected.getTime())) {
        setError("Invalid date or time selected.");
        return;
      }
      if (selected.getTime() - Date.now() < 1000) {
        setError("Scheduled time must be in the future.");
        return;
      }
      onSelectTime(selected.toISOString());
      onClose();
    } catch {
      setError("Please select a valid future date and time.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 max-w-sm w-full space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-emerald-600" />
              <span>Send Later</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Pick date & time</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Date and Time Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={dateVal}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                setDateVal(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={timeVal}
              onChange={(e) => {
                setTimeVal(e.target.value);
                setError(null);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 bg-white"
            />
          </div>
        </div>

        {/* Quick Options */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Quick Options
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => handleApplyPreset(getTomorrowPreset(10, 0))}
              className="text-left px-3 py-2 bg-gray-50 hover:bg-emerald-50 text-xs font-medium text-gray-700 hover:text-emerald-900 rounded-xl transition-colors cursor-pointer border border-gray-100"
            >
              Tomorrow, 10:00 AM
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(getTomorrowPreset(11, 0))}
              className="text-left px-3 py-2 bg-gray-50 hover:bg-emerald-50 text-xs font-medium text-gray-700 hover:text-emerald-900 rounded-xl transition-colors cursor-pointer border border-gray-100"
            >
              Tomorrow, 11:00 AM
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset(getTomorrowPreset(15, 0))}
              className="text-left px-3 py-2 bg-gray-50 hover:bg-emerald-50 text-xs font-medium text-gray-700 hover:text-emerald-900 rounded-xl transition-colors cursor-pointer border border-gray-100"
            >
              Tomorrow, 3:00 PM
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="px-5 py-2 border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
