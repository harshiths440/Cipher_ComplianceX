"""Quick smoke test for ComplianceX API endpoints."""
import urllib.request
import json

BASE = "http://localhost:8000"

def get(path):
    url = BASE + path
    res = urllib.request.urlopen(url)
    return json.loads(res.read())

# ── Test 1: Health ────────────────────────────────────────────────────────────
data = get("/")
print("=== GET / ===")
print(json.dumps(data, indent=2))

# ── Test 2: Companies list ────────────────────────────────────────────────────
companies = get("/companies")
print(f"\n=== GET /companies ===")
print(f"Total companies returned: {len(companies)}")
for c in companies:
    print(f"  {c['cin']} | {c['name']} | {c['city']} | {c['sector']}")

# ── Test 3: Single company ────────────────────────────────────────────────────
cin = "U72900KA2018PTC123456"
co = get(f"/company/{cin}")
print(f"\n=== GET /company/{cin} ===")
print(f"  Name     : {co['name']}")
print(f"  Sector   : {co['sector']}")
print(f"  City     : {co['city']}")
print(f"  Overdue  : {co['compliance_history']['overdue_filings']}")
print(f"  Directors: {[d['name'] for d in co['directors']]}")

# ── Test 4: Regulation search ─────────────────────────────────────────────────
regs = get("/search-regulation?q=penalty+for+late+annual+return")
print(f"\n=== GET /search-regulation?q=penalty+for+late+annual+return ===")
print(f"Results returned: {regs['total']}")
for r in regs["results"]:
    print(f"  Act     : {r['metadata']['act']}")
    print(f"  Section : {r['metadata']['section']}")
    print(f"  Penalty : {r['metadata']['penalty']}")
    print(f"  Score   : {r['relevance_score']}")
    print()

print("All endpoint tests passed OK!")
