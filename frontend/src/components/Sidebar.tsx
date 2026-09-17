import { useState } from "react";
import type { ActiveTab, User } from "../types";
import {
  ChevronDownIcon,
  ClockIcon,
  MailFlowLogo,
  PaperPlaneIcon,
  PlusIcon,
} from "./Icons";
import { logoutUser } from "../services/api";

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: User | null;
  scheduledCount?: number;
  sentCount?: number;
  onLogoutSuccess?: () => void;
}

export default function Sidebar({
  activeTab,
  onSelectTab,
  user,
  scheduledCount = 0,
  sentCount = 0,
  onLogoutSuccess,
}: SidebarProps) {
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logoutUser();
      if (onLogoutSuccess) onLogoutSuccess();
      else window.location.reload();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const displayName = user?.name || "Guest User";
  const displayEmail = user?.email || "user@mailflow.com";
  const avatarUrl = user?.avatar;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col justify-between h-screen sticky top-0 p-4 shrink-0 font-sans">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Logo Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <MailFlowLogo className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight text-gray-900">MailFlow</span>
        </div>

        {/* User Profile Container */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="w-full bg-gray-100 hover:bg-gray-150 rounded-xl p-3 flex items-center justify-between text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">
                  {displayEmail}
                </p>
              </div>
            </div>
            <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0 ml-1" />
          </button>

          {profileOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50">
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Compose Button */}
        <button
          onClick={() => onSelectTab("compose")}
          className="w-full border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-full font-semibold py-2.5 px-4 text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <PlusIcon className="w-4 h-4 stroke-[3]" />
          <span>Compose</span>
        </button>

        {/* Core Navigation */}
        <nav className="space-y-1">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
            CORE
          </p>

          <button
            onClick={() => onSelectTab("scheduled")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "scheduled"
                ? "bg-emerald-50 text-emerald-900 font-semibold"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <ClockIcon className={`w-4 h-4 ${activeTab === "scheduled" ? "text-emerald-700" : "text-gray-400"}`} />
              <span>Scheduled</span>
            </div>
            {scheduledCount > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  activeTab === "scheduled"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {scheduledCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab("sent")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === "sent"
                ? "bg-emerald-50 text-emerald-900 font-semibold"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <PaperPlaneIcon className={`w-4 h-4 ${activeTab === "sent" ? "text-emerald-700" : "text-gray-400"}`} />
              <span>Sent</span>
            </div>
            {sentCount > 0 && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  activeTab === "sent"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {sentCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Footer Branding */}
      <div className="pt-4 border-t border-gray-100 px-2 text-xs text-gray-400">
        <p>MailFlow SaaS &copy; 2026</p>
      </div>
    </aside>
  );
}
