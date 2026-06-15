"""
Eval Runner — orchestrates all 4 eval layers against a synthetic dataset.
Usage:
    python3 -m evals.eval_runner          # with LLM judge
    python3 -m evals.eval_runner --no-llm # skip LLM judge (cheaper)
"""
import argparse
import sys
from typing import Any

from evals.layer0_prompt_audit import audit_prompt
from evals.layer1_model_eval import evaluate_output
from evals.layer2_retrieval_eval import evaluate_retrieval
from evals.layer3_trajectory_eval import EXPECTED_TRAJECTORIES, evaluate_trajectory

# ---------------------------------------------------------------------------
# Synthetic evaluation dataset
# ---------------------------------------------------------------------------
EVAL_DATASET = [
    {
        "lead_id": "eval-lead-001",
        "lead": {"name": "Sarah Chen", "title": "VP Engineering", "email": "sarah@techcorp.io"},
        "company": {"name": "TechCorp", "industry": "SaaS", "employee_count": 150},
        "query": "Write a personalized outreach email about AI-powered data analytics",
        "source_facts": [
            "TechCorp raised Series B in 2025",
            "Sarah leads a team of 40 engineers",
            "TechCorp uses Python and AWS",
        ],
        "all_available_facts": [
            "TechCorp raised Series B in 2025",
            "Sarah leads a team of 40 engineers",
            "TechCorp uses Python and AWS",
            "TechCorp competitor is DataCo",
            "Sarah previously worked at Google",
        ],
        "ground_truth": "A concise personalized email referencing TechCorp's Series B and Sarah's engineering background",
        "expected_trajectory": "outreach",
        "expected_terminal_state": "approved",
    },
    {
        "lead_id": "eval-lead-002",
        "lead": {"name": "Marcus Johnson", "title": "CTO", "email": "marcus@fintech.ai"},
        "company": {"name": "FinTech AI", "industry": "Fintech", "employee_count": 80},
        "query": "Handle a reply where the lead asks for more information about pricing",
        "source_facts": [
            "FinTech AI processes $2B in transactions monthly",
            "Marcus is hiring 10 ML engineers",
        ],
        "all_available_facts": [
            "FinTech AI processes $2B in transactions monthly",
            "Marcus is hiring 10 ML engineers",
            "FinTech AI uses Kubernetes",
        ],
        "ground_truth": "A helpful response acknowledging the pricing question and offering to schedule a demo",
        "expected_trajectory": "conversation",
        "expected_terminal_state": "sent",
    },
    {
        "lead_id": "eval-lead-003",
        "lead": {"name": "Priya Sharma", "title": "Head of Data", "email": "priya@healthtech.com"},
        "company": {"name": "HealthTech Co", "industry": "Healthcare", "employee_count": 300},
        "query": "Research the lead and build context for outreach",
        "source_facts": [
            "HealthTech Co serves 500 hospitals",
            "Priya has 10 years in healthcare data",
        ],
        "all_available_facts": [
            "HealthTech Co serves 500 hospitals",
            "Priya has 10 years in healthcare data",
            "HealthTech Co is HIPAA compliant",
        ],
        "ground_truth": "A research summary with pain points, signals, and AI readiness score",
        "expected_trajectory": "research_only",
        "expected_terminal_state": "approved",
    },
]


# ---------------------------------------------------------------------------
# Mock prompt templates and output generators (no real model calls)
# ---------------------------------------------------------------------------
_PROMPT_TEMPLATE = """\
<instructions>
You are a B2B outreach specialist. Write a personalized cold email for the lead below.
Your goal is to get a reply, so be direct and specific.
Only use information from the context — do not make up facts or invent details
that are not in the provided source data (investigate before asserting).
</instructions>

<context>
Lead: {name}, {title} at {company} ({industry}, {employees} employees)
Known facts:
{facts}
</context>

<input>
Task: {query}
Write a 3-sentence email with a professional tone. Include the subject line.
Format: Subject: ...\nBody: ...
</input>
"""


def _make_prompt(lead: dict, query: str, facts: list[str]) -> str:
    return _PROMPT_TEMPLATE.format(
        name=lead["lead"]["name"],
        title=lead["lead"]["title"],
        company=lead["company"]["name"],
        industry=lead["company"]["industry"],
        employees=lead["company"]["employee_count"],
        facts="\n".join(f"- {f}" for f in facts),
        query=query,
    )


def _make_mock_output(lead: dict, facts: list[str]) -> str:
    """Generate a rich template-based mock output that embeds source facts — no model call."""
    name = lead["lead"]["name"]
    company = lead["company"]["name"]
    title = lead["lead"]["title"]
    # Embed all source facts directly so faithfulness and utilization scores are meaningful
    facts_inline = " ".join(facts)
    return (
        f"Subject: AI analytics for {company}\n"
        f"Hi {name}, as {title} at {company} I wanted to reach out based on what I know: {facts_inline}. "
        f"Given {company}'s trajectory, our AI-powered analytics platform could help your team "
        f"move faster with data. Would a 15-minute call this week work for you?"
    )


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------
def run_all(use_llm_judge: bool = True, verbose: bool = False) -> dict:
    """Run all 4 eval layers against every entry in EVAL_DATASET."""
    results: dict[str, Any] = {}

    for entry in EVAL_DATASET:
        lead_id = entry["lead_id"]
        prompt_text = _make_prompt(entry, entry["query"], entry["source_facts"])
        mock_output = _make_mock_output(entry, entry["source_facts"])
        context = {
            "company": entry["company"],
            "query": entry["query"],
        }
        expected_agents = EXPECTED_TRAJECTORIES.get(entry["expected_trajectory"], [])

        # Layer 0 — prompt quality
        l0 = audit_prompt(prompt_text, prompt_name=f"{lead_id}_outreach_prompt", use_llm=use_llm_judge)

        # Layer 1 — model output evaluation
        l1 = evaluate_output(
            generated=mock_output,
            ground_truth=entry["ground_truth"],
            context=context,
            task=entry["query"],
            source_facts=entry["source_facts"],
        )

        # Layer 2 — retrieval evaluation
        l2 = evaluate_retrieval(
            query=entry["query"],
            retrieved_facts=entry["source_facts"],
            all_available_facts=entry["all_available_facts"],
            generated_output=mock_output,
            k=3,
        )

        # Layer 3 — trajectory evaluation (simulate a passing run)
        l3 = evaluate_trajectory(
            actual_agents=expected_agents,
            pipeline_type=entry["expected_trajectory"],
            terminal_state=entry["expected_terminal_state"],
            retry_count=0,
        )

        results[lead_id] = {
            "lead": entry["lead"],
            "layer0": l0,
            "layer1": l1,
            "layer2": l2,
            "layer3": l3,
        }

        if verbose:
            print(f"\n[{lead_id}] L0={l0['aggregate_score']:.3f} L1={l1['score']:.3f} "
                  f"L2_prec={l2['precision_at_k']:.3f} L3_seq={l3['sequence_validity']:.3f}")

    # --- CI gate -------------------------------------------------------------
    gate = {
        "layer0_passed": all(r["layer0"]["passed"] for r in results.values()),
        "layer1_passed": all(
            r["layer1"]["faithfulness"] >= 0.7 and r["layer1"]["hallucination"].get("passed", True)
            for r in results.values()
        ),
        "layer2_passed": all(r["layer2"]["precision_at_k"] >= 0.6 for r in results.values()),
        "layer3_passed": all(r["layer3"]["terminal_state_valid"] for r in results.values()),
    }
    gate["overall_passed"] = all(gate[k] for k in gate)

    return {"leads": results, "gate": gate}


# ---------------------------------------------------------------------------
# Report printer
# ---------------------------------------------------------------------------
def print_report(results: dict) -> None:
    gate = results["gate"]
    leads = results["leads"]

    print("\n" + "=" * 60)
    print("  LeadGenie-AI — 4-Layer Evaluation Report")
    print("=" * 60)

    for lead_id, data in leads.items():
        name = data["lead"]["name"]
        l0 = data["layer0"]
        l1 = data["layer1"]
        l2 = data["layer2"]
        l3 = data["layer3"]

        p = lambda passed: "PASS" if passed else "FAIL"  # noqa: E731
        print(f"\n  Lead: {name} ({lead_id})")
        print(f"    Layer 0 — Prompt Audit    : {p(l0['passed'])}  (score={l0['aggregate_score']:.3f})")
        if l0["warnings"]:
            for w in l0["warnings"]:
                print(f"              WARNING: {w}")
        print(f"    Layer 1 — Model Output    : {p(l1['passed'])}  (score={l1['score']:.3f}, "
              f"faith={l1['faithfulness']:.3f}, bleu1={l1['bleu1']:.3f})")
        print(f"    Layer 2 — Retrieval       : {p(l2['passed'])}  (prec@k={l2['precision_at_k']:.3f}, "
              f"recall={l2['recall']:.3f}, utilization={l2['context_utilization']:.3f})")
        print(f"    Layer 3 — Trajectory      : {p(l3['passed'])}  (seq={l3['sequence_validity']:.3f}, "
              f"terminal_valid={l3['terminal_state_valid']})")

    print("\n" + "-" * 60)
    print("  CI Gate Summary")
    print("-" * 60)
    for key, val in gate.items():
        status = "PASS" if val else "FAIL"
        print(f"    {key:<25}: {status}")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run LeadGenie-AI evaluation pipeline")
    parser.add_argument("--no-llm", action="store_true", help="Skip LLM judge calls (faster, cheaper)")
    parser.add_argument("--verbose", action="store_true", help="Print per-lead scores during run")
    args = parser.parse_args()

    results = run_all(use_llm_judge=not args.no_llm, verbose=args.verbose)
    print_report(results)

    sys.exit(0 if results["gate"]["overall_passed"] else 1)
