"""
ComplianceX — FastAPI Backend
Endpoints:
  GET  /companies              → list of all companies (summary)
  GET  /company/{cin}          → full company object
  POST /analyze/{cin}          → run LangGraph pipeline, return ComplianceStatus
  GET  /search-regulation?q=   → semantic search over ChromaDB regulations
"""

import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from chromadb_client import search_regulation
from langgraph_orchestrator import run_analysis
from news_fetcher import get_regulatory_news, get_cache_info

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

app = FastAPI(
    title="ComplianceX API",
    description=(
        "Compliance intelligence platform for Indian private limited companies. "
        "Powered by LangGraph, ChromaDB, and Claude AI."
    ),
    version="1.0.0",
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


@app.post("/analyze/{cin}", tags=["Analysis"])
async def analyze_company(cin: str):
    """
    Run the full LangGraph compliance pipeline for a given CIN.

    Pipeline stages:
      load_company → run_rule_engine → run_risk_scorer
      → fetch_regulations → generate_remediation → compile_output

    Returns a ComplianceStatus object with risk score, violations,
    relevant regulations, and AI-generated remediation steps.
    """
    # Validate CIN exists before kicking off the expensive pipeline
    companies = _load_companies()
    if not any(c["cin"] == cin for c in companies):
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
