import { useState } from "react";
import { X } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { cn } from "../lib/utils";

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <div className="mb-7">
      <label className="label-mono mb-2 block">{label}</label>
      {children}
    </div>
  );
}

function ChipInput({ chips, onRemove }: { chips: string[]; onRemove: (chip: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 bg-surface border border-line rounded-md p-2 min-h-[42px] items-center">
      {chips.map((chip) => (
        <span key={chip} className="bg-brand-soft text-brand px-2 py-0.5 rounded text-[11px] font-medium flex gap-1.5 items-center">
          {chip}
          <X
            size={12}
            className="opacity-60 hover:opacity-100 cursor-pointer"
            onClick={() => onRemove(chip)}
          />
        </span>
      ))}
    </div>
  );
}

function SeqStep({ n, channel, delay, desc }: { n: number; channel: "email" | "linkedin" | "whatsapp"; delay: string; desc: string }) {
  const channelStyles = {
    email: "bg-info-tint text-info",
    linkedin: "bg-magenta/15 text-magenta-dark",
    whatsapp: "bg-gold-tint text-gold-dark",
  };
  const channelLabel = { email: "Email", linkedin: "LinkedIn", whatsapp: "WhatsApp" };

  return (
    <div className="grid grid-cols-[50px_1fr] gap-4 p-4 bg-surface-2 border border-line-soft rounded-lg mb-2.5">
      <div className="font-serif text-[32px] text-brand leading-none">{n}</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2.5 items-center">
          <span className={cn(
            "font-mono text-[10px] uppercase tracking-[0.08em] px-1.5 py-0.5 rounded font-semibold",
            channelStyles[channel]
          )}>
            {channelLabel[channel]}
          </span>
          <span className="font-mono text-[11px] text-ink-mute">{delay}</span>
        </div>
        <div className="text-xs text-ink-2">{desc}</div>
      </div>
    </div>
  );
}

export function CampaignsPage() {
  const [industry, setIndustry] = useState(["SaaS", "FinTech", "DevTools", "Data Infrastructure"]);
  const [funding, setFunding] = useState(["Series A", "Series B", "Series C"]);
  const [tech, setTech] = useState(["Snowflake", "dbt", "Airflow"]);
  const [roles, setRoles] = useState(["VP Data", "Head of Analytics", "Director, Data Eng"]);

  function remove(setter: React.Dispatch<React.SetStateAction<string[]>>, chip: string) {
    setter((prev) => prev.filter((c) => c !== chip));
  }

  return (
    <>
      <Topbar
        breadcrumb="Workspace / Campaigns / New"
        title={<>Campaign <span className="text-brand font-semibold">Studio</span></>}
        right={
          <>
            <button className="btn-ghost">Save Draft</button>
            <button className="btn-primary">Activate Campaign</button>
          </>
        }
      />

      <div className="p-8 pb-20">
        <div className="card-base mb-5">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="text-display-md font-semibold text-ink">
              Ideal <span className="text-brand">Customer Profile</span>
            </div>
            <div className="label-mono">Step 1 of 3</div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-2 gap-6">
              <FormField label="Campaign Name">
                <input
                  defaultValue="Q2 — Data Infra Leaders, Series A+"
                  className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px] focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
                />
              </FormField>
              <FormField label="Target Region">
                <select className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px]">
                  <option>North America + EU</option>
                  <option>APAC</option>
                  <option>Global</option>
                </select>
              </FormField>
              <FormField label="Industry">
                <ChipInput chips={industry} onRemove={(c) => remove(setIndustry, c)} />
              </FormField>
              <FormField label="Company Size">
                <select className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px]">
                  <option>50 — 500 employees</option>
                  <option>500 — 2000 employees</option>
                  <option>2000+ employees</option>
                </select>
              </FormField>
              <FormField label="Funding Stage">
                <ChipInput chips={funding} onRemove={(c) => remove(setFunding, c)} />
              </FormField>
              <FormField label="Tech Stack Signals">
                <ChipInput chips={tech} onRemove={(c) => remove(setTech, c)} />
              </FormField>
              <FormField label="Target Roles">
                <ChipInput chips={roles} onRemove={(c) => remove(setRoles, c)} />
              </FormField>
              <FormField label="Brand Voice">
                <select className="w-full bg-surface border border-line text-ink px-3 py-2.5 rounded-md text-[13px]">
                  <option>Professional · Consultative</option>
                  <option>Friendly · Conversational</option>
                  <option>Bold · Direct</option>
                </select>
              </FormField>
            </div>
          </div>
        </div>

        <div className="card-base">
          <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
            <div className="text-display-md font-semibold text-ink">
              Outreach <span className="text-brand">Sequence</span>
            </div>
            <div className="label-mono">Step 2 of 3 · 14 day cadence</div>
          </div>
          <div className="p-5">
            <SeqStep n={1} channel="email" delay="Day 0 · 9:00am local" desc="First touch — personalized using research signals + role-specific pain points" />
            <SeqStep n={2} channel="linkedin" delay="Day 3 · Connection request + note" desc="Soft cross-channel touch, referencing the email — no hard sell" />
            <SeqStep n={3} channel="email" delay="Day 6 · Follow-up" desc="Reference any new signals (funding, hiring, product launches) since first touch" />
            <SeqStep n={4} channel="whatsapp" delay="Day 10 · Only if double-opted" desc="Short, direct — explicitly opt-in based for regions where WhatsApp is acceptable" />
            <SeqStep n={5} channel="email" delay="Day 14 · Breakup" desc="Final touch — graceful close with door left open" />
          </div>
        </div>
      </div>
    </>
  );
}
