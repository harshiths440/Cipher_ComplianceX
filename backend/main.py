"""
ComplianceX — FastAPI Backend
Endpoints:
  GET  /companies                              -> list of all companies (summary)
  GET  /company/{cin}                          -> full company object
  POST /analyze/{cin}                          -> run LangGraph pipeline, return ComplianceStatus
  GET  /search-regulation?q=                  -> semantic search over ChromaDB regulations
  GET  /news                                  -> live + curated regulatory news (merged)
  POST /news/analyze                          -> scrape + AI-analyze a regulatory news item
  GET  /tax/{cin}                             -> Tax Expert full analysis for a company
  GET  /ca-verify/{cin}                       -> CA filing verification against regulation changes
  GET  /executive/{cin}                       -> Executive dashboard view (exposure, signatures, impact)
  POST /alerts/{cin}                          -> create Executive alert for a company
  GET  /alerts/{cin}                          -> get all alerts for a company
  PUT  /alerts/{alert_id}/acknowledge         -> CA acknowledges an alert
  PUT  /alerts/{alert_id}/read               -> mark alert as read
  POST /filing-requests/{cin}                 -> create a filing request
  GET  /filing-requests/{cin}                 -> get all filing requests for a company
  PUT  /filing-requests/{request_id}/file     -> mark a filing as FILED
  PUT  /filing-requests/{request_id}/progress -> mark a filing as IN_PROGRESS
  GET  /activity-log                          -> last 20 automation activity entries
  POST /demo/trigger-regulation               -> inject a custom regulation and run detector
"""

import json
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from scheduler import start_scheduler, activity_log

from chromadb_client import search_regulation
from gemini_client import analyze_regulatory_news
from langgraph_orchestrator import run_analysis
from news_fetcher import get_regulatory_news, get_cache_info, FALLBACK_NEWS
from tax_expert import compute_tax_analysis, compute_what_if, apply_saving_opportunity
from ca_verifier import verify_ca_filings
from alerts import create_alert, get_alerts, acknowledge_alert, mark_read, alerts_store
from filing_tracker import (
    create_filing_request, get_filing_requests, mark_filed, mark_in_progress,
    score_cache,
)

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()  # load Gemini_API_KEY from .env if present

DATA_PATH = Path(__file__).parent / "data" / "companies.json"


def _load_companies() -> list[dict]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Lifespan — start the automation scheduler on boot
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start background scheduler before the server begins accepting requests."""
    start_scheduler()
    from alerts import seed_demo_alerts
    seed_demo_alerts()
    yield
    # (scheduler stops automatically when the process exits)


app = FastAPI(
    title="ComplianceX API",
    description=(
        "Compliance intelligence platform for Indian private limited companies. "
        "Powered by LangGraph, ChromaDB, and Claude AI."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Allow all origins so the frontend can call this locally
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", tags=["Health"])
def root():
    """Health check."""
    return {"status": "ok", "service": "ComplianceX API", "version": "1.0.0"}


# ---------------------------------------------------------------------------
# Auth — Executive Portal Login
# ---------------------------------------------------------------------------

# One password per company (CIN → credentials).
# Password scheme: lowercase-slug of company name + "2024"
_EXEC_CREDENTIALS: dict[str, dict] = {
    "U72900KA2018PTC123456": {"password": "technova2024",   "name": "Technova Solutions Pvt Ltd"},
    "U51909MH2015PTC987654": {"password": "redstone2024",   "name": "Redstone Retail Ventures Pvt Ltd"},
    "U26100DL2020PTC456789": {"password": "greenfield2024", "name": "Greenfield Manufacturing Pvt Ltd"},
    "U74140TN2017PTC654321": {"password": "clearpath2024",  "name": "Clearpath Legal Consulting Pvt Ltd"},
    "U45201GJ2019PTC321098": {"password": "swiftline2024",  "name": "Swiftline Logistics Pvt Ltd"},
    "U85110RJ2021PTC112233": {"password": "arogya2024",     "name": "Arogya Health Tech Pvt Ltd"},
    "U65910MH2013PTC445566": {"password": "pinnacle2024",   "name": "Pinnacle Capital Advisors Pvt Ltd"},
    "U01100AP2022PTC778899": {"password": "haritha2024",    "name": "Haritha Agro Foods Pvt Ltd"},
    "U74999PB2016PTC334455": {"password": "infracore2024",  "name": "Infracore Builders Pvt Ltd"},
    "U40100WB2014PTC556677": {"password": "voltex2024",     "name": "Voltex Energy Solutions Pvt Ltd"},
    "U63090KL2012PTC889900": {"password": "seaways2024",    "name": "Seaways Maritime Pvt Ltd"},
    "U80301HR2023PTC001122": {"password": "edubridge2024",  "name": "EduBridge EdTech Pvt Ltd"},
    # New companies (added in expansion)
    "U65191DL2018PTC445123": {"password": "bankedge2024",   "name": "BankEdge Microfinance Pvt Ltd"},
    "U24230TG2019PTC556234": {"password": "pharmaroots2024","name": "Pharma Roots India Pvt Ltd"},
    "U27100MH2011PTC667345": {"password": "steelforge2024", "name": "SteelForge Heavy Industries Pvt Ltd"},
    "U40106GJ2020PTC778456": {"password": "greengrid2024",  "name": "GreenGrid Solar Pvt Ltd"},
    "U52100KA2017PTC889567": {"password": "freshmart2024",  "name": "FreshMart Grocery Chain Pvt Ltd"},
    "U62200MH2015PTC990678": {"password": "skybridge2024",  "name": "Skybridge Aviation Services Pvt Ltd"},
    "U63090TN2010PTC001789": {"password": "coastalship2024","name": "CoastalShip Cargo Pvt Ltd"},
    "U70100HR2016PTC112890": {"password": "landmark2024",   "name": "LandMark Realty Pvt Ltd"},
}


class LoginRequest(BaseModel):
    cin: str
    password: str


@app.post("/auth/login", tags=["Auth"])
def exec_login(body: LoginRequest):
    """
    Executive Portal login.
    Body: { cin, password }
    Returns: { cin, company_name } on success, 401 on failure.
    """
    cred = _EXEC_CREDENTIALS.get(body.cin)
    if not cred or cred["password"] != body.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"cin": body.cin, "company_name": cred["name"]}


@app.get("/companies", tags=["Companies"])
async def list_companies():
    """
    Return a summary list of all companies.
    Fields: cin, name, city, sector, type
    """
    companies = _load_companies()
    return [
        {
            "cin": c["cin"],
            "name": c["name"],
            "city": c["city"],
            "sector": c["sector"],
            "type": c["type"],
        }
        for c in companies
    ]


@app.get("/company/{cin}", tags=["Companies"])
async def get_company(cin: str):
    """
    Return the full company object for the given CIN.
    """
    companies = _load_companies()
    match = next((c for c in companies if c["cin"] == cin), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")
    return match


# ---------------------------------------------------------------------------
# Sector-Tailored Regulations
# ---------------------------------------------------------------------------

_SECTOR_CATEGORIES: dict[str, list[str]] = {
    "IT Services":                    ["Tax", "Corporate"],
    "Education Technology":           ["Tax", "Corporate"],
    "Financial Services & NBFC":      ["Securities", "Tax", "Corporate"],
    "Retail & E-Commerce":            ["GST", "Corporate", "Tax"],
    "Manufacturing":                  ["GST", "Corporate", "Tax"],
    "Healthcare & MedTech":           ["GST", "Corporate"],
    "Real Estate & Construction":     ["GST", "Tax", "Corporate"],
    "Shipping & Maritime":            ["GST", "Corporate"],
    "Logistics & Supply Chain":       ["GST", "Corporate", "Tax"],
    "Agribusiness & Food Processing": ["GST", "Corporate"],
    "Renewable Energy":               ["GST", "Tax", "Corporate"],
    "Legal & Professional Services":  ["Tax", "Corporate"],
}

_SECTOR_REASONS: dict[str, dict[str, str]] = {
    "GST":        {
        "Manufacturing":                  "Your sector involves goods production — GST on inputs, outputs, and ITC claims apply directly.",
        "Retail & E-Commerce":            "Retail and e-commerce are high-frequency GST filers; invoice matching and GSTR-1 filings are critical.",
        "Healthcare & MedTech":           "Medical devices and pharma have complex GST exemptions and rate slabs you must track.",
        "Real Estate & Construction":     "Construction materials and works contracts are heavily governed by GST notifications.",
        "Shipping & Maritime":            "Port services, freight, and bunkering attract GST; import/export documentation is key.",
        "Logistics & Supply Chain":       "Freight and warehousing are GST-liable; e-waybills and GTA compliance apply.",
        "Agribusiness & Food Processing": "Food processing GST rates change frequently; input credits on packaging affect margins.",
        "Renewable Energy":               "Solar panels and equipment attract GST; project-level ITC claims require careful tracking.",
        "default":                        "GST compliance applies to your sector for goods and services transactions.",
    },
    "Securities": {
        "Financial Services & NBFC":      "As an NBFC, SEBI and RBI regulations on securities, lending, and disclosures apply directly to you.",
        "default":                        "SEBI regulations may affect your investment disclosures and listed-entity obligations.",
    },
    "Tax":        {
        "IT Services":                    "IT companies are subject to TDS on contractor payments, advance tax on large profits, and MSME vendor rules.",
        "Education Technology":           "EdTech companies must track TDS on service payments, advance tax, and GST on digital services.",
        "Financial Services & NBFC":      "NBFCs face complex tax treatment on provisioning, interest income, and capital gains.",
        "Manufacturing":                  "Manufacturing firms must manage TDS on labour contracts, Section 43B(h) MSME payments, and advance tax.",
        "Real Estate & Construction":     "Real estate developers face TDS on land acquisition (Section 194IA) and advance tax on project profits.",
        "Logistics & Supply Chain":       "Logistics companies must track TDS on freight payments and advance tax on quarterly profits.",
        "Renewable Energy":               "Solar project companies have accelerated depreciation benefits and specific advance tax rules.",
        "Legal & Professional Services":  "Professional services firms face TDS deduction (Section 194J) from every client payment.",
        "default":                        "Income tax obligations including TDS, advance tax, and filing deadlines apply to your company.",
    },
    "Corporate":  {
        "default":                        "MCA corporate governance rules — board meetings, director KYC, annual filings — apply to all companies.",
    },
}


def _score_regulation(item: dict, sector: str) -> dict:
    """Score a news item by relevance to the given sector."""
    relevant_cats = _SECTOR_CATEGORIES.get(sector, ["Corporate"])
    cat = item.get("category", "General")

    if cat not in ["GST", "Tax", "Corporate", "Securities"]:
        score = 20
        label = "LOW"
    elif len(relevant_cats) >= 1 and cat == relevant_cats[0]:
        score = 90
        label = "HIGH"
    elif cat in relevant_cats:
        score = 60
        label = "MEDIUM"
    else:
        score = 30
        label = "LOW"

    # Reason sentence
    cat_reasons = _SECTOR_REASONS.get(cat, {})
    reason = cat_reasons.get(sector) or cat_reasons.get("default", f"{cat} regulations apply to your company.")

    return {
        **item,
        "impact": score,
        "impact_label": label,
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Relevant Regulations — violation-aware scoring helper
# ---------------------------------------------------------------------------

_REG_SECTOR_MAP: dict[str, list[str]] = {
    "Financial Services & NBFC": ["Securities", "Tax", "Corporate"],
    "Information Technology":    ["Tax", "Corporate"],
    "Manufacturing":             ["GST", "Corporate", "Tax"],
    "Healthcare":                ["GST", "Corporate"],
    "Real Estate":               ["GST", "Tax", "Corporate"],
    "Maritime":                  ["GST", "Corporate"],
    "EdTech":                    ["Tax", "Corporate", "GST"],
}

_VIOLATION_CATEGORY_MAP: dict[str, str] = {
    "gst":           "GST",
    "director":      "Corporate",
    "roc":           "Corporate",
    "tds":           "Tax",
    "advance tax":   "Tax",
    "annual return": "Corporate",
    "sebi":          "Securities",
    "income tax":    "Tax",
}


async def get_relevant_regulations(
    company: dict, violations: list
) -> tuple[list, dict]:
    """Score and filter news items by sector relevance + active violation categories.

    Returns (scored_items, debug_info) so callers can surface debug metadata.
    """
    news = await get_regulatory_news()
    total_before = len(news)

    sector = company.get("sector", "")
    # Debug: print the exact sector value so we can inspect mismatches
    print(f"[regulations] company='{company.get('name')}' sector='{sector}'")

    matched_categories = _REG_SECTOR_MAP.get(sector)
    if matched_categories is None:
        print(f"[regulations] WARNING: sector '{sector}' not in _REG_SECTOR_MAP — using default ['Corporate', 'Tax']")
        matched_categories = ["Corporate", "Tax"]
    else:
        print(f"[regulations] matched_categories={matched_categories}")

    # Derive categories from active violations
    violation_categories: set[str] = set()
    for v in violations:
        description = v.get("description", "").lower()
        for keyword, category in _VIOLATION_CATEGORY_MAP.items():
            if keyword in description:
                violation_categories.add(category)

    scored_news = []
    for item in news:
        score = 0
        reason = ""

        # Layer 1 — sector match
        if item["category"] in matched_categories:
            score += 1
            reason = f"Relevant to {sector}"

        # Layer 2 — violation match (higher priority)
        if item["category"] in violation_categories:
            score += 2
            reason = "Directly related to your active violations"

        # Layer 3 — severity boost
        if item.get("severity") == "HIGH":
            score += 1

        if score > 0:
            scored_news.append({
                **item,
                "relevance_score":  score,
                "relevance_reason": reason,
                "affects_you":      True,
            })

    scored_news.sort(key=lambda x: x["relevance_score"], reverse=True)
    result = scored_news[:6]

    debug_info = {
        "company_sector":      sector,
        "matched_categories":  matched_categories,
        "total_before_filter": total_before,
        "total_after_filter":  len(result),
    }
    print(f"[regulations] debug={debug_info}")
    return result, debug_info


@app.get("/regulations/{cin}", tags=["Analysis"])
async def get_tailored_regulations(cin: str):
    """
    Return up to 6 regulatory news items scored by relevance to this company's
    sector and active violations.

    Scoring layers:
      +1  — item category matches the company sector
      +2  — item category matches an active violation category
      +1  — item severity is HIGH

    Response: { items, company_name, sector, total, debug }
      debug.company_sector      — exact sector string from companies.json
      debug.matched_categories  — categories used for Layer-1 scoring
      debug.total_before_filter — total news items before scoring
      debug.total_after_filter  — items returned after scoring/capping
    """
    companies = _load_companies()
    company = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company '{cin}' not found.")

    from rule_engine import RuleEngine
    violations = RuleEngine().evaluate(company)

    try:
        items, debug_info = await get_relevant_regulations(company, violations)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regulation scoring failed: {str(e)}")

    return {
        "items":        items,
        "company_name": company["name"],
        "sector":       company.get("sector", ""),
        "total":        len(items),
        "debug":        debug_info,
    }




@app.post("/analyze/{cin}", tags=["Analysis"])
async def analyze_company(cin: str):
    """
    Run the full LangGraph compliance pipeline for a given CIN.

    Pipeline stages:
      load_company → run_rule_engine → run_risk_scorer
      → fetch_regulations → generate_remediation → compile_output

    Returns a ComplianceStatus object with risk score, violations,
    relevant regulations, AI-generated remediation steps, and a
    `relevant_regulations` list scored by sector + active violations.
    """
    # Validate CIN exists before kicking off the expensive pipeline
    companies = _load_companies()
    company = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    try:
        result = await run_analysis(cin)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis pipeline failed: {str(e)}",
        )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    # Attach violation-aware relevant regulations
    violations = result.get("violations", [])
    try:
        reg_items, _ = await get_relevant_regulations(company, violations)
        result["relevant_regulations"] = reg_items
    except Exception:
        result["relevant_regulations"] = []

    return result


@app.get("/search-regulation", tags=["Regulations"])
async def search_regulations(q: str = Query(..., description="Plain-English compliance query")):
    """
    Perform a semantic search over the pre-loaded Indian compliance regulation corpus.

    Example: /search-regulation?q=penalty for late annual return filing
    Returns top 2 matching regulation chunks with metadata.
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query parameter 'q' must not be empty.")

    try:
        results = search_regulation(q.strip(), n_results=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Regulation search failed: {str(e)}")

    return {
        "query": q.strip(),
        "results": results,
        "total": len(results),
    }


@app.get("/news", tags=["News"])
async def get_news(
    category: Optional[str] = Query(None, description="Filter by category: GST | Corporate | Tax | Securities | General"),
    limit: int = Query(20, ge=1, le=50, description="Maximum number of items to return"),
):
    """
    Fetch live Indian regulatory news from PIB, SEBI, Income Tax, and MCA.
    Results are cached for 30 minutes. Falls back to curated sample data if
    all live sources are unavailable.
    """
    items = await get_regulatory_news(max_items=50)

    if category:
        items = [i for i in items if i["category"].lower() == category.lower()]

    cache_info = get_cache_info()

    return {
        "items": items[:limit],
        "total": len(items),
        "cached": cache_info["cached"],
        "last_updated": cache_info["last_updated"],
    }


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------


class NewsAnalyzeRequest(BaseModel):
    title: str
    link: str
    source: str
    category: str


_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}


@app.post("/news/analyze", tags=["News"])
async def analyze_news_item(req: NewsAnalyzeRequest):
    """
    Return a structured compliance breakdown for a news item.

    Lookup order:
      1. Exact match on title or rule_name in FALLBACK_NEWS -> instant pre-baked response
      2. Scrape full page via httpx + call Gemini 2.0 Flash -> AI-generated response

    Always returns a valid JSON object. Never raises on scrape or LLM failure.
    """
    # ── 1. Static lookup (title OR rule_name) ─────────────────────────────────
    req_title_lower     = req.title.strip().lower()
    for item in FALLBACK_NEWS:
        item_title     = item.get("title", "").strip().lower()
        item_rule_name = item.get("rule_name", "").strip().lower()
        if req_title_lower in (item_title, item_rule_name):
            # Return only the analysis-relevant keys
            return {
                "rule_name":          item.get("rule_name", item["title"]),
                "what_changed":       item.get("what_changed", "See full article for details."),
                "who_it_hits":        item.get("who_it_hits", item["source"]),
                "what_to_do":         item.get("what_to_do", ["Visit the official source for details"]),
                "deadline":           item.get("deadline"),
                "penalty":            item.get("penalty"),
                "severity":           item.get("severity", "MEDIUM"),
                "compared_to_before": item.get("compared_to_before"),
            }

    # ── 2. Scrape page ────────────────────────────────────────────────────────
    plain_text = ""
    try:
        async with httpx.AsyncClient(
            headers=_SCRAPE_HEADERS, follow_redirects=True, timeout=12
        ) as client:
            resp = await client.get(req.link)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            plain_text = soup.get_text(separator=" ", strip=True)
    except Exception:
        plain_text = req.title

    # ── 3. Analyze with Gemini ────────────────────────────────────────────────
    result = analyze_regulatory_news(
        title=req.title,
        content=plain_text[:3000],
        source=req.source,
        category=req.category,
    )

    return result


# ---------------------------------------------------------------------------
# Tax Expert
# ---------------------------------------------------------------------------

@app.get("/tax/{cin}", tags=["Tax"])
async def get_tax_analysis(cin: str):
    """
    Run the Tax Expert (Doctor 3) analysis for a company.

    Computes:
    - Advance tax installments with live countdown and PAID/MISSED/DUE_SOON status
    - TDS obligations cross-referenced against filing_history
    - MAT applicability check (Section 115JB)
    - Sector-specific savings opportunities (80IC, 10AA, 35AD)
    - Risk flags, effective tax rate, and what-if scenarios
    """
    companies = _load_companies()
    company = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    try:
        tax_data = compute_tax_analysis(company)
        what_if  = compute_what_if(company, tax_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tax analysis failed: {str(e)}")

    return {**tax_data, "what_if": what_if}


class ApplySavingRequest(BaseModel):
    scenario_id:    str
    scenario_title: str
    form:           str
    saving:         int
    company_name:   str


@app.post("/tax/{cin}/apply-saving", tags=["Tax"])
def post_apply_saving(cin: str, body: ApplySavingRequest):
    """
    Executive flags a what-if tax saving scenario for the CA to action.

    Creates a filing request, sends an alert to the CA, and logs the activity.
    Returns the filing request ID and confirmation message.
    """
    companies = _load_companies()
    if not any(c["cin"] == cin for c in companies):
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    try:
        result = apply_saving_opportunity(
            cin=cin,
            company_name=body.company_name,
            scenario_id=body.scenario_id,
            scenario_title=body.scenario_title,
            form=body.form,
            saving=body.saving,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply saving opportunity: {str(e)}")

    return result


@app.get("/tax/{cin}/countdown", tags=["Tax"])
async def get_tax_countdown(cin: str):
    """
    Returns live advance tax installment countdown data only.
    Designed to be polled every 60 seconds by the frontend to keep
    countdowns live without reloading the full tax analysis.

    Response includes:
    - installments: all 4 installments with live days_remaining and status
    - next_due: the soonest upcoming installment
    - total_missed: count of missed installments
    - total_interest_accrued: total interest from missed installments
    - as_of: today's date (ISO)
    """
    from datetime import date as _date
    companies = _load_companies()
    company = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    try:
        tax_data = compute_tax_analysis(company)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tax analysis failed: {str(e)}")

    installments = tax_data["advance_tax"]["installments"]
    upcoming     = [
        i for i in installments
        if i["status"] in ("UPCOMING", "UPCOMING_SOON", "DUE_SOON")
    ]
    next_due = upcoming[0] if upcoming else None

    missed     = [i for i in installments if i["status"] == "MISSED"]
    total_missed = len(missed)
    total_interest_accrued = tax_data["advance_tax"]["interest_liability"]

    return {
        "installments":          installments,
        "next_due":              next_due,
        "total_missed":          total_missed,
        "total_interest_accrued": total_interest_accrued,
        "as_of":                 _date.today().isoformat(),
    }


# ---------------------------------------------------------------------------
# CA Verifier
# ---------------------------------------------------------------------------

@app.get("/ca-verify/{cin}", tags=["CA Verification"])
async def ca_verify(cin: str):
    """
    Cross-reference synthesised company filings against the regulatory news
    dataset to detect AT_RISK and OUTDATED filings.

    Status:
    - VERIFIED  — no conflicting regulation found
    - AT_RISK   — filed within 30 days of a new regulation
    - OUTDATED  — filed before a regulation that amends a prior rule
    """
    companies = _load_companies()
    company = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    try:
        news_data = await get_regulatory_news(max_items=50)
        result = verify_ca_filings(company, news_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CA verification failed: {str(e)}")

    return result


# ---------------------------------------------------------------------------
# Executive Dashboard View
# ---------------------------------------------------------------------------

# Sector -> relevant regulatory news categories for impact cross-reference
_SECTOR_NEWS_MAP: dict[str, list[str]] = {
    "IT Services":                   ["Tax", "Corporate"],
    "Education Technology":          ["Tax", "Corporate"],
    "Financial Services & NBFC":     ["Securities", "Tax"],
    "Retail & E-Commerce":           ["GST", "Tax"],
    "Manufacturing":                 ["GST", "Corporate"],
    "Logistics & Supply Chain":      ["GST", "Corporate"],
    "Agribusiness & Food Processing":["GST", "Tax"],
    "Real Estate & Construction":    ["GST", "Corporate"],
    "Renewable Energy":              ["Tax", "Corporate"],
    "Shipping & Maritime":           ["GST", "Securities"],
    "Healthcare & MedTech":          ["Tax", "Corporate"],
}

# Rules that carry personal / director liability
_DIRECTOR_RULES = {
    "Disqualified Director on Board",
    "Annual Return Not Filed",
    "Overdue ROC Filing",
    "Repeat Offender Pattern",
}

# Hardcoded signature-required obligations mapped from rule names
_SIGNATURE_META: dict[str, dict] = {
    "Disqualified Director on Board": {
        "item":     "Director Disqualification — Board Action Required",
        "reason":   "A disqualified director cannot legally act. Board must convene and pass a resolution to reconstitute the board.",
        "deadline": "Immediately",
        "penalty":  "Imprisonment up to 6 months OR fine ₹1L–5L (Section 167)",
        "law_ref":  "Companies Act 2013 — Section 164(2) & 167(1)(a)",
    },
    "Annual Return Not Filed": {
        "item":     "Board Resolution — Approval for Annual Return (MGT-7)",
        "reason":   "Annual return requires board approval and must be signed by a Director and CS/CA before MCA21 filing.",
        "deadline": "Within 60 days of AGM",
        "penalty":  "₹50,000 + ₹100/day (max ₹5L)",
        "law_ref":  "Companies Act 2013 — Section 92(4) & 92(5)",
    },
    "Overdue ROC Filing": {
        "item":     "Director Sign-off — Overdue ROC Forms",
        "reason":   "Overdue forms (AOC-4, MGT-7) require digital signature of an authorised director before submission.",
        "deadline": "Immediate — additional fees accruing daily",
        "penalty":  "₹200/day late fee + compounding penalty",
        "law_ref":  "Companies Act 2013 — Section 92(5) & Section 137(3)",
    },
    "Repeat Offender Pattern": {
        "item":     "Board Resolution — Compliance Remediation Plan",
        "reason":   "Repeat violations require the board to pass a remediation resolution and appoint a compliance officer under Section 454B.",
        "deadline": "Within 30 days of second violation notice",
        "penalty":  "₹25,000 per violation × number of violations",
        "law_ref":  "Companies Act 2013 — Section 454B",
    },
    "Tax Payment Shortfall": {
        "item":     "Board Approval — Advance Tax Settlement",
        "reason":   "Outstanding tax shortfall requires board resolution authorising payment and engagement of tax counsel.",
        "deadline": "Next advance tax due date",
        "penalty":  "1% per month interest under Section 234B/C",
        "law_ref":  "Income Tax Act 1961 — Section 234B & 234C",
    },
    "GST Return Arrears": {
        "item":     "Director Auth — GST Arrear Payment & Return Filing",
        "reason":   "Consecutive GST defaults can trigger GST registration cancellation. Director must authorise bulk filing and penalty payment.",
        "deadline": "Immediate to avoid registration cancellation",
        "penalty":  "₹200/day IGST + ₹100/day CGST+SGST; registration cancellation risk",
        "law_ref":  "CGST Act 2017 — Section 29(2) & Section 47",
    },
}


@app.get("/executive/{cin}", tags=["Executive"])
async def get_executive_view(cin: str):
    """
    Executive dashboard view for a company.

    Assembles:
    - Total penalty exposure from rule engine violations
    - Signature-required items (director / board action needed)
    - Regulatory news items relevant to the company sector
    - CA audit summary (filing health at a glance, verified_filings list)
    - What-If tax savings bundled (no extra /tax call needed)
    - Pending filing requests and unread alerts
    """
    companies = _load_companies()
    company   = next((c for c in companies if c["cin"] == cin), None)
    if company is None:
        raise HTTPException(status_code=404, detail=f"Company with CIN '{cin}' not found.")

    from rule_engine import RuleEngine
    import re as _re
    violations = RuleEngine().evaluate(company)

    # ── Penalty parser: extract first integer from strings like "₹200/day" ───
    def _parse_penalty_int(penalty_str: str, default_days: int = 30) -> int:
        if isinstance(penalty_str, (int, float)):
            return int(penalty_str) * default_days
        s = str(penalty_str).replace(",", "")
        m = _re.search(r"(\d+)", s)
        if not m:
            return 0
        amount = int(m.group(1))
        if "/day" in penalty_str.lower() or "per day" in penalty_str.lower():
            return amount * default_days
        return amount

    # ── Violations fallback: if rule engine returns nothing, use filing_history
    if not violations:
        filing_history = company.get("filing_history", [])
        from datetime import date as _date_cls
        today = _date_cls.today()
        for filing in filing_history:
            try:
                filed = _date_cls.fromisoformat(filing.get("date", "2000-01-01"))
                days_since = (today - filed).days
            except Exception:
                days_since = 999
            if days_since > 365:
                violations.append({
                    "rule":              "Overdue ROC Filing",
                    "description":       f"{filing.get('form', 'Unknown form')} has not been filed in over a year.",
                    "severity":          "HIGH",
                    "penalty":           "₹200/day",
                    "penalty_amount_inr": 200 * 30,
                    "law_reference":     "Companies Act 2013 — Section 92(5)",
                })

    # ── Exposure totals ──────────────────────────────────────────────────────
    total_exposure = 0
    for v in violations:
        raw = v.get("penalty_amount_inr")
        if raw:
            total_exposure += int(raw)
        else:
            total_exposure += _parse_penalty_int(v.get("penalty", "0"))

    critical_count = sum(1 for v in violations if v["severity"] == "CRITICAL")
    high_count     = sum(1 for v in violations if v["severity"] == "HIGH")

    # ── Signature-required items ─────────────────────────────────────────────
    signature_required = []
    for v in violations:
        rule = v["rule"]
        if rule in _DIRECTOR_RULES or rule in _SIGNATURE_META:
            meta = _SIGNATURE_META.get(rule)
            if meta:
                signature_required.append(meta)

    # Fallback: map HIGH/CRITICAL violations that have no _SIGNATURE_META entry
    if not signature_required:
        for v in violations:
            if v["severity"] in ("HIGH", "CRITICAL"):
                signature_required.append({
                    "item":     v.get("description", v["rule"]),
                    "reason":   v.get("description", "This violation requires executive action."),
                    "deadline": "Immediate",
                    "penalty":  v.get("penalty", "See violation details"),
                    "law_ref":  v.get("law_reference", "N/A"),
                })

    # De-duplicate
    seen_items: set[str] = set()
    deduped_sigs = []
    for s in signature_required:
        if s["item"] not in seen_items:
            seen_items.add(s["item"])
            deduped_sigs.append(s)

    # ── Regulatory impact cross-reference ────────────────────────────────────
    sector        = company.get("sector", "")
    relevant_cats = _SECTOR_NEWS_MAP.get(sector, ["Corporate", "Tax"])

    try:
        all_news = await get_regulatory_news(max_items=60)
    except Exception:
        all_news = FALLBACK_NEWS

    regulatory_impact = []
    for item in all_news:
        if item.get("category") in relevant_cats:
            cat = item.get("category", "")
            cat_reasons = _SECTOR_REASONS.get(cat, {})
            relevance_reason = (
                cat_reasons.get(sector)
                or cat_reasons.get("default", f"{cat} regulations apply to your company.")
            )
            regulatory_impact.append({
                **item,
                "impact_on_company": (
                    f"This regulation affects {sector} companies in {company.get('city', 'India')}. "
                    f"Deadline: {item.get('deadline', 'As notified')}. "
                    f"Penalty: {item.get('penalty', 'See regulation text')}."
                ),
                "relevance_reason": relevance_reason,
            })
        if len(regulatory_impact) >= 6:
            break

    # ── CA summary (with full verified_filings list) ──────────────────────────
    try:
        ca_result = verify_ca_filings(company, all_news)
    except Exception:
        ca_result = {"total_filings": 0, "at_risk_count": 0, "outdated_count": 0, "verified_filings": []}

    verified_filings = ca_result.get("verified_filings", [])
    last_filing = verified_filings[0] if verified_filings else None
    ca_summary = {
        "total_filings":    ca_result.get("total_filings", 0),
        "at_risk_count":    ca_result.get("at_risk_count", 0),
        "outdated_count":   ca_result.get("outdated_count", 0),
        "last_filed_date":  last_filing["filed_date"] if last_filing else None,
        "last_filed_form":  last_filing["form"]       if last_filing else None,
        "last_ca_name":     last_filing["filed_by"]   if last_filing else None,
        "verified_filings": verified_filings,
    }

    # ── What-If tax data (bundled — no extra /tax call needed) ───────────────
    try:
        from tax_expert import compute_tax_analysis, compute_what_if
        tax_data = compute_tax_analysis(company)
        what_if  = compute_what_if(company, tax_data)
    except Exception:
        what_if = None

    # ── Filing requests & alerts ──────────────────────────────────────────────
    filing_requests = get_filing_requests(cin)
    alerts_sent     = [a for a in alerts_store if a["cin"] == cin]

    return {
        "company": {
            "name":   company["name"],
            "cin":    cin,
            "sector": sector,
            "city":   company.get("city", ""),
        },
        "total_exposure":      total_exposure,
        "critical_count":      critical_count,
        "high_count":          high_count,
        "signature_required":  deduped_sigs,
        "regulatory_impact":   regulatory_impact,
        "ca_summary":          ca_summary,
        "filing_requests":     filing_requests,
        "alerts_sent":         alerts_sent,
    }


# ---------------------------------------------------------------------------
# Alerts — Pydantic models
# ---------------------------------------------------------------------------

class AlertCreateRequest(BaseModel):
    company_name:        str
    regulation_title:    str
    regulation_category: str
    message:             str
    urgency:             str = "LOW"   # LOW | HIGH | EMERGENCY

class ChatRequest(BaseModel):
    system: str
    messages: list[dict]


class AcknowledgeRequest(BaseModel):
    ca_response: str


# ---------------------------------------------------------------------------
# Alerts — Endpoints
# ---------------------------------------------------------------------------

@app.post("/alerts/{cin}", tags=["Alerts"])
def post_create_alert(cin: str, body: AlertCreateRequest):
    """Executive creates an urgency alert for a company's CA."""
    return create_alert(cin, body.model_dump())


@app.get("/alerts/{cin}", tags=["Alerts"])
def post_get_alerts(cin: str):
    """Retrieve all alerts for a given company CIN."""
    return get_alerts(cin)


@app.put("/alerts/{alert_id}/acknowledge", tags=["Alerts"])
def put_acknowledge_alert(alert_id: str, body: AcknowledgeRequest):
    """CA acknowledges an alert and provides a response."""
    try:
        return acknowledge_alert(alert_id, body.ca_response)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.put("/alerts/{alert_id}/read", tags=["Alerts"])
def put_mark_read(alert_id: str):
    """Mark an alert as READ."""
    try:
        return mark_read(alert_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.post("/chat", tags=["AI"])
async def chat_endpoint(req: ChatRequest):
    """Proxy chat requests to Gemini with system instructions."""
    from google import genai
    from google.genai import types
    import os
    
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    formatted_messages = []
    for msg in req.messages:
        role = "user" if msg["role"] == "user" else "model"
        formatted_messages.append(
            types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
        )
        
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=formatted_messages,
            config=types.GenerateContentConfig(
                system_instruction=req.system,
                max_output_tokens=1000,
            )
        )
        return {"reply": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Filing Tracker — Pydantic models
# ---------------------------------------------------------------------------

class FilingCreateRequest(BaseModel):
    company_name:   str
    form_name:      str           # e.g. "GSTR-3B", "MGT-7"
    regulation_ref: str = ""      # rule name from news dataset
    deadline:       str           # e.g. "15 May 2026"
    notes:          Optional[str] = None


class FilingMarkRequest(BaseModel):
    ca_name:   str
    form_name: str
    portal:    str = ""           # override portal name (optional)


# ---------------------------------------------------------------------------
# Filing Tracker — Endpoints
# ---------------------------------------------------------------------------

@app.post("/filing-requests/{cin}", tags=["Filing Tracker"])
def post_create_filing(cin: str, body: FilingCreateRequest):
    """Executive creates a filing request for a CA."""
    return create_filing_request(cin, body.model_dump())


@app.get("/filing-requests/{cin}", tags=["Filing Tracker"])
def post_get_filings(cin: str):
    """Retrieve all filing requests for a given company CIN."""
    return get_filing_requests(cin)


@app.put("/filing-requests/{request_id}/file", tags=["Filing Tracker"])
def put_mark_filed(request_id: str, body: FilingMarkRequest):
    """CA marks a filing as FILED and generates an ACK number."""
    try:
        return mark_filed(request_id, body.ca_name, body.form_name, body.portal)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.put("/filing-requests/{request_id}/progress", tags=["Filing Tracker"])
def put_mark_in_progress(request_id: str):
    """CA marks a filing request as IN_PROGRESS."""
    try:
        return mark_in_progress(request_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Score Update
# ---------------------------------------------------------------------------

@app.get("/score-update/{cin}", tags=["Scheduler"])
def get_score_update(cin: str):
    """
    Return the most recent risk score recalculation for a company.

    The score is recomputed automatically whenever a filing request is marked
    as FILED via PUT /filing-requests/{request_id}/file.

    Response (when data exists):
      previous_score  — score before the last filing
      new_score       — score after recomputation
      delta           — previous_score − new_score  (positive = improvement)
      recalculated_at — ISO timestamp of the recalculation
      triggered_by    — "{form} filed by {ca_name}"

    Returns null for all fields when no recalculation has occurred yet.
    """
    entry = score_cache.get(cin)
    if not entry:
        return {
            "previous_score":  None,
            "new_score":       None,
            "delta":           None,
            "recalculated_at": None,
            "triggered_by":    None,
        }
    return {
        "previous_score":  entry["previous_score"],
        "new_score":       entry["new_score"],
        "delta":           entry["previous_score"] - entry["new_score"],
        "recalculated_at": entry["recalculated_at"],
        "triggered_by":    entry["triggered_by"],
    }


# ---------------------------------------------------------------------------
# Activity Log
# ---------------------------------------------------------------------------

@app.get("/activity-log", tags=["Scheduler"])
def get_activity_log():
    """
    Return the last 20 automation activity entries from the in-memory log.

    Response:
      entries      — list of activity entries (newest first)
      total        — total entries currently in the log (max 50)
      last_updated — ISO timestamp of the most recent entry, or None
    """
    entries = activity_log[:20]
    return {
        "entries":      entries,
        "total":        len(activity_log),
        "last_updated": entries[0]["full_timestamp"] if entries else None,
    }


# ---------------------------------------------------------------------------
# Demo — Trigger Regulation
# ---------------------------------------------------------------------------

class TriggerRegulationRequest(BaseModel):
    title:    str
    category: str   # GST | Tax | Corporate | Securities | General
    severity: str = "HIGH"   # LOW | MEDIUM | HIGH


@app.post("/demo/trigger-regulation", tags=["Scheduler"])
async def demo_trigger_regulation(body: TriggerRegulationRequest):
    """
    Inject a custom regulation into the live news dataset and immediately
    run the regulation-impact detector job against all companies.

    Body: { title, category, severity }
    Returns:
      regulation_added  — the injected news item
      companies_affected — number of alerts created in this run
      alerts_created    — same value (for convenience)
    """
    from news_fetcher import FALLBACK_NEWS
    from scheduler import job_regulation_detector

    today = datetime.now().strftime("%d %b %Y")
    new_item = {
        "title":              body.title,
        "source":             "Demo Trigger",
        "source_icon":        "🧪",
        "date":               today,
        "previous_rule_date": today,
        "link":               "#",
        "category":           body.category,
        "rule_name":          body.title,
        "what_changed":       f"Demo-triggered regulation: {body.title}",
        "who_it_hits":        "All companies in the relevant sector",
        "what_to_do":         ["Review the new regulation", "Assess impact", "File required forms"],
        "deadline":           "As notified",
        "penalty":            "As per regulation",
        "severity":           body.severity.upper(),
        "compared_to_before": "N/A — demo-injected regulation",
    }

    # Inject into the shared FALLBACK_NEWS list so it is picked up by the detector
    FALLBACK_NEWS.insert(0, new_item)

    # Count alerts before running the job
    from alerts import alerts_store as _alerts
    count_before = len(_alerts)

    # Run the detector immediately (it is an async job)
    await job_regulation_detector()

    alerts_created = len(_alerts) - count_before

    return {
        "regulation_added":   new_item,
        "companies_affected": alerts_created,
        "alerts_created":     alerts_created,
    }


# ---------------------------------------------------------------------------
# Entry Point (uvicorn)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
