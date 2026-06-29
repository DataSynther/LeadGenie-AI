import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, TrendingUp, Users, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ── Injected CSS ─────────────────────────────────────────────────────────── */
const ANIM = `
  @keyframes floatA  { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-12px)} }
  @keyframes floatB  { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-8px)}  }
  @keyframes floatC  { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-15px)} }
  @keyframes rockMag { 0%,100%{transform:rotate(-7deg)}     50%{transform:rotate(7deg)}      }
  @keyframes glowMag { 0%,100%{filter:drop-shadow(0 0 8px rgba(168,85,247,.55))} 50%{filter:drop-shadow(0 0 22px rgba(168,85,247,1))} }
  @keyframes screenG { 0%,100%{opacity:.7}                  50%{opacity:1}                   }
  @keyframes blink   { 0%,50%{opacity:1}                    51%,100%{opacity:0}              }
  @keyframes typeB   { 0%,100%{transform:translateY(0px)}   50%{transform:translateY(-3px)}  }
  @keyframes drawCh  { from{stroke-dashoffset:220} to{stroke-dashoffset:0} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes dashAni { to{stroke-dashoffset:-22} }
`;

/* ── Lead bubbles config ──────────────────────────────────────────────────── */
// laptop screen center ≈ (200, 208) in SVG space;
// each path is relative to the bubble's (cx,cy) translate
const LEADS = [
  { cx: 38,  cy: 58,  i: "AM", c: "#a855f7", d: "0s",   t: "3.2s", p: "M0,0 Q60,72 162,150" },
  { cx: 362, cy: 58,  i: "SK", c: "#06b6d4", d: "0.7s",  t: "3.5s", p: "M0,0 Q-60,72 -162,150" },
  { cx: 12,  cy: 195, i: "JR", c: "#10b981", d: "1.5s",  t: "3.1s", p: "M0,0 Q95,6 188,13"  },
  { cx: 388, cy: 195, i: "LT", c: "#f59e0b", d: "2.3s",  t: "3.4s", p: "M0,0 Q-95,6 -188,13" },
  { cx: 200, cy: 15,  i: "MP", c: "#ef4444", d: "0.3s",  t: "3.8s", p: "M0,0 Q0,95 0,193"   },
  { cx: 70,  cy: 328, i: "EW", c: "#8b5cf6", d: "3.1s",  t: "3.0s", p: "M0,0 Q64,-44 130,-120" },
  { cx: 330, cy: 328, i: "JD", c: "#ec4899", d: "1.1s",  t: "3.7s", p: "M0,0 Q-64,-44 -130,-120" },
  { cx: 350, cy: 102, i: "KL", c: "#14b8a6", d: "2.0s",  t: "3.3s", p: "M0,0 Q-75,44 -150,106" },
];

/* ── Attraction dash paths (background arcs) ─────────────────────────────── */
const ARC_PATHS = [
  "M38,58 Q100,128 200,208",  "M362,58 Q300,128 200,208",
  "M12,195 Q106,202 200,208", "M388,195 Q294,202 200,208",
  "M200,15 Q200,112 200,208", "M70,328 Q134,268 200,208",
  "M330,328 Q266,268 200,208","M350,102 Q276,154 200,208",
];

function LeadBubble({ cx, cy, i, c, d, t, p }: typeof LEADS[0]) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <animateMotion path={p} dur={t} begin={d} repeatCount="indefinite"
        calcMode="spline" keyTimes="0;0.55;1"
        keySplines="0.25 0.1 0.55 0.25; 0.7 0 1 1" />
      <animate attributeName="opacity"
        values="0;1;1;0.5;0" keyTimes="0;0.08;0.55;0.88;1"
        dur={t} begin={d} repeatCount="indefinite" />

      {/* Outer glow ring */}
      <circle r="26" fill="none" stroke={c} strokeWidth="0.6" opacity="0.35">
        <animate attributeName="r" values="26;32;26" dur="1.8s" begin={d} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.35;0.08;0.35" dur="1.8s" begin={d} repeatCount="indefinite" />
      </circle>
      {/* Main bubble */}
      <circle r="19" fill={c + "28"} stroke={c} strokeWidth="1.5">
        <animate attributeName="r" values="19;20;15;7;0"
          keyTimes="0;0.1;0.65;0.88;1" dur={t} begin={d} repeatCount="indefinite" />
      </circle>
      <text dy="3.5" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="700">{i}</text>
    </g>
  );
}

function AttractionArcs() {
  return (
    <g>
      {ARC_PATHS.map((d, idx) => (
        <path key={idx} d={d} fill="none" stroke="rgba(168,85,247,0.35)"
          strokeWidth="0.8" strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" values="0;-24"
            dur="1.8s" begin={`${idx * 0.22}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

function Magnet() {
  return (
    <g transform="translate(165,8)"
      style={{ animation: "rockMag 3s ease-in-out infinite, glowMag 2.2s ease-in-out infinite" }}>
      <defs>
        <linearGradient id="mgG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="50%"  stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Horseshoe arc */}
      <path d="M14,52 Q14,8 35,8 Q56,8 56,52"
        stroke="url(#mgG)" strokeWidth="16" fill="none" strokeLinecap="round" />
      {/* N pole */}
      <rect x="6" y="50" width="16" height="28" rx="4" fill="#dc2626" />
      <text x="14" y="69" textAnchor="middle" fill="white" fontSize="9" fontWeight="700">N</text>
      {/* S pole */}
      <rect x="48" y="50" width="16" height="28" rx="4" fill="#2563eb" />
      <text x="56" y="69" textAnchor="middle" fill="white" fontSize="9" fontWeight="700">S</text>
      {/* Field glow */}
      <ellipse cx="35" cy="26" rx="40" ry="18" fill="rgba(139,92,246,0.1)" />
    </g>
  );
}

function Laptop() {
  return (
    <g transform="translate(138,155)">
      {/* Screen bezel */}
      <rect x="0" y="0" width="124" height="88" rx="7"
        fill="#1e1b2e" stroke="rgba(139,92,246,0.7)" strokeWidth="1.5" />
      {/* Screen */}
      <rect x="5" y="5" width="114" height="78" rx="3" fill="#09071a"
        style={{ animation: "screenG 2.5s ease-in-out infinite" }} />

      {/* KPI chips */}
      <rect x="9"  y="10" width="33" height="14" rx="3" fill="rgba(139,92,246,0.25)" />
      <text x="25" y="20" textAnchor="middle" fill="#a78bfa" fontSize="7" fontWeight="700">247 Leads</text>
      <rect x="47" y="10" width="28" height="14" rx="3" fill="rgba(16,185,129,0.22)" />
      <text x="61" y="20" textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700">18.4%</text>
      <rect x="81" y="10" width="33" height="14" rx="3" fill="rgba(245,158,11,0.22)" />
      <text x="97" y="20" textAnchor="middle" fill="#fbbf24" fontSize="7" fontWeight="700">8 Mtgs</text>

      {/* Chart */}
      <polyline points="10,65 22,52 36,56 50,40 63,45 77,29 91,34 105,26 113,30"
        fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round"
        strokeDasharray="220"
        style={{ animation: "drawCh 2.5s ease-out forwards" }} />
      <polyline points="10,65 22,52 36,56 50,40 63,45 77,29 91,34 105,26 113,30 113,78 10,78"
        fill="rgba(139,92,246,0.10)" stroke="none" />

      {/* Cursor blink */}
      <rect x="111" y="29" width="1.5" height="8" fill="#a78bfa"
        style={{ animation: "blink 1s step-end infinite" }} />

      {/* Keyboard */}
      <rect x="-6" y="90" width="136" height="13" rx="4"
        fill="#252040" stroke="rgba(139,92,246,0.3)" strokeWidth="1" />
      {[...Array(12)].map((_, k) => (
        <rect key={k} x={-3 + k * 11} y="93" width="9" height="6" rx="1.5"
          fill="rgba(139,92,246,0.22)" />
      ))}
      {/* Base taper */}
      <path d="M-16,103 L-10,120 L134,120 L140,103 Z" fill="#18142e" />
    </g>
  );
}

function SDRPerson() {
  return (
    <g transform="translate(278,165)"
      style={{ animation: "typeB 0.42s ease-in-out infinite" }}>
      {/* Hair */}
      <path d="M3,16 Q17,4 31,16 Q29,6 17,4 Q5,6 3,16 Z" fill="#92400e" />
      {/* Head */}
      <circle cx="17" cy="20" r="14" fill="#f59e0b" />
      {/* Eyes */}
      <circle cx="12" cy="19" r="2.2" fill="#1a1730" />
      <circle cx="22" cy="19" r="2.2" fill="#1a1730" />
      {/* Smile */}
      <path d="M11,25 Q17,30 23,25" stroke="#1a1730" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Headset arc */}
      <path d="M4,17 Q17,5 30,17" stroke="#7c3aed" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="4" cy="18" r="4" fill="#6d28d9" />
      <rect x="2" y="17" width="2" height="7" rx="1" fill="#a855f7" />
      {/* Body */}
      <rect x="4" y="35" width="26" height="30" rx="6" fill="#6d28d9" />
      {/* Left arm to keyboard */}
      <path d="M4,42 Q-8,62 -16,80" stroke="#6d28d9" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Right arm to keyboard */}
      <path d="M30,42 Q32,62 28,80" stroke="#6d28d9" strokeWidth="8" strokeLinecap="round" fill="none" />
      {/* Hands */}
      <ellipse cx="-17" cy="83" rx="7" ry="5" fill="#f59e0b" />
      <ellipse cx="28"  cy="83" rx="7" ry="5" fill="#f59e0b" />
    </g>
  );
}

function EmailParticles() {
  const items = [
    { x: 258, y: 168, d: "0s",   t: "2.4s", p: "M0,0 Q18,-18 36,-44" },
    { x: 250, y: 158, d: "0.9s", t: "2.7s", p: "M0,0 Q22,-14 48,-32" },
    { x: 265, y: 172, d: "1.8s", t: "2.2s", p: "M0,0 Q14,-22 28,-50" },
  ];
  return (
    <g>
      {items.map((e, idx) => (
        <g key={idx} transform={`translate(${e.x},${e.y})`}>
          <rect x="-7" y="-5" width="14" height="10" rx="2" fill="rgba(168,85,247,0.85)">
            <animateMotion path={e.p} dur={e.t} begin={e.d} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0.8;0"
              keyTimes="0;0.12;0.7;1" dur={e.t} begin={e.d} repeatCount="indefinite" />
          </rect>
          <path d="M-7,-5 L0,0 L7,-5" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" fill="none">
            <animateMotion path={e.p} dur={e.t} begin={e.d} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;0.8;0"
              keyTimes="0;0.12;0.7;1" dur={e.t} begin={e.d} repeatCount="indefinite" />
          </path>
        </g>
      ))}
    </g>
  );
}

/* ── Floating stat cards ─────────────────────────────────────────────────── */
function StatCard({
  icon, label, value, sub, color, animClass, delay,
}: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  color: string; animClass: string; delay: string;
}) {
  return (
    <div className={animClass} style={{
      animation: `${animClass.replace("anim-", "")} 4s ease-in-out infinite`,
      animationDelay: delay,
      background: "rgba(255,255,255,0.06)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: "12px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      minWidth: 170,
      animation: `floatA 4s ease-in-out infinite ${delay}`,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: color + "22", display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${color}44`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: 9, color, marginTop: 1, fontFamily: "monospace" }}>{sub}</div>
      </div>
    </div>
  );
}

function MiniLineChart() {
  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14,
      padding: "12px 16px",
      animation: "floatB 5s ease-in-out infinite 0.5s",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 6, fontFamily: "monospace" }}>
        REPLY RATE TREND
      </div>
      <svg width="130" height="38" viewBox="0 0 130 38">
        <defs>
          <linearGradient id="lgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points="0,32 18,26 36,28 54,18 72,22 90,12 108,16 126,10"
          fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round"
          strokeDasharray="220"
          style={{ animation: "drawCh 2s ease-out forwards" }} />
        <polyline points="0,32 18,26 36,28 54,18 72,22 90,12 108,16 126,10 126,38 0,38"
          fill="url(#lgFill)" stroke="none" />
        {[0,18,36,54,72,90,108,126].map((x,i) => {
          const ys = [32,26,28,18,22,12,16,10];
          return <circle key={i} cx={x} cy={ys[i]} r="2.5" fill="#8b5cf6" />;
        })}
      </svg>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa", marginTop: 2 }}>18.4%</div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";

  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState<string | null>(null);

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
    <>
      <style>{ANIM}</style>

      <div style={{
        minHeight: "100vh",
        display: "flex",
        background: "linear-gradient(135deg, #0d0821 0%, #140d2e 40%, #0a1128 100%)",
        overflow: "hidden",
        position: "relative",
      }}>
        {/* ── Subtle grid background ─────────────────────────────────────── */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48,0 L0,0 L0,48" fill="none" stroke="rgba(139,92,246,0.06)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 32px",
          position: "relative",
          gap: 28,
        }}
          className="hidden lg:flex"
        >
          {/* Headline */}
          <div style={{ textAlign: "center", animation: "fadeUp 0.8s ease-out both" }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Lead<span style={{ color: "#a855f7" }}>Genie</span> AI
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 8, letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "monospace" }}>
              AI-Powered SDR Platform
            </div>
          </div>

          {/* Main SVG animation */}
          <div style={{ width: "100%", maxWidth: 420, animation: "fadeUp 0.8s ease-out 0.2s both" }}>
            <svg viewBox="0 0 400 360" style={{ width: "100%", height: "auto", overflow: "visible" }}>
              {/* Concentric pulse rings around laptop */}
              <circle cx="200" cy="208" r="80"  fill="rgba(139,92,246,0.04)" />
              <circle cx="200" cy="208" r="130" fill="rgba(139,92,246,0.025)" />
              <circle cx="200" cy="208" r="175" fill="rgba(139,92,246,0.015)" />

              <AttractionArcs />
              {LEADS.map((l, idx) => <LeadBubble key={idx} {...l} />)}
              <Magnet />
              <Laptop />
              <SDRPerson />
              <EmailParticles />
            </svg>
          </div>

          {/* Floating stat cards */}
          <div style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            justifyContent: "center",
            animation: "fadeUp 0.8s ease-out 0.4s both",
          }}>
            <StatCard
              icon={<Users size={16} color="#a855f7" />}
              label="Leads Captured"
              value="247"
              sub="↑ 12% this week"
              color="#a855f7"
              animClass=""
              delay="0s"
            />
            <MiniLineChart />
            <StatCard
              icon={<Zap size={16} color="#f59e0b" />}
              label="Meetings Booked"
              value="8"
              sub="↑ 3 vs last week"
              color="#f59e0b"
              animClass=""
              delay="1s"
            />
          </div>
        </div>

        {/* ── RIGHT PANEL — Login form ─────────────────────────────────── */}
        <div style={{
          width: "100%",
          maxWidth: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 24px",
          flexShrink: 0,
        }}>
          <div style={{
            width: "100%",
            background: "rgba(255,255,255,0.07)",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 24,
            padding: "40px 36px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(139,92,246,0.15)",
            animation: "fadeUp 0.8s ease-out 0.15s both",
          }}>
            {/* Logo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
              <div style={{ position: "relative", marginBottom: 14 }}>
                <img src="/bot-logo.png" alt="LeadGenie"
                  style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover",
                    boxShadow: "0 0 32px rgba(168,85,247,0.5), 0 0 0 2px rgba(168,85,247,0.3)" }} />
                <div style={{
                  position: "absolute", inset: -4, borderRadius: "50%",
                  border: "2px solid rgba(168,85,247,0.4)",
                  animation: "glowMag 2s ease-in-out infinite",
                  pointerEvents: "none",
                }} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                Lead<span style={{ color: "#a855f7" }}>Genie</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: "monospace",
                letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 4 }}>
                AI-Powered SDR Platform
              </div>
            </div>

            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 24 }}>
              Sign in to your workspace to continue
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Username */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontFamily: "monospace",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required autoComplete="username" autoFocus
                  style={{
                    width: "100%", padding: "11px 14px", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 10, fontSize: 13, color: "#fff",
                    outline: "none", transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.7)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.14)"}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{ display: "block", fontSize: 10, fontFamily: "monospace",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required autoComplete="current-password"
                    style={{
                      width: "100%", padding: "11px 40px 11px 14px", boxSizing: "border-box",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.14)",
                      borderRadius: 10, fontSize: 13, color: "#fff",
                      outline: "none", transition: "border-color 0.2s",
                    }}
                    onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.7)"}
                    onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.14)"}
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPassword(p => !p)}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "rgba(255,255,255,0.4)", padding: 0,
                    }}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8, fontSize: 12,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#fca5a5", display: "flex", gap: 8, alignItems: "flex-start",
                }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button type="submit"
                disabled={isLoading || !username.trim() || !password}
                style={{
                  width: "100%", padding: "12px", borderRadius: 10, border: "none",
                  cursor: isLoading || !username.trim() || !password ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  opacity: isLoading || !username.trim() || !password ? 0.55 : 1,
                  transition: "opacity 0.2s, transform 0.1s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 24px rgba(168,85,247,0.35)",
                  marginTop: 4,
                }}>
                {isLoading
                  ? <><Loader2 size={15} className="animate-spin" />Signing in…</>
                  : "Sign in →"}
              </button>
            </form>

            {/* Role hint */}
            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "monospace",
                textAlign: "center", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Demo credentials
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {[
                  { role: "admin",     cred: "leadgenie123", color: "#a855f7" },
                  { role: "sdr",       cred: "sdr123",       color: "#06b6d4" },
                  { role: "developer", cred: "dev123",       color: "#10b981" },
                  { role: "manager",   cred: "manager123",   color: "#f59e0b" },
                ].map(({ role, cred, color }) => (
                  <button key={role} type="button"
                    onClick={() => { setUsername(role); setPassword(cred); }}
                    style={{
                      padding: "4px 10px", borderRadius: 20, border: `1px solid ${color}44`,
                      background: color + "18", color, fontSize: 10, fontFamily: "monospace",
                      cursor: "pointer", fontWeight: 600,
                      transition: "background 0.15s",
                    }}>
                    {role}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: 8, fontFamily: "monospace" }}>
                Click a role to auto-fill
              </div>
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 16, right: 24,
            fontSize: 9, color: "rgba(255,255,255,0.18)", fontFamily: "monospace" }}>
            LeadGenie AI · v0.1 · Governed SDR Platform
          </div>
        </div>
      </div>
    </>
  );
}
