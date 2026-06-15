"""
Layer 3 — Trajectory Evaluation
Evaluates the agent execution sequence against expected pipelines.
No model calls needed.
"""

EXPECTED_TRAJECTORIES: dict[str, list[str]] = {
    "outreach": ["research", "context_builder", "trend", "outreach", "governance"],
    "conversation": ["intent", "conversation"],
    "research_only": ["research", "context_builder"],
    "full_pipeline": ["research", "context_builder", "trend", "outreach", "governance", "intent", "conversation"],
}

VALID_TERMINAL_STATES = {"approved", "sent", "human_review", "rejected_by_human"}
INVALID_TERMINAL_STATES = {"error", "stuck", "timeout"}


def _lcs_length(a: list[str], b: list[str]) -> int:
    """Compute the length of the longest common subsequence of two lists."""
    m, n = len(a), len(b)
    # Use two-row DP to save memory
    prev = [0] * (n + 1)
    curr = [0] * (n + 1)
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                curr[j] = prev[j - 1] + 1
            else:
                curr[j] = max(prev[j], curr[j - 1])
        prev, curr = curr, [0] * (n + 1)
    return prev[n]


def evaluate_trajectory(
    actual_agents: list[str],
    pipeline_type: str,
    terminal_state: str,
    retry_count: int = 0,
    max_retries: int = 3,
) -> dict:
    """
    Evaluate how well an agent trajectory matches the expected pipeline.

    Args:
        actual_agents: Ordered list of agent names that were actually called.
        pipeline_type: Key into EXPECTED_TRAJECTORIES.
        terminal_state: Final state string (e.g. "approved", "error").
        retry_count: Number of retries that occurred during execution.
        max_retries: Maximum allowed retries (used for efficiency penalty).

    Returns dict with all metrics and a top-level passed bool.
    """
    expected_agents = EXPECTED_TRAJECTORIES.get(pipeline_type, [])

    # --- Sequence validity ---------------------------------------------------
    # LCS of actual vs expected, normalized by expected length.
    if not expected_agents:
        sequence_validity = 1.0  # unknown pipeline type → no penalty
    else:
        lcs_len = _lcs_length(actual_agents, expected_agents)
        sequence_validity = lcs_len / len(expected_agents)

    # --- Routing correctness -------------------------------------------------
    expected_set = set(expected_agents)
    unexpected_agents = [a for a in actual_agents if a not in expected_set]
    missing_agents = [e for e in expected_agents if e not in set(actual_agents)]

    if not actual_agents:
        routing_correctness = 0.0
    else:
        routing_correctness = 1.0 - (len(unexpected_agents) / len(actual_agents))

    # --- Terminal state validity ---------------------------------------------
    terminal_state_valid = terminal_state in VALID_TERMINAL_STATES

    # --- Efficiency ----------------------------------------------------------
    efficiency = 1.0 - (retry_count / max_retries) if max_retries > 0 else 1.0
    efficiency = max(0.0, min(1.0, efficiency))

    # --- Passed gate ---------------------------------------------------------
    passed = terminal_state_valid and sequence_validity >= 0.7

    return {
        "sequence_validity": round(sequence_validity, 4),
        "routing_correctness": round(routing_correctness, 4),
        "terminal_state_valid": terminal_state_valid,
        "efficiency": round(efficiency, 4),
        "missing_agents": missing_agents,
        "unexpected_agents": unexpected_agents,
        "passed": passed,
    }
