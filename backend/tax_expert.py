"""
tax_expert.py — ComplianceX Tax Expert (Doctor 3)

Computes a full tax analysis for a given company using data from
the companies.json dataset. All figures are derived from financials
and compliance_history since the dataset does not store net_profit
or employee_count directly.

Derivation assumptions:
  net_profit       = annual_turnover * 0.12   (12% PAT margin — conservative)
  employee_count   = derived from sector + turnover band
  office_rent      = annual_turnover * 0.02   (2% of turnover for non-owned premises)
  professional_fees = annual_turnover * 0.05  (5% for outsourced professional work)
  contractor_spend  = annual_turnover * 0.08  (8% for contractors)
"""

from __future__ import annotations
from datetime import date, datetime
from typing import Optional

# ---------------------------------------------------------------------------
# Current date anchor for installment status
# ---------------------------------------------------------------------------

_TODAY = date.today()
_CURRENT_YEAR = _TODAY.year

# Advance tax installment schedule (percent of annual liability due BY each date)
_INSTALLMENTS = [
    {"due_label": "15 Jun", "month": 6,  "day": 15, "percent": 15},
    {"due_label": "15 Sep", "month": 9,  "day": 15, "percent": 45},
    {"due_label": "15 Dec", "month": 12, "day": 15, "percent": 75},
    {"due_label": "15 Mar", "month": 3,  "day": 15, "percent": 100},
]

# Sector -> typical employee count multiplier (employees per ₹1Cr turnover)
_SECTOR_EMP_PER_CR = {
    "IT Services":                  8,
    "Legal & Professional Services": 10,
    "Healthcare & MedTech":          6,
    "Education Technology":          5,
    "Financial Services & NBFC":     3,
    "Retail & E-Commerce":           4,
    "Manufacturing":                 5,
    "Logistics & Supply Chain":      4,
    "Agribusiness & Food Processing": 3,
    "Real Estate & Construction":    3,
    "Renewable Energy":              2,
    "Shipping & Maritime":           2,
}

# Sectors eligible for specific savings schemes
_SECTOR_SAVINGS = {
    "Manufacturing":                ["80IC", "35AD"],
    "Renewable Energy":             ["80IC", "35AD", "10AA"],
    "IT Services":                  ["10AA"],
    "Education Technology":         ["10AA"],
    "Agribusiness & Food Processing": ["80IC"],
    "Healthcare & MedTech":         ["35AD"],
    "Real Estate & Construction":   ["35AD"],
    "Logistics & Supply Chain":     ["35AD"],
}

_SAVINGS_META = {
    "80IC": {
        "description": "100% deduction on profits for manufacturing units in special category states (Himachal Pradesh, Uttarakhand, NE states) — Sections 80-IC",
        "rate": 0.30,
    },
    "10AA": {
        "description": "100% deduction on profits of newly established units in SEZs for first 5 years — Section 10AA",
        "rate": 0.25,
    },
    "35AD": {
        "description": "100% deduction on capital expenditure for specified businesses (cold chain, warehousing, hospitals) — Section 35AD",
        "rate": 0.20,
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_net_profit(company: dict) -> int:
    turnover = company.get("financials", {}).get("annual_turnover_inr", 0)
    return int(turnover * 0.12)


def _derive_employee_count(company: dict) -> int:
    turnover_cr = company.get("financials", {}).get("annual_turnover_inr", 0) / 1_00_00_000
    sector = company.get("sector", "")
    per_cr = _SECTOR_EMP_PER_CR.get(sector, 4)
    return max(1, int(turnover_cr * per_cr))


def _installment_status(due_date: date, has_advance_tax_history: bool, tax_paid: int, annual_liability: int, percent: int) -> str:
    """
    Determine installment status.
    - Future due date            -> UPCOMING
    - Past due, no history       -> MISSED
    - Past due, tax paid >= expected cumulative -> PAID
    - Otherwise                  -> MISSED
    """
    if due_date > _TODAY:
        return "UPCOMING"
    if not has_advance_tax_history:
        return "MISSED"
    expected_cumulative = int(annual_liability * percent / 100)
    if tax_paid >= expected_cumulative * 0.9:   # 90% tolerance
        return "PAID"
    return "MISSED"


def _parse_date(date_str: Optional[str]) -> Optional[date]:
    if not date_str:
        return None
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

def compute_tax_analysis(company: dict) -> dict:
    """
    Compute a full tax analysis for a company from the dataset.
    Returns a structured dict with advance tax, TDS, MAT, savings, and risk flags.
    """
    fin       = company.get("financials", {})
    ch        = company.get("compliance_history", {})
    sector    = company.get("sector", "General")
    city      = company.get("city", "")
    name      = company.get("name", "")

    turnover  = fin.get("annual_turnover_inr", 0)
    tax_paid  = fin.get("tax_paid_inr", 0)
    net_profit = _derive_net_profit(company)
    emp_count  = _derive_employee_count(company)

    # Derive whether advance tax was ever filed from compliance quality
    delay_avg = ch.get("filing_delay_days_avg", 0)
    overdue   = ch.get("overdue_filings", 0)
    has_adv_tax = (overdue == 0 and delay_avg < 30)

    risk_flags: list[str] = []

    # ── 1. Corporate tax rate ─────────────────────────────────────────────────
    # 25% for turnover < ₹400 Cr, 30% above (including surcharge approximation)
    TAX_RATE = 0.25 if turnover < 4_00_00_00_000 else 0.30

    annual_liability = int(net_profit * TAX_RATE)

    # ── 2. Advance tax installments ───────────────────────────────────────────
    installments = []
    shortfall    = 0

    for inst in _INSTALLMENTS:
        # Mar installment is in the NEXT calendar year if current month > 3
        year = _CURRENT_YEAR if inst["month"] != 3 else (
            _CURRENT_YEAR if _TODAY.month <= 3 else _CURRENT_YEAR + 1
        )
        due_date = date(year, inst["month"], inst["day"])
        amount   = int(annual_liability * inst["percent"] / 100)
        status   = _installment_status(due_date, has_adv_tax, tax_paid, annual_liability, inst["percent"])

        if status == "MISSED":
            shortfall += amount

        installments.append({
            "due":     inst["due_label"],
            "percent": inst["percent"],
            "amount":  amount,
            "status":  status,
        })

    # Dedup shortfall — only count the highest missed installment (cumulative)
    # The last MISSED installment already includes all prior amounts
    missed_installments = [i for i in installments if i["status"] == "MISSED"]
    shortfall = missed_installments[-1]["amount"] if missed_installments else 0

    months_overdue = len(missed_installments)
    interest_liability = int(shortfall * 0.015 * months_overdue)

    if shortfall > 0:
        risk_flags.append(
            f"Advance tax shortfall of ₹{shortfall / 1_00_000:.1f}L — "
            f"interest liability ₹{interest_liability / 1_00_000:.1f}L"
        )

    # ── 3. TDS obligations ────────────────────────────────────────────────────
    salary_base        = int(turnover * 0.15)   # 15% of turnover as salary cost
    professional_fees  = int(turnover * 0.05)
    rent_base          = int(turnover * 0.02)
    contractor_spend   = int(turnover * 0.08)

    tds_obligations = []

    # 192 — Salary TDS
    if emp_count > 0:
        avg_salary = int(salary_base / max(emp_count, 1))
        salary_tds_rate = 0.20 if emp_count > 12 else 0.10
        salary_tds = int(salary_base * salary_tds_rate)
        salary_status = "COMPLIANT" if has_adv_tax else ("DEFAULTING" if overdue > 2 else "AT_RISK")
        tds_obligations.append({
            "type":              "Salary",
            "section":           "192",
            "estimated_annual":  salary_base,
            "tds_rate":          salary_tds_rate,
            "tds_due":           salary_tds,
            "status":            salary_status,
        })
        if salary_status == "DEFAULTING":
            risk_flags.append(f"TDS default risk on salary payments (Section 192) — {emp_count} employees")

    # 194J — Professional fees TDS (applies above ₹50,000 threshold)
    if professional_fees > 50_000:
        prof_tds = int(professional_fees * 0.10)
        prof_status = "COMPLIANT" if has_adv_tax else "AT_RISK"
        tds_obligations.append({
            "type":              "Professional Fees",
            "section":           "194J",
            "estimated_annual":  professional_fees,
            "tds_rate":          0.10,
            "tds_due":           prof_tds,
            "status":            prof_status,
        })
        if prof_status == "AT_RISK":
            risk_flags.append("TDS default risk on professional fees (Section 194J)")

    # 194I — Rent TDS (assume all companies pay rent unless Manufacturing or Agri with low turnover)
    pays_rent = sector not in ("Manufacturing", "Agribusiness & Food Processing") or turnover > 5_00_00_000
    if pays_rent and rent_base > 0:
        rent_tds = int(rent_base * 0.10)
        rent_status = "COMPLIANT" if has_adv_tax else "AT_RISK"
        tds_obligations.append({
            "type":              "Rent",
            "section":           "194I",
            "estimated_annual":  rent_base,
            "tds_rate":          0.10,
            "tds_due":           rent_tds,
            "status":            rent_status,
        })

    # 194C — Contractor TDS
    if contractor_spend > 0:
        contractor_tds = int(contractor_spend * 0.02)
        contractor_status = "COMPLIANT" if has_adv_tax else ("DEFAULTING" if overdue > 3 else "AT_RISK")
        tds_obligations.append({
            "type":              "Contractor",
            "section":           "194C",
            "estimated_annual":  contractor_spend,
            "tds_rate":          0.02,
            "tds_due":           contractor_tds,
            "status":            contractor_status,
        })

    # ── 4. MAT check (Section 115JB) ──────────────────────────────────────────
    # Book profit approximation: use net_profit with add-backs
    book_profit    = int(net_profit * 1.15)   # standard add-backs inflate book profit ~15%
    mat_liability  = int(book_profit * 0.15)
    regular_tax    = annual_liability
    mat_applies    = mat_liability > regular_tax and book_profit > 0
    # MAT credit = excess of MAT over regular tax (can be carried forward 15 years)
    tax_credit_available = max(0, mat_liability - regular_tax) if mat_applies else 0

    if mat_applies:
        risk_flags.append(
            f"MAT applicable — ₹{mat_liability / 1_00_000:.1f}L MAT vs "
            f"₹{regular_tax / 1_00_000:.1f}L regular tax"
        )

    mat_check = {
        "applicable":           book_profit > 0,
        "book_profit":          book_profit,
        "mat_liability":        mat_liability,
        "regular_tax":          regular_tax,
        "mat_applies":          mat_applies,
        "tax_credit_available": tax_credit_available,
    }

    # ── 5. Savings opportunities ──────────────────────────────────────────────
    applicable_sections = _SECTOR_SAVINGS.get(sector, [])
    # SEZ cities — 10AA more likely
    sez_cities = {"Bengaluru", "Chennai", "Hyderabad", "Pune", "Ahmedabad", "Surat"}
    if city in sez_cities and "10AA" not in applicable_sections:
        applicable_sections = applicable_sections + ["10AA"]

    savings_opportunities = []
    for sec in ["80IC", "10AA", "35AD"]:
        meta = _SAVINGS_META[sec]
        is_applicable = sec in applicable_sections
        estimated_saving = int(net_profit * meta["rate"]) if is_applicable else 0
        savings_opportunities.append({
            "section":           sec,
            "description":       meta["description"],
            "estimated_saving":  estimated_saving,
            "applicable":        is_applicable,
        })

    # ── 6. Totals ─────────────────────────────────────────────────────────────
    actual_tax   = mat_liability if mat_applies else regular_tax
    total_liability = actual_tax + interest_liability
    effective_rate  = round(total_liability / max(net_profit, 1), 4)

    # GST penalty flag
    gst_pending = fin.get("gst_pending_months", 0)
    if gst_pending > 3:
        risk_flags.append(f"GST returns pending for {gst_pending} months — late fee exposure")

    # Tax underpayment flag
    if tax_paid < annual_liability * 0.85:
        gap = annual_liability - tax_paid
        risk_flags.append(f"Tax underpayment detected — ₹{gap / 1_00_000:.1f}L gap vs computed liability")

    return {
        "advance_tax": {
            "annual_liability":   annual_liability,
            "installments":       installments,
            "shortfall":          shortfall,
            "interest_liability": interest_liability,
        },
        "tds_obligations":      tds_obligations,
        "mat_check":            mat_check,
        "savings_opportunities": savings_opportunities,
        "total_tax_liability":  total_liability,
        "effective_rate":       effective_rate,
        "risk_flags":           risk_flags,
    }
