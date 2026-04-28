"""
Quick live API test — run while server is up on :8000
"""
import urllib.request
import urllib.parse
import json

BASE = "http://localhost:8000"

def get(path):
    r = urllib.request.urlopen(BASE + path)
    return json.loads(r.read())

# Health
h = get("/")
print("GET /  ->", h)

# Companies list
companies = get("/companies")
print(f"\nGET /companies -> {len(companies)} companies")
for c in companies[:4]:
    print(f"  {c['cin']} | {c['name']} | {c['city']}")

# Full company
cin = companies[1]["cin"]  # Redstone — should be CRITICAL
company = get(f"/company/{cin}")
print(f"\nGET /company/{cin}")
print(f"  Name: {company['name']}")
print(f"  Overdue filings: {company['compliance_history']['overdue_filings']}")
print(f"  GST pending months: {company['financials']['gst_pending_months']}")

# Regulation search
q = urllib.parse.quote("penalty for late GST return filing")
reg = get(f"/search-regulation?q={q}")
print(f"\nGET /search-regulation?q=penalty for late GST return filing")
print(f"  Total results: {reg['total']}")
for hit in reg["results"]:
    print(f"  [{hit['relevance_score']}] {hit['metadata']['section']}")

print("\nAll endpoints OK!")
