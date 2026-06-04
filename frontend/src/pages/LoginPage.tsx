import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Brand lockup */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <img
              src="/bot-logo.png"
              alt="LeadGenie"
              className="w-24 h-24 rounded-full object-cover ring-2 ring-brand/40 shadow-[0_0_32px_rgba(106,50,122,0.40)]"
            />
            {/* Subtle glow ring */}
            <div className="absolute inset-0 rounded-full animate-pulse opacity-30 ring-4 ring-brand/30 pointer-events-none" />
          </div>
          <div className="text-[34px] font-bold leading-none tracking-tight text-ink select-none">
            Lead<span className="text-brand">Genie</span>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-mute mt-1.5">
            AI-Powered SDR Platform
          </div>
        </div>

        {/* Login card */}
        <div className="bg-surface border border-line-soft rounded-2xl p-8 shadow-[0_8px_32px_rgba(106,50,122,0.08)]">
          <h1 className="text-[15px] font-semibold text-ink mb-1">Welcome back</h1>
          <p className="text-[12px] text-ink-2 mb-6">Sign in to your workspace to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Username */}
            <div>
              <label
                htmlFor="lg-username"
                className="block text-[11px] font-mono uppercase tracking-[0.1em] text-ink-2 mb-1.5"
              >
                Username
              </label>
              <input
                id="lg-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="username"
                autoFocus
                className="w-full px-3 py-2.5 bg-surface-2 border border-line-soft rounded-lg text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/60 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="lg-password"
                className="block text-[11px] font-mono uppercase tracking-[0.1em] text-ink-2 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="lg-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-line-soft rounded-lg text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/60 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-mute hover:text-ink-2 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-danger-tint border border-danger/30 rounded-lg text-[12px] text-danger">
                <span className="mt-px shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !username.trim() || !password}
              className="w-full py-2.5 bg-brand hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[13px] rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-5 pt-4 border-t border-line-soft">
            <p className="text-center text-[11px] text-ink-mute font-mono leading-relaxed">
              Demo credentials<br />
              <span className="text-ink-2">admin</span>
              <span className="text-ink-mute mx-1">/</span>
              <span className="text-ink-2">leadgenie123</span>
            </p>
          </div>
        </div>

        <p className="text-center text-[10px] text-ink-mute font-mono mt-5">
          LeadGenie AI · v0.1 · Governed SDR Platform
        </p>
      </div>
    </div>
  );
}
