"""
ComplianceX — Smoke Test
Run: python smoke_test.py
"""
import json
import pathlib
import sys

print("=" * 60)
print("ComplianceX Backend Smoke Test")
print("=" * 60)

# ── 1. Load companies ─────────────────────────────────────────
data_path = pathlib.Path(__file__).parent / "data" / "companies.json"
data = json.loads(data_path.read_text(encoding="utf-8"))
print(f"\n[1] Companies loaded: {len(data)}")
for c in data:
    print(f"  - {c['cin']} | {c['name']} | {c['city']}")

# ── 2. Rule engine ────────────────────────────────────────────
from rule_engine import RuleEngine
from risk_scorer import RiskScorer

engine = RuleEngine()
scorer = RiskScorer()

print("\n[2] Rule Engine + Risk Scorer — all companies:")
for company in data:
    violations = engine.evaluate(company)
    result = scorer.score(company, violations)
    print(
        f"  {company['name'][:35]:<35} | "
        f"Score: {result['score']:>3} | "
        f"Bucket: {result['bucket']:<8} | "
        f"Violations: {len(violations)}"
    )

# ── 3. ChromaDB ───────────────────────────────────────────────
print("\n[3] ChromaDB regulation search:")
from chromadb_client import search_regulation

hits = search_regulation("penalty for late annual return filing", n_results=2)
for i, h in enumerate(hits, 1):
    print(f"  Result {i}: {h['metadata']['section']} | relevance={h['relevance_score']}")

# ── 4. LangGraph graph build ──────────────────────────────────
print("\n[4] LangGraph graph build:")
from langgraph_orchestrator import build_graph
graph = build_graph()
print(f"  Graph compiled OK — nodes: {list(graph.get_graph().nodes.keys())}")

# ── 5. Check .env / ANTHROPIC_API_KEY ────────────────────────
import os
from dotenv import load_dotenv
load_dotenv()
key = os.environ.get("ANTHROPIC_API_KEY", "")
print(f"\n[5] ANTHROPIC_API_KEY set: {'YES (' + key[:8] + '...)' if key else 'NO — set in .env!'}")

print("\n" + "=" * 60)
print("Smoke test complete. Start server with:")
print("  uvicorn main:app --host 0.0.0.0 --port 8000 --reload")
print("=" * 60)
