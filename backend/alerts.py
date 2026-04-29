"""
alerts.py — ComplianceX Alert System

In-memory store for Executive → CA alerts.
No database required — resets on server restart (demo-safe).
"""

from __future__ import annotations
import random
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

alerts_store: list[dict] = []
_seeded = False


def seed_demo_alerts() -> None:
    """Seed realistic demo alerts for hackathon demo. Called once on startup."""
    global _seeded
    if _seeded:
        return
    _seeded = True

    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)

    demo_alerts = [
        {
            "id": "ALT100001",
            "cin": "U72900KA2018PTC123456",
            "company_name": "Technova Solutions Pvt Ltd",
            "regulation_title": "Tax Saving Opportunity \u2014 File overdue TDS returns (26Q, 24Q)",
            "regulation_category": "Tax",
            "message": "Executive has flagged a tax saving opportunity of \u20b920,265. Action required: File overdue TDS returns (26Q, 24Q). Please file 26Q, 24Q and confirm.",
            "urgency": "HIGH",
            "sent_by": "Executive",
            "sent_at": (now - timedelta(hours=2)).isoformat(),
            "status": "ACKNOWLEDGED",
            "acknowledged_at": (now - timedelta(hours=1)).isoformat(),
            "ca_response": "Will go through",
        },
        {
            "id": "ALT100002",
            "cin": "U72900KA2018PTC123456",
            "company_name": "Technova Solutions Pvt Ltd",
            "regulation_title": "Tax Saving Opportunity \u2014 Claim Section 10AA deduction",
            "regulation_category": "Tax",
            "message": "Executive has flagged a tax saving of \u20b910,50,000 via Section 10AA. Please advise on SEZ unit eligibility and file deduction claim.",
            "urgency": "HIGH",
            "sent_by": "Executive",
            "sent_at": (now - timedelta(minutes=45)).isoformat(),
            "status": "READ",
            "acknowledged_at": None,
            "ca_response": None,
        },
        {
            "id": "ALT100003",
            "cin": "U72900KA2018PTC123456",
            "company_name": "Technova Solutions Pvt Ltd",
            "regulation_title": "Board Resolution \u2014 Approval for Annual Return (MGT-7)",
            "regulation_category": "Corporate",
            "message": "Annual return requires board approval and must be signed by a Director before MCA21 filing. Deadline is within 60 days of AGM. Penalty: \u20b950,000 + \u20b9100/day",
            "urgency": "HIGH",
            "sent_by": "Executive",
            "sent_at": (now - timedelta(minutes=10)).isoformat(),
            "status": "UNREAD",
            "acknowledged_at": None,
            "ca_response": None,
        },
    ]

    # Seed for all companies listed in _EXEC_CREDENTIALS using Technova's alerts as a template
    # (In a real system each company would have its own alerts)
    for alert in demo_alerts:
        alerts_store.append(alert)


# ---------------------------------------------------------------------------
# CRUD helpers
# ---------------------------------------------------------------------------

def create_alert(cin: str, payload: dict) -> dict:
    alert = {
        "id":                  f"ALT{random.randint(100000, 999999)}",
        "cin":                 cin,
        "company_name":        payload["company_name"],
        "regulation_title":    payload["regulation_title"],
        "regulation_category": payload["regulation_category"],
        "message":             payload["message"],
        "urgency":             payload.get("urgency", "LOW"),   # "LOW" | "HIGH" | "EMERGENCY"
        "sent_by":             "Executive",
        "sent_at":             datetime.now(timezone.utc).isoformat(),
        "status":              "UNREAD",   # "UNREAD" | "READ" | "ACKNOWLEDGED"
        "acknowledged_at":     None,
        "ca_response":         None,
    }
    alerts_store.append(alert)
    return alert


def get_alerts(cin: str) -> list[dict]:
    """Return all alerts for a given CIN, newest first."""
    return sorted(
        [a for a in alerts_store if a["cin"] == cin],
        key=lambda a: a["sent_at"],
        reverse=True,
    )


def acknowledge_alert(alert_id: str, ca_response: str) -> dict:
    """Mark an alert as ACKNOWLEDGED and store the CA's response."""
    for alert in alerts_store:
        if alert["id"] == alert_id:
            alert["status"]          = "ACKNOWLEDGED"
            alert["ca_response"]     = ca_response
            alert["acknowledged_at"] = datetime.now(timezone.utc).isoformat()
            return alert
    raise KeyError(f"Alert '{alert_id}' not found.")


def mark_read(alert_id: str) -> dict:
    """Mark an alert as READ (intermediate state before ACKNOWLEDGED)."""
    for alert in alerts_store:
        if alert["id"] == alert_id:
            if alert["status"] == "UNREAD":
                alert["status"] = "READ"
            return alert
    raise KeyError(f"Alert '{alert_id}' not found.")
