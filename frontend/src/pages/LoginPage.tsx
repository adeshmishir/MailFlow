import { useState, type FormEvent } from "react";
import { GoogleLogo } from "../components/Icons";

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  if (onLoginSuccess) {
    // optional callback hook
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setInfoMessage("Please fill in both Email ID and Password.");
      return;
    }
    // Backend uses Google OAuth as primary authentication mechanism.
    setInfoMessage(
      "Email/Password authentication is not configured in backend. Please use 'Login with Google'.",
    );
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Login</h1>
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl py-3 px-4 flex items-center justify-center gap-3 font-medium text-sm transition-colors cursor-pointer"
        >
          <GoogleLogo className="w-5 h-5" />
          <span>Login with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-3 text-xs text-gray-400 whitespace-nowrap">
            or sign up through email
          </span>
          <div className="border-t border-gray-200 w-full" />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Email ID"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-gray-900 placeholder-gray-400"
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-gray-900 placeholder-gray-400"
            />
          </div>

          {infoMessage && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
              {infoMessage}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors cursor-pointer"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
