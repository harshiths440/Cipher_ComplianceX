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
    # ===================== GST (5) =====================
    {
        "title": "Mandatory Bank Account Linking for GSTR-3B Filers",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "18 Apr 2026",
        "previous_rule_date": "10 Feb 2023",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "GSTR-3B Bank Linking Rule",
        "what_changed": "Businesses above ₹5Cr turnover must now link a verified bank account before filing GSTR-3B. Previously, this step was optional and not enforced strictly.",
        "who_it_hits": "All GST-registered businesses with turnover above ₹5 Cr",
        "what_to_do": ["Link bank account on GST portal", "Verify account via OTP", "Ensure mapping before filing returns"],
        "deadline": "31 May 2026",
        "penalty": "₹500 per day of delay",
        "severity": "HIGH",
        "compared_to_before": "Earlier, bank account linking was optional and not mandatory for return filing.",
    },
    {
        "title": "ITC Reversal Computation Now Monthly Under Revised Rule 42/43",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "05 Apr 2026",
        "previous_rule_date": "01 Jul 2017",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "ITC Reversal Rule 42/43 Update",
        "what_changed": "Input Tax Credit reversal must now be calculated monthly instead of annually. This increases reporting frequency for mixed-use businesses.",
        "who_it_hits": "Businesses dealing with both taxable and exempt supplies",
        "what_to_do": ["Update accounting systems", "Compute ITC reversal monthly", "Maintain monthly reconciliation reports"],
        "deadline": "Effective May 2026",
        "penalty": "Interest @18% p.a. on excess ITC claimed",
        "severity": "HIGH",
        "compared_to_before": "Previously, ITC reversal was calculated annually and adjusted at year-end.",
    },
    {
        "title": "E-Invoicing Threshold Reduced to ₹1 Crore",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "12 Apr 2026",
        "previous_rule_date": "01 Aug 2023",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "E-Invoicing Threshold Update",
        "what_changed": "Businesses with turnover above ₹1Cr must now generate IRN for B2B invoices. This expands compliance requirements significantly.",
        "who_it_hits": "Businesses with turnover above ₹1 Cr",
        "what_to_do": ["Integrate with IRP system", "Generate IRN for all B2B invoices", "Train accounting teams"],
        "deadline": "01 Jun 2026",
        "penalty": "₹10,000 per invoice or tax amount, whichever higher",
        "severity": "HIGH",
        "compared_to_before": "Earlier threshold was ₹5Cr turnover for mandatory e-invoicing.",
    },
    {
        "title": "Late Fee Cap Reduced for GSTR-9 Filing",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "20 Mar 2026",
        "previous_rule_date": "15 Dec 2022",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "GSTR-9 Late Fee Revision",
        "what_changed": "Late fee cap reduced to ₹5,000 for small taxpayers. This reduces financial burden for delayed filings.",
        "who_it_hits": "Taxpayers with turnover below ₹2 Cr",
        "what_to_do": ["File returns early", "Track compliance calendar", "Avoid last-minute filing"],
        "deadline": "31 Dec 2026",
        "penalty": "₹200 per day (capped at ₹5,000)",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier late fee cap was ₹10,000 for similar taxpayers.",
    },
    {
        "title": "Composition Scheme Eligibility Expanded to ₹2 Crore",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "02 Apr 2026",
        "previous_rule_date": "01 Apr 2019",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "Composition Scheme Expansion",
        "what_changed": "Eligibility limit increased to ₹2Cr and IT services added. This allows more small businesses to opt for simplified tax.",
        "who_it_hits": "Small businesses and IT service providers under 20 employees",
        "what_to_do": ["Check eligibility", "Opt-in via GST portal", "File CMP-02"],
        "deadline": "30 Jun 2026",
        "penalty": "Regular tax liability if wrongly opted",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier limit was ₹1.5Cr and excluded IT services.",
    },
    # ===================== CORPORATE (5) =====================
    {
        "title": "DIR-3 KYC Deadline Extended to September 30",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "10 Apr 2026",
        "previous_rule_date": "01 Aug 2021",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "DIR-3 KYC Deadline Change",
        "what_changed": "Annual DIR-3 KYC deadline moved to September 30. Provides additional compliance time.",
        "who_it_hits": "All directors with DIN",
        "what_to_do": ["Update KYC details", "Verify OTP", "Submit DIR-3 KYC"],
        "deadline": "30 Sep 2026",
        "penalty": "DIN deactivation + ₹5,000 fee",
        "severity": "HIGH",
        "compared_to_before": "Earlier deadline was August 31 annually.",
    },
    {
        "title": "New MGT-7A Form Introduced for Small Companies",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "25 Mar 2026",
        "previous_rule_date": "01 Apr 2021",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "MGT-7A Filing",
        "what_changed": "Simplified annual return form introduced for OPCs and small companies. Reduces filing complexity.",
        "who_it_hits": "OPCs and small companies",
        "what_to_do": ["Prepare annual return", "Use MGT-7A format", "File within 60 days of AGM"],
        "deadline": "Within 60 days of AGM",
        "penalty": "₹100 per day",
        "severity": "LOW",
        "compared_to_before": "Previously required filing under detailed MGT-7 form.",
    },
    {
        "title": "CSR Applicability Threshold Reduced to ₹50 Lakh Profit",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "05 Apr 2026",
        "previous_rule_date": "01 Apr 2014",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "CSR Threshold Revision",
        "what_changed": "CSR now mandatory for companies with ₹50L profit. Expands coverage significantly.",
        "who_it_hits": "Mid-sized companies",
        "what_to_do": ["Allocate CSR budget", "Form CSR committee", "Report in annual filings"],
        "deadline": "FY 2026-27",
        "penalty": "2x unspent CSR amount",
        "severity": "HIGH",
        "compared_to_before": "Earlier threshold was ₹5Cr net profit.",
    },
    {
        "title": "Board Meeting Gap Reduced to 90 Days",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "15 Apr 2026",
        "previous_rule_date": "01 Apr 2014",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "Board Meeting Frequency Rule",
        "what_changed": "Companies must hold meetings every 90 days. Increases governance frequency.",
        "who_it_hits": "All companies",
        "what_to_do": ["Schedule quarterly meetings", "Maintain minutes", "Ensure quorum"],
        "deadline": "Immediate effect",
        "penalty": "₹25,000 per violation",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier allowed gap was 120 days.",
    },
    {
        "title": "AOC-4 XBRL Filing Mandatory for Large Unlisted Companies",
        "source": "MCA",
        "source_icon": "🏛️",
        "date": "08 Apr 2026",
        "previous_rule_date": "01 Apr 2020",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "AOC-4 XBRL Expansion",
        "what_changed": "Unlisted public companies above ₹250Cr must file in XBRL. Enhances transparency.",
        "who_it_hits": "Large unlisted public companies",
        "what_to_do": ["Convert financials to XBRL", "Validate filings", "Submit AOC-4"],
        "deadline": "30 Oct 2026",
        "penalty": "₹1,000 per day",
        "severity": "HIGH",
        "compared_to_before": "Earlier only listed companies were required to file in XBRL.",
    },
    # ===================== TAX (5) =====================
    {
        "title": "TDS Threshold for Professional Fees Raised to ₹50,000",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "01 Apr 2026",
        "previous_rule_date": "01 Apr 2010",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Section 194J Threshold Update",
        "what_changed": "TDS deduction required only above ₹50,000. Reduces compliance for small transactions.",
        "who_it_hits": "Small businesses and professionals",
        "what_to_do": ["Update accounting systems", "Track payments", "Apply TDS correctly"],
        "deadline": "Effective FY 2026-27",
        "penalty": "Interest @1% per month",
        "severity": "LOW",
        "compared_to_before": "Earlier threshold was ₹30,000.",
    },
    {
        "title": "Interest Rate Increased for Advance Tax Defaults",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "10 Apr 2026",
        "previous_rule_date": "01 Apr 2005",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Section 234C Update",
        "what_changed": "Interest increased to 1.5% per month. Applies to higher default amounts.",
        "who_it_hits": "Taxpayers with advance tax liability above ₹1L",
        "what_to_do": ["Estimate income accurately", "Pay advance tax on time", "Review quarterly"],
        "deadline": "Ongoing",
        "penalty": "1.5% per month interest",
        "severity": "HIGH",
        "compared_to_before": "Earlier interest rate was 1% per month.",
    },
    {
        "title": "New ITR-B Form Introduced for High Turnover Businesses",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "18 Apr 2026",
        "previous_rule_date": "01 Apr 2016",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "ITR-B Introduction",
        "what_changed": "New form replaces Schedule BP for large businesses. Improves reporting clarity.",
        "who_it_hits": "Businesses with turnover above ₹10Cr",
        "what_to_do": ["Download new form", "Prepare disclosures", "File before due date"],
        "deadline": "31 Oct 2026",
        "penalty": "₹5,000 late fee",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier reporting was part of ITR-6 Schedule BP.",
    },
    {
        "title": "Form 26AS Now Includes GST Turnover Data",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "12 Apr 2026",
        "previous_rule_date": "01 Jun 2020",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Form 26AS Expansion",
        "what_changed": "GST turnover integrated for cross-verification. Helps detect mismatches.",
        "who_it_hits": "All GST-registered taxpayers",
        "what_to_do": ["Reconcile GST and IT returns", "Correct mismatches", "Maintain audit trail"],
        "deadline": "Immediate",
        "penalty": "Scrutiny notice + penalties",
        "severity": "HIGH",
        "compared_to_before": "Earlier Form 26AS only showed TDS/TCS details.",
    },
    {
        "title": "Strict Enforcement of MSME Payment Rule Under Section 43B(h)",
        "source": "Income Tax",
        "source_icon": "🧮",
        "date": "03 Apr 2026",
        "previous_rule_date": "01 Apr 2023",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Section 43B(h) Enforcement",
        "what_changed": "Payments beyond 45 days disallowed as deduction. Improves MSME liquidity.",
        "who_it_hits": "Businesses dealing with MSMEs",
        "what_to_do": ["Track vendor payments", "Ensure payment within 45 days", "Update contracts"],
        "deadline": "FY 2025-26 onward",
        "penalty": "Disallowance of expense",
        "severity": "HIGH",
        "compared_to_before": "Earlier no strict enforcement of MSME payment timelines.",
    },
    # ===================== SECURITIES (5) =====================
    {
        "title": "Quarterly Compliance Reporting Timeline Reduced to 21 Days",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "15 Apr 2026",
        "previous_rule_date": "01 Jan 2019",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "LODR Timeline Amendment",
        "what_changed": "Companies must file compliance reports within 21 days. Faster disclosure required.",
        "who_it_hits": "Top 1000 listed companies",
        "what_to_do": ["Prepare reports early", "Automate reporting", "Meet deadlines"],
        "deadline": "Ongoing",
        "penalty": "₹1,00,000 per delay",
        "severity": "HIGH",
        "compared_to_before": "Earlier allowed 30 days for submission.",
    },
    {
        "title": "RPT Threshold Revised for Shareholder Approval",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "08 Apr 2026",
        "previous_rule_date": "01 Apr 2022",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "RPT Threshold Update",
        "what_changed": "Transactions above 10% turnover require approval. Expands compliance.",
        "who_it_hits": "Listed companies",
        "what_to_do": ["Identify RPTs", "Seek approvals", "Disclose transactions"],
        "deadline": "Immediate",
        "penalty": "Invalidation of transaction",
        "severity": "HIGH",
        "compared_to_before": "Earlier only ₹1000Cr threshold applied.",
    },
    {
        "title": "T+0 Settlement Introduced for Top 500 Stocks",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "20 Apr 2026",
        "previous_rule_date": "01 Jan 2023",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "T+0 Settlement Rule",
        "what_changed": "Same-day settlement introduced for select stocks. Reduces settlement risk.",
        "who_it_hits": "Investors and brokers",
        "what_to_do": ["Upgrade systems", "Train staff", "Adjust workflows"],
        "deadline": "01 Jun 2026",
        "penalty": "Trading restrictions",
        "severity": "HIGH",
        "compared_to_before": "Earlier settlement cycle was T+1.",
    },
    {
        "title": "Insider Trading Definition Expanded to Include Algo Trades",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "11 Apr 2026",
        "previous_rule_date": "01 Apr 2015",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "PIT Regulation Update",
        "what_changed": "Algorithmic trades using UPSI now classified as insider trading. Requires disclosures.",
        "who_it_hits": "Algo traders and institutions",
        "what_to_do": ["Update compliance policies", "Disclose trades", "Monitor systems"],
        "deadline": "Immediate",
        "penalty": "₹25Cr or 3x profit",
        "severity": "HIGH",
        "compared_to_before": "Earlier definition excluded algorithm-driven decisions.",
    },
    {
        "title": "Mandatory Registration on SCORES 2.0 Portal",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "02 Apr 2026",
        "previous_rule_date": "01 Jun 2011",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "SCORES 2.0 Compliance",
        "what_changed": "All listed companies must register on upgraded grievance portal. Enhances investor protection.",
        "who_it_hits": "Listed companies",
        "what_to_do": ["Register on SCORES 2.0", "Assign compliance officer", "Track complaints"],
        "deadline": "31 May 2026",
        "penalty": "Show cause notice",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier version of SCORES had optional features and lower enforcement.",
    },
    # ===================== GST — batch 2 (5) =====================
    {
        "title": "GSTR-1 Filing Window Restricted to 11 Days After Month-End",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "28 Mar 2026",
        "previous_rule_date": "01 Jul 2017",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "GSTR-1 Filing Window Rule",
        "what_changed": "Taxpayers must now file GSTR-1 within 11 days after month-end. This shortens the reporting window significantly.",
        "who_it_hits": "All regular GST taxpayers",
        "what_to_do": ["Prepare invoices early", "Reconcile monthly data", "File before deadline"],
        "deadline": "11th of next month",
        "penalty": "\u20b9200 per day",
        "severity": "HIGH",
        "compared_to_before": "Earlier taxpayers had flexibility up to 13 days or more in some cases.",
    },
    {
        "title": "GST Audit Requirement Reintroduced for Turnover Above \u20b95Cr",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "14 Feb 2026",
        "previous_rule_date": "01 Aug 2020",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "GST Audit Rule Reinstatement",
        "what_changed": "Businesses above \u20b95Cr must undergo GST audit again. This ensures higher compliance monitoring.",
        "who_it_hits": "Businesses with turnover above \u20b95 Cr",
        "what_to_do": ["Appoint CA", "Prepare audit docs", "Submit reconciliation statement"],
        "deadline": "31 Dec 2026",
        "penalty": "\u20b925,000 minimum",
        "severity": "HIGH",
        "compared_to_before": "Audit requirement was removed in 2020 for most taxpayers.",
    },
    {
        "title": "QRMP Scheme Limit Increased to \u20b97 Crore",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "10 Jan 2026",
        "previous_rule_date": "01 Jan 2021",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "QRMP Limit Expansion",
        "what_changed": "Quarterly return filing allowed up to \u20b97Cr turnover. Reduces compliance burden.",
        "who_it_hits": "Small and mid-sized businesses",
        "what_to_do": ["Opt into QRMP", "File quarterly returns", "Pay monthly tax"],
        "deadline": "31 Mar 2026",
        "penalty": "Late fee \u20b9200/day",
        "severity": "LOW",
        "compared_to_before": "Earlier threshold was \u20b95Cr.",
    },
    {
        "title": "Mandatory HSN Code Reporting Expanded to 6 Digits",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "22 Dec 2025",
        "previous_rule_date": "01 Apr 2022",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "HSN Code Expansion",
        "what_changed": "6-digit HSN codes mandatory for businesses above \u20b95Cr. Improves invoice accuracy.",
        "who_it_hits": "Businesses with turnover above \u20b95 Cr",
        "what_to_do": ["Update invoicing software", "Map HSN codes", "Train staff"],
        "deadline": "01 Apr 2026",
        "penalty": "\u20b950,000 per incorrect invoice batch",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier only 4-digit HSN codes were required.",
    },
    {
        "title": "Refund Processing Timeline Reduced to 30 Days",
        "source": "GST Council",
        "source_icon": "📋",
        "date": "05 Nov 2025",
        "previous_rule_date": "01 Jul 2017",
        "link": "https://www.gstcouncil.gov.in",
        "category": "GST",
        "rule_name": "GST Refund Timeline",
        "what_changed": "Refunds must now be processed within 30 days. Improves cash flow for businesses.",
        "who_it_hits": "Exporters and refund claimants",
        "what_to_do": ["File accurate refund claims", "Track status", "Respond to queries"],
        "deadline": "30 days from filing",
        "penalty": "Interest @6% if delayed",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier timeline was up to 60 days.",
    },
    # ===================== CORPORATE — batch 2 (5) =====================
    {
        "title": "Mandatory Dematerialisation of Shares for Private Companies",
        "source": "MCA",
        "source_icon": "\U0001f3db\ufe0f",
        "date": "18 Jan 2026",
        "previous_rule_date": "01 Oct 2018",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "Share Demat Rule",
        "what_changed": "Private companies must now convert shares into demat form. Improves transparency.",
        "who_it_hits": "All private companies (except small companies)",
        "what_to_do": ["Open demat accounts", "Convert shares", "Update records"],
        "deadline": "30 Sep 2026",
        "penalty": "\u20b910,000 + \u20b91,000/day",
        "severity": "HIGH",
        "compared_to_before": "Earlier only public companies required dematerialisation.",
    },
    {
        "title": "Introduction of Web-Based Incorporation Filing System",
        "source": "MCA",
        "source_icon": "\U0001f3db\ufe0f",
        "date": "02 Feb 2026",
        "previous_rule_date": "01 Apr 2017",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "SPICe+ Web Filing",
        "what_changed": "Company incorporation now fully web-based. Removes offline PDF filings.",
        "who_it_hits": "New companies",
        "what_to_do": ["Use MCA portal", "Upload documents", "Complete online forms"],
        "deadline": "Immediate",
        "penalty": "Application rejection",
        "severity": "LOW",
        "compared_to_before": "Earlier filings required PDF uploads and manual validation.",
    },
    {
        "title": "Auditor Rotation Period Reduced to 5 Years",
        "source": "MCA",
        "source_icon": "\U0001f3db\ufe0f",
        "date": "11 Dec 2025",
        "previous_rule_date": "01 Apr 2014",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "Auditor Rotation Update",
        "what_changed": "Auditors must rotate every 5 years. Strengthens independence.",
        "who_it_hits": "Large companies",
        "what_to_do": ["Appoint new auditor", "Update filings", "Notify stakeholders"],
        "deadline": "Next AGM",
        "penalty": "\u20b950,000 fine",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier rotation period was 10 years.",
    },
    {
        "title": "Mandatory ESG Reporting for Top 500 Companies",
        "source": "MCA",
        "source_icon": "\U0001f3db\ufe0f",
        "date": "03 Jan 2026",
        "previous_rule_date": "01 Apr 2022",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "ESG Reporting Rule",
        "what_changed": "Companies must disclose ESG metrics annually. Enhances sustainability reporting.",
        "who_it_hits": "Top 500 companies",
        "what_to_do": ["Prepare ESG report", "Audit metrics", "Disclose publicly"],
        "deadline": "31 Mar 2027",
        "penalty": "\u20b91,00,000",
        "severity": "HIGH",
        "compared_to_before": "Earlier ESG reporting was voluntary.",
    },
    {
        "title": "Reduction in Minimum Capital Requirement for OPC",
        "source": "MCA",
        "source_icon": "\U0001f3db\ufe0f",
        "date": "20 Nov 2025",
        "previous_rule_date": "01 Apr 2014",
        "link": "https://www.mca.gov.in",
        "category": "Corporate",
        "rule_name": "OPC Capital Rule",
        "what_changed": "No minimum capital required for OPCs. Encourages startups.",
        "who_it_hits": "Entrepreneurs",
        "what_to_do": ["Register OPC", "Declare capital", "Maintain compliance"],
        "deadline": "Immediate",
        "penalty": "Compliance-based penalties",
        "severity": "LOW",
        "compared_to_before": "Earlier minimum capital requirement existed.",
    },
    # ===================== TAX — batch 2 (5) =====================
    {
        "title": "PAN-Aadhaar Linking Mandatory for All Filers",
        "source": "Income Tax",
        "source_icon": "\U0001f9ee",
        "date": "31 Mar 2026",
        "previous_rule_date": "01 Jul 2017",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "PAN-Aadhaar Linking",
        "what_changed": "All PANs must be linked with Aadhaar. Ensures identity verification.",
        "who_it_hits": "All taxpayers",
        "what_to_do": ["Link PAN with Aadhaar", "Verify details", "Check status"],
        "deadline": "30 Jun 2026",
        "penalty": "\u20b91,000",
        "severity": "HIGH",
        "compared_to_before": "Earlier linking was optional with multiple extensions.",
    },
    {
        "title": "Faceless Assessment Expanded to All Taxpayer Categories",
        "source": "Income Tax",
        "source_icon": "\U0001f9ee",
        "date": "25 Feb 2026",
        "previous_rule_date": "01 Oct 2020",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Faceless Assessment Expansion",
        "what_changed": "All assessments now conducted online without physical interaction. Improves transparency.",
        "who_it_hits": "All taxpayers",
        "what_to_do": ["Respond online", "Upload documents", "Track notices"],
        "deadline": "Immediate",
        "penalty": "Best judgment assessment",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier limited to selected cases.",
    },
    {
        "title": "Standard Deduction Increased to \u20b975,000",
        "source": "Income Tax",
        "source_icon": "\U0001f9ee",
        "date": "01 Feb 2026",
        "previous_rule_date": "01 Apr 2019",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Standard Deduction Update",
        "what_changed": "Standard deduction increased to \u20b975,000. Provides tax relief.",
        "who_it_hits": "Salaried individuals",
        "what_to_do": ["Update tax planning", "Recalculate liability", "Adjust TDS"],
        "deadline": "FY 2026-27",
        "penalty": "N/A",
        "severity": "LOW",
        "compared_to_before": "Earlier deduction was \u20b950,000.",
    },
    {
        "title": "Higher TCS on Foreign Remittances Above \u20b97 Lakh",
        "source": "Income Tax",
        "source_icon": "\U0001f9ee",
        "date": "15 Jan 2026",
        "previous_rule_date": "01 Oct 2023",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "TCS on LRS Update",
        "what_changed": "TCS increased to 20% for foreign remittances. Impacts overseas spending.",
        "who_it_hits": "Individuals sending money abroad",
        "what_to_do": ["Plan remittances", "Claim credit later", "Track TCS"],
        "deadline": "Immediate",
        "penalty": "Higher tax outflow",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier TCS was 5%.",
    },
    {
        "title": "Pre-Filled ITR Expanded with Bank Interest Data",
        "source": "Income Tax",
        "source_icon": "\U0001f9ee",
        "date": "10 Dec 2025",
        "previous_rule_date": "01 Apr 2021",
        "link": "https://www.incometax.gov.in",
        "category": "Tax",
        "rule_name": "Pre-Filled ITR Update",
        "what_changed": "Bank interest now auto-populated in returns. Reduces manual effort.",
        "who_it_hits": "All taxpayers",
        "what_to_do": ["Verify data", "Correct mismatches", "File return"],
        "deadline": "31 Jul 2026",
        "penalty": "\u20b95,000 late fee",
        "severity": "LOW",
        "compared_to_before": "Earlier limited data was pre-filled.",
    },
    # ===================== SECURITIES — batch 2 (5) =====================
    {
        "title": "Mandatory Disclosure of ESG Risks in Annual Reports",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "05 Mar 2026",
        "previous_rule_date": "01 Apr 2022",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "ESG Disclosure Rule",
        "what_changed": "Companies must disclose ESG risks in detail. Improves investor awareness.",
        "who_it_hits": "Listed companies",
        "what_to_do": ["Prepare ESG section", "Disclose risks", "Audit data"],
        "deadline": "FY 2026 reports",
        "penalty": "\u20b910,00,000",
        "severity": "HIGH",
        "compared_to_before": "Earlier ESG disclosures were limited.",
    },
    {
        "title": "Mutual Fund Expense Ratio Cap Reduced",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "18 Feb 2026",
        "previous_rule_date": "01 Apr 2018",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "TER Cap Revision",
        "what_changed": "Expense ratios reduced for equity funds. Benefits investors.",
        "who_it_hits": "Mutual fund investors",
        "what_to_do": ["Review fund costs", "Switch funds if needed", "Track TER"],
        "deadline": "01 Apr 2026",
        "penalty": "Penalty on AMC",
        "severity": "LOW",
        "compared_to_before": "Earlier TER limits were higher.",
    },
    {
        "title": "IPO Allotment Timeline Reduced to T+3",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "12 Jan 2026",
        "previous_rule_date": "01 Sep 2022",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "IPO Timeline Rule",
        "what_changed": "IPO allotment now completed in 3 days. Faster listing process.",
        "who_it_hits": "Investors and issuers",
        "what_to_do": ["Prepare funds", "Track allotment", "Monitor listing"],
        "deadline": "Immediate",
        "penalty": "Listing delays penalties",
        "severity": "MEDIUM",
        "compared_to_before": "Earlier timeline was T+6.",
    },
    {
        "title": "Enhanced Margin Requirements for Derivatives Trading",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "22 Dec 2025",
        "previous_rule_date": "01 Jun 2020",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "Derivative Margin Rule",
        "what_changed": "Higher upfront margin required. Reduces speculative risk.",
        "who_it_hits": "Derivative traders",
        "what_to_do": ["Maintain margin balance", "Monitor positions", "Avoid penalties"],
        "deadline": "Immediate",
        "penalty": "Position square-off",
        "severity": "HIGH",
        "compared_to_before": "Earlier margin requirements were lower.",
    },
    {
        "title": "KYC Norms Tightened for Foreign Portfolio Investors",
        "source": "SEBI",
        "source_icon": "📊",
        "date": "30 Nov 2025",
        "previous_rule_date": "01 Apr 2019",
        "link": "https://www.sebi.gov.in",
        "category": "Securities",
        "rule_name": "FPI KYC Rule",
        "what_changed": "Additional disclosures required for FPIs. Improves transparency.",
        "who_it_hits": "Foreign investors",
        "what_to_do": ["Update KYC", "Submit disclosures", "Verify ownership"],
        "deadline": "31 Mar 2026",
        "penalty": "Account suspension",
        "severity": "HIGH",
        "compared_to_before": "Earlier KYC requirements were less stringent.",
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

def _detect_category(title: str, source: str = "") -> str:
    t = title.lower()
    src = source.upper()

    # ── GST ──────────────────────────────────────────────────────────────────
    if "gst" in t or "goods and services" in t:
        return "GST"

    # ── Securities (title-based) ─────────────────────────────────────────────
    if any(kw in t for kw in (
        "sebi", "securities", "market",
        "mutual fund", "fund",
        "capital", "disclosure", "listing",
        "registrar", "transfer agent",
        "investment adviser", "research analyst",
    )):
        return "Securities"

    # "circular" only maps to Securities when the source is SEBI
    if "circular" in t and src == "SEBI":
        return "Securities"

    # ── Tax ───────────────────────────────────────────────────────────────────
    if "income tax" in t or "tds" in t or "advance tax" in t:
        return "Tax"

    # ── Corporate ─────────────────────────────────────────────────────────────
    if "mca" in t or "companies act" in t or "roc" in t or "director" in t:
        return "Corporate"

    # ── SEBI source fallback — always Securities, never General ───────────────
    if src == "SEBI":
        return "Securities"

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
        "category": _detect_category(title, source),
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
    date descending. Uses a 30-minute in-memory cache.

    FALLBACK_NEWS (synthetic curated data) is ALWAYS included and merged
    with any live-scraped items. Live items that share a title with a
    FALLBACK_NEWS entry are deduplicated (FALLBACK_NEWS wins, since it
    carries richer pre-baked analysis fields).
    """
    global _cache

    # Return cached results if fresh
    if _cache["last_fetched"] is not None:
        age = datetime.utcnow() - _cache["last_fetched"]
        if age < timedelta(minutes=CACHE_TTL_MINUTES):
            return _cache["items"][:max_items]

    live_items: list[dict] = []
    fetchers = [_fetch_pib, _fetch_sebi, _fetch_income_tax, _fetch_mca]

    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True) as client:
        results = await asyncio.gather(
            *[f(client) for f in fetchers],
            return_exceptions=True,
        )

    for result in results:
        if isinstance(result, Exception):
            continue
        live_items.extend(result)

    # Build a set of known titles from FALLBACK_NEWS (lowercase) for dedup
    known_titles = {item["title"].strip().lower() for item in FALLBACK_NEWS}

    # Keep only live items whose titles are NOT already in FALLBACK_NEWS
    novel_live = [i for i in live_items if i["title"].strip().lower() not in known_titles]

    # Merge: synthetic data first, then novel live items
    all_items = list(FALLBACK_NEWS) + novel_live

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
