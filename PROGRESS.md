# ComplianceX 4.0 — Build Progress

## 🏆 Hackathon: TECHFUSION 2.0
**Team:** Cipher
**Build Duration:** 24 Hours
**Date:** April 28, 2026

---

## ✅ Completed Features

### Backend (Python + FastAPI)
- [x] FastAPI server running on port 8000
- [x] LangGraph state machine orchestrating full compliance pipeline
- [x] Rule Engine — 8 hardcoded IF-THEN compliance rules with real Indian law references
- [x] Risk Scorer — weighted composite 0–100 scoring with SHAP-style factor explanation
- [x] ChromaDB vector database pre-loaded with 8 real Indian regulation documents
- [x] Semantic regulation search using sentence-transformers/all-MiniLM-L6-v2
- [x] Gemini 2.0 Flash integration for AI remediation step generation
- [x] Pre-loaded dataset of 12 realistic Indian private limited companies
- [x] Full REST API with 6 endpoints (+ `/docs`)
- [x] CORS enabled for frontend connection
- [x] Environment-based API key management
- [x] `GET /news` — live regulatory news merged with 40-item curated synthetic dataset
- [x] `POST /news/analyze` — scrapes article + calls Gemini 2.0 Flash for structured breakdown
  - Lookup order: curated dataset match (instant) → scrape + Gemini fallback
  - Matches by `title` OR `rule_name` for flexibility
  - Returns: `rule_name`, `what_changed`, `who_it_hits`, `what_to_do[]`, `deadline`, `penalty`, `severity`, `compared_to_before`
- [x] 40-item curated regulatory news dataset (10 per category: GST, Corporate, Tax, Securities)
- [x] News merge logic — FALLBACK_NEWS always included, live scraped items deduped and appended
- [x] `GET /tax/{cin}` — Doctor 3 (Tax Expert) computing advance tax, TDS (192/194J/194I/194C), MAT check, and sector-based savings
- [x] `GET /ca-verify/{cin}` — CA Audit Trail cross-referencing synthesised CA filings against the 40-item regulatory news dataset to detect OUTDATED and AT_RISK filings

### Frontend (React + Vite + Tailwind)
- [x] Home page with company dropdown populated from live API
- [x] Full compliance analysis triggered on button click
- [x] Risk Dashboard with animated semicircular gauge
- [x] SHAP-style factor bars showing score contributors
- [x] Active Violations panel with severity badges and ₹ exposure amounts
- [x] AI Remediation Plan panel with numbered steps
- [x] Relevant Regulations section pulled from ChromaDB
- [x] Compliance Calendar with deadline tracking
- [x] Filter tabs — All / Overdue / Due Soon / Upcoming / Filed
- [x] Take Action modal with step-by-step filing instructions per obligation
- [x] Mark as In Progress functionality with toast notification
- [x] Dark theme throughout with indigo accent design system
- [x] Animated gradient background with grid pattern and indigo glow
- [x] Gradient text hero heading + styled dropdown with indigo focus states
- [x] Glowing Analyze button with hover effect and custom loading state
- [x] Doctor cards with dark backgrounds, left-border accents, and stagger animations
- [x] Stats bar with 3 primary compliance metrics

### Dashboard UI (Tabs)
- [x] **Overview Tab** — Risk gauge, SHAP factors, active violations, AI remediation, and relevant regulations
- [x] **Tax Analysis Tab** — Advance tax timeline, TDS obligations table, MAT check card, and savings opportunities
- [x] **CA Audit Tab** — Filing verification table with AT_RISK / OUTDATED status badges and expandable row panels for finding & recommendation details

### Regulatory News UI (Doctor 1)
- [x] Category filter pills — All / GST / Corporate / Tax / Securities / General
- [x] **Stale category fallback** — if no recent news for a tab, shows last-ever item for that category:
  - Muted card (60% opacity, dashed border)
  - ⚠️ amber banner: "No recent [Category] updates — last update was [date]"
- [x] Empty state tombstone (📭) for categories with zero items ever
- [x] **News Detail Modal** — clicking a card opens full-screen overlay instead of navigating:
  - Loading state: spinner + animated "Analyzing regulatory update..." dots
  - Calls `POST /news/analyze` on mount
  - Renders: Rule Name (large), Severity badge (RED/AMBER/GREEN), What Changed
  - **VS BEFORE diff** — side-by-side red/green two-tone comparison (only when amendment detected)
  - Who It Hits block, numbered action steps, Deadline + Penalty info cards
  - "Read full circular →" opens original link in new tab
  - Close via X button, Escape key, or click-outside
- [x] **Analysis cache** — `useRef(Map)` keyed by title; re-opening same card is instant
- [x] Body scroll lock while modal is open

### AI Pipeline (LangGraph Orchestration)
- [x] Node 1: `load_company` — loads from JSON dataset by CIN
- [x] Node 2: `run_rule_engine` — evaluates 8 compliance rules
- [x] Node 3: `run_risk_scorer` — computes weighted composite score
- [x] Node 4: `fetch_regulations` — semantic ChromaDB search
- [x] Node 5: `generate_remediation` — Gemini API call
- [x] Node 6: `compile_output` — assembles final ComplianceStatus JSON

---

## 🚧 In Progress

- [ ] Demo script finalization
- [ ] General category news items (currently shows stale fallback — by design)

---

## 📋 Planned (Post-Hackathon Roadmap)

### Phase 3 — Live Data Integration
- [ ] MCA21 V3 REST API integration (replace static dataset)
- [ ] GSTN Sandbox API for live GST data
- [ ] SEBI SCORES RSS feed monitoring
- [ ] Doctor 1 (News Reader) — live regulatory change detection with diff-against-previous

### Phase 4 — Full Agent Activation
- [ ] Redis Pub/Sub messaging between agents
- [ ] Multi-tenant support — CA firm managing multiple client companies
- [ ] Email/SMS deadline alerts

### Phase 5 — Product
- [ ] User authentication and company onboarding
- [ ] Subscription billing via Razorpay
- [ ] PDF compliance report export
- [ ] Historical risk score trend charts
- [ ] Director DIN verification against MCA disqualification list

---

## 🏗️ Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Orchestration | LangGraph | Real state machine visible in code review |
| Vector DB | ChromaDB | Local, no external dependency, fast setup |
| AI Model | Gemini 2.0 Flash | Free API, fast, sufficient quality |
| Data Layer | JSON flat file | Zero setup time, demo-safe, no DB crashes |
| Scoring | Rule-based weighted | Deterministic, explainable, no model training needed |
| News analysis | Curated dataset + Gemini fallback | Instant response for known items; Gemini for unknowns |
| News merge | Always-include FALLBACK_NEWS | Synthetic data always visible regardless of live scraper success |
| Redis/Pub-Sub | Deferred to Phase 3 | Demo stability over architectural completeness |

---

## 📊 Demo Companies

| Company | CIN | Risk Score | Bucket |
|---------|-----|------------|--------|
| Pinnacle Capital Advisors | U65910MH2013PTC445566 | 100 | CRITICAL |
| [Add more as tested] | | | |

---

## 📰 News Dataset Summary

| Category   | Items | Date Range |
|------------|-------|------------|
| GST        | 10    | Nov 2025 – Apr 2026 |
| Corporate  | 10    | Nov 2025 – Apr 2026 |
| Tax        | 10    | Dec 2025 – Apr 2026 |
| Securities | 10    | Nov 2025 – Apr 2026 |
| **Total**  | **40** | |

All 40 items have pre-baked `rule_name`, `what_changed`, `who_it_hits`, `what_to_do[]`, `deadline`, `penalty`, `severity`, and `compared_to_before` fields, enabling instant modal rendering without any Gemini call.

---

## 🐛 Known Issues

- Calendar status does not persist across page refreshes (session only)
- Take Action modal "Mark as In Progress" updates local state only
- SEBI / Income Tax scrapers are occasionally blocked by the source site's bot detection; the curated dataset covers the gap
- General category has no curated items (intentional — shows stale fallback UI demo)