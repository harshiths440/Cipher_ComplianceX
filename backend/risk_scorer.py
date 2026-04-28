"""
ComplianceX Risk Scorer
Computes a composite 0–100 risk score from a company object and its violations.
Returns SHAP-style top contributing factors.
"""


class RiskScorer:
    """
    Computes a weighted composite risk score for a company based on its violations
    and raw company data fields.
    """

    SEVERITY_POINTS = {
        "CRITICAL": 20,
        "HIGH": 12,
        "WARNING": 6,
    }

    BUCKETS = [
        (0, 25, "LOW"),
        (26, 50, "MEDIUM"),
        (51, 75, "HIGH"),
        (76, 100, "CRITICAL"),
    ]

    def score(self, company: dict, violations: list[dict]) -> dict:
        """
        Compute the composite risk score and return a structured result.

        Args:
            company: Full company dict
            violations: List of violation dicts from RuleEngine

        Returns:
            dict with score, bucket, top_factors, all_violations, recommendation
        """
        ch = company.get("compliance_history", {})
        directors = company.get("directors", [])

        contributions: list[tuple[str, int]] = []  # (label, points)

        # ── Violation severity points ─────────────────────────────────────────
        severity_totals: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "WARNING": 0}
        for v in violations:
            sev = v.get("severity", "WARNING")
            pts = self.SEVERITY_POINTS.get(sev, 0)
            severity_totals[sev] += pts
            contributions.append((f'{v["rule"]} ({sev})', pts))

        # ── Overdue filings penalty (5 pts each, max 20) ──────────────────────
        overdue = ch.get("overdue_filings", 0)
        overdue_pts = min(overdue * 5, 20)
        if overdue_pts > 0:
            contributions.append((f"{overdue} overdue filing(s)", overdue_pts))

        # ── Chronic delay bonus ───────────────────────────────────────────────
        delay_avg = ch.get("filing_delay_days_avg", 0)
        delay_bonus = 8 if delay_avg > 60 else 0
        if delay_bonus > 0:
            contributions.append((
                f"Average filing delay of {delay_avg} days (>60 threshold)",
                delay_bonus,
            ))

        # ── Sector risk index ─────────────────────────────────────────────────
        sector_risk = company.get("sector_risk_index", 0.0)
        sector_pts = round(sector_risk * 10)
        if sector_pts > 0:
            contributions.append((
                f"Sector risk index {sector_risk:.1f} × 10",
                sector_pts,
            ))

        # ── Disqualified directors (+15 each) ────────────────────────────────
        disqualified_count = sum(1 for d in directors if d.get("disqualified"))
        dir_pts = disqualified_count * 15
        if dir_pts > 0:
            contributions.append((
                f"{disqualified_count} disqualified director(s) on board",
                dir_pts,
            ))

        # ── Violations in last 12m (*3) ───────────────────────────────────────
        violations_12m = ch.get("violations_last_12m", 0)
        hist_pts = violations_12m * 3
        if hist_pts > 0:
            contributions.append((
                f"{violations_12m} violation(s) in last 12 months × 3",
                hist_pts,
            ))

        # ── Compute raw total ─────────────────────────────────────────────────
        raw_score = sum(pts for _, pts in contributions)
        final_score = min(raw_score, 100)

        # ── Bucket ───────────────────────────────────────────────────────────
        bucket = self._get_bucket(final_score)

        # ── Top 3 SHAP-style factors ──────────────────────────────────────────
        sorted_contributions = sorted(contributions, key=lambda x: x[1], reverse=True)
        top_factors = [
            f"{label} (+{pts} pts)" for label, pts in sorted_contributions[:3]
        ]

        # ── Recommendation ────────────────────────────────────────────────────
        recommendation = self._generate_recommendation(bucket, violations)

        return {
            "score": final_score,
            "bucket": bucket,
            "top_factors": top_factors,
            "all_violations": violations,
            "recommendation": recommendation,
        }

    # -------------------------------------------------------------------------

    def _get_bucket(self, score: int) -> str:
        for low, high, label in self.BUCKETS:
            if low <= score <= high:
                return label
        return "CRITICAL"

    def _generate_recommendation(self, bucket: str, violations: list[dict]) -> str:
        critical_count = sum(1 for v in violations if v.get("severity") == "CRITICAL")
        high_count = sum(1 for v in violations if v.get("severity") == "HIGH")

        if bucket == "LOW":
            return (
                "Company demonstrates strong compliance posture. "
                "Continue periodic monitoring and maintain filing schedules."
            )
        elif bucket == "MEDIUM":
            return (
                f"Moderate compliance risk detected. Address {len(violations)} pending "
                "violation(s) before next filing cycle to avoid escalation."
            )
        elif bucket == "HIGH":
            return (
                f"High compliance risk. Immediate attention required for "
                f"{high_count} HIGH-severity item(s). Engage a compliance officer."
            )
        else:  # CRITICAL
            return (
                f"Critical compliance failure. {critical_count} CRITICAL violation(s) "
                "require immediate rectification. Risk of regulatory prosecution, "
                "director disqualification proceedings, and company strike-off."
            )
