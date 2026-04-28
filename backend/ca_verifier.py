"""
ca_verifier.py — ComplianceX CA Compliance Verifier (Doctor 1 Extension)

Cross-references a company's filing history against the regulatory news
dataset to detect filings made during active regulatory change windows.

Filing history is synthesised from compliance_history since the dataset
does not store individual filing records. Synthetic filings are derived
from last_annual_return_date and sector-typical forms.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_date(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d-%m-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None


def _synthesise_filings(company: dict) -> list[dict]:
    """
    Build a realistic set of filing records from the company's compliance_history.
    Since the dataset has no per-filing log, we derive plausible filings from:
      - last_annual_return_date  -> MGT-7 / MGT-7A
      - gst_returns_filed        -> GSTR-3B (monthly, use last 3 months)
      - overdue_filings          -> mark some as delayed
      - sector                   -> sector-specific forms
    """
    ch      = company.get("compliance_history", {})
    fin     = company.get("financials", {})
    sector  = company.get("sector", "")
    directors = company.get("directors", [])

    # Prefer first non-disqualified director name as "CA proxy"
    ca_name = next(
        (d["name"] for d in directors if not d.get("disqualified", False)),
        "Company Secretary"
    )

    last_ar_str  = ch.get("last_annual_return_date")
    last_ar_date = _parse_date(last_ar_str)
    delay_avg    = ch.get("filing_delay_days_avg", 0)
    overdue      = ch.get("overdue_filings", 0)

    filings: list[dict] = []

    # ── Annual return ──────────────────────────────────────────────────────
    if last_ar_date:
        form = "MGT-7A" if sector in ("Education Technology", "Agribusiness & Food Processing") else "MGT-7"
        filings.append({
            "form":        form,
            "filed_date":  last_ar_date,
            "filed_by":    ca_name,
        })

    # ── Financial statements ───────────────────────────────────────────────
    if last_ar_date:
        aoc_date = last_ar_date - timedelta(days=15)
        filings.append({
            "form":        "AOC-4",
            "filed_date":  aoc_date,
            "filed_by":    ca_name,
        })

    # ── GST returns (last 3 monthly GSTR-3B) ──────────────────────────────
    if fin.get("gst_returns_filed"):
        for i in range(1, 4):
            gst_date = datetime.now() - timedelta(days=30 * i + delay_avg)
            filings.append({
                "form":       "GSTR-3B",
                "filed_date": gst_date,
                "filed_by":   ca_name,
            })

    # ── Income tax return ──────────────────────────────────────────────────
    if last_ar_date:
        itr_date = last_ar_date - timedelta(days=30)
        filings.append({
            "form":       "ITR-6",
            "filed_date": itr_date,
            "filed_by":   ca_name,
        })

    # ── Sector-specific forms ──────────────────────────────────────────────
    sector_forms = {
        "Financial Services & NBFC":     ("NBS-7",  90),
        "Real Estate & Construction":    ("RERA-AR", 60),
        "Manufacturing":                 ("ER-1",    45),
        "Logistics & Supply Chain":      ("GR-7",    30),
        "Healthcare & MedTech":          ("PCPNDT",  60),
    }
    if sector in sector_forms and last_ar_date:
        form_name, days_before = sector_forms[sector]
        spec_date = last_ar_date - timedelta(days=days_before + delay_avg)
        filings.append({
            "form":       form_name,
            "filed_date": spec_date,
            "filed_by":   ca_name,
        })

    return filings


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def verify_ca_filings(company: dict, news_data: list) -> dict:
    """
    Cross-reference synthesised filings against the regulatory news dataset.

    Status logic:
      OUTDATED  — filing date is BEFORE the regulation date AND the regulation
                  amends a previous rule (compared_to_before is not null)
      AT_RISK   — filing date is within 30 days AFTER a regulation became active
      VERIFIED  — no conflicting regulation found
    """
    filings = _synthesise_filings(company)

    # Pre-parse regulation dates from news_data
    regulations: list[dict] = []
    for item in news_data:
        reg_date = _parse_date(item.get("date"))
        prev_date = _parse_date(item.get("previous_rule_date"))
        if reg_date:
            regulations.append({
                "rule_name":           item.get("rule_name") or item.get("title", "Unknown Rule"),
                "category":            item.get("category", "General"),
                "regulation_date":     reg_date,
                "previous_rule_date":  prev_date,
                "compared_to_before":  item.get("compared_to_before"),
                "date_str":            item.get("date", ""),
            })

    verified_filings = []
    at_risk_count  = 0
    outdated_count = 0

    # Map form -> relevant regulation categories
    _form_category_map = {
        "MGT-7":    ["Corporate"],
        "MGT-7A":   ["Corporate"],
        "AOC-4":    ["Corporate"],
        "ITR-6":    ["Tax"],
        "GSTR-3B":  ["GST"],
        "NBS-7":    ["Securities", "Corporate"],
        "RERA-AR":  ["Corporate"],
        "ER-1":     ["Corporate", "GST"],
        "GR-7":     ["Corporate"],
        "PCPNDT":   ["Corporate"],
    }

    for filing in filings:
        form        = filing["form"]
        filed_date  = filing["filed_date"]
        filed_by    = filing["filed_by"]
        relevant_cats = _form_category_map.get(form, [])

        # Find conflicting regulations
        conflicting: Optional[dict] = None
        status = "VERIFIED"
        flag_message: Optional[str] = None
        recommendation: Optional[str] = None

        for reg in regulations:
            # Only check regulations relevant to this form's category
            if relevant_cats and reg["category"] not in relevant_cats:
                continue

            reg_dt   = reg["regulation_date"]
            prev_dt  = reg["previous_rule_date"]
            is_amendment = bool(reg.get("compared_to_before"))

            # OUTDATED: filing predates the regulation AND it amends a prior rule
            if is_amendment and filed_date < reg_dt:
                if prev_dt is None or filed_date >= prev_dt:
                    status       = "OUTDATED"
                    conflicting  = reg
                    flag_message = (
                        f"CA filed {form} on {filed_date.strftime('%d %b %Y')}. "
                        f"{reg['rule_name']} was updated on {reg['date_str']}. "
                        f"The old rule applied at time of filing."
                    )
                    recommendation = (
                        f"Request CA to confirm whether the pre-{reg['date_str']} "
                        f"version of {reg['rule_name']} was correctly applied."
                    )
                    outdated_count += 1
                    break

            # AT_RISK: filing within 30 days after a new regulation
            elif reg_dt <= filed_date <= reg_dt + timedelta(days=30):
                if status != "OUTDATED":  # don't downgrade
                    status      = "AT_RISK"
                    conflicting = reg
                    flag_message = (
                        f"CA filed {form} on {filed_date.strftime('%d %b %Y')}. "
                        f"{reg['rule_name']} became effective on {reg['date_str']} "
                        f"— within 30 days of this filing."
                    )
                    recommendation = (
                        f"Confirm with CA that {reg['rule_name']} was incorporated "
                        f"in the {form} filing."
                    )
                    at_risk_count += 1

        verified_filings.append({
            "form":                        form,
            "filed_date":                  filed_date.strftime("%d %b %Y"),
            "filed_by":                    filed_by,
            "status":                      status,
            "regulation_active_at_filing": conflicting["rule_name"] if conflicting else None,
            "regulation_date":             conflicting["date_str"]   if conflicting else None,
            "flag_message":                flag_message,
            "recommendation":              recommendation,
        })

    total    = len(verified_filings)
    flagged  = at_risk_count + outdated_count

    if flagged == 0:
        summary = f"All {total} filings verified — no regulatory conflicts detected."
    else:
        summary = f"{flagged} of {total} filings need CA verification."

    return {
        "verified_filings": verified_filings,
        "total_filings":    total,
        "at_risk_count":    at_risk_count,
        "outdated_count":   outdated_count,
        "summary":          summary,
    }
