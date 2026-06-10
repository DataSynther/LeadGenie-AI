import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { cn } from "../lib/utils";
import { Topbar } from "../components/layout/Topbar";
import {
  api,
  type QuidditchRun,
  type QuidditchMetrics,
} from "../lib/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    icon: "🐦",
    badge: "Fast · Cheap",
    desc: "Great for quick iteration. Quality noticeable step below Sonnet.",
    color: "sky",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    icon: "🎵",
    badge: "Balanced",
    desc: "Production quality. Best cost/quality ratio for outreach.",
    color: "amber",
  },
  {
    id: "claude-opus-4-7",
    label: "Opus 4.7",
    icon: "🔮",
    badge: "Premium · Slow",
    desc: "Highest quality. ~5× more expensive than Sonnet.",
    color: "violet",
  },
];

const HUMAN_METRICS = [
  { key: "relevance",       label: "Relevance",       desc: "Relevant to the lead and their context?" },
  { key: "tone",            label: "Tone",             desc: "Appropriate and professional tone?" },
  { key: "personalization", label: "Personalization",  desc: "Well tailored to this specific prospect?" },
  { key: "clarity",         label: "Clarity",          desc: "Clear, concise, no fluff?" },
];

const NIMBUS_MESSAGES = [
  "Your Nimbus 2000 is airborne…",
  "Casting Wingardium Leviosa…",
  "The Golden Snitch has been spotted…",
  "Summoning your email owl…",
  "Consulting the Sorting Hat…",
  "Polishing the broomstick…",
];

const DEFAULT_PROMPT = `Write a personalised B2B outreach email for a VP of Sales at a mid-size SaaS company in the fintech space. The email should:
- Reference their pain point of manual sales reporting
- Introduce Ganit's AI-powered analytics platform
- Include a specific, low-friction CTA

Keep it under 150 words, professional but warm in tone.`;

// ── Nimbus Loading Animation ──────────────────────────────────────────────────

function NimbusLoader() {
  const msg = NIMBUS_MESSAGES[Math.floor(Math.random() * NIMBUS_MESSAGES.length)];
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6">
      <style>{`
        @keyframes snitchOrbit {
          0%   { transform: rotate(0deg)   translateX(36px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(36px) rotate(-360deg); }
        }
        @keyframes snitchPulse {
          0%, 100% { box-shadow: 0 0 0 0   rgba(251,191,36,0.6); transform: scale(1); }
          50%       { box-shadow: 0 0 0 14px rgba(251,191,36,0);   transform: scale(1.06); }
        }
        @keyframes wingFlap {
          0%, 100% { transform: scaleY(1) rotate(-20deg); }
          50%       { transform: scaleY(-0.4) rotate(-20deg); }
        }
      `}</style>

      <div className="relative w-24 h-24 flex items-center justify-center">
        {/* Central golden snitch */}
        <div
          className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-xl z-10 relative"
          style={{ animation: "snitchPulse 1.5s ease-in-out infinite" }}
        >
          ✨
        </div>

        {/* Left wing */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-3 bg-amber-300/30 border border-amber-400/50 rounded-full origin-right"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite" }}
        />
        {/* Right wing */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-3 bg-amber-300/30 border border-amber-400/50 rounded-full origin-left"
          style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.2s" }}
        />

        {/* Orbiting broomstick */}
        <div
          className="absolute text-base"
          style={{ animation: "snitchOrbit 1.4s linear infinite" }}
        >
          🧹
        </div>
      </div>

      <div className="text-center space-y-1.5">
        <div className="text-amber-400 font-semibold text-sm tracking-wide">{msg}</div>
        <div className="text-ink-mute text-[11px] font-mono">
          The match is in progress — Claude is on the field
        </div>
      </div>
    </div>
  );
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  icon, label, value, unit = "", good, sub,
}: {
  icon: string;
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  good?: boolean;
  sub?: string;
}) {
  if (value === null || value === undefined) return null;
  const displayValue = typeof value === "number" ? value.toFixed(3) : value;
  const colorClass =
    good === undefined ? "text-ink" :
    good ? "text-emerald-400" : "text-red-400";

  return (
    <div className="rounded-lg border border-line-soft bg-surface-2 p-3.5 min-w-[100px]">
      <div className="text-[10px] text-ink-mute font-mono mb-1.5">{icon} {label}</div>
      <div className={cn("text-base font-bold font-mono", colorClass)}>
        {displayValue}{unit}
      </div>
      {sub && <div className="text-[10px] text-ink-mute mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Match Stats ───────────────────────────────────────────────────────────────

function MatchStats({ m, modelDisplay, promptName }: {
  m: QuidditchMetrics;
  modelDisplay: string;
  promptName: string;
}) {
  return (
    <div className="rounded-[10px] border border-line-soft bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🏆</span>
        <div>
          <div className="text-sm font-semibold text-ink">Match Stats</div>
          <div className="text-[11px] text-ink-mute">{modelDisplay} · {promptName}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <MetricCard icon="⚡" label="Latency" value={m.latency_s} unit="s" good={m.latency_s < 15} />
        <MetricCard icon="💰" label="Cost"    value={`$${m.cost_usd.toFixed(5)}`} good={m.cost_usd < 0.05} />
        <MetricCard icon="📥" label="In tokens"  value={m.input_tokens}  good={undefined} />
        <MetricCard icon="📤" label="Out tokens" value={m.output_tokens} good={undefined} />
        {m.self_eval_confidence !== undefined && (
          <MetricCard icon="🧠" label="Self-eval" value={m.self_eval_confidence}
            good={m.self_eval_confidence >= 0.7}
            sub={m.self_eval_explanation ? `"${m.self_eval_explanation.slice(0, 50)}…"` : undefined} />
        )}
        {m.hallucination_confidence !== undefined && (
          <MetricCard icon="🔍" label="Anti-halluc" value={m.hallucination_confidence}
            good={m.hallucination_passed !== false} />
        )}
        {m.retrieval_score !== undefined && (
          <MetricCard icon="🎯" label="Retrieval" value={m.retrieval_score}
            good={m.retrieval_score >= 0.55} />
        )}
        {m.semantic_sim_gt !== undefined && (
          <MetricCard icon="🔮" label="Sem·Sim GT" value={m.semantic_sim_gt}
            good={m.semantic_sim_gt >= 0.6}
            sub="vs ground truth" />
        )}
        {m.bleu1_gt !== undefined && (
          <MetricCard icon="📊" label="BLEU-1 GT" value={m.bleu1_gt}
            good={m.bleu1_gt >= 0.3}
            sub="unigram overlap" />
        )}
        {m.tone_passed !== undefined && (
          <MetricCard icon="🎭" label="Tone" value={m.tone_passed ? "Pass" : "Fail"}
            good={m.tone_passed} />
        )}
      </div>

      {m.hallucination_violations && m.hallucination_violations.length > 0 && (
        <div className="mt-3 p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 space-y-1">
          <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest">
            ⚠ Hallucination Flags
          </div>
          {m.hallucination_violations.map((v, i) => (
            <div key={i} className="text-xs text-ink-mute">· {v}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Human Judge ───────────────────────────────────────────────────────────────

function HumanJudge({ runId, initialScores }: {
  runId: string;
  initialScores: Record<string, number>;
}) {
  const qc = useQueryClient();
  const [scores, setScores] = useState<Record<string, number>>(
    Object.fromEntries(HUMAN_METRICS.map(m => [m.key, initialScores[m.key] ?? 0.5]))
  );
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (s: Record<string, number>) => api.quidditchSaveHumanScores(runId, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quidditchHistory"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const avg = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

  return (
    <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">👁</span>
          <div>
            <div className="text-sm font-semibold text-amber-400">Human Judge</div>
            <div className="text-[11px] text-ink-mute">Score each dimension 0–1 as a human evaluator</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-mute">Overall</div>
          <div className="text-lg font-bold font-mono text-amber-400">{avg.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {HUMAN_METRICS.map(m => (
          <div key={m.key} className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-ink">{m.label}</span>
              <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                {scores[m.key].toFixed(2)}
              </span>
            </div>
            <input
              type="range" min="0" max="1" step="0.05"
              value={scores[m.key]}
              onChange={e => setScores(s => ({ ...s, [m.key]: parseFloat(e.target.value) }))}
              className="w-full h-1.5 accent-amber-400 cursor-pointer"
            />
            <div className="text-[10px] text-ink-mute">{m.desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={() => save.mutate(scores)}
        disabled={save.isPending}
        className={cn(
          "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
          saved
            ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
            : "bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30"
        )}
      >
        {saved ? "✓ Saved!" : save.isPending ? "Saving…" : "💾 Save Scores"}
      </button>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────────────────────────────

function ResultPanel({ run }: { run: QuidditchRun }) {
  const m = run.metrics;

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center gap-2 text-amber-400">
        <div className="flex-1 h-px bg-amber-500/20" />
        <span className="text-[11px] font-mono uppercase tracking-widest">Match Results</span>
        <div className="flex-1 h-px bg-amber-500/20" />
      </div>

      <MatchStats m={m} modelDisplay={run.model_display} promptName={run.prompt_name} />

      {/* Generated email */}
      <div className="rounded-[10px] border border-line-soft bg-surface p-5">
        <div className="flex items-center gap-2 mb-3">
          <span>🦉</span>
          <div className="text-sm font-semibold text-ink">Generated Email</div>
          <span className="text-[10px] font-mono text-ink-mute ml-auto">
            {run.generated_text.split(/\s+/).length} words
          </span>
        </div>
        <pre className="whitespace-pre-wrap text-[12px] text-ink-mute font-mono bg-surface-2 rounded-lg p-3.5 max-h-72 overflow-y-auto leading-relaxed">
          {run.generated_text}
        </pre>
      </div>

      {/* Side-by-side comparison if GT present */}
      {run.ground_truth && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="text-xs font-semibold text-emerald-400 mb-2.5 flex items-center gap-1.5">
              🏆 Ground Truth
            </div>
            <pre className="whitespace-pre-wrap text-[11px] text-ink-mute font-mono max-h-44 overflow-y-auto leading-relaxed">
              {run.ground_truth}
            </pre>
          </div>
          <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="text-xs font-semibold text-amber-400 mb-2.5 flex items-center gap-1.5">
              🧹 Generated
              {m.semantic_sim_gt !== undefined && (
                <span className={cn(
                  "ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded",
                  m.semantic_sim_gt >= 0.6 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                  sim {m.semantic_sim_gt.toFixed(3)}
                </span>
              )}
            </div>
            <pre className="whitespace-pre-wrap text-[11px] text-ink-mute font-mono max-h-44 overflow-y-auto leading-relaxed">
              {run.generated_text}
            </pre>
          </div>
        </div>
      )}

      <HumanJudge runId={run.run_id} initialScores={run.human_scores} />
    </div>
  );
}

// ── Season Record (Trend Charts) ──────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "#0f0f1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 11,
  color: "#c8c8d8",
};

function SeasonRecord({ history }: { history: QuidditchRun[] }) {
  if (history.length < 2) return null;

  const data = [...history].reverse().map((r, i) => {
    const hs = r.human_scores ?? {};
    const hsVals = Object.values(hs) as number[];
    return {
      name:       `#${i + 1}`,
      fullName:   `${r.prompt_name} (${r.model_display})`,
      model:      r.model_display,
      latency:    r.metrics.latency_s,
      cost_m:     parseFloat((r.metrics.cost_usd * 1000).toFixed(4)),
      self_eval:  r.metrics.self_eval_confidence,
      sem_gt:     r.metrics.semantic_sim_gt,
      bleu1:      r.metrics.bleu1_gt,
      human_avg:  hsVals.length > 0
        ? parseFloat((hsVals.reduce((a, b) => a + b, 0) / hsVals.length).toFixed(3))
        : undefined,
    };
  });

  return (
    <div className="rounded-[10px] border border-line-soft bg-surface p-5 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📈</span>
        <div>
          <div className="text-sm font-semibold text-ink">Season Record</div>
          <div className="text-[11px] text-ink-mute">
            {history.length} matches — performance trends across prompt × model combos
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Latency */}
        <div>
          <div className="text-[11px] text-ink-mute font-mono mb-3">⚡ Latency (seconds)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} unit="s" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}s`, "Latency"]} />
              <Line type="monotone" dataKey="latency" stroke="#f59e0b" strokeWidth={2}
                dot={{ r: 3, fill: "#f59e0b", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Cost */}
        <div>
          <div className="text-[11px] text-ink-mute font-mono mb-3">💰 Cost (milli-$)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} unit="m$" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}m$`, "Cost"]} />
              <Line type="monotone" dataKey="cost_m" stroke="#10b981" strokeWidth={2}
                dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Quality scores */}
        <div>
          <div className="text-[11px] text-ink-mute font-mono mb-3">🧠 Quality Scores (0–1)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#9ca3af" }} />
              <Line type="monotone" dataKey="self_eval" name="Self-eval" stroke="#8b5cf6"
                strokeWidth={2} dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }} connectNulls />
              <Line type="monotone" dataKey="sem_gt" name="Sem·Sim GT" stroke="#06b6d4"
                strokeWidth={2} dot={{ r: 3, fill: "#06b6d4", strokeWidth: 0 }} connectNulls />
              <Line type="monotone" dataKey="bleu1" name="BLEU-1" stroke="#f97316"
                strokeWidth={2} dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Human judge avg */}
        <div>
          <div className="text-[11px] text-ink-mute font-mono mb-3">👁 Human Judge Average (0–1)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [typeof v === "number" ? v.toFixed(3) : v, "Human avg"]} />
              <Line type="monotone" dataKey="human_avg" name="Human avg" stroke="#f59e0b"
                strokeWidth={2} dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Match History List ────────────────────────────────────────────────────────

const MODEL_ICON: Record<string, string> = {
  "Haiku 4.5":  "🐦",
  "Sonnet 4.6": "🎵",
  "Opus 4.7":   "🔮",
};

function HistoryList({
  history,
  onSelect,
}: {
  history: QuidditchRun[];
  onSelect: (r: QuidditchRun) => void;
}) {
  if (!history.length) return null;
  return (
    <div className="rounded-[10px] border border-line-soft bg-surface p-5">
      <div className="flex items-center gap-2 mb-4">
        <span>📜</span>
        <div className="text-sm font-semibold text-ink">Match History</div>
        <span className="ml-auto text-[10px] text-ink-mute font-mono">{history.length} runs</span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {history.map(r => (
          <button
            key={r.run_id}
            onClick={() => onSelect(r)}
            className="w-full flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2.5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-colors text-left"
          >
            <span className="text-base">{MODEL_ICON[r.model_display] ?? "⚡"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-ink font-semibold truncate">{r.prompt_name}</div>
              <div className="text-[10px] text-ink-mute">
                {r.model_display} · {r.ts.slice(0, 16).replace("T", " ")} UTC
              </div>
            </div>
            <div className="flex gap-2.5 shrink-0">
              <span className="font-mono text-[10px] text-amber-400">{r.metrics.latency_s}s</span>
              {r.metrics.semantic_sim_gt !== undefined && (
                <span className={cn(
                  "font-mono text-[10px]",
                  r.metrics.semantic_sim_gt >= 0.6 ? "text-emerald-400" : "text-red-400"
                )}>
                  sim {r.metrics.semantic_sim_gt.toFixed(2)}
                </span>
              )}
              {r.metrics.self_eval_confidence !== undefined && (
                <span className="font-mono text-[10px] text-violet-400">
                  eval {r.metrics.self_eval_confidence.toFixed(2)}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function QuidditchPage() {
  const navigate    = useNavigate();
  const qc          = useQueryClient();

  const [tab,            setTab]           = useState<"ground-truth" | "prompt-lab">("ground-truth");
  const [groundTruth,    setGroundTruth]   = useState("");
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT);
  const [selectedModel,  setSelectedModel] = useState("claude-sonnet-4-6");
  const [promptName,     setPromptName]    = useState("");
  const [result,         setResult]        = useState<QuidditchRun | null>(null);
  const [isRunning,      setIsRunning]     = useState(false);
  const [error,          setError]         = useState<string | null>(null);

  const { data: history = [] } = useQuery<QuidditchRun[]>({
    queryKey: ["quidditchHistory"],
    queryFn: api.quidditchHistory,
    refetchInterval: 30_000,
  });

  const fly = async () => {
    if (!promptTemplate.trim()) return;
    setIsRunning(true);
    setError(null);
    try {
      const run = await api.quidditchRun({
        prompt_template: promptTemplate,
        model: selectedModel,
        ground_truth: groundTruth,
        prompt_name:
          promptName.trim() || `run-${new Date().toISOString().slice(11, 19)}`,
      });
      setResult(run);
      qc.invalidateQueries({ queryKey: ["quidditchHistory"] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Run failed — check backend logs");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Topbar breadcrumb="Observability" title="Quidditch" />

      {/* ── Hero header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-line-soft">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-2xl">
              🏟️
            </div>
            <div>
              <h1 className="text-xl font-bold text-ink flex items-center gap-2.5">
                Quidditch
                <span className="text-[11px] font-mono font-normal text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 tracking-wide">
                  Prompt Lab
                </span>
              </h1>
              <p className="text-[12px] text-ink-mute mt-0.5">
                Test prompt × model combos · Score vs ground truth · Find your Nimbus 2000
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate("/prompt-versions")}
            className="text-[11px] text-ink-mute hover:text-amber-400 transition-colors flex items-center gap-1 shrink-0"
          >
            ← Prompt Versions
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-7xl mx-auto w-full space-y-5">

        {/* ── Tab bar ── */}
        <div className="flex gap-1 p-1 bg-surface-2 rounded-lg border border-line-soft w-fit">
          {[
            { id: "ground-truth", icon: "🏆", label: "Ground Truth" },
            { id: "prompt-lab",   icon: "🧹", label: "Prompt Lab"   },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "px-4 py-1.5 rounded text-xs font-semibold transition-colors flex items-center gap-1.5",
                tab === t.id
                  ? "bg-amber-500/20 border border-amber-500/30 text-amber-400"
                  : "text-ink-mute hover:text-ink"
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Ground Truth tab ── */}
        {tab === "ground-truth" && (
          <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🏆</span>
              <div>
                <div className="text-sm font-semibold text-emerald-400">Reference / Ground Truth Email</div>
                <div className="text-[11px] text-ink-mute">
                  Paste the ideal outreach email. Generated emails will be scored against this target.
                </div>
              </div>
            </div>
            <textarea
              value={groundTruth}
              onChange={e => setGroundTruth(e.target.value)}
              placeholder={
                "Paste your ground truth / ideal outreach email here…\n\nSubject: …\n\nHi [Name],\n…"
              }
              rows={13}
              className="w-full bg-surface border border-line-soft rounded-lg px-3.5 py-2.5 text-xs text-ink font-mono placeholder:text-ink-mute resize-y focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            <div className="flex items-center justify-between text-[10px] text-ink-mute">
              <span>
                {groundTruth
                  ? `${groundTruth.split(/\s+/).filter(Boolean).length} words · BLEU-1 and Semantic Similarity will appear in results`
                  : "Leave empty to skip GT comparison — retrieval, tone, and self-eval still run"}
              </span>
              {groundTruth && (
                <button
                  onClick={() => setGroundTruth("")}
                  className="text-red-400/60 hover:text-red-400 transition-colors"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Prompt Lab tab ── */}
        {tab === "prompt-lab" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
            {/* Left: prompt editor */}
            <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧹</span>
                <div>
                  <div className="text-sm font-semibold text-amber-400">Prompt Template</div>
                  <div className="text-[11px] text-ink-mute">
                    Full prompt sent directly to the model — no hidden system prompt.
                  </div>
                </div>
              </div>
              <textarea
                value={promptTemplate}
                onChange={e => setPromptTemplate(e.target.value)}
                rows={17}
                className="w-full bg-surface border border-line-soft rounded-lg px-3.5 py-2.5 text-xs text-ink font-mono placeholder:text-ink-mute resize-y focus:outline-none focus:border-amber-500/50 transition-colors"
              />
              <div className="text-[10px] text-ink-mute">
                {promptTemplate.split(/\s+/).filter(Boolean).length} words ·{" "}
                ~{Math.round(promptTemplate.length / 4)} est. input tokens
              </div>
            </div>

            {/* Right: model + controls */}
            <div className="space-y-3">
              {/* Model picker */}
              <div className="rounded-[10px] border border-line-soft bg-surface p-4 space-y-2.5">
                <div className="text-xs font-semibold text-ink mb-1">⚡ Model</div>
                {MODELS.map(m => (
                  <label
                    key={m.id}
                    className={cn(
                      "flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors",
                      selectedModel === m.id
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-line-soft hover:border-amber-500/20 hover:bg-amber-500/5"
                    )}
                  >
                    <input
                      type="radio" name="model" value={m.id}
                      checked={selectedModel === m.id}
                      onChange={() => setSelectedModel(m.id)}
                      className="mt-0.5 accent-amber-400 shrink-0"
                    />
                    <div>
                      <div className="text-xs font-semibold text-ink leading-tight">
                        {m.icon} {m.label}
                        <span className="ml-1.5 text-[9px] font-mono text-ink-mute bg-surface-2 px-1 py-0.5 rounded">
                          {m.badge}
                        </span>
                      </div>
                      <div className="text-[10px] text-ink-mute mt-0.5 leading-relaxed">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Prompt name */}
              <div className="rounded-[10px] border border-line-soft bg-surface p-4 space-y-2">
                <div className="text-xs font-semibold text-ink">📋 Run Label</div>
                <input
                  type="text"
                  value={promptName}
                  onChange={e => setPromptName(e.target.value)}
                  placeholder="e.g. v2-shorter-cta, haiku-test"
                  className="w-full bg-surface-2 border border-line-soft rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-mute focus:outline-none focus:border-amber-500/50 transition-colors"
                />
              </div>

              {/* Fly button */}
              <button
                onClick={fly}
                disabled={isRunning || !promptTemplate.trim()}
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
                  isRunning || !promptTemplate.trim()
                    ? "bg-surface-2 border border-line-soft text-ink-mute cursor-not-allowed"
                    : "bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/25 active:scale-[0.98]"
                )}
              >
                {isRunning ? (
                  <>🧹 Flying…</>
                ) : (
                  <>▶ FLY! Generate</>
                )}
              </button>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  ⚠ {error}
                </div>
              )}

              {/* Quick tips */}
              <div className="rounded-lg border border-line-soft bg-surface-2 p-3 space-y-1.5">
                <div className="text-[10px] font-mono text-ink-mute uppercase tracking-widest">Tips</div>
                {[
                  "Set Ground Truth first for GT metrics",
                  "Haiku → iterate fast, Sonnet → validate",
                  "Label runs to track experiments in history",
                  "Human Judge scores are saved per run",
                ].map((tip, i) => (
                  <div key={i} className="text-[10px] text-ink-mute">· {tip}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Loading animation ── */}
        {isRunning && (
          <div className="rounded-[10px] border border-amber-500/20 bg-amber-500/5">
            <NimbusLoader />
          </div>
        )}

        {/* ── Result panel ── */}
        {!isRunning && result && <ResultPanel run={result} />}

        {/* ── Season Record ── */}
        {history.length >= 2 && <SeasonRecord history={history} />}

        {/* ── Match history ── */}
        <HistoryList history={history} onSelect={r => { setResult(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} />

        {history.length === 0 && !isRunning && !result && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <span className="text-5xl">🏟️</span>
            <div className="text-sm font-semibold text-ink">The pitch is empty</div>
            <div className="text-[12px] text-ink-mute max-w-xs">
              Set a ground truth, write your prompt, pick a model, then hit{" "}
              <span className="text-amber-400 font-semibold">FLY!</span> to run your first match.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
