"""
ComplianceX Rule Engine
Evaluates a company against hardcoded Indian compliance IF-THEN rules.
"""

from typing import Optional


class RuleEngine:
    """
    Evaluates a company against a set of hardcoded compliance rules.
    Returns a list of violation objects for any triggered rules.
    """

    def evaluate(self, company: dict) -> list[dict]:
        """
        Run all compliance rules against a company object.

        Args:
            company: Full company dict from companies.json

        Returns:
            List of violation dicts (empty if fully compliant)
        """
        violations = []
        ch = company.get("compliance_history", {})
        fin = company.get("financials", {})
        directors = company.get("directors", [])

        # Rule 1 — Overdue ROC Filings
        v = self._rule_overdue_filings(ch)
        if v:
            violations.append(v)

        # Rule 2 — Chronic Filing Delays
        v = self._rule_chronic_filing_delays(ch)
        if v:
            violations.append(v)

        # Rule 3 — Disqualified Director
        disqualified = self._rule_disqualified_director(directors)
        violations.extend(disqualified)

        # Rule 4/5 — GST Return Arrears (with severity escalation)
        v = self._rule_gst_arrears(fin)
        if v:
            violations.append(v)

        # Rule 6 — Tax Payment Shortfall
        v = self._rule_tax_shortfall(fin)
        if v:
            violations.append(v)

        # Rule 7 — Annual Return Not Filed
        v = self._rule_annual_return_not_filed(ch)
        if v:
            violations.append(v)

        # Rule 8 — Repeat Offender Pattern
        v = self._rule_repeat_offender(ch)
        if v:
            violations.append(v)

        return violations

    # -------------------------------------------------------------------------
    # Individual Rule Implementations
    # -------------------------------------------------------------------------

    def _rule_overdue_filings(self, ch: dict) -> Optional[dict]:
        """
        IF overdue_filings > 0 THEN violation.
        Severity: 1 = WARNING, 2 = HIGH, 3+ = CRITICAL
        """
        count = ch.get("overdue_filings", 0)
        if count <= 0:
            return None

        if count == 1:
            severity = "WARNING"
            points = 6
            penalty = 10000
        elif count == 2:
            severity = "HIGH"
            points = 12
            penalty = 25000
        else:
            severity = "CRITICAL"
            points = 20
            penalty = 50000 + (count - 3) * 10000  # escalating

        return {
            "rule": "Overdue ROC Filing",
            "description": (
                f"The company has {count} overdue ROC filing(s) pending with the "
                "Registrar of Companies. Timely filing of annual returns and financial "
                "statements is mandatory under the Companies Act 2013."
            ),
            "severity": severity,
            "penalty_reference": "Companies Act 2013 — Section 92(5) & Section 137(3)",
            "penalty_amount_inr": penalty,
            "points_added": points,
        }

    def _rule_chronic_filing_delays(self, ch: dict) -> Optional[dict]:
        """
        IF filing_delay_days_avg > 30 THEN violation (WARNING).
        """
        avg_delay = ch.get("filing_delay_days_avg", 0)
        if avg_delay <= 30:
            return None

        return {
            "rule": "Chronic Filing Delays",
            "description": (
                f"The company's average filing delay is {avg_delay} days, exceeding the "
                "30-day threshold. Habitual late filing attracts additional fees and "
                "regulatory scrutiny under the Companies Act 2013."
            ),
            "severity": "WARNING",
            "penalty_reference": "Companies Act 2013 — Section 403 (Additional Fee)",
            "penalty_amount_inr": 200 * avg_delay,  # ₹200/day late fee approximation
            "points_added": 6,
        }

    def _rule_disqualified_director(self, directors: list) -> list[dict]:
        """
        IF any director disqualified == true THEN violation (CRITICAL) per director.
        """
        violations = []
        for director in directors:
            if director.get("disqualified"):
                violations.append({
                    "rule": "Disqualified Director on Board",
                    "description": (
                        f"Director {director.get('name')} (DIN: {director.get('din')}) "
                        "is disqualified under the Companies Act 2013. A disqualified "
                        "director cannot legally act as a director of any company."
                    ),
                    "severity": "CRITICAL",
                    "penalty_reference": (
                        "Companies Act 2013 — Section 164(2) & Section 167(1)(a)"
                    ),
                    "penalty_amount_inr": 100000,
                    "points_added": 20,
                })
        return violations

    def _rule_gst_arrears(self, fin: dict) -> Optional[dict]:
        """
        IF gst_pending_months > 2 THEN HIGH.
        IF gst_pending_months > 5 THEN escalate to CRITICAL.
        """
        pending = fin.get("gst_pending_months", 0)
        if pending <= 2:
            return None

        if pending > 5:
            severity = "CRITICAL"
            points = 20
            penalty = 25000 * pending
        else:
            severity = "HIGH"
            points = 12
            penalty = 10000 * pending

        return {
            "rule": "GST Return Arrears",
            "description": (
                f"The company has {pending} months of pending GST returns. "
                "Non-filing of GST returns beyond 2 months attracts interest, late fees, "
                "and potential cancellation of GST registration."
            ),
            "severity": severity,
            "penalty_reference": (
                "GST Act 2017 — Section 39(3) read with Rule 61; "
                "CGST Act Section 47 (Late Fee)"
            ),
            "penalty_amount_inr": penalty,
            "points_added": points,
        }

    def _rule_tax_shortfall(self, fin: dict) -> Optional[dict]:
        """
        IF tax_paid_inr < tax_liability_inr THEN violation (CRITICAL).
        """
        liability = fin.get("tax_liability_inr", 0)
        paid = fin.get("tax_paid_inr", 0)
        if paid >= liability:
            return None

        shortfall = liability - paid

        return {
            "rule": "Tax Payment Shortfall",
            "description": (
                f"The company has an outstanding tax payment shortfall of "
                f"₹{shortfall:,.0f}. Tax liability of ₹{liability:,.0f} exceeds "
                f"tax paid ₹{paid:,.0f}. This attracts interest under Section 234B."
            ),
            "severity": "CRITICAL",
            "penalty_reference": (
                "Income Tax Act 1961 — Section 234B (Interest for Default in "
                "Payment of Advance Tax)"
            ),
            "penalty_amount_inr": int(shortfall * 0.01),  # ~1% per month interest
            "points_added": 20,
        }

    def _rule_annual_return_not_filed(self, ch: dict) -> Optional[dict]:
        """
        IF annual_returns_filed == false THEN violation (CRITICAL).
        """
        if ch.get("annual_returns_filed", True):
            return None

        return {
            "rule": "Annual Return Not Filed",
            "description": (
                "The company has not filed its annual return with the Registrar of "
                "Companies. Annual return filing is mandatory within 60 days of the "
                "Annual General Meeting under the Companies Act 2013."
            ),
            "severity": "CRITICAL",
            "penalty_reference": "Companies Act 2013 — Section 92(5)",
            "penalty_amount_inr": 50000,
            "points_added": 20,
        }

    def _rule_repeat_offender(self, ch: dict) -> Optional[dict]:
        """
        IF violations_last_12m > 2 THEN violation (HIGH).
        """
        violations_count = ch.get("violations_last_12m", 0)
        if violations_count <= 2:
            return None

        return {
            "rule": "Repeat Offender Pattern",
            "description": (
                f"The company has committed {violations_count} compliance violations "
                "in the last 12 months, indicating a systemic non-compliance pattern. "
                "Repeat offenders face enhanced penalties and potential prosecution."
            ),
            "severity": "HIGH",
            "penalty_reference": (
                "Companies Act 2013 — Section 454B (Repeat Default — Enhanced Penalty)"
            ),
            "penalty_amount_inr": 25000 * violations_count,
            "points_added": 12,
        }
