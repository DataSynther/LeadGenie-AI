import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Topbar } from "../components/layout/Topbar";
import { OnePagerDetail, type DetailTab } from "../components/kyc/OnePagerDetail";
import { api } from "../lib/api";

export function KYCOnePagerDetailPage() {
  const { onepagerId } = useParams<{ onepagerId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab") as DetailTab | null;

  const { data: record, isLoading, isError } = useQuery({
    queryKey: ["kycOnepager", onepagerId],
    queryFn: () => api.getKycOnepager(onepagerId!),
    enabled: !!onepagerId,
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Topbar
        breadcrumb="Know Your Customer / Briefing"
        title={record ? record.company_name : "Briefing"}
        right={
          <button
            onClick={() => navigate("/kyc")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line-soft text-[11px] font-medium text-ink-2 hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <ArrowLeft size={12} /> All briefings
          </button>
        }
      />

      <div className="flex-1 p-4 sm:p-8 max-w-3xl mx-auto w-full">
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-ink-mute gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading briefing…
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
            <AlertTriangle size={20} className="text-danger" />
            <div className="text-[13px] text-ink-2">
              Couldn't load this briefing. It may have been removed.
            </div>
            <button
              onClick={() => navigate("/kyc")}
              className="mt-2 text-[12px] text-brand hover:underline"
            >
              Back to Know Your Customer
            </button>
          </div>
        )}

        {record && <OnePagerDetail record={record} initialTab={tabParam ?? "overview"} />}
      </div>
    </div>
  );
}
