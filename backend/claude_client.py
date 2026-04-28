"""
ComplianceX Claude Client
Generates actionable remediation steps using Anthropic Claude API.
"""

import os
import anthropic


SYSTEM_PROMPT = (
    "You are a compliance expert specializing in Indian corporate law. "
    "Given a company's compliance violations, generate 3 specific, actionable "
    "remediation steps. Be concise. Reference the specific law section. "
    "Format as a numbered list."
)


def generate_remediation(
    company_name: str,
    violations: list[dict],
    risk_score: int,
) -> str:
    """
    Call Claude to generate targeted remediation steps for the given violations.

    Args:
        company_name: Name of the company
        violations: List of violation dicts from rule_engine
        risk_score: Composite risk score (0–100)

    Returns:
        Raw text string with numbered remediation steps
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Please export it before running the server."
        )

    client = anthropic.Anthropic(api_key=api_key)

    # Build a structured violation summary for the prompt
    if violations:
        violation_lines = []
        for i, v in enumerate(violations, 1):
            violation_lines.append(
                f"  {i}. [{v['severity']}] {v['rule']} — {v['description']} "
                f"(Ref: {v['penalty_reference']})"
            )
        violation_text = "\n".join(violation_lines)
    else:
        violation_text = "  No violations detected."

    user_message = (
        f"Company: {company_name}\n"
        f"Composite Risk Score: {risk_score}/100\n\n"
        f"Current Compliance Violations:\n{violation_text}\n\n"
        "Please provide 3 specific, actionable remediation steps to address "
        "the most critical issues, referencing the relevant Indian law sections."
    )

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": user_message}
        ],
    )

    return message.content[0].text
