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
- [x] Full REST API with CORS enabled for both portals
- [x] Environment-based API key management
- [x] `GET /news` — live regulatory news merged with 40-item curated synthetic dataset
- [x] `POST /news/analyze` — scrapes article + calls Gemini 2.0 Flash for structured breakdown
- [x] 40-item curated regulatory news dataset (10 per category: GST, Corporate, Tax, Securities)
- [x] `GET /tax/{cin}` — Tax Expert computing advance tax, TDS, MAT check, and sector-based savings
- [x] `GET /ca-verify/{cin}` — CA Audit Trail cross-referencing filings against regulation changes
- [x] `GET /executive/{cin}` — Executive dashboard view (exposure, signatures, regulatory impact)
- [x] `POST /alerts/{cin}` / `GET /alerts/{cin}` — Executive → CA alert messaging (in-memory store)
- [x] `PUT /alerts/{id}/acknowledge` — CA replies to executive alert
- [x] `POST /filing-requests/{cin}` / `GET /filing-requests/{cin}` — Filing lifecycle tracker
- [x] `PUT /filing-requests/{id}/file` — CA marks a filing as FILED with ACK number + portal
- [x] `PUT /filing-requests/{id}/progress` — CA marks a filing as IN_PROGRESS
- [x] **`POST /auth/login`** — Executive Portal login (CIN + password → session, 401 on fail)
- [x] **`GET /activity-log`** — Returns last 20 automation engine entries (newest first)
- [x] **`POST /demo/trigger-regulation`** — Injects a custom regulation and immediately runs the detector against all companies
- [x] **`GET /score-update/{cin}`** — Returns latest risk score recalculation delta after a filing is marked FILED
- [x] **`POST /chat`** — Gemini-powered compliance chat (fixed `Part.from_text` keyword arg bug; upgraded to `gemini-2.5-flash`)

### Automation Engine (`backend/scheduler.py`) ⭐ NEW
- [x] `AsyncIOScheduler` (APScheduler 3.11) started via FastAPI lifespan hook
- [x] **`job_deadline_scanner`** — Runs every 60s; scans all 12 companies for overdue GST/MCA/Tax filings; auto-creates alerts + filing requests (deduplication-safe)
- [x] **`job_regulation_detector`** — Fetches live news, filters to last 7 days, maps sector → affected companies, creates alerts for novel regulation+company combos
- [x] **`job_filing_escalator`** — Escalates PENDING filing requests to HIGH alert after 24h, EMERGENCY after 48h
- [x] **`activity_log`** — In-memory list (max 50 entries, newest-first) tracking all automation events with icon, timestamp, company, and severity

### Risk Score Recalculation on Filing (`filing_tracker.py`)
- [x] `mark_filed()` now calls `RuleEngine().evaluate()` + `RiskScorer().score()` after marking FILED
- [x] Stores `{ previous_score, new_score, recalculated_at, triggered_by }` in `score_cache[cin]`
- [x] Emits a `📉` activity log entry with the before → after delta
- [x] Fully non-blocking — wrapped in `try/except` so a bad recalc never breaks the filing response

### AI Pipeline (LangGraph Orchestration)
- [x] Node 1: `load_company` — loads from JSON dataset by CIN
- [x] Node 2: `run_rule_engine` — evaluates 8 compliance rules
- [x] Node 3: `run_risk_scorer` — computes weighted composite score
- [x] Node 4: `fetch_regulations` — semantic ChromaDB search
- [x] Node 5: `generate_remediation` — Gemini API call
- [x] Node 6: `compile_output` — assembles final ComplianceStatus JSON

---

### CA Portal — `frontend/` (port 5173)
- [x] Home page with company dropdown (all 12 companies, CA can select any)
- [x] "⚖️ CA Portal" badge and link to Executive Portal at localhost:5174
- [x] Full compliance analysis triggered on button click
- [x] Risk Dashboard with animated semicircular gauge + SHAP-style factor bars
- [x] Active Violations panel with severity badges and ₹ exposure amounts
- [x] AI Remediation Plan panel with numbered steps
- [x] Relevant Regulations section pulled from ChromaDB
- [x] Compliance Calendar with deadline tracking and filter tabs
- [x] Take Action modal with step-by-step filing instructions per obligation
- [x] Dark theme with indigo accent design system
- [x] **Tax Analysis Tab** — Advance tax timeline, TDS table, MAT check, savings opportunities
- [x] **CA Audit Tab** — Filing verification with AT_RISK / OUTDATED badges
- [x] **🔴 Alerts Tab** — Polls `GET /alerts/{cin}` every 5s; shows executive alerts with urgency badges (LOW/HIGH/EMERGENCY pulsing); "Acknowledge + Reply" modal
- [x] **📋 Filing Requests Tab** — Polls `GET /filing-requests/{cin}` every 5s; CA can mark IN_PROGRESS or FILED (with ACK number + portal selection)
- [x] **⚡ Activity Feed** — `ActivityFeed.jsx` appended to the Overview tab; polls `/activity-log` every 5s; filters entries to the current company; CRITICAL entries have red left border; countdown timer shows next scan

### Regulatory News UI
- [x] Category filter pills — All / GST / Corporate / Tax / Securities / General
- [x] Stale category fallback with amber warning banner
- [x] News Detail Modal with Gemini analysis, VS BEFORE diff, action steps
- [x] Analysis cache — re-opening same card is instant (no repeat API call)

---

### Executive Portal — `executive/` (port 5174) ⭐ NEW
> A completely separate Vite + React application — isolated from the CA portal, like an admin panel vs. the main site.

- [x] **Login Page** — Company dropdown + password field → `POST /auth/login`
  - Session stored in `sessionStorage` on success
  - Red error message on invalid credentials
  - Hint showing password format (`companyname2024`)
  - "Switch to CA Portal" link back to localhost:5173
- [x] **Route Guard** — `PrivateRoute` component redirects unauthenticated users to `/login`
- [x] **Executive Dashboard** — `/dashboard` route, locked to the logged-in company only
  - 3 KPI cards: Total ₹ Exposure · Items Needing Signature · Last CA Filing
  - "What Needs Your Signature" panel — urgency-tagged cards per board action required
  - **"Alert CA"** button → opens modal to compose + send alert with LOW/HIGH/EMERGENCY urgency
  - **CA Filing Tracker** table — polls `GET /filing-requests/{cin}` every 5s to reflect CA updates in real time
  - **"Request Filing"** button → sends `POST /filing-requests/{cin}` to ask CA to file a form
  - Regulatory Impact Feed — sector-filtered news cards with detail modal
  - **🤖 Ask Compliance AI** — Gemini chat with suggested query pills, scroll-to-bottom, loading state; sends company context as system prompt
  - **⚡ Activity Feed** — Appended below CA Audit; same `ActivityFeed.jsx` component, filtered to this company; live 🟢 status dot
  - **Sign Out** button clears sessionStorage and returns to login

### Credential System
- [x] 12 company passwords hardcoded in backend `_EXEC_CREDENTIALS` dict
- [x] Password scheme: `lowercaseslug2024` (e.g. `technova2024`, `pinnacle2024`)
- [x] Each executive can only access their own company — no company selector shown

---

## 🔄 Real-Time Communication Flow

```
Executive Portal (5174)          CA Portal (5173)
        │                               │
        │  POST /alerts/{cin}           │
        │ ─────────────────────────────►│  CA sees alert in 5s (polling)
        │                               │  CA replies via PUT /alerts/{id}/acknowledge
        │                               │
        │  POST /filing-requests/{cin}  │
        │ ─────────────────────────────►│  CA sees request in Filing Requests tab
        │                               │  CA marks as FILED with ACK number
        │◄──────────────────────────────│
        │  GET /filing-requests/{cin}   │
        │  (auto-polls every 5s)        │
        │  Status updates to FILED ✓    │
```

---

## 🏗️ Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Orchestration | LangGraph | Real state machine visible in code review |
| Vector DB | ChromaDB | Local, no external dependency, fast setup |
| AI Model | Gemini 2.0 Flash | Free API, fast, sufficient quality |
| Data Layer | JSON flat file | Zero setup time, demo-safe, no DB crashes |
| Scoring | Rule-based weighted | Deterministic, explainable, no model training needed |
| News analysis | Curated dataset + Gemini fallback | Instant response for known items |
| Alert storage | In-memory Python list | Hackathon-safe; no DB setup needed |
| Auth | sessionStorage + hardcoded credentials | Demo-appropriate; no JWT overhead |
| Portal split | Two separate Vite apps | Clean separation like e-commerce + admin panel |
| Real-time | Polling (5s interval) | No WebSocket complexity; reliable for demo |

---

## 📊 Demo Companies

| Company | CIN | Password | Risk Score |
|---------|-----|----------|------------|
| Pinnacle Capital Advisors | U65910MH2013PTC445566 | `pinnacle2024` | 100 — CRITICAL |
| Technova Solutions | U72900KA2018PTC123456 | `technova2024` | High |
| Redstone Retail | U51909MH2015PTC987654 | `redstone2024` | — |
| Greenfield Manufacturing | U26100DL2020PTC456789 | `greenfield2024` | — |
| Clearpath Legal | U74140TN2017PTC654321 | `clearpath2024` | — |
| Swiftline Logistics | U45201GJ2019PTC321098 | `swiftline2024` | — |
| Arogya Health Tech | U85110RJ2021PTC112233 | `arogya2024` | — |
| Haritha Agro Foods | U01100AP2022PTC778899 | `haritha2024` | — |
| Infracore Builders | U74999PB2016PTC334455 | `infracore2024` | — |
| Voltex Energy | U40100WB2014PTC556677 | `voltex2024` | — |
| Seaways Maritime | U63090KL2012PTC889900 | `seaways2024` | — |
| EduBridge EdTech | U80301HR2023PTC001122 | `edubridge2024` | — |

---

## 📰 News Dataset Summary

| Category   | Items | Date Range |
|------------|-------|------------|
| GST        | 10    | Nov 2025 – Apr 2026 |
| Corporate  | 10    | Nov 2025 – Apr 2026 |
| Tax        | 10    | Dec 2025 – Apr 2026 |
| Securities | 10    | Nov 2025 – Apr 2026 |
| **Total**  | **40** | |

---

## 🚧 In Progress

- [ ] Demo script finalization
- [ ] Wire `GET /score-update/{cin}` into Executive Dashboard UI for a visible risk delta card

---

## 📋 Planned (Post-Hackathon Roadmap)

### Phase 3 — Live Data Integration
- [ ] MCA21 V3 REST API integration (replace static dataset)
- [ ] GSTN Sandbox API for live GST data
- [ ] SEBI SCORES RSS feed monitoring

### Phase 4 — Full Agent Activation
- [ ] WebSocket / SSE to replace polling
- [ ] Redis Pub/Sub messaging between agents
- [ ] Email/SMS deadline alerts

### Phase 5 — Product
- [ ] JWT-based authentication replacing sessionStorage
- [ ] Subscription billing via Razorpay
- [ ] PDF compliance report export
- [ ] Historical risk score trend charts
- [ ] Persistent database (SQLite/Postgres) replacing in-memory alert store

---

## 🐛 Known Issues

- Alert and filing data is in-memory — clears on backend restart
- Calendar status does not persist across page refreshes (session only)
- General category has no curated news items (intentional — shows stale fallback UI demo)
- SEBI / Income Tax scrapers occasionally blocked by bot detection; curated dataset covers the gap
- `gemini-2.0-flash` free-tier quota may exhaust during heavy demo use; all AI calls now use `gemini-2.5-flash`
- Automation activity log also resets on backend restart (in-memory only)