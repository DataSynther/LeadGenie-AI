import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, Users, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

/* ── Injected keyframe CSS ────────────────────────────────────────────────── */
const ANIM = `
  @keyframes rockMag  { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }
  @keyframes glowMag  { 0%,100%{filter:drop-shadow(0 0 8px rgba(168,85,247,.5))} 50%{filter:drop-shadow(0 0 24px rgba(168,85,247,1))} }
  @keyframes screenG  { 0%,100%{opacity:.72} 50%{opacity:1} }
  @keyframes blink    { 0%,49%{opacity:1} 50%,100%{opacity:0} }
  @keyframes drawLine { from{stroke-dashoffset:240} to{stroke-dashoffset:0} }
  @keyframes fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
  @keyframes dashFlow { to{stroke-dashoffset:-22} }
  @keyframes floatSC  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
`;

/* ── SVG helpers ─────────────────────────────────────────────────────────── */

// Attraction arcs from each chart panel & lead to laptop center
const ARC_PATHS = [
  "M98,82 Q155,128 233,200",   "M372,82 Q315,128 237,200",
  "M98,318 Q155,265 233,210",  "M372,318 Q315,265 237,210",
  "M30,48 Q120,110 233,200",   "M440,48 Q350,110 237,200",
  "M18,200 Q110,200 233,205",  "M460,200 Q365,200 237,205",
];

function AttractionArcs() {
  return (
    <g opacity="0.28">
      {ARC_PATHS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(168,85,247,0.7)"
          strokeWidth="0.9" strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" values="0;-24"
            dur="1.8s" begin={`${i * 0.2}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

/* ── Bar chart panel ─────────────────────────────────────────────────────── */
function BarPanel({ cx, cy, floatDelay }: { cx: number; cy: number; floatDelay: string }) {
  const W = 88, H = 66, BASE = 54;
  const bars = [
    { h: 20, c: "#a855f7" }, { h: 34, c: "#8b5cf6" }, { h: 26, c: "#7c3aed" },
    { h: 44, c: "#a855f7" }, { h: 32, c: "#8b5cf6" }, { h: 40, c: "#7c3aed" },
  ];
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx - W/2},${cy - H/2}; ${cx - W/2},${cy - H/2 - 10}; ${cx - W/2},${cy - H/2}`}
        dur="4s" begin={floatDelay} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8"
        fill="rgba(8,6,24,0.82)" stroke="rgba(139,92,246,0.45)" strokeWidth="1" />
      <text x="8" y="13" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">PIPELINE</text>
      {bars.map((b, i) => {
        const bx = 7 + i * 13, by = BASE - b.h;
        const h2 = b.h * 0.7, h3 = b.h * 0.9;
        return (
          <g key={i}>
            <rect x={bx} y={by} width="10" height={b.h} rx="2" fill={b.c} opacity="0.88">
              <animate attributeName="height" values={`${b.h};${h2};${h3};${b.h}`}
                dur={`${2.6 + i * 0.35}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} />
              <animate attributeName="y" values={`${by};${BASE - h2};${BASE - h3};${by}`}
                dur={`${2.6 + i * 0.35}s`} repeatCount="indefinite" begin={`${i * 0.2}s`} />
            </rect>
          </g>
        );
      })}
      <line x1="6" y1={BASE + 1} x2={W - 6} y2={BASE + 1}
        stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      <text x="8" y={H - 4} fill="rgba(255,255,255,0.3)" fontSize="6" fontFamily="monospace">Outreach volume</text>
    </g>
  );
}

/* ── Donut chart panel ───────────────────────────────────────────────────── */
function DonutPanel({ cx, cy, floatDelay }: { cx: number; cy: number; floatDelay: string }) {
  const W = 84, H = 66, pcx = W / 2, pcy = H / 2 + 4, r = 20;
  const C = 2 * Math.PI * r;
  const segs = [
    { pct: 0.38, c: "#a855f7" },
    { pct: 0.28, c: "#06b6d4" },
    { pct: 0.20, c: "#10b981" },
    { pct: 0.14, c: "#f59e0b" },
  ];
  let off = 0;
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx - W/2},${cy - H/2}; ${cx - W/2},${cy - H/2 - 10}; ${cx - W/2},${cy - H/2}`}
        dur="4.5s" begin={floatDelay} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8"
        fill="rgba(8,6,24,0.82)" stroke="rgba(6,182,212,0.4)" strokeWidth="1" />
      <text x="8" y="13" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">AI SPEND</text>
      {/* Track */}
      <circle cx={pcx} cy={pcy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
      {segs.map((s, i) => {
        const dash = s.pct * C;
        const dashOff = -off * C / 1;
        const elem = (
          <circle key={i} cx={pcx} cy={pcy} r={r} fill="none" stroke={s.c}
            strokeWidth="8"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-off * C}
            transform={`rotate(-90 ${pcx} ${pcy})`}>
            <animate attributeName="stroke-width" values="8;9.5;8"
              dur={`${2.2 + i * 0.4}s`} repeatCount="indefinite" begin={`${i * 0.3}s`} />
          </circle>
        );
        off += s.pct;
        return elem;
      })}
      <text x={pcx} y={pcy + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="700">38%</text>
    </g>
  );
}

/* ── Pie chart panel ─────────────────────────────────────────────────────── */
function PiePanel({ cx, cy, floatDelay }: { cx: number; cy: number; floatDelay: string }) {
  const W = 84, H = 66, pcx = W / 2, pcy = H / 2 + 4, r = 22;
  const slices = [
    { pct: 0.35, c: "#a855f7" }, { pct: 0.25, c: "#06b6d4" },
    { pct: 0.22, c: "#10b981" }, { pct: 0.18, c: "#f59e0b" },
  ];
  let angle = -90;
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx - W/2},${cy - H/2}; ${cx - W/2},${cy - H/2 - 10}; ${cx - W/2},${cy - H/2}`}
        dur="5s" begin={floatDelay} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8"
        fill="rgba(8,6,24,0.82)" stroke="rgba(16,185,129,0.4)" strokeWidth="1" />
      <text x="8" y="13" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">CHANNELS</text>
      {slices.map((s, i) => {
        const sweep = s.pct * 360;
        const a1 = (angle * Math.PI) / 180;
        const a2 = ((angle + sweep) * Math.PI) / 180;
        const x1 = pcx + r * Math.cos(a1), y1 = pcy + r * Math.sin(a1);
        const x2 = pcx + r * Math.cos(a2), y2 = pcy + r * Math.sin(a2);
        const laf = sweep > 180 ? 1 : 0;
        const d = `M${pcx},${pcy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${laf},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
        angle += sweep;
        return (
          <path key={i} d={d} fill={s.c} stroke="rgba(8,6,24,0.6)" strokeWidth="1.2" opacity="0.9">
            <animate attributeName="opacity" values="0.9;1;0.9"
              dur={`${2.4 + i * 0.4}s`} repeatCount="indefinite" begin={`${i * 0.25}s`} />
          </path>
        );
      })}
    </g>
  );
}

/* ── Continuous line chart panel ─────────────────────────────────────────── */
function LinePanel({ cx, cy, floatDelay }: { cx: number; cy: number; floatDelay: string }) {
  const W = 88, H = 66;
  const pts = [[8,54],[22,42],[36,46],[50,30],[64,36],[78,22]];
  const polyStr = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const areaStr = [...pts, [78, 56], [8, 56]].map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx - W/2},${cy - H/2}; ${cx - W/2},${cy - H/2 - 10}; ${cx - W/2},${cy - H/2}`}
        dur="3.8s" begin={floatDelay} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8"
        fill="rgba(8,6,24,0.82)" stroke="rgba(245,158,11,0.4)" strokeWidth="1" />
      <text x="8" y="13" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">REPLY RATE</text>
      {/* Area */}
      <polyline points={areaStr} fill="rgba(245,158,11,0.10)" stroke="none" />
      {/* Line */}
      <polyline points={polyStr} fill="none" stroke="#f59e0b" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round"
        strokeDasharray="240">
        <animate attributeName="stroke-dashoffset" values="240;0;240" dur="4s" repeatCount="indefinite" />
      </polyline>
      {/* Dots */}
      {pts.map(([px, py], i) => (
        <circle key={i} cx={px} cy={py} r="2.5" fill="#f59e0b">
          <animate attributeName="r" values="2.5;3.5;2.5"
            dur={`${1.4 + i * 0.18}s`} repeatCount="indefinite" begin={`${i * 0.12}s`} />
        </circle>
      ))}
      <line x1="6" y1="57" x2={W - 6} y2="57" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
      <text x="8" y={H - 3} fill="rgba(255,255,255,0.28)" fontSize="6" fontFamily="monospace">18.4% avg</text>
    </g>
  );
}

/* ── Area / scatter panel ────────────────────────────────────────────────── */
function AreaPanel({ cx, cy, floatDelay }: { cx: number; cy: number; floatDelay: string }) {
  const W = 84, H = 62;
  const pts1 = [[6,48],[18,38],[30,42],[42,26],[54,32],[66,18],[78,24]];
  const pts2 = [[6,52],[18,44],[30,48],[42,36],[54,40],[66,28],[78,34]];
  const area1 = [...pts1, [78,55],[6,55]].map(([x,y]) => `${x},${y}`).join(" ");
  const area2 = [...pts2, [78,55],[6,55]].map(([x,y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx - W/2},${cy - H/2}; ${cx - W/2},${cy - H/2 - 10}; ${cx - W/2},${cy - H/2}`}
        dur="4.2s" begin={floatDelay} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8"
        fill="rgba(8,6,24,0.82)" stroke="rgba(236,72,153,0.4)" strokeWidth="1" />
      <text x="7" y="13" fill="rgba(255,255,255,0.45)" fontSize="7" fontFamily="monospace">ENGAGEMENT</text>
      <polyline points={area1} fill="rgba(168,85,247,0.15)" stroke="none" />
      <polyline points={area2} fill="rgba(236,72,153,0.10)" stroke="none" />
      <polyline points={pts1.map(([x,y])=>`${x},${y}`).join(" ")} fill="none"
        stroke="#a855f7" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" values="0;-240" dur="6s" repeatCount="indefinite" />
        <animate attributeName="stroke-dasharray" values="240 0;160 80;240 0" dur="6s" repeatCount="indefinite" />
      </polyline>
      <polyline points={pts2.map(([x,y])=>`${x},${y}`).join(" ")} fill="none"
        stroke="#ec4899" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7">
        <animate attributeName="stroke-dashoffset" values="0;-240" dur="6s" begin="0.5s" repeatCount="indefinite" />
        <animate attributeName="stroke-dasharray" values="240 0;140 100;240 0" dur="6s" begin="0.5s" repeatCount="indefinite" />
      </polyline>
    </g>
  );
}

/* ── Magnet ────────────────────────────────────────────────────────────────── */
function Magnet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}
      style={{ animation: "rockMag 3s ease-in-out infinite, glowMag 2.2s ease-in-out infinite" }}>
      <defs>
        <linearGradient id="mgG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#ef4444" />
          <stop offset="50%"  stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path d="M12,46 Q12,6 32,6 Q52,6 52,46"
        stroke="url(#mgG)" strokeWidth="15" fill="none" strokeLinecap="round" />
      <rect x="4.5"  y="44" width="15" height="26" rx="4" fill="#dc2626" />
      <text x="12"   y="62" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="700">N</text>
      <rect x="44.5" y="44" width="15" height="26" rx="4" fill="#2563eb" />
      <text x="52"   y="62" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="700">S</text>
      <ellipse cx="32" cy="22" rx="36" ry="16" fill="rgba(139,92,246,0.1)" />
    </g>
  );
}

/* ── Laptop ─────────────────────────────────────────────────────────────── */
function Laptop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="128" height="90" rx="7"
        fill="#1e1b2e" stroke="rgba(139,92,246,0.7)" strokeWidth="1.5" />
      <rect x="5" y="5" width="118" height="80" rx="3" fill="#09071a"
        style={{ animation: "screenG 2.5s ease-in-out infinite" }} />
      {/* KPI chips */}
      <rect x="8"  y="9"  width="34" height="14" rx="3" fill="rgba(139,92,246,0.25)" />
      <text x="25" y="19" textAnchor="middle" fill="#a78bfa" fontSize="7" fontWeight="700">247 Leads</text>
      <rect x="48" y="9"  width="28" height="14" rx="3" fill="rgba(16,185,129,0.22)" />
      <text x="62" y="19" textAnchor="middle" fill="#34d399" fontSize="7" fontWeight="700">18.4%</text>
      <rect x="82" y="9"  width="34" height="14" rx="3" fill="rgba(245,158,11,0.22)" />
      <text x="99" y="19" textAnchor="middle" fill="#fbbf24" fontSize="7" fontWeight="700">8 Mtgs</text>
      {/* Chart */}
      <polyline points="10,68 23,55 37,58 51,42 65,47 79,32 93,37 107,28 116,32"
        fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinejoin="round"
        strokeDasharray="240"
        style={{ animation: "drawLine 2.5s ease-out forwards" }} />
      <polyline points="10,68 23,55 37,58 51,42 65,47 79,32 93,37 107,28 116,32 116,80 10,80"
        fill="rgba(139,92,246,0.09)" stroke="none" />
      <rect x="113" y="31" width="1.5" height="8" fill="#a78bfa"
        style={{ animation: "blink 1s step-end infinite" }} />
      {/* Keyboard */}
      <rect x="-6"  y="92" width="140" height="13" rx="4"
        fill="#252040" stroke="rgba(139,92,246,0.28)" strokeWidth="1" />
      {[...Array(12)].map((_, k) => (
        <rect key={k} x={-3 + k * 11.5} y="95" width="9" height="6" rx="1.5"
          fill="rgba(139,92,246,0.2)" />
      ))}
      <path d="M-16,105 L-10,122 L138,122 L144,105 Z" fill="#18142e" />
    </g>
  );
}

/* ── Lead bubbles ─────────────────────────────────────────────────────────── */
// Laptop screen center ≈ (235, 200)
const LEADS = [
  { cx: 28,  cy: 45,  i: "AM", c: "#a855f7", d: "0s",   t: "3.2s", p: "M0,0 Q90,72 207,155" },
  { cx: 445, cy: 45,  i: "SK", c: "#06b6d4", d: "0.7s",  t: "3.5s", p: "M0,0 Q-90,72 -210,155" },
  { cx: 15,  cy: 200, i: "JR", c: "#10b981", d: "1.5s",  t: "3.1s", p: "M0,0 Q110,0 220,0"  },
  { cx: 455, cy: 200, i: "LT", c: "#f59e0b", d: "2.3s",  t: "3.4s", p: "M0,0 Q-110,0 -220,0" },
  { cx: 28,  cy: 352, i: "EW", c: "#ec4899", d: "1.1s",  t: "3.7s", p: "M0,0 Q90,-75 207,-152" },
  { cx: 445, cy: 352, i: "JD", c: "#14b8a6", d: "2.0s",  t: "3.3s", p: "M0,0 Q-90,-75 -210,-152" },
];

function LeadBubble({ cx, cy, i, c, d, t, p }: typeof LEADS[0]) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <animateMotion path={p} dur={t} begin={d} repeatCount="indefinite"
        calcMode="spline" keyTimes="0;0.55;1"
        keySplines="0.25 0.1 0.55 0.25; 0.7 0 1 1" />
      <animate attributeName="opacity"
        values="0;1;1;0.45;0" keyTimes="0;0.08;0.55;0.88;1"
        dur={t} begin={d} repeatCount="indefinite" />
      <circle r="26" fill="none" stroke={c} strokeWidth="0.6" opacity="0.3">
        <animate attributeName="r" values="26;33;26" dur="2s" begin={d} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.07;0.3" dur="2s" begin={d} repeatCount="indefinite" />
      </circle>
      <circle r="19" fill={c + "28"} stroke={c} strokeWidth="1.5">
        <animate attributeName="r" values="19;20;15;7;0"
          keyTimes="0;0.1;0.65;0.88;1" dur={t} begin={d} repeatCount="indefinite" />
      </circle>
      <text dy="3.5" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="700">{i}</text>
    </g>
  );
}

/* ── Floating stat cards (HTML) ──────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color, delay }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; delay: string;
}) {
  return (
    <div style={{
      animation: `floatSC 4s ease-in-out infinite ${delay}`,
      background: "rgba(255,255,255,0.06)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14,
      padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 165,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: color + "22",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${color}44`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{label}</div>
        <div style={{ fontSize: 9, color, marginTop: 1, fontFamily: "monospace" }}>{sub}</div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/dashboard";
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    try { await login(username.trim(), password); navigate(from, { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "Login failed."); }
  };

  return (
    <>
      <style>{ANIM}</style>
      <div style={{
        minHeight: "100vh", display: "flex", overflow: "hidden",
        background: "linear-gradient(135deg, #0d0821 0%, #140d2e 45%, #0a1128 100%)",
        position: "relative",
      }}>
        {/* Grid bg */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
          preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48,0 L0,0 0,48" fill="none" stroke="rgba(139,92,246,0.055)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* ── LEFT PANEL ── */}
        <div className="hidden lg:flex" style={{
          flex: 1, flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "36px 28px", gap: 22,
          display: "flex", position: "relative",
        }}>
          {/* Headline */}
          <div style={{ textAlign: "center", animation: "fadeUp 0.8s ease-out both" }}>
            <div style={{ fontSize: 38, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Lead<span style={{ color: "#a855f7" }}>Genie</span> AI
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 7,
              letterSpacing: "0.18em", textTransform: "uppercase", fontFamily: "monospace" }}>
              AI-Powered SDR Platform
            </div>
          </div>

          {/* Main SVG animation */}
          <div style={{ width: "100%", maxWidth: 480, animation: "fadeUp 0.8s ease-out 0.2s both" }}>
            <svg viewBox="0 0 480 380" style={{ width: "100%", height: "auto", overflow: "visible" }}>

              {/* Pulse rings around laptop center */}
              <circle cx="235" cy="200" r="72"  fill="rgba(139,92,246,0.04)" />
              <circle cx="235" cy="200" r="115" fill="rgba(139,92,246,0.026)" />
              <circle cx="235" cy="200" r="155" fill="rgba(139,92,246,0.015)" />

              <AttractionArcs />

              {/* Chart panels — 4 corners + 2 sides */}
              <BarPanel    cx={95}  cy={82}  floatDelay="0s"    />
              <DonutPanel  cx={382} cy={82}  floatDelay="0.6s"  />
              <LinePanel   cx={95}  cy={315} floatDelay="1.2s"  />
              <PiePanel    cx={382} cy={315} floatDelay="0.3s"  />
              <AreaPanel   cx={238} cy={42}  floatDelay="0.9s"  />

              {/* Lead bubbles from edges */}
              {LEADS.map((l, idx) => <LeadBubble key={idx} {...l} />)}

              {/* Magnet — just above laptop screen */}
              <Magnet x={202} y={98} />

              {/* Laptop — center */}
              <Laptop x={171} y={162} />
            </svg>
          </div>

          {/* Floating stat cards */}
          <div style={{
            display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center",
            animation: "fadeUp 0.8s ease-out 0.4s both",
          }}>
            <StatCard icon={<Users size={16} color="#a855f7" />}
              label="Leads Captured" value="247" sub="↑ 12% this week" color="#a855f7" delay="0s" />
            <StatCard icon={<Zap size={16} color="#f59e0b" />}
              label="Meetings Booked" value="8" sub="↑ 3 vs last week" color="#f59e0b" delay="0.8s" />
          </div>
        </div>

        {/* ── RIGHT PANEL — Login ── */}
        <div style={{
          width: "100%", maxWidth: 420, display: "flex", alignItems: "center",
          justifyContent: "center", padding: "32px 24px", flexShrink: 0,
        }}>
          <div style={{
            width: "100%",
            background: "rgba(255,255,255,0.07)", backdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 24,
            padding: "40px 36px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.4),0 0 0 1px rgba(139,92,246,0.15)",
            animation: "fadeUp 0.8s ease-out 0.15s both",
          }}>
            {/* Logo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
              <div style={{ position: "relative", marginBottom: 14 }}>
                <img src="/bot-logo.png" alt="LeadGenie"
                  style={{ width: 70, height: 70, borderRadius: "50%", objectFit: "cover",
                    boxShadow: "0 0 32px rgba(168,85,247,0.5),0 0 0 2px rgba(168,85,247,0.3)" }} />
                <div style={{
                  position: "absolute", inset: -4, borderRadius: "50%",
                  border: "2px solid rgba(168,85,247,0.35)",
                  animation: "glowMag 2s ease-in-out infinite",
                  pointerEvents: "none",
                }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
                Lead<span style={{ color: "#a855f7" }}>Genie</span>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", fontFamily: "monospace",
                letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 4 }}>
                AI-Powered SDR Platform
              </div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 4 }}>Welcome back</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginBottom: 22 }}>
              Sign in to your workspace
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
              {(["Username", "Password"] as const).map((field) => {
                const isPass = field === "Password";
                return (
                  <div key={field}>
                    <label style={{ display: "block", fontSize: 10, fontFamily: "monospace",
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>{field}</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type={isPass ? (showPassword ? "text" : "password") : "text"}
                        value={isPass ? password : username}
                        onChange={e => isPass ? setPassword(e.target.value) : setUsername(e.target.value)}
                        placeholder={isPass ? "••••••••" : "Enter your username"}
                        required autoComplete={isPass ? "current-password" : "username"}
                        autoFocus={!isPass}
                        style={{
                          width: "100%", padding: isPass ? "11px 40px 11px 14px" : "11px 14px",
                          boxSizing: "border-box",
                          background: "rgba(255,255,255,0.08)",
                          border: "1px solid rgba(255,255,255,0.13)",
                          borderRadius: 10, fontSize: 13, color: "#fff", outline: "none",
                          transition: "border-color 0.2s",
                        }}
                        onFocus={e => e.target.style.borderColor = "rgba(168,85,247,0.7)"}
                        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.13)"}
                      />
                      {isPass && (
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowPassword(p => !p)}
                          style={{ position: "absolute", right: 12, top: "50%",
                            transform: "translateY(-50%)", background: "none",
                            border: "none", cursor: "pointer", color: "rgba(255,255,255,0.38)", padding: 0 }}>
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {error && (
                <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.28)",
                  color: "#fca5a5", display: "flex", gap: 8 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <button type="submit"
                disabled={isLoading || !username.trim() || !password}
                style={{
                  width: "100%", padding: "12px", borderRadius: 10, border: "none",
                  cursor: isLoading || !username.trim() || !password ? "not-allowed" : "pointer",
                  background: "linear-gradient(135deg,#7c3aed 0%,#a855f7 100%)",
                  color: "#fff", fontSize: 14, fontWeight: 700,
                  opacity: isLoading || !username.trim() || !password ? 0.5 : 1,
                  transition: "opacity 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: "0 4px 24px rgba(168,85,247,0.35)", marginTop: 4,
                }}>
                {isLoading ? <><Loader2 size={15} className="animate-spin" />Signing in…</> : "Sign in →"}
              </button>
            </form>

            {/* Role quick-fill */}
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", fontFamily: "monospace",
                textAlign: "center", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Demo — click role to fill
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {[
                  { role: "admin",     pass: "leadgenie123", c: "#a855f7" },
                  { role: "sdr",       pass: "sdr123",       c: "#06b6d4" },
                  { role: "developer", pass: "dev123",        c: "#10b981" },
                  { role: "manager",   pass: "manager123",    c: "#f59e0b" },
                ].map(({ role, pass, c }) => (
                  <button key={role} type="button"
                    onClick={() => { setUsername(role); setPassword(pass); }}
                    style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${c}44`,
                      background: c + "18", color: c, fontSize: 10, fontFamily: "monospace",
                      cursor: "pointer", fontWeight: 600 }}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position: "absolute", bottom: 14, right: 22,
            fontSize: 9, color: "rgba(255,255,255,0.16)", fontFamily: "monospace" }}>
            LeadGenie AI · v0.1 · Governed SDR Platform
          </div>
        </div>
      </div>
    </>
  );
}
