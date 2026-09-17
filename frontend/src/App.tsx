import { useEffect, useState, useCallback } from "react";
import type { ActiveTab, User } from "./types";
import Sidebar from "./components/Sidebar";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ScheduledPage from "./pages/ScheduledPage";
import SentPage from "./pages/SentPage";
import EmailDetailPage from "./pages/EmailDetailPage";
import ComposePage from "./pages/ComposePage";
import { getCurrentUser, getScheduledEmails, getSentEmails } from "./services/api";

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("scheduled");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const [scheduledCount, setScheduledCount] = useState(0);
  const [sentCount, setSentCount] = useState(0);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadCounts = useCallback(async () => {
    try {
      const [schedRes, sentRes] = await Promise.all([
        getScheduledEmails(undefined, 100),
        getSentEmails(undefined, 100),
      ]);
      setScheduledCount(schedRes.items.length);
      setSentCount(sentRes.items.length);
    } catch {
      // Ignore background count errors
    }
  }, []);

  const checkUserSession = useCallback(async () => {
    try {
      setLoadingUser(true);
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (user) {
        loadCounts();
      }
    } finally {
      setLoadingUser(false);
    }
  }, [loadCounts]);

  useEffect(() => {
    checkUserSession();
  }, [checkUserSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("slack") === "connected") {
      showToast("Slack connected. Rate limit alerts are now enabled.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    const slackError = params.get("slack_error");
    if (slackError) {
      showToast(`Slack connection failed: ${decodeURIComponent(slackError)}`);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectEmail = (id: string) => {
    setSelectedEmailId(id);
    setActiveTab("detail");
  };

  const handleComposeSuccess = () => {
    showToast("Email campaign scheduled successfully!");
    loadCounts();
    setActiveTab("scheduled");
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 font-medium">Connecting to MailFlow...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={checkUserSession} />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row text-gray-900 font-sans">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-800 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-4 duration-200 flex items-center gap-2">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Mobile Sidebar Toggle Button */}
      <div className="md:hidden bg-white border-b border-gray-200 p-3 flex items-center justify-between sticky top-0 z-30">
        <span className="font-bold text-lg text-gray-900">MailFlow</span>
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="p-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700"
        >
          {mobileSidebarOpen ? "Close Menu" : "Menu"}
        </button>
      </div>

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <div
        className={`${
          mobileSidebarOpen ? "block" : "hidden"
        } md:block fixed md:static inset-0 z-40 bg-white md:bg-transparent`}
      >
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setMobileSidebarOpen(false);
          }}
          user={currentUser}
          scheduledCount={scheduledCount}
          sentCount={sentCount}
          onLogoutSuccess={() => setCurrentUser(null)}
        />
      </div>

      {/* Main View Container */}
      <main className="flex-1 flex flex-col min-w-0 bg-white min-h-screen">
        {activeTab === "scheduled" && (
          <ScheduledPage onSelectEmail={handleSelectEmail} />
        )}

        {activeTab === "sent" && <SentPage onSelectEmail={handleSelectEmail} />}

        {activeTab === "compose" && (
          <ComposePage
            onBack={() => setActiveTab("scheduled")}
            onSuccess={handleComposeSuccess}
          />
        )}

        {activeTab === "detail" && selectedEmailId && (
          <EmailDetailPage
            emailId={selectedEmailId}
            onBack={() => setActiveTab("scheduled")}
            currentUser={currentUser}
          />
        )}

        {activeTab === "integrations" && <HomePage />}
      </main>
    </div>
  );
}