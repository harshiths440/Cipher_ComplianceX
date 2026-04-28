"""
ComplianceX LangGraph Orchestrator
Linear state machine: load_company → run_rule_engine → run_risk_scorer
                     → fetch_regulations → generate_remediation → compile_output
"""

import json
import os
from pathlib import Path
from typing import TypedDict

from langgraph.graph import StateGraph, END

from rule_engine import RuleEngine
from risk_scorer import RiskScorer
from chromadb_client import search_regulation
from claude_client import generate_remediation

# ---------------------------------------------------------------------------
# State Schema
# ---------------------------------------------------------------------------

class ComplianceState(TypedDict):
    cin: str
    company: dict
    violations: list
    risk_result: dict
    regulations: list
    remediation: str
    final_output: dict


# ---------------------------------------------------------------------------
# Data Path
# ---------------------------------------------------------------------------

_DATA_PATH = Path(__file__).parent / "data" / "companies.json"


def _load_companies() -> list[dict]:
    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Node Functions
# ---------------------------------------------------------------------------

def load_company(state: ComplianceState) -> ComplianceState:
    """Node 1 — Load the company record by CIN from companies.json."""
    cin = state["cin"]
    companies = _load_companies()

    match = next((c for c in companies if c["cin"] == cin), None)
    if match is None:
        raise ValueError(f"Company with CIN '{cin}' not found in dataset.")

    return {**state, "company": match}


def run_rule_engine(state: ComplianceState) -> ComplianceState:
    """Node 2 — Evaluate the company against all compliance rules."""
    engine = RuleEngine()
    violations = engine.evaluate(state["company"])
    return {**state, "violations": violations}


def run_risk_scorer(state: ComplianceState) -> ComplianceState:
    """Node 3 — Compute the composite risk score from violations."""
    scorer = RiskScorer()
    risk_result = scorer.score(state["company"], state["violations"])
    return {**state, "risk_result": risk_result}


def fetch_regulations(state: ComplianceState) -> ComplianceState:
    """
    Node 4 — Query ChromaDB for regulations relevant to the top violations.
    Builds a compound query from the top 2 violation rule names.
    """
    violations = state["violations"]

    if not violations:
        query = "general corporate compliance obligations India"
    else:
        # Use the top violations (by severity order: CRITICAL first) as query seeds
        priority = {"CRITICAL": 0, "HIGH": 1, "WARNING": 2}
        sorted_violations = sorted(
            violations,
            key=lambda v: priority.get(v.get("severity", "WARNING"), 3),
        )
        top_rules = [v["rule"] for v in sorted_violations[:2]]
        query = " AND ".join(top_rules)

    regulation_hits = search_regulation(query, n_results=2)
    return {**state, "regulations": regulation_hits}


def generate_remediation_node(state: ComplianceState) -> ComplianceState:
    """Node 5 — Call Claude API to generate remediation steps."""
    company = state["company"]
    risk_result = state["risk_result"]
    violations = state["violations"]

    remediation_text = generate_remediation(
        company_name=company["name"],
        violations=violations,
        risk_score=risk_result["score"],
    )

    return {**state, "remediation": remediation_text}


def compile_output(state: ComplianceState) -> ComplianceState:
    """Node 6 — Assemble the final ComplianceStatus object."""
    company = state["company"]
    risk_result = state["risk_result"]

    final_output = {
        "cin": state["cin"],
        "company_name": company["name"],
        "sector": company["sector"],
        "city": company["city"],
        "risk_score": risk_result["score"],
        "risk_bucket": risk_result["bucket"],
        "top_factors": risk_result["top_factors"],
        "recommendation": risk_result["recommendation"],
        "violations": [
            {
                "rule": v["rule"],
                "description": v["description"],
                "severity": v["severity"],
                "penalty_reference": v["penalty_reference"],
                "penalty_amount_inr": v["penalty_amount_inr"],
            }
            for v in state["violations"]
        ],
        "total_violations": len(state["violations"]),
        "critical_count": sum(1 for v in state["violations"] if v["severity"] == "CRITICAL"),
        "high_count": sum(1 for v in state["violations"] if v["severity"] == "HIGH"),
        "warning_count": sum(1 for v in state["violations"] if v["severity"] == "WARNING"),
        "relevant_regulations": state["regulations"],
        "remediation_steps": state["remediation"],
        "directors": company.get("directors", []),
        "compliance_summary": {
            "annual_returns_filed": company["compliance_history"]["annual_returns_filed"],
            "overdue_filings": company["compliance_history"]["overdue_filings"],
            "filing_delay_days_avg": company["compliance_history"]["filing_delay_days_avg"],
            "violations_last_12m": company["compliance_history"]["violations_last_12m"],
            "penalty_paid_inr": company["compliance_history"]["penalty_paid_inr"],
            "gst_pending_months": company["financials"]["gst_pending_months"],
        },
    }

    return {**state, "final_output": final_output}


# ---------------------------------------------------------------------------
# Graph Construction
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """Build and compile the LangGraph state machine."""
    builder = StateGraph(ComplianceState)

    # Register nodes
    builder.add_node("load_company", load_company)
    builder.add_node("run_rule_engine", run_rule_engine)
    builder.add_node("run_risk_scorer", run_risk_scorer)
    builder.add_node("fetch_regulations", fetch_regulations)
    builder.add_node("generate_remediation", generate_remediation_node)
    builder.add_node("compile_output", compile_output)

    # Linear edges
    builder.set_entry_point("load_company")
    builder.add_edge("load_company", "run_rule_engine")
    builder.add_edge("run_rule_engine", "run_risk_scorer")
    builder.add_edge("run_risk_scorer", "fetch_regulations")
    builder.add_edge("fetch_regulations", "generate_remediation")
    builder.add_edge("generate_remediation", "compile_output")
    builder.add_edge("compile_output", END)

    return builder.compile()


# Singleton graph instance
_graph = None


def get_graph():
    """Return the compiled graph (singleton)."""
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_analysis(cin: str) -> dict:
    """
    Entry point for running the full compliance pipeline for a given CIN.

    Args:
        cin: Company Identification Number

    Returns:
        final_output dict (ComplianceStatus)
    """
    graph = get_graph()

    initial_state: ComplianceState = {
        "cin": cin,
        "company": {},
        "violations": [],
        "risk_result": {},
        "regulations": [],
        "remediation": "",
        "final_output": {},
    }

    result = await graph.ainvoke(initial_state)
    return result["final_output"]
