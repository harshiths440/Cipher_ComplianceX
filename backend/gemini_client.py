"""
ComplianceX Gemini Client
Generates actionable remediation steps using Google Gemini API.
Also provides analyze_regulatory_news() for the /news/analyze endpoint.
"""

import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

SYSTEM_PROMPT = (
    "You are a senior compliance expert specializing in Indian corporate law "
    "(Companies Act 2013, GST Act, Income Tax Act). Given a company's compliance "
    "violations, generate exactly 3 specific, actionable remediation steps. "
    "Be concise. Reference the specific law section for each step. "
    "Format strictly as:\n"
    "1. [Action] — [Law Reference] — [Timeline]\n"
    "2. [Action] — [Law Reference] — [Timeline]\n"
    "3. [Action] — [Law Reference] — [Timeline]"
)

def generate_remediation(
    company_name: str,
    violations: list[dict],
    risk_score: int,
    risk_bucket: str,
) -> str:
    violation_lines = "\n".join(
        f"- {v['rule']} ({v['severity']}): {v['description']}"
        for v in violations
    ) or "- No violations detected."

    prompt = (
        f"Company: {company_name}\n"
        f"Risk Score: {risk_score}/100 ({risk_bucket})\n"
        f"Violations:\n{violation_lines}"
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                max_output_tokens=500,
            )
        )
        return response.text.strip()
    except Exception as e:
        return (
            "1. File all overdue returns immediately — Companies Act 2013 Section 92 — Within 7 days\n"
            "2. Engage a qualified Company Secretary for compliance audit — ICSI Guidelines — Within 14 days\n"
            "3. Clear all pending tax liabilities with interest — Income Tax Act Section 234B — Within 30 days"
        )


# ---------------------------------------------------------------------------
# Regulatory news analyzer
# ---------------------------------------------------------------------------

ANALYZE_PROMPT_TEMPLATE = """You are a compliance analyst for Indian companies. Analyze this regulatory update and return ONLY a JSON object with these exact keys:
{{
  "rule_name": "Short name for the rule or form (e.g. Form MGT-14)",
  "what_changed": "1-2 sentence plain English summary of what changed",
  "who_it_hits": "Which companies or sectors are affected (e.g. Companies with 50+ employees, All NBFCs)",
  "what_to_do": ["Step 1 action", "Step 2 action", "Step 3 action"],
  "deadline": "Specific date or timeframe if mentioned, else null",
  "penalty": "Penalty amount or consequence if mentioned, else null",
  "severity": "HIGH | MEDIUM | LOW based on penalty and urgency",
  "compared_to_before": "What the old rule was, if this is an amendment. Null if new rule."
}}
Return ONLY the JSON. No preamble. No markdown.

Regulatory update title: {title}
Content: {content}"""


def analyze_regulatory_news(
    title: str,
    content: str,
    source: str,
    category: str,
) -> dict:
    """
    Analyze a regulatory news item using Gemini 2.0 Flash.
    Returns a structured dict. Never raises — returns a fallback on any failure.
    """
    fallback = {
        "rule_name": title,
        "what_changed": "See full article for details.",
        "who_it_hits": f"{source} — {category}",
        "what_to_do": ["Visit the official source for details"],
        "deadline": None,
        "penalty": None,
        "severity": "MEDIUM",
        "compared_to_before": None,
    }

    prompt = ANALYZE_PROMPT_TEMPLATE.format(
        title=title,
        content=content[:3000],
    )

    try:
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                max_output_tokens=800,
            ),
        )
        raw = response.text.strip()
        # Strip potential markdown fences
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(raw)
    except Exception:
        return fallback