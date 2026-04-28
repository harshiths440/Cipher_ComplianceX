"""
news_fetcher.py — RegulatoryNewsFetcher
Fetches live Indian regulatory news from PIB (RSS), SEBI, Income Tax, and MCA.
Caches results in-memory for 30 minutes. Falls back to hardcoded news if all
live sources fail.
"""

import re
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from xml.etree import ElementTree as ET

import httpx
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

CACHE_TTL_MINUTES = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}

PIB_KEYWORDS = [
    "gst", "tax", "mca", "sebi", "rbi", "compliance",
    "companies", "income tax", "ministry of finance", "corporate",
]

FALLBACK_NEWS = [
    {
        "title": "SEBI tightens disclosure norms for listed companies — stricter RPT reporting required",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "15 Apr 2026",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
    },
    {
        "title": "MCA21 V3 portal launches new company incorporation workflow — reduced timeline to 24 hours",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "10 Apr 2026",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
    },
    {
        "title": "GST Council clarifies ITC reversal rules for mixed supply transactions",
        "source": "PIB",
        "source_icon": "📡",
        "date": "08 Apr 2026",
        "link": "https://pib.gov.in",
        "category": "GST",
    },
    {
        "title": "Income Tax Department extends ITR filing deadline for AY 2025-26 to August 31",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "05 Apr 2026",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
    },
    {
        "title": "SEBI introduces T+0 settlement cycle for top 500 listed securities",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "01 Apr 2026",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
    },
    {
        "title": "Companies Act amendment — mandatory CSR reporting for companies with turnover above ₹250 Cr",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "28 Mar 2026",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
    },
]

# ---------------------------------------------------------------------------
# Cache state
# ---------------------------------------------------------------------------

_cache: dict = {
    "items": [],
    "last_fetched": None,  # datetime or None
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _detect_category(title: str) -> str:
    t = title.lower()
    if "gst" in t or "goods and services" in t:
        return "GST"
    if "sebi" in t or "securities" in t or "market" in t:
        return "Securities"
    if "income tax" in t or "tds" in t or "advance tax" in t:
        return "Tax"
    if "mca" in t or "companies act" in t or "roc" in t or "director" in t:
        return "Corporate"
    return "General"


def _format_date(raw: Optional[str]) -> str:
    """Try to parse a date string into 'DD MMM YYYY'. Return 'Recent' on failure."""
    if not raw:
        return "Recent"
    raw = raw.strip()
    # RFC 822 format used by RSS (e.g. "Mon, 28 Apr 2026 10:00:00 +0530")
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%d %b %Y",
        "%B %d, %Y",
        "%d-%m-%Y",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw, fmt).strftime("%d %b %Y")
        except ValueError:
            continue
    # Last-resort: grab first 11 chars if it looks like "28 Apr 2026"
    match = re.search(r"\d{1,2}\s+\w{3}\s+\d{4}", raw)
    if match:
        return match.group(0)
    return "Recent"


def _make_item(title, source, source_icon, date_raw, link) -> dict:
    return {
        "title": title.strip(),
        "source": source,
        "source_icon": source_icon,
        "date": _format_date(date_raw),
        "link": link.strip() if link else "#",
        "category": _detect_category(title),
    }


# ---------------------------------------------------------------------------
# Source fetchers
# ---------------------------------------------------------------------------

async def _fetch_pib(client: httpx.AsyncClient) -> list[dict]:
    url = "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"
    resp = await client.get(url, timeout=10)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    items = []
    for item in root.findall(".//item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pub_el = item.find("pubDate")
        if title_el is None or title_el.text is None:
            continue
        title = title_el.text.strip()
        # Filter by keywords
        if not any(kw in title.lower() for kw in PIB_KEYWORDS):
            continue
        link = link_el.text.strip() if link_el is not None and link_el.text else "https://pib.gov.in"
        date_raw = pub_el.text if pub_el is not None else None
        items.append(_make_item(title, "PIB", "📡", date_raw, link))
    return items


async def _fetch_sebi(client: httpx.AsyncClient) -> list[dict]:
    url = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0"
    resp = await client.get(url, timeout=10)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    items = []
    # SEBI press release table rows — look for anchor tags inside typical listing containers
    for a in soup.select("td a[href]"):
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if len(text) < 15:
            continue
        full_link = ("https://www.sebi.gov.in" + href) if href.startswith("/") else href
        # Try to grab a nearby date text
        td_parent = a.find_parent("td")
        date_raw = None
        if td_parent:
            sibling = td_parent.find_next_sibling("td")
            if sibling:
                date_raw = sibling.get_text(strip=True)
        items.append(_make_item(text, "SEBI", "📊", date_raw, full_link))
        if len(items) >= 5:
            break
    return items


async def _fetch_income_tax(client: httpx.AsyncClient) -> list[dict]:
    url = "https://www.incometax.gov.in/iec/foportal/newsroom"
    resp = await client.get(url, timeout=10)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    items = []
    for a in soup.select("a[href]"):
        text = a.get_text(strip=True)
        if len(text) < 15:
            continue
        href = a.get("href", "")
        if not href or href == "#":
            continue
        full_link = ("https://www.incometax.gov.in" + href) if href.startswith("/") else href
        date_raw = None
        parent = a.find_parent(["li", "div", "tr"])
        if parent:
            date_match = re.search(r"\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}", parent.get_text())
            if date_match:
                date_raw = date_match.group(0)
        items.append(_make_item(text, "Income Tax", "🧮", date_raw, full_link))
        if len(items) >= 5:
            break
    return items


async def _fetch_mca(client: httpx.AsyncClient) -> list[dict]:
    url = "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/notifications.html"
    resp = await client.get(url, timeout=10)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "lxml")
    items = []
    for a in soup.select("a[href]"):
        text = a.get_text(strip=True)
        if len(text) < 15:
            continue
        href = a.get("href", "")
        if not href or href == "#":
            continue
        full_link = ("https://www.mca.gov.in" + href) if href.startswith("/") else href
        date_raw = None
        parent = a.find_parent(["li", "div", "tr", "td"])
        if parent:
            date_match = re.search(r"\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}", parent.get_text())
            if date_match:
                date_raw = date_match.group(0)
        items.append(_make_item(text, "MCA", "🏛️", date_raw, full_link))
        if len(items) >= 5:
            break
    return items


# ---------------------------------------------------------------------------
# Main export
# ---------------------------------------------------------------------------

async def get_regulatory_news(max_items: int = 20) -> list[dict]:
    """
    Return a combined list of regulatory news from all sources, sorted by
    date descending. Uses a 30-minute in-memory cache. Falls back to
    FALLBACK_NEWS if all live sources fail.
    """
    global _cache

    # Return cached results if fresh
    if _cache["last_fetched"] is not None:
        age = datetime.utcnow() - _cache["last_fetched"]
        if age < timedelta(minutes=CACHE_TTL_MINUTES):
            return _cache["items"][:max_items]

    all_items: list[dict] = []
    fetchers = [_fetch_pib, _fetch_sebi, _fetch_income_tax, _fetch_mca]

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(
            *[f(client) for f in fetchers],
            return_exceptions=True,
        )

    for result in results:
        if isinstance(result, Exception):
            # Source failed — skip gracefully
            continue
        all_items.extend(result)

    if not all_items:
        # All sources failed — serve fallback
        return FALLBACK_NEWS[:max_items]

    # Sort by date desc (items with "Recent" sorted last)
    def _sort_key(item):
        d = item.get("date", "Recent")
        if d == "Recent":
            return datetime.min
        try:
            return datetime.strptime(d, "%d %b %Y")
        except ValueError:
            return datetime.min

    all_items.sort(key=_sort_key, reverse=True)

    # Update cache
    _cache["items"] = all_items
    _cache["last_fetched"] = datetime.utcnow()

    return all_items[:max_items]


def get_cache_info() -> dict:
    """Return cache metadata for the API response."""
    if _cache["last_fetched"] is None:
        return {"cached": False, "last_updated": None}
    return {
        "cached": True,
        "last_updated": _cache["last_fetched"].isoformat(),
    }
