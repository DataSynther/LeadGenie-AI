import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2, Users, Zap } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const ANIM = `
  @keyframes rockMag { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(5deg)} }
  @keyframes glowMag { 0%,100%{filter:drop-shadow(0 0 6px rgba(124,58,237,.28))} 50%{filter:drop-shadow(0 0 20px rgba(124,58,237,.65))} }
  @keyframes screenG { 0%,100%{opacity:.88} 50%{opacity:1} }
  @keyframes blink   { 0%,49%{opacity:1} 50%,100%{opacity:0} }
  @keyframes drawLine{ from{stroke-dashoffset:240} to{stroke-dashoffset:0} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
  @keyframes floatSC { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  input::placeholder { color:rgba(30,27,75,0.32); }
`;

/* ── Dashed attraction arcs ──────────────────────────────────────────────── */
const ARC_PATHS = [
  "M98,82 Q155,128 233,195",  "M372,82 Q315,128 237,195",
  "M98,318 Q155,265 233,205", "M372,318 Q315,265 237,205",
  "M30,50 Q120,110 233,195",  "M440,50 Q350,110 237,195",
  "M18,200 Q110,200 233,200", "M460,200 Q365,200 237,200",
];
function AttractionArcs() {
  return (
    <g opacity="0.28">
      {ARC_PATHS.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(109,40,217,0.55)"
          strokeWidth="1" strokeDasharray="4 8">
          <animate attributeName="stroke-dashoffset" values="0;-24"
            dur="1.8s" begin={`${i * 0.22}s`} repeatCount="indefinite" />
        </path>
      ))}
    </g>
  );
}

/* ── Chart panels — light style ──────────────────────────────────────────── */
function BarPanel({ cx, cy, fd }: { cx: number; cy: number; fd: string }) {
  const W = 88, H = 64, BASE = 52;
  const bars = [
    { h: 20, c: "#a855f7" }, { h: 34, c: "#8b5cf6" }, { h: 26, c: "#7c3aed" },
    { h: 44, c: "#a855f7" }, { h: 32, c: "#8b5cf6" }, { h: 40, c: "#7c3aed" },
  ];
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx-W/2},${cy-H/2};${cx-W/2},${cy-H/2-9};${cx-W/2},${cy-H/2}`}
        dur="4s" begin={fd} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8" fill="white"
        stroke="rgba(139,92,246,0.28)" strokeWidth="1" filter="url(#ps)" />
      <text x="8" y="12" fill="rgba(30,27,75,0.45)" fontSize="6.5" fontFamily="monospace">PIPELINE</text>
      {bars.map((b, i) => {
        const bx = 7 + i * 13, by = BASE - b.h;
        const h2 = b.h * 0.68, h3 = b.h * 0.88;
        return (
          <g key={i}>
            <rect x={bx} y={by} width="10" height={b.h} rx="2" fill={b.c} opacity="0.82">
              <animate attributeName="height" values={`${b.h};${h2};${h3};${b.h}`}
                dur={`${2.6+i*0.35}s`} repeatCount="indefinite" begin={`${i*0.2}s`} />
              <animate attributeName="y" values={`${by};${BASE-h2};${BASE-h3};${by}`}
                dur={`${2.6+i*0.35}s`} repeatCount="indefinite" begin={`${i*0.2}s`} />
            </rect>
          </g>
        );
      })}
      <line x1="6" y1={BASE+1} x2={W-6} y2={BASE+1} stroke="rgba(30,27,75,0.09)" strokeWidth="0.5" />
      <text x="8" y={H-4} fill="rgba(30,27,75,0.28)" fontSize="5.8" fontFamily="monospace">Outreach volume</text>
    </g>
  );
}

function DonutPanel({ cx, cy, fd }: { cx: number; cy: number; fd: string }) {
  const W = 84, H = 64, pcx = W/2, pcy = H/2+4, r = 19;
  const C = 2*Math.PI*r;
  const segs = [
    { pct: 0.38, c: "#a855f7" }, { pct: 0.28, c: "#06b6d4" },
    { pct: 0.20, c: "#10b981" }, { pct: 0.14, c: "#f59e0b" },
  ];
  let off = 0;
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx-W/2},${cy-H/2};${cx-W/2},${cy-H/2-9};${cx-W/2},${cy-H/2}`}
        dur="4.5s" begin={fd} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8" fill="white"
        stroke="rgba(6,182,212,0.3)" strokeWidth="1" filter="url(#ps)" />
      <text x="8" y="12" fill="rgba(30,27,75,0.45)" fontSize="6.5" fontFamily="monospace">AI SPEND</text>
      <circle cx={pcx} cy={pcy} r={r} fill="none" stroke="rgba(30,27,75,0.06)" strokeWidth="8" />
      {segs.map((s, i) => {
        const dash = s.pct * C;
        const el = (
          <circle key={i} cx={pcx} cy={pcy} r={r} fill="none" stroke={s.c}
            strokeWidth="8" strokeDasharray={`${dash} ${C-dash}`}
            strokeDashoffset={-off*C} transform={`rotate(-90 ${pcx} ${pcy})`}>
            <animate attributeName="stroke-width" values="8;9.5;8"
              dur={`${2.2+i*0.4}s`} repeatCount="indefinite" begin={`${i*0.3}s`} />
          </circle>
        );
        off += s.pct; return el;
      })}
      <text x={pcx} y={pcy+4} textAnchor="middle" fill="#1e1b4b" fontSize="10" fontWeight="700">38%</text>
    </g>
  );
}

function PiePanel({ cx, cy, fd }: { cx: number; cy: number; fd: string }) {
  const W = 82, H = 64, pcx = W/2, pcy = H/2+4, r = 21;
  const slices = [
    { pct: 0.35, c: "#a855f7" }, { pct: 0.25, c: "#06b6d4" },
    { pct: 0.22, c: "#10b981" }, { pct: 0.18, c: "#f59e0b" },
  ];
  let angle = -90;
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx-W/2},${cy-H/2};${cx-W/2},${cy-H/2-9};${cx-W/2},${cy-H/2}`}
        dur="5s" begin={fd} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8" fill="white"
        stroke="rgba(16,185,129,0.3)" strokeWidth="1" filter="url(#ps)" />
      <text x="8" y="12" fill="rgba(30,27,75,0.45)" fontSize="6.5" fontFamily="monospace">CHANNELS</text>
      {slices.map((s, i) => {
        const sweep = s.pct*360;
        const a1 = angle*Math.PI/180, a2 = (angle+sweep)*Math.PI/180;
        const x1 = pcx+r*Math.cos(a1), y1 = pcy+r*Math.sin(a1);
        const x2 = pcx+r*Math.cos(a2), y2 = pcy+r*Math.sin(a2);
        const d = `M${pcx},${pcy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${sweep>180?1:0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
        angle += sweep;
        return (
          <path key={i} d={d} fill={s.c} stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" opacity="0.88">
            <animate attributeName="opacity" values="0.88;1;0.88"
              dur={`${2.4+i*0.4}s`} repeatCount="indefinite" begin={`${i*0.25}s`} />
          </path>
        );
      })}
    </g>
  );
}

function LinePanel({ cx, cy, fd }: { cx: number; cy: number; fd: string }) {
  const W = 88, H = 64;
  const pts: [number,number][] = [[8,52],[22,40],[36,44],[50,28],[64,34],[78,20]];
  const poly = pts.map(([x,y]) => `${x},${y}`).join(" ");
  const area = [...pts,[78,54],[8,54]].map(([x,y]) => `${x},${y}`).join(" ");
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx-W/2},${cy-H/2};${cx-W/2},${cy-H/2-9};${cx-W/2},${cy-H/2}`}
        dur="3.8s" begin={fd} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8" fill="white"
        stroke="rgba(245,158,11,0.3)" strokeWidth="1" filter="url(#ps)" />
      <text x="8" y="12" fill="rgba(30,27,75,0.45)" fontSize="6.5" fontFamily="monospace">REPLY RATE</text>
      <polyline points={area} fill="rgba(245,158,11,0.1)" stroke="none" />
      <polyline points={poly} fill="none" stroke="#f59e0b" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" strokeDasharray="240">
        <animate attributeName="stroke-dashoffset" values="240;0;240" dur="4s" repeatCount="indefinite" />
      </polyline>
      {pts.map(([px,py],i) => (
        <circle key={i} cx={px} cy={py} r="2.5" fill="#f59e0b">
          <animate attributeName="r" values="2.5;3.5;2.5"
            dur={`${1.4+i*0.18}s`} repeatCount="indefinite" begin={`${i*0.12}s`} />
        </circle>
      ))}
      <text x="8" y={H-4} fill="rgba(30,27,75,0.28)" fontSize="5.8" fontFamily="monospace">18.4% avg</text>
    </g>
  );
}

function AreaPanel({ cx, cy, fd }: { cx: number; cy: number; fd: string }) {
  const W = 84, H = 60;
  const p1: [number,number][] = [[6,46],[18,36],[30,40],[42,24],[54,30],[66,16],[78,22]];
  const p2: [number,number][] = [[6,50],[18,42],[30,46],[42,34],[54,38],[66,26],[78,32]];
  const a1 = [...p1,[78,53],[6,53]].map(([x,y])=>`${x},${y}`).join(" ");
  const a2 = [...p2,[78,53],[6,53]].map(([x,y])=>`${x},${y}`).join(" ");
  return (
    <g>
      <animateTransform attributeName="transform" type="translate"
        values={`${cx-W/2},${cy-H/2};${cx-W/2},${cy-H/2-9};${cx-W/2},${cy-H/2}`}
        dur="4.2s" begin={fd} repeatCount="indefinite" additive="replace" />
      <rect width={W} height={H} rx="8" fill="white"
        stroke="rgba(236,72,153,0.3)" strokeWidth="1" filter="url(#ps)" />
      <text x="7" y="12" fill="rgba(30,27,75,0.45)" fontSize="6.5" fontFamily="monospace">ENGAGEMENT</text>
      <polyline points={a1} fill="rgba(168,85,247,0.1)" stroke="none" />
      <polyline points={a2} fill="rgba(236,72,153,0.07)" stroke="none" />
      <polyline points={p1.map(([x,y])=>`${x},${y}`).join(" ")} fill="none"
        stroke="#a855f7" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <animate attributeName="stroke-dashoffset" values="0;-240" dur="6s" repeatCount="indefinite" />
        <animate attributeName="stroke-dasharray" values="240 0;160 80;240 0" dur="6s" repeatCount="indefinite" />
      </polyline>
      <polyline points={p2.map(([x,y])=>`${x},${y}`).join(" ")} fill="none"
        stroke="#ec4899" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7">
        <animate attributeName="stroke-dashoffset" values="0;-240" dur="6s" begin="0.5s" repeatCount="indefinite" />
        <animate attributeName="stroke-dasharray" values="240 0;140 100;240 0" dur="6s" begin="0.5s" repeatCount="indefinite" />
      </polyline>
    </g>
  );
}

/* ── Magnet ───────────────────────────────────────────────────────────────── */
function Magnet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}
      style={{ animation: "rockMag 3s ease-in-out infinite, glowMag 2.2s ease-in-out infinite" }}>
      <defs>
        <linearGradient id="mgG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      {/* Field glow */}
      <ellipse cx="32" cy="22" rx="38" ry="18" fill="rgba(124,58,237,0.07)" />
      {/* Body arc */}
      <path d="M12,46 Q12,6 32,6 Q52,6 52,46"
        stroke="url(#mgG)" strokeWidth="14" fill="none" strokeLinecap="round" />
      {/* N pole */}
      <rect x="5" y="44" width="14" height="24" rx="4" fill="#dc2626" />
      <text x="12" y="60" textAnchor="middle" fill="white" fontSize="8" fontWeight="800">N</text>
      {/* S pole */}
      <rect x="45" y="44" width="14" height="24" rx="4" fill="#2563eb" />
      <text x="52" y="60" textAnchor="middle" fill="white" fontSize="8" fontWeight="800">S</text>
      {/* Label */}
      <text x="32" y="76" textAnchor="middle" fill="rgba(109,40,217,0.5)"
        fontSize="6" fontFamily="monospace" fontWeight="600">LEAD MAGNET</text>
      {/* Magnetic field sparks */}
      {[-12,-6,0,6,12].map((dx,i) => (
        <line key={i} x1={32+dx} y1={69} x2={32+dx} y2={79}
          stroke="rgba(124,58,237,0.35)" strokeWidth="1.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0;0.7;0"
            dur={`${1.1+i*0.14}s`} begin={`${i*0.12}s`} repeatCount="indefinite" />
          <animate attributeName="y2" values="79;87;79"
            dur={`${1.1+i*0.14}s`} begin={`${i*0.12}s`} repeatCount="indefinite" />
        </line>
      ))}
    </g>
  );
}

/* ── Laptop — light MacBook style ────────────────────────────────────────── */
function Laptop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width="128" height="90" rx="7" fill="#e8e8ea" stroke="#c7c7cc" strokeWidth="1.2" />
      <rect x="5" y="5" width="118" height="80" rx="3" fill="#f5f5f7"
        style={{ animation: "screenG 2.5s ease-in-out infinite" }} />
      {/* KPI chips */}
      <rect x="8"  y="9"  width="34" height="13" rx="3" fill="rgba(124,58,237,0.13)" />
      <text x="25" y="18" textAnchor="middle" fill="#6d28d9" fontSize="6.5" fontWeight="700">247 Leads</text>
      <rect x="48" y="9"  width="28" height="13" rx="3" fill="rgba(16,185,129,0.16)" />
      <text x="62" y="18" textAnchor="middle" fill="#059669" fontSize="6.5" fontWeight="700">18.4%</text>
      <rect x="82" y="9"  width="34" height="13" rx="3" fill="rgba(245,158,11,0.16)" />
      <text x="99" y="18" textAnchor="middle" fill="#d97706" fontSize="6.5" fontWeight="700">8 Mtgs</text>
      {/* Chart */}
      <polyline points="10,68 23,55 37,58 51,42 65,47 79,32 93,37 107,28 116,32"
        fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round"
        strokeDasharray="240"
        style={{ animation: "drawLine 2.5s ease-out forwards" }} />
      <polyline points="10,68 23,55 37,58 51,42 65,47 79,32 93,37 107,28 116,32 116,80 10,80"
        fill="rgba(124,58,237,0.07)" stroke="none" />
      <rect x="113" y="31" width="1.5" height="7" fill="#7c3aed"
        style={{ animation: "blink 1s step-end infinite" }} />
      {/* Keyboard */}
      <rect x="-6" y="92" width="140" height="12" rx="4" fill="#d1d1d6" stroke="#c7c7cc" strokeWidth="1" />
      {[...Array(12)].map((_, k) => (
        <rect key={k} x={-3+k*11.5} y="95" width="9" height="5.5" rx="1.5"
          fill="rgba(109,40,217,0.1)" />
      ))}
      <path d="M-16,104 L-10,120 L138,120 L144,104 Z" fill="#d1d1d6" />
    </g>
  );
}

/* ── Anime lead bubbles ───────────────────────────────────────────────────── */
type LeadDef = {
  cx: number; cy: number; name: string; company: string;
  skinC: string; hairC: string; c: string; compC: string;
  d: string; t: string; p: string;
};

const LEADS: LeadDef[] = [
  { cx: 28,  cy: 50,  name: "AM", company: "SF", skinC: "#fde8d6", hairC: "#3d1200", c: "#a855f7", compC: "#00a1e0", d: "0s",   t: "3.2s", p: "M0,0 Q90,70 207,150" },
  { cx: 445, cy: 50,  name: "SK", company: "GL", skinC: "#fff2e2", hairC: "#1a1a1a", c: "#06b6d4", compC: "#4285f4", d: "0.7s",  t: "3.5s", p: "M0,0 Q-90,70 -210,150" },
  { cx: 15,  cy: 200, name: "JR", company: "HB", skinC: "#ffe4cc", hairC: "#7b3200", c: "#10b981", compC: "#ff7a59", d: "1.5s",  t: "3.1s", p: "M0,0 Q110,0 220,0" },
  { cx: 455, cy: 200, name: "LT", company: "LN", skinC: "#fef3e2", hairC: "#2c1654", c: "#f59e0b", compC: "#0077b5", d: "2.3s",  t: "3.4s", p: "M0,0 Q-110,0 -220,0" },
  { cx: 28,  cy: 345, name: "EW", company: "ST", skinC: "#fde8d6", hairC: "#6b2a1a", c: "#ec4899", compC: "#635bff", d: "1.1s",  t: "3.7s", p: "M0,0 Q90,-72 207,-145" },
  { cx: 445, cy: 345, name: "JD", company: "SL", skinC: "#ffdecf", hairC: "#1e293b", c: "#14b8a6", compC: "#4a154b", d: "2.0s",  t: "3.3s", p: "M0,0 Q-90,-72 -210,-145" },
];

function AnimeFace({ skinC, hairC }: { skinC: string; hairC: string }) {
  return (
    <g>
      {/* Head */}
      <ellipse cx="0" cy="1" rx="11" ry="12" fill={skinC} />
      {/* Hair covers top */}
      <path d="M-11,3 Q-12,-13 0,-15 Q12,-13 11,3 Q8,-1 0,-2 Q-8,-1 -11,3 Z" fill={hairC} />
      {/* Ears */}
      <ellipse cx="-11.5" cy="2" rx="2.2" ry="2.8" fill={skinC} />
      <ellipse cx="11.5"  cy="2" rx="2.2" ry="2.8" fill={skinC} />
      {/* Eyes */}
      <ellipse cx="-3.8" cy="0.5" rx="2.8" ry="3.2" fill="#1e1b4b" />
      <ellipse cx="3.8"  cy="0.5" rx="2.8" ry="3.2" fill="#1e1b4b" />
      {/* Eye shine */}
      <circle cx="-2.6" cy="-0.8" r="1.1" fill="white" opacity="0.9" />
      <circle cx="5.0"  cy="-0.8" r="1.1" fill="white" opacity="0.9" />
      {/* Brows */}
      <path d="M-6.8,-4.5 Q-3.8,-6 -1,-4.5" fill="none" stroke={hairC} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M1,-4.5 Q3.8,-6 6.8,-4.5" fill="none" stroke={hairC} strokeWidth="1.3" strokeLinecap="round" />
      {/* Blush */}
      <ellipse cx="-7" cy="4.5" rx="3.2" ry="2" fill="#ffb3b3" opacity="0.42" />
      <ellipse cx="7"  cy="4.5" rx="3.2" ry="2" fill="#ffb3b3" opacity="0.42" />
      {/* Smile */}
      <path d="M-4,7 Q0,10.5 4,7" fill="none" stroke="#c06070" strokeWidth="1.3" strokeLinecap="round" />
      {/* Nose */}
      <path d="M-1,4 Q0,5.5 1,4" fill="none" stroke="rgba(180,100,80,0.3)" strokeWidth="0.8" strokeLinecap="round" />
    </g>
  );
}

function LeadBubble({ cx, cy, name, company, skinC, hairC, c, compC, d, t, p }: LeadDef) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      <animateMotion path={p} dur={t} begin={d} repeatCount="indefinite"
        calcMode="spline" keyTimes="0;0.55;1"
        keySplines="0.25 0.1 0.55 0.25; 0.7 0 1 1" />
      <animate attributeName="opacity"
        values="0;1;1;0.4;0" keyTimes="0;0.08;0.55;0.88;1"
        dur={t} begin={d} repeatCount="indefinite" />
      {/* Glow ring */}
      <circle r="34" fill="none" stroke={c} strokeWidth="0.8" opacity="0.18">
        <animate attributeName="r" values="34;42;34" dur="2.3s" begin={d} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.18;0.04;0.18" dur="2.3s" begin={d} repeatCount="indefinite" />
      </circle>
      {/* White bubble */}
      <circle r="26" fill="white" stroke={c} strokeWidth="1.8"
        style={{ filter: `drop-shadow(0 3px 10px ${c}45)` }}>
        <animate attributeName="r" values="26;27;20;12;0"
          keyTimes="0;0.1;0.65;0.88;1" dur={t} begin={d} repeatCount="indefinite" />
      </circle>
      {/* Anime face */}
      <AnimeFace skinC={skinC} hairC={hairC} />
      {/* Company badge — top-right */}
      <g transform="translate(13,-22)">
        <rect width="16" height="13" rx="3.5" fill={compC} />
        <text x="8" y="9.5" textAnchor="middle" fill="white"
          fontSize="5.5" fontWeight="800" fontFamily="monospace">{company}</text>
      </g>
      {/* Name tag — bottom */}
      <g transform="translate(0,18)">
        <rect x="-13" y="-1" width="26" height="10" rx="5" fill={c+"20"} stroke={c+"60"} strokeWidth="0.9" />
        <text y="7" textAnchor="middle" fill={c}
          fontSize="6" fontWeight="700" fontFamily="monospace">{name}</text>
      </g>
    </g>
  );
}

/* ── Stat cards ─────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color, delay }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string; delay: string;
}) {
  return (
    <div style={{
      animation: `floatSC 4s ease-in-out infinite ${delay}`,
      background: "white", borderRadius: 14, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 12, minWidth: 162,
      border: "1px solid rgba(109,40,217,0.12)",
      boxShadow: "0 4px 18px rgba(109,40,217,0.09), 0 1px 4px rgba(0,0,0,0.05)",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: color+"18",
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px solid ${color}32`,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1e1b4b", lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 10, color: "rgba(30,27,75,0.48)", marginTop: 2 }}>{label}</div>
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
        minHeight: "100vh", display: "flex", overflow: "hidden", position: "relative",
        background: "linear-gradient(135deg, #faf8ff 0%, #fef4ff 55%, #f0f5ff 100%)",
      }}>
        {/* Grid */}
        <svg style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }}
          preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48,0 L0,0 0,48" fill="none" stroke="rgba(109,40,217,0.065)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        {/* Ambient blobs */}
        <div style={{ position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden" }}>
          <div style={{ position:"absolute",top:"-8%",left:"2%",width:440,height:440,
            background:"radial-gradient(circle,rgba(168,85,247,0.07) 0%,transparent 70%)",borderRadius:"50%" }} />
          <div style={{ position:"absolute",bottom:"-4%",right:"28%",width:340,height:340,
            background:"radial-gradient(circle,rgba(6,182,212,0.06) 0%,transparent 70%)",borderRadius:"50%" }} />
        </div>

        {/* ── LEFT PANEL ── */}
        <div className="hidden lg:flex" style={{
          flex:1, flexDirection:"column", alignItems:"center",
          justifyContent:"center", padding:"36px 24px", gap:20,
          display:"flex", position:"relative",
        }}>
          <div style={{ textAlign:"center", animation:"fadeUp 0.8s ease-out both" }}>
            <div style={{ fontSize:38,fontWeight:800,color:"#1e1b4b",letterSpacing:"-0.02em",lineHeight:1 }}>
              Lead<span style={{ color:"#7c3aed" }}>Genie</span> AI
            </div>
            <div style={{ fontSize:11,color:"rgba(30,27,75,0.42)",marginTop:7,
              letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"monospace" }}>
              AI-Powered SDR Platform
            </div>
          </div>

          <div style={{ width:"100%",maxWidth:490,animation:"fadeUp 0.8s ease-out 0.2s both" }}>
            <svg viewBox="0 0 480 380" style={{ width:"100%",height:"auto",overflow:"visible" }}>
              <defs>
                <filter id="ps" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="6" floodColor="rgba(109,40,217,0.10)" />
                </filter>
              </defs>

              {/* Pulse rings */}
              {[72,115,160].map((r,i) => (
                <circle key={r} cx="235" cy="200" r={r} fill={`rgba(139,92,246,${0.055-i*0.015})`}>
                  <animate attributeName="opacity"
                    values={`${0.055-i*0.015};${0.13-i*0.02};${0.055-i*0.015}`}
                    dur={`${2.5+i*0.5}s`} begin={`${i*0.5}s`} repeatCount="indefinite" />
                </circle>
              ))}

              <AttractionArcs />

              {/* Chart panels */}
              <BarPanel   cx={95}  cy={82}  fd="0s"   />
              <DonutPanel cx={382} cy={82}  fd="0.6s" />
              <LinePanel  cx={95}  cy={315} fd="1.2s" />
              <PiePanel   cx={382} cy={315} fd="0.3s" />
              <AreaPanel  cx={238} cy={42}  fd="0.9s" />

              {/* Lead bubbles */}
              {LEADS.map((l, i) => <LeadBubble key={i} {...l} />)}

              {/* Magnet — centered just above laptop */}
              <Magnet x={202} y={96} />

              {/* Laptop */}
              <Laptop x={171} y={162} />
            </svg>
          </div>

          <div style={{
            display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center",
            animation:"fadeUp 0.8s ease-out 0.4s both",
          }}>
            <StatCard icon={<Users size={16} color="#7c3aed" />}
              label="Leads Captured" value="247" sub="↑ 12% this week" color="#7c3aed" delay="0s" />
            <StatCard icon={<Zap size={16} color="#f59e0b" />}
              label="Meetings Booked" value="8" sub="↑ 3 vs last week" color="#f59e0b" delay="0.8s" />
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{
          width:"100%", maxWidth:420, display:"flex", alignItems:"center",
          justifyContent:"center", padding:"32px 24px", flexShrink:0,
        }}>
          <div style={{
            width:"100%", background:"white",
            border:"1px solid rgba(109,40,217,0.16)", borderRadius:24, padding:"40px 36px",
            boxShadow:"0 20px 60px rgba(109,40,217,0.13),0 4px 16px rgba(0,0,0,0.05)",
            animation:"fadeUp 0.8s ease-out 0.15s both",
          }}>
            {/* Logo */}
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",marginBottom:28 }}>
              <div style={{ position:"relative",marginBottom:14 }}>
                <img src="/bot-logo.png" alt="LeadGenie"
                  style={{ width:68,height:68,borderRadius:"50%",objectFit:"cover",
                    boxShadow:"0 0 22px rgba(109,40,217,0.32),0 0 0 2px rgba(109,40,217,0.22)" }} />
                <div style={{ position:"absolute",inset:-4,borderRadius:"50%",
                  border:"2px solid rgba(109,40,217,0.22)",
                  animation:"glowMag 2s ease-in-out infinite",pointerEvents:"none" }} />
              </div>
              <div style={{ fontSize:26,fontWeight:800,color:"#1e1b4b",letterSpacing:"-0.02em" }}>
                Lead<span style={{ color:"#7c3aed" }}>Genie</span>
              </div>
              <div style={{ fontSize:10,color:"rgba(30,27,75,0.38)",fontFamily:"monospace",
                letterSpacing:"0.15em",textTransform:"uppercase",marginTop:4 }}>
                AI-Powered SDR Platform
              </div>
            </div>

            <div style={{ fontSize:15,fontWeight:600,color:"#1e1b4b",marginBottom:4 }}>Welcome back</div>
            <div style={{ fontSize:12,color:"rgba(30,27,75,0.44)",marginBottom:22 }}>
              Sign in to your workspace
            </div>

            <form onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:14 }}>
              {(["Username","Password"] as const).map((field) => {
                const isPass = field === "Password";
                return (
                  <div key={field}>
                    <label style={{ display:"block",fontSize:10,fontFamily:"monospace",
                      letterSpacing:"0.1em",textTransform:"uppercase",
                      color:"rgba(30,27,75,0.48)",marginBottom:6 }}>{field}</label>
                    <div style={{ position:"relative" }}>
                      <input
                        type={isPass ? (showPassword ? "text" : "password") : "text"}
                        value={isPass ? password : username}
                        onChange={e => isPass ? setPassword(e.target.value) : setUsername(e.target.value)}
                        placeholder={isPass ? "••••••••" : "Enter your username"}
                        required autoComplete={isPass ? "current-password" : "username"}
                        autoFocus={!isPass}
                        style={{
                          width:"100%",padding:isPass?"11px 40px 11px 14px":"11px 14px",
                          boxSizing:"border-box",
                          background:"rgba(109,40,217,0.04)",
                          border:"1px solid rgba(109,40,217,0.18)",
                          borderRadius:10,fontSize:13,color:"#1e1b4b",outline:"none",
                          transition:"border-color 0.2s",
                        }}
                        onFocus={e => e.target.style.borderColor="rgba(109,40,217,0.55)"}
                        onBlur={e => e.target.style.borderColor="rgba(109,40,217,0.18)"}
                      />
                      {isPass && (
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowPassword(p => !p)}
                          style={{ position:"absolute",right:12,top:"50%",
                            transform:"translateY(-50%)",background:"none",
                            border:"none",cursor:"pointer",color:"rgba(30,27,75,0.35)",padding:0 }}>
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {error && (
                <div style={{ padding:"10px 14px",borderRadius:8,fontSize:12,
                  background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.22)",
                  color:"#dc2626",display:"flex",gap:8 }}>
                  <span>⚠</span><span>{error}</span>
                </div>
              )}

              <button type="submit"
                disabled={isLoading || !username.trim() || !password}
                style={{
                  width:"100%",padding:"12px",borderRadius:10,border:"none",
                  cursor:isLoading||!username.trim()||!password?"not-allowed":"pointer",
                  background:"linear-gradient(135deg,#6d28d9 0%,#7c3aed 100%)",
                  color:"#fff",fontSize:14,fontWeight:700,
                  opacity:isLoading||!username.trim()||!password?0.52:1,
                  transition:"opacity 0.2s",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                  boxShadow:"0 4px 20px rgba(109,40,217,0.28)",marginTop:4,
                }}>
                {isLoading ? <><Loader2 size={15} className="animate-spin" />Signing in…</> : "Sign in →"}
              </button>
            </form>

            {/* Role quick-fill */}
            <div style={{ marginTop:22,paddingTop:18,borderTop:"1px solid rgba(30,27,75,0.08)" }}>
              <div style={{ fontSize:10,color:"rgba(30,27,75,0.32)",fontFamily:"monospace",
                textAlign:"center",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.1em" }}>
                Demo — click role to fill
              </div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center" }}>
                {[
                  { role:"admin",     pass:"leadgenie123", c:"#7c3aed" },
                  { role:"sdr",       pass:"sdr123",       c:"#0891b2" },
                  { role:"developer", pass:"dev123",       c:"#059669" },
                  { role:"manager",   pass:"manager123",   c:"#d97706" },
                ].map(({ role, pass, c }) => (
                  <button key={role} type="button"
                    onClick={() => { setUsername(role); setPassword(pass); }}
                    style={{ padding:"4px 10px",borderRadius:20,border:`1px solid ${c}30`,
                      background:c+"0e",color:c,fontSize:10,fontFamily:"monospace",
                      cursor:"pointer",fontWeight:600 }}>
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ position:"absolute",bottom:14,right:22,
            fontSize:9,color:"rgba(30,27,75,0.22)",fontFamily:"monospace" }}>
            LeadGenie AI · v0.1 · Governed SDR Platform
          </div>
        </div>
      </div>
    </>
  );
}
