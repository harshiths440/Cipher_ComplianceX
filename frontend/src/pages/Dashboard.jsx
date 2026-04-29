import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
import { analyzeCompany } from '../api/client';
import RiskGauge from '../components/RiskGauge';
import ShapFactorBar from '../components/ShapFactorBar';
import ViolationCard from '../components/ViolationCard';
import RemediationPanel from '../components/RemediationPanel';
import LoadingSpinner from '../components/LoadingSpinner';
import ActivityFeed from '../components/ActivityFeed';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart, Bar, Cell, PieChart, Pie, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { LayoutDashboard, CreditCard, TrendingUp, BarChart2, FileText, Settings, HelpCircle, Search, Bell, Plus, ArrowUpRight, MoreHorizontal, Check, AlertCircle, Activity, Star, Rss, ShieldCheck, Brain, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';

const API = 'http://localhost:8000';

// ─── helpers ────────────────────────────────────────────────────────────────

const getBucketStyle = (bucket) => {
  switch (bucket) {
    case 'LOW':      return 'text-[#22C55E] border-[#22C55E]/20 bg-[#22C55E]/10';
    case 'MEDIUM':   return 'text-[#EAB308] border-[#EAB308]/20 bg-[#EAB308]/10';
    case 'HIGH':     return 'text-[#F97316] border-[#F97316]/20 bg-[#F97316]/10';
    case 'CRITICAL': return 'text-[#EF4444] border-[#EF4444]/20 bg-[#EF4444]/10';
    default:         return 'text-gray-400 border-gray-400/20 bg-gray-400/10';
  }
};

const fmt = (n) => n >= 1e5
  ? `₹${(n / 1e5).toFixed(1)}L`
  : `₹${n?.toLocaleString('en-IN') ?? 0}`;

const StatusBadge = ({ s }) => {
  const map = {
    COMPLIANT: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20',
    VERIFIED:  'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20',
    AT_RISK:   'bg-amber-500/10 text-amber-400/80 border-amber-500/20',
    OUTDATED:  'bg-rose-500/10 text-rose-400/80 border-rose-500/20',
    DEFAULTING:'bg-rose-500/10 text-rose-400/80 border-rose-500/20',
    PAID:      'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/20',
    MISSED:    'bg-rose-500/10 text-rose-400/80 border-rose-500/20',
    UPCOMING:  'bg-slate-500/10 text-slate-400/80 border-slate-500/20',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-widest font-['Inclusive_Sans'] ${map[s] ?? 'text-gray-500 border-gray-500/20'}`}>
      {s}
    </span>
  );
};

// ─── Tax Analysis Tab ────────────────────────────────────────────────────────

const RiskAnalyserTab = ({ cin }) => {
  return (
    <div className="space-y-8 pb-24 font-['Inclusive_Sans'] max-w-6xl">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3 font-['Plus_Jakarta_Sans']">
            <ShieldAlert className="w-6 h-6 text-indigo-400" />
            Risk Intelligence Engine
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-500" />
            </span>
            Live Analysis
          </span>
        </div>
      </div>

      {/* ── RISK INTELLIGENCE ENGINE (SHAP) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Factors & Analysis */}
        <div className="bg-[#1C1F2E] border border-white/5 rounded-[32px] p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white font-['Plus_Jakarta_Sans']">Risk Calculation Engine</h2>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">SHAP Explainability Model v4.6</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">Input Data Analyzed</p>
              <div className="grid grid-cols-2 gap-3">
                {['3 years filing history', 'GST payment patterns', 'MCA compliance record', 'TDS deposit history', 'Director record', 'Industry benchmarks'].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">SHAP Explanation (Impact Breakdown)</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <span className="text-sm text-gray-200">Filing consistency</span>
                  <span className="text-xs font-bold text-emerald-400">+15 pts GOOD</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                  <span className="text-sm text-gray-200">GST payment history</span>
                  <span className="text-xs font-bold text-emerald-400">+22 pts GOOD</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-rose-500/5 rounded-xl border border-rose-500/10">
                  <span className="text-sm text-gray-200">Late TDS in 2022</span>
                  <span className="text-xs font-bold text-rose-400">-8 pts BAD</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-rose-500/5 rounded-xl border border-rose-500/10">
                  <span className="text-sm text-gray-200">Director with defaulted company</span>
                  <span className="text-xs font-bold text-rose-400">-12 pts BAD</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Remediation & Loan Prediction */}
        <div className="space-y-8">
          <div className="bg-[#1C1F2E] border border-white/5 rounded-[32px] p-8">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-6">Risk Factors to Fix</p>
            <div className="space-y-6">
              <div className="flex gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Late TDS deposit in Q3 2022</h4>
                  <p className="text-xs text-gray-500 mb-2">Shows cash flow stress pattern</p>
                  <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 inline-block">
                    FIX: Maintain TDS reserve account
                  </div>
                </div>
              </div>
              <div className="flex gap-4">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Director history flags</h4>
                  <p className="text-xs text-gray-500 mb-2">Could attract MCA scrutiny</p>
                  <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-lg border border-emerald-500/20 inline-block">
                    FIX: File compounding application
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#1C1F2E] border border-white/5 rounded-[32px] p-8 relative overflow-hidden shadow-xl shadow-black/20">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <TrendingUp className="w-32 h-32 text-indigo-400" />
            </div>
            <div className="relative z-10">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Intelligence Forecast</p>
              <h3 className="text-2xl font-bold text-white font-['Plus_Jakarta_Sans'] mb-6">Bank Loan Probability</h3>
              <div className="flex items-end gap-4 mb-4">
                <span className="text-5xl font-black text-indigo-400">89%</span>
                <span className="text-gray-500 text-xs font-bold mb-2 uppercase">IF ISSUES FIXED</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed opacity-80">
                Current approval chance is <span className="font-bold text-white">64%</span>. Fixing the highlighted TDS and Director flags will elevate your score to top-tier eligibility.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TaxTab = ({ cin }) => {
  const [tax, setTax] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [actionedCards, setActionedCards] = useState({});

  useEffect(() => {
    fetch(`${API}/tax/${cin}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setTax)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [cin]);

  if (loading) return <LoadingSpinner message="Analysing Tax Intelligence…" />;
  if (err)     return <div className="p-6 text-red-400 text-sm">Failed to load tax intelligence.</div>;
  if (!tax)    return null;

  const at = tax.advance_tax;
  const dotColor = { 
    PAID: 'bg-emerald-400', 
    MISSED: 'bg-rose-500 animate-pulse', 
    DUE_SOON: 'bg-orange-500 animate-pulse',
    UPCOMING_SOON: 'bg-yellow-400',
    UPCOMING: 'bg-slate-500' 
  };
  
  // Find the index of the last PAID installment to color the connecting line
  let lastPaidIndex = -1;
  at.installments.forEach((inst, i) => {
    if (inst.status === 'PAID') lastPaidIndex = i;
  });

  return (
    <div className="space-y-10 pb-24 font-['Inclusive_Sans'] max-w-6xl">
      {/* ── TAX INTELLIGENCE ── */}
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white flex items-center gap-3 font-['Plus_Jakarta_Sans']">
              <CreditCard className="w-6 h-6 text-indigo-400" />
              Tax Intelligence System
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
              <span className="relative flex w-1.5 h-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-500" />
              </span>
              Live Audit
            </span>
          </div>
        </div>
        
        {/* Header row */}
        <div className="bg-[#1C1F2E] border border-white/5 rounded-2xl p-6 flex flex-wrap gap-12 items-center">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2">Total Tax Liability</p>
            <p className="text-4xl font-black text-white">{fmt(tax.total_tax_liability)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-black mb-2">Effective Rate</p>
            <p className="text-2xl font-black text-indigo-400">{(tax.effective_rate * 100).toFixed(1)}%</p>
          </div>
          <div className="flex flex-wrap gap-2 ml-auto">
            {(tax.risk_flags || []).slice(0, 3).map((f, i) => (
              <span key={i} className="text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-3 py-1 rounded-full uppercase tracking-wider">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Advance Tax Timeline */}
        <div className="bg-[#1C1F2E] border border-white/5 rounded-[32px] p-8">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-10 flex items-center gap-2">Advance Tax Timeline <span className="text-[10px] text-green-400 normal-case bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">Live Countdown</span></h3>
          <div className="relative flex justify-between items-start pt-4">
            <div className="absolute top-[34px] left-0 right-0 h-0.5 bg-white/5 z-0" />
            <div 
              className="absolute top-[34px] left-0 h-0.5 bg-emerald-500 z-0 transition-all duration-1000" 
              style={{ width: lastPaidIndex >= 0 ? `${(lastPaidIndex / (at.installments.length - 1)) * 100}%` : '0%' }} 
            />
            {at.installments.map((inst, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center gap-4 w-1/4">
                <div className={`w-10 h-10 rounded-full border-4 border-[#1C1F2E] flex items-center justify-center transition-colors ${dotColor[inst.status] || 'bg-slate-500'}`}>
                  {inst.status === 'PAID' ? <Check className="w-4 h-4 text-[#1C1F2E]" /> : <div className="w-2 h-2 rounded-full bg-white/20" />}
                </div>
                <div className="text-center w-full px-2">
                  <p className="text-xs font-bold text-white mb-1 uppercase tracking-widest">{inst.due}</p>
                  <p className="text-[10px] text-gray-500 font-bold mb-2">{inst.percent}% Liability</p>
                  <p className="text-base font-black text-white mb-2">{fmt(inst.amount)}</p>
                  
                  {inst.status === 'PAID' && (
                    <>
                      <span className="text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full uppercase">✓ PAID</span>
                      <p className="text-[10px] text-gray-400 mt-2">Paid on {inst.payment_date}</p>
                    </>
                  )}
                  {inst.status === 'MISSED' && (
                    <>
                      <span className="text-[10px] font-bold bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full uppercase">MISSED</span>
                      <p className="text-[10px] text-rose-400 mt-2 font-semibold leading-tight">{inst.warning}</p>
                    </>
                  )}
                  {inst.status === 'DUE_SOON' && (
                    <>
                      <span className="text-[10px] font-bold bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full uppercase">DUE IN {inst.days_remaining} DAYS</span>
                      <p className="text-[10px] text-orange-400/80 mt-2 leading-tight">Pay immediately</p>
                    </>
                  )}
                  {inst.status === 'UPCOMING_SOON' && (
                    <>
                      <span className="text-[10px] font-bold bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full uppercase">Upcoming</span>
                      <p className="text-[10px] text-gray-400 mt-2">{inst.days_remaining} days left</p>
                    </>
                  )}
                  {inst.status === 'UPCOMING' && (
                    <>
                      <span className="text-[10px] font-bold bg-slate-500/10 border border-slate-500/20 text-slate-400 px-2 py-0.5 rounded-full uppercase">Upcoming</span>
                      <p className="text-[10px] text-gray-500 mt-2">{inst.days_remaining} days left</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TDS Table */}
        <div className="bg-[#1C1F2E] border border-white/5 rounded-[32px] p-8 overflow-x-auto">
          <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-8">TDS Obligations</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                <th className="text-left pb-4 pr-4">Obligation Type</th>
                <th className="text-left pb-4 pr-4">Section</th>
                <th className="text-right pb-4 pr-4">Volume</th>
                <th className="text-right pb-4 pr-4">Rate</th>
                <th className="text-right pb-4 pr-4">Amount Due</th>
                <th className="text-left pb-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(tax.tds_obligations || []).map((t, i) => (
                <React.Fragment key={i}>
                  <tr className="hover:bg-white/[0.02] transition-colors group">
                    <td className="py-4 pr-4 font-bold text-gray-200 group-hover:text-white">{t.type}</td>
                    <td className="py-4 pr-4 text-indigo-400 font-bold text-xs">{t.section}</td>
                    <td className="py-4 pr-4 text-right text-gray-400">{fmt(t.estimated_annual)}</td>
                    <td className="py-4 pr-4 text-right text-gray-400 font-bold">{(t.tds_rate * 100).toFixed(0)}%</td>
                    <td className="py-4 pr-4 text-right font-black text-white">{fmt(t.tds_due)}</td>
                    <td className="py-4 relative group/badge">
                      {t.status === 'COMPLIANT' && (
                        <div className="relative inline-block cursor-help">
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">COMPLIANT</span>
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-10">Last filed {t.days_since_filing} days ago</div>
                        </div>
                      )}
                      {t.status === 'AT_RISK' && (
                        <div className="relative inline-block cursor-help">
                          <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase animate-pulse">AT RISK</span>
                          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded whitespace-nowrap opacity-0 group-hover/badge:opacity-100 transition-opacity pointer-events-none z-10">Filing due soon — last filed {t.days_since_filing} days ago</div>
                        </div>
                      )}
                      {t.status === 'DEFAULTING' && (
                        <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase animate-pulse">DEFAULTING</span>
                      )}
                    </td>
                  </tr>
                  {t.status === 'DEFAULTING' && (
                    <tr className="bg-rose-500/5">
                      <td colSpan="6" className="py-2 px-4 text-xs font-semibold text-rose-400">
                        ⚠️ {t.status_reason} — Interest accrued: {fmt(t.interest_accrued)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MAT Check ── */}
      <div className="bg-[var(--color-brand-card)] border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">MAT Check — Section 115JB</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: 'Regular Tax', val: tax.mat_check.regular_tax, active: !tax.mat_check.mat_applies },
            { label: 'MAT Liability', val: tax.mat_check.mat_liability, active: tax.mat_check.mat_applies },
          ].map(({ label, val, active }) => (
            <div key={label} className={`p-4 rounded-xl border-2 transition-all ${active ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 bg-white/3'}`}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-2xl font-black ${active ? 'text-indigo-300' : 'text-gray-400'}`}>{fmt(val)}</p>
              {active && <span className="text-xs text-indigo-400 font-semibold mt-1 block">▲ Applies</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-4 text-sm">
          <span className={`px-3 py-1 rounded-full border text-xs font-semibold ${tax.mat_check.mat_applies ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-green-500/10 text-green-400 border-green-500/30'}`}>
            {tax.mat_check.mat_applies ? 'MAT Applies' : 'Regular Tax Applies'}
          </span>
          {tax.mat_check.tax_credit_available > 0 && (
            <span className="px-3 py-1 rounded-full border text-xs font-semibold bg-indigo-500/10 text-indigo-400 border-indigo-500/30">
              MAT Credit: {fmt(tax.mat_check.tax_credit_available)}
            </span>
          )}
        </div>
      </div>

      {/* ── Savings Opportunities ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Savings Opportunities</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(tax.savings_opportunities || []).map((s, i) => {
            const actioned = actionedCards[i];
            return (
              <div key={i} className={`p-5 rounded-xl border transition-all ${actioned ? 'border-emerald-500/40 bg-emerald-500/5' : s.applicable ? 'border-green-500/30 bg-green-500/5' : 'border-white/5 bg-white/2 opacity-40'}`}>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono font-bold text-indigo-400">§ {s.section}</span>
                  {actioned
                    ? <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">✓ Noted</span>
                    : s.applicable && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Applicable</span>
                  }
                </div>
                <p className="text-xs text-gray-400 mb-3 leading-relaxed">{s.description}</p>
                {s.applicable && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-lg font-black text-green-400">Save {fmt(s.estimated_saving)}</p>
                    {!actioned && (
                      <button
                        onClick={() => setActionedCards(prev => ({ ...prev, [i]: true }))}
                        className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:border-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/5 transition-all"
                      >
                        Mark as Actioned
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── CA Audit Tab ────────────────────────────────────────────────────────────

const CAAuditTab = ({ cin }) => {
  const [ca, setCa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${API}/ca-verify/${cin}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setCa)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [cin]);

  if (loading) return <LoadingSpinner message="Running CA Audit verification…" />;
  if (err)     return <div className="p-6 text-red-400 text-sm">Failed: {err}</div>;
  if (!ca)     return null;

  const allVerified = ca.at_risk_count === 0 && ca.outdated_count === 0;

  return (
    <div className="space-y-6 pb-16">

      {/* ── Summary banner ── */}
      {allVerified ? (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
          <span className="text-2xl">✅</span>
          <p className="text-green-400 font-semibold">{ca.summary}</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="text-yellow-300 font-semibold">{ca.summary}</p>
            <p className="text-yellow-400/60 text-xs mt-0.5">
              {ca.outdated_count} outdated &nbsp;·&nbsp; {ca.at_risk_count} at risk &nbsp;·&nbsp; {ca.total_filings - ca.at_risk_count - ca.outdated_count} verified
            </p>
          </div>
        </div>
      )}

      {/* ── Filings table ── */}
      <div className="bg-[var(--color-brand-card)] border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Filing Verification</h3>
        </div>
        <div className="divide-y divide-white/5">
          {(ca.verified_filings || []).map((f, i) => (
            <div key={i}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className="w-full text-left px-6 py-4 hover:bg-white/3 transition-colors flex items-center gap-4"
              >
                {/* Form */}
                <span className="font-mono font-bold text-indigo-300 w-20 shrink-0">{f.form}</span>
                {/* Date */}
                <span className="text-gray-400 text-sm w-28 shrink-0">{f.filed_date}</span>
                {/* CA */}
                <span className="text-gray-500 text-sm flex-1 truncate">{f.filed_by}</span>
                {/* Status */}
                <StatusBadge s={f.status} />
                {/* Flag snippet */}
                {f.flag_message && (
                  <span className="text-xs text-gray-600 hidden md:block flex-1 truncate ml-2">
                    {f.flag_message}
                  </span>
                )}
                {/* Chevron */}
                {f.flag_message && (
                  <span className={`text-gray-600 transition-transform ${expanded === i ? 'rotate-180' : ''}`}>▾</span>
                )}
              </button>

              {/* Expanded detail */}
              {expanded === i && f.flag_message && (
                <div className="mx-6 mb-4 p-4 border border-indigo-500/30 bg-indigo-500/5 rounded-xl space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Finding</p>
                    <p className="text-sm text-gray-200 leading-relaxed">{f.flag_message}</p>
                  </div>
                  {f.recommendation && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Recommendation</p>
                      <p className="text-sm text-indigo-300 leading-relaxed">→ {f.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const OverviewTab = ({ data, cin, alerts, setTab }) => {
  const [latestNews, setLatestNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [quickAction, setQuickAction] = useState(null);

  useEffect(() => {
    fetch(`${API}/news?limit=3`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setLatestNews(d.items || []))
      .catch(() => setLatestNews([]))
      .finally(() => setNewsLoading(false));
  }, []);

  const taxData = [
    { name: 'Jan', val: 20 }, { name: 'Feb', val: 35 }, { name: 'Mar', val: 50 },
    { name: 'Apr', val: 40 }, { name: 'May', val: 60 }, { name: 'Jun', val: 55 },
    { name: 'Jul', val: 70 }, { name: 'Aug', val: 45 }, { name: 'Sep', val: 65 },
    { name: 'Oct', val: 90 }, { name: 'Nov', val: 30 }, { name: 'Dec', val: 50 },
  ];

  const score = data.risk_score || 0;
  const riskData = [
    { name: 'Critical', value: score > 70 ? score * 0.5 : score * 0.2, color: '#e11d48' },
    { name: 'High', value: score > 40 ? score * 0.3 : score * 0.1, color: '#d97706' },
    { name: 'Medium', value: Math.max(10, 100 - (score > 70 ? score * 0.8 : score * 0.3)), color: '#059669' },
  ];

  const recentAlerts = (alerts || []).slice(0, 3);

  const QUICK_ACTION_DATA = {
    'GST': { title: 'GST Filing (GSTR-3B)', steps: ['Reconcile sales register', 'Download GSTR-2B', 'Offset ITC', 'Submit return'], fee: '₹2,500', ref: 'Rule 61(5)' },
    'MGT': { title: 'Annual Return (MGT-7)', steps: ['Draft Director Report', 'Verify Shareholding', 'Compute penalties (if late)', 'File on MCA V3'], fee: '₹5,000', ref: 'Sec 92' },
    'AOC': { title: 'Financials (AOC-4)', steps: ['Audit financials', 'Prepare XBRL (if applicable)', 'Board approval', 'File on MCA'], fee: '₹5,000', ref: 'Sec 137' },
    'KYC': { title: 'Director KYC (DIR-3)', steps: ['Verify mobile/email', 'Generate OTP', 'Submit e-form', 'Verify DSC'], fee: '₹500', ref: 'Rule 12A' },
  };

  const handleSeedAlert = async () => {
    try {
      await fetch(`${API}/demo/trigger-regulation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Urgent: New GST Notification (2026)',
          category: 'GST',
          severity: 'HIGH'
        })
      });
      alert("Demo alert triggered! It will appear in Recent Alerts within 5 seconds.");
    } catch (e) {
      alert("Failed to trigger demo alert. Is the backend running?");
    }
  };

  return (
    <div className="space-y-10 pb-24 font-['Inclusive_Sans']">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3 font-['Plus_Jakarta_Sans']">
            <LayoutDashboard className="w-6 h-6 text-indigo-400" />
            Executive Compliance Overview
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
            <span className="relative flex w-1.5 h-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-500" />
            </span>
            Live Monitoring
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in relative">
      
      {/* LEFT COLUMN */}
      <div className="lg:col-span-2 space-y-6">
        {/* Total Penalty Exposure Chart */}
        <div className="bg-[#1C1F2E] rounded-[32px] p-8 relative overflow-hidden border border-white/5">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/2 z-0" />
          <div className="relative z-10 flex justify-between items-start mb-8">
            <div>
              <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mb-1">Total Penalty Exposure</p>
              <h2 className="text-4xl font-black text-white mt-2 font-['Plus_Jakarta_Sans']">
                {data.compliance_summary?.penalty_paid_inr 
                  ? `₹${data.compliance_summary.penalty_paid_inr.toLocaleString()}` 
                  : '₹65,000.00'}
              </h2>
              <p className="text-gray-500 text-xs mt-2 uppercase tracking-wide">Risk escalation <span className="text-rose-400 font-bold">+{data.risk_score || 0} pts</span></p>
            </div>
            <button className="bg-white/5 hover:bg-white/10 text-gray-300 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
              Monthly Reports
            </button>
          </div>
          
          <div className="h-48 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taxData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '12px' }} />
                <Bar dataKey="val" radius={[4, 4, 4, 4]}>
                  {taxData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'Oct' ? '#6366f1' : '#312e81'} opacity={entry.name === 'Oct' ? 1 : 0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Score Breakdown */}
        <div className="bg-[#1C1F2E] rounded-[32px] p-8 flex flex-col md:flex-row items-center gap-10 relative overflow-hidden border border-white/5 shadow-xl shadow-black/20 group">
           <div className="absolute top-8 right-8 z-20">
             <button 
               onClick={() => setTab('risk')}
               className="text-[10px] text-indigo-400 hover:text-indigo-300 font-black uppercase tracking-[0.2em] transition-colors flex items-center gap-2"
             >
               Risk Analyser →
             </button>
           </div>
           <div className="w-full md:w-1/2 flex justify-center items-center relative">
              <div className="h-48 w-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskData} innerRadius={65} outerRadius={80} paddingAngle={4} dataKey="value" stroke="none">
                      {riskData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                  <Activity className="w-6 h-6 text-white" />
                </div>
              </div>
           </div>
           <div className="w-full md:w-1/2">
             <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">October Intelligence</p>
             <h3 className="text-white font-bold text-xl mb-4 font-['Plus_Jakarta_Sans'] tracking-tight">Risk Score Breakdown</h3>
             <h2 className="text-5xl font-black text-white mb-8 font-['Plus_Jakarta_Sans']">{data.risk_score || 0} <span className="text-lg text-gray-600 font-bold">/ 100</span></h2>
             <div className="space-y-4">
               {riskData.map((item, i) => (
                 <div key={i} className="flex items-center gap-3">
                   <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                   <span className="text-gray-400 text-[11px] font-bold uppercase tracking-widest">{item.name} Violations</span>
                 </div>
               ))}
             </div>
           </div>
        </div>

        {/* 📡 Live Regulatory Updates Feed */}
        <div className="bg-[#1C1F2E] rounded-3xl p-6 relative overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <Rss className="w-5 h-5 text-indigo-400" />
              Latest Regulatory Updates
            </h3>
            <button 
              onClick={() => setTab('live_updates')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
            >
              Live Updates →
            </button>
          </div>

          {newsLoading ? (
            <div className="py-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (latestNews.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {latestNews.map((item, i) => {
                const cs = LIVE_CATEGORY_STYLES[item.category] || LIVE_CATEGORY_STYLES.General;
                const is = IMPACT_BADGE_STYLES[item.impact_label || item.severity] || IMPACT_BADGE_STYLES.LOW;
                return (
                  <div key={i} className="group p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-indigo-500/30 hover:bg-white/10 transition-all cursor-default flex flex-col justify-between h-full min-h-[140px]">
                    <div>
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <span className="text-base">{item.source_icon}</span>
                        <span className="text-[9px] text-gray-500 font-mono">{item.date}</span>
                      </div>
                      <h4 className="text-xs font-bold text-white mb-3 line-clamp-2 leading-relaxed group-hover:text-indigo-300 transition-colors">{item.title}</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full border uppercase" 
                        style={{ background: is.bg, color: is.text, borderColor: is.border }}>
                        {item.impact_label || item.severity}
                      </span>
                      <span className="text-[8px] font-black px-2 py-0.5 rounded-full border uppercase"
                        style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}>
                        {item.category}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-gray-500 text-sm">No recent updates found.</div>
          ))}
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div className="space-y-6">
        {/* Company Card */}
        <div>
          <h3 className="text-white font-semibold text-lg mb-4">Company</h3>
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-6 text-white relative overflow-hidden shadow-[0_8px_30px_rgb(99,102,241,0.3)]">
             <div className="absolute top-0 right-0 p-4 opacity-30"><CreditCard className="w-24 h-24" /></div>
             <div className="relative z-10">
               <div className="bg-white/20 w-12 h-8 rounded mb-10 flex items-center justify-center backdrop-blur-md border border-white/30">
                 <div className="w-6 h-4 bg-white/40 rounded-sm" />
               </div>
               <h4 className="text-2xl font-bold mb-1">{data.company_name}</h4>
               <p className="font-mono text-white/70 tracking-widest text-sm">{data.cin}</p>
               
               <div className="mt-6 flex justify-between items-end">
                 <div>
                    <p className="text-xs text-white/60 uppercase">Sector</p>
                    <p className="font-semibold">{data.sector}</p>
                 </div>
                 <div className="flex gap-1">
                    <div className="w-6 h-6 rounded-full bg-white/30 backdrop-blur-md" />
                    <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md -ml-3" />
                 </div>
               </div>
             </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h3 className="text-white font-semibold text-lg mb-4">Quick Actions</h3>
          <div className="flex items-center gap-4">
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {['GST', 'MGT', 'AOC', 'KYC'].map((action, i) => (
                <button 
                  key={i} 
                  onClick={() => setQuickAction(QUICK_ACTION_DATA[action])}
                  className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 hover:bg-indigo-600 hover:text-white transition-colors shrink-0 shadow-lg border border-white/5"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-semibold text-lg">Recent Alerts</h3>
            {(alerts.length > 0 || (data.violations && data.violations.length > 0)) && (
              <button 
                onClick={() => setTab(alerts.length > 0 ? 'alerts' : 'ca_audit')}
                className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider"
              >
                View All
              </button>
            )}
          </div>
          <div className="space-y-4">
            {recentAlerts.length > 0 ? (
              recentAlerts.map(a => (
                <div key={a.id} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors group cursor-pointer" onClick={() => setTab('alerts')}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${a.urgency === 'EMERGENCY' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="text-white text-sm font-semibold truncate group-hover:text-indigo-300 transition-colors">{a.regulation_title}</h4>
                    <p className="text-gray-400 text-xs truncate">{a.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-500 block">{new Date(a.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    {a.status === 'UNREAD' && <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block mt-1" />}
                  </div>
                </div>
              ))
            ) : data.violations && data.violations.length > 0 ? (
              data.violations.slice(0, 3).map((v, i) => (
                <div key={i} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors group cursor-pointer" onClick={() => setTab('ca_audit')}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${v.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <h4 className="text-white text-sm font-semibold truncate group-hover:text-indigo-300 transition-colors">{v.rule}</h4>
                    <p className="text-gray-400 text-xs truncate">Action required: {v.penalty_reference}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-red-400 font-bold block">AUDIT</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                No recent alerts or violations found.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Quick Action Modal */}
      <AnimatePresence>
        {quickAction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-[#1C1F2E] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 bg-indigo-500/5">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-xl font-bold text-white">{quickAction.title}</h3>
                  <button onClick={() => setQuickAction(null)} className="text-gray-500 hover:text-white transition-colors">✕</button>
                </div>
                <p className="text-xs text-indigo-400 font-mono font-bold">{quickAction.ref}</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Required Procedure</h4>
                  <div className="space-y-3">
                    {quickAction.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center shrink-0 font-bold border border-indigo-500/30">
                          {i+1}
                        </div>
                        <span className="text-sm text-gray-300">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-white/3 rounded-2xl border border-white/5">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Professional Fee</p>
                    <p className="text-lg font-black text-white">{quickAction.fee}</p>
                  </div>
                  <button 
                    onClick={(e) => {
                      const btn = e.currentTarget;
                      btn.innerHTML = '✅ Task Initiated';
                      btn.style.backgroundColor = '#10b981'; // green-500
                      btn.style.pointerEvents = 'none';
                      setTimeout(() => setQuickAction(null), 1500);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    Initiate Task
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
};

// ─── Live Updates Tab (company-specific) ────────────────────────────────────

const LIVE_CATEGORY_STYLES = {
  GST:        { bg: 'rgba(52,211,153,0.05)',  text: '#6ee7b7', border: 'rgba(52,211,153,0.1)' },
  Securities: { bg: 'rgba(96,165,250,0.05)', text: '#93c5fd', border: 'rgba(96,165,250,0.1)' },
  Tax:        { bg: 'rgba(251,191,36,0.05)',  text: '#fcd34d', border: 'rgba(251,191,36,0.1)' },
  Corporate:  { bg: 'rgba(244,114,182,0.05)', text: '#f9a8d4', border: 'rgba(244,114,182,0.1)' },
  General:    { bg: 'rgba(148,163,184,0.05)',text: '#cbd5e1', border: 'rgba(148,163,184,0.1)' },
};

const IMPACT_BADGE_STYLES = {
  HIGH:   { bg: 'rgba(239,68,68,0.15)',  text: '#f87171', border: 'rgba(239,68,68,0.4)',   dot: '#ef4444' },
  MEDIUM: { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.4)',  dot: '#f59e0b' },
  LOW:    { bg: 'rgba(34,197,94,0.15)',  text: '#4ade80', border: 'rgba(34,197,94,0.4)',   dot: '#22c55e' },
};

const LiveUpdatesTab = ({ cin, companyName, sector }) => {
  const [allItems, setAllItems]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [impactFilter, setImpactFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(12);
  const [meta, setMeta]                 = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/news?limit=50`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        // Normalise: backend returns `severity`, component needs `impact_label`
        // Sort by date: latest first
        const items = (d.items || []).map(item => ({
          ...item,
          impact_label: item.impact_label || item.severity || 'LOW',
        })).sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA;
        });
        const highCount = items.filter(i => i.impact_label === 'HIGH').length;
        setMeta({ company: companyName, sector, total: items.length, high: highCount });
        setAllItems(items);
      })
      .catch(() => setAllItems([]))
      .finally(() => setLoading(false));
  }, [cin]);

  const impactLevels = ['All', 'HIGH', 'MEDIUM', 'LOW'];

  const filtered = allItems.filter(item =>
    impactFilter === 'All' || item.impact_label === impactFilter
  );

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-500">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-indigo-500"
        />
        <div className="absolute inset-0 flex items-center justify-center text-xl">📡</div>
      </div>
      <p className="text-sm font-medium">Loading live regulatory updates…</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-16">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Rss className="w-5 h-5 text-indigo-400" />
            Live Regulatory Updates
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
            <span className="relative flex w-2 h-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full w-2 h-2 bg-green-500" />
            </span>
            Live
          </span>
        </div>
        {meta && (
          <p className="text-xs text-gray-500">
            Filtered for <span className="text-indigo-400 font-semibold">{meta.company}</span> · {meta.sector} ·{' '}
            <span className="text-red-400 font-semibold">{meta.high} high-impact</span> regulations
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-600 uppercase tracking-wider font-bold mr-1">Filter By:</span>
        {impactLevels.map(lvl => {
          const active = impactFilter === lvl;
          const s = IMPACT_BADGE_STYLES[lvl];
          return (
            <button
              key={lvl}
              onClick={() => { setImpactFilter(lvl); setVisibleCount(12); }}
              className="px-3 py-1 rounded-full text-xs font-semibold transition-all border"
              style={active && s ? {
                background: s.bg, color: s.text, borderColor: s.border,
                boxShadow: `0 0 10px ${s.dot}40`,
              } : {
                background: active ? '#4f46e5' : 'rgba(255,255,255,0.05)',
                color: active ? '#fff' : '#94a3b8',
                borderColor: active ? '#6366f1' : 'rgba(255,255,255,0.1)',
              }}
            >
              {lvl === 'All' ? 'Latest' : lvl}
            </button>
          );
        })}
      </div>

      {/* ── Stats row ── */}
      {meta && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'High Impact', count: allItems.filter(i => i.impact_label === 'HIGH').length,   color: 'text-red-400',    icon: '🔴' },
            { label: 'Medium',      count: allItems.filter(i => i.impact_label === 'MEDIUM').length, color: 'text-yellow-400', icon: '🟡' },
            { label: 'Low',         count: allItems.filter(i => i.impact_label === 'LOW').length,    color: 'text-gray-400',   icon: '⚪' },
          ].map(({ label, count, color, icon }) => (
            <div key={label} className="bg-[#111827] border border-white/8 rounded-xl p-4 text-center">
              <p className={`text-2xl font-black ${color}`}>{icon} {count}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Cards grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-sm font-medium">No updates match the selected filters</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={impactFilter}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {visible.map((item, idx) => {
              const cs = LIVE_CATEGORY_STYLES[item.category] || LIVE_CATEGORY_STYLES.General;
              const is = IMPACT_BADGE_STYLES[item.impact_label] || IMPACT_BADGE_STYLES.LOW;
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.3, ease: 'easeOut' }}
                  className="bg-[#111827] border border-white/8 rounded-xl p-5 flex flex-col gap-3 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.12)] transition-all cursor-default"
                >
                  {/* Top row: severity badge + category badge + date */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                        style={{ background: is.bg, color: is.text, borderColor: is.border }}
                      >
                        {item.impact_label === 'HIGH' ? '🔴' : item.impact_label === 'MEDIUM' ? '🟡' : '⚪'} {item.impact_label}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                        style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
                      >
                        {item.category}
                      </span>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">{item.date}</span>
                  </div>

                  {/* Source */}
                  <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-semibold">
                    <span>{item.source_icon}</span>
                    <span>{item.source}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{item.title}</h3>

                  {/* Reason */}
                  <p className="text-xs text-indigo-300/70 italic leading-relaxed line-clamp-2">↳ {item.reason}</p>

                  {/* Penalty */}
                  {item.penalty && (
                    <p className="text-xs text-red-400/80 font-medium mt-auto">⚠ {item.penalty}</p>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}

      {/* ── Load more ── */}
      {hasMore && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setVisibleCount(c => c + 12)}
            className="px-6 py-2.5 text-sm font-semibold text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-500/10 transition-colors"
          >
            Load More ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Regulations Affecting You Tab ──────────────────────────────────────────

const CATEGORY_STYLES = {
  GST:        { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  Securities: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  Tax:        { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', border: 'rgba(234,179,8,0.3)' },
  Corporate:  { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  General:    { bg: 'rgba(148,163,184,0.12)',text: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
};

const RegulationsTab = ({ cin, sector, companyName }) => {
  const [items, setItems]         = useState([]);
  const [meta, setMeta]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);   // holds the item being inspected

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/regulations/${cin}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        // Sort: violation-matched (score >= 3) first, then sector-matched
        const sorted = [...(d.items || [])].sort((a, b) => b.relevance_score - a.relevance_score);
        setItems(sorted);
        setMeta({
          company_name: d.company_name,
          sector:       d.sector,
          total:        d.total,
          debug:        d.debug || null,
        });
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [cin]);

  // ── Detail modal ──
  const DetailModal = ({ item, onClose }) => {
    if (!item) return null;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.22 }}
          className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/8 flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                  style={(() => { const cs = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.General; return { background: cs.bg, color: cs.text, borderColor: cs.border }; })()}
                >
                  {item.category}
                </span>
                {item.relevance_score >= 3
                  ? <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">⚠️ Active Violation Related</span>
                  : <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-indigo-500/15 text-indigo-400 border-indigo-500/30">Affects You</span>
                }
              </div>
              <h3 className="text-base font-bold text-white leading-snug">{item.rule_name || item.title}</h3>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none shrink-0">✕</button>
          </div>

          <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto custom-scrollbar">
            {/* What Changed */}
            {item.what_changed && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">What Changed</p>
                <p className="text-sm text-gray-200 leading-relaxed">{item.what_changed}</p>
              </div>
            )}

            {/* Before / After diff */}
            {item.compared_to_before && (
              <div className="bg-black/30 border border-white/5 rounded-xl px-4 py-3">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Before → After</p>
                <p className="text-xs text-gray-300 leading-relaxed">{item.compared_to_before}</p>
              </div>
            )}

            {/* Who It Hits */}
            {item.who_it_hits && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Who It Hits</p>
                <p className="text-sm text-gray-300 leading-relaxed">{item.who_it_hits}</p>
              </div>
            )}

            {/* Deadline + Penalty */}
            <div className="grid grid-cols-2 gap-3">
              {item.deadline && (
                <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-1">Deadline</p>
                  <p className="text-sm text-white font-semibold">{item.deadline}</p>
                </div>
              )}
              {item.penalty && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl p-3">
                  <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold mb-1">Penalty</p>
                  <p className="text-sm text-white font-semibold">{item.penalty}</p>
                </div>
              )}
            </div>

            {/* What to do */}
            {item.what_to_do?.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Action Steps</p>
                <ol className="space-y-2">
                  {item.what_to_do.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-gray-300">
                      <span className="text-indigo-400 font-bold shrink-0">{i + 1}.</span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

  const RegCard = ({ item, idx }) => {
    const cs = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.General;
    const isViolation = (item.relevance_score || 0) >= 3;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setModal(item)}
        className="flex flex-col gap-4 p-6 rounded-[24px] cursor-pointer transition-all duration-300 bg-[#1C1F2E]/40 border border-white/5 hover:bg-[#1C1F2E]/80 hover:border-indigo-500/30 group h-full"
      >
        <div className="flex justify-between items-start">
           <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500 font-['Inclusive_Sans']">{item.date}</span>
           <div className="px-2 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider" style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}>
             {item.category}
           </div>
        </div>
        
        <h3 className="text-base font-bold text-gray-100 leading-snug group-hover:text-white transition-colors font-['Plus_Jakarta_Sans'] line-clamp-2">{item.title}</h3>
        
        <div className="mt-auto pt-4 flex items-center justify-between border-t border-white/5">
           <div className="flex items-center gap-2">
             <span className="text-lg">{item.source_icon}</span>
             <span className="text-xs font-semibold text-gray-400">{item.source}</span>
           </div>
           {isViolation ? (
             <span className="flex items-center gap-1 text-[10px] font-bold text-red-400/80 uppercase tracking-tight">
               <AlertCircle className="w-3 h-3" /> Risk Match
             </span>
           ) : (
             <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-400/80 uppercase tracking-tight">
               <ShieldCheck className="w-3 h-3" /> Sector Match
             </span>
           )}
        </div>
      </motion.div>
    );
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-600">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border border-white/5" />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-transparent border-t-indigo-400"
        />
      </div>
      <p className="text-xs font-medium tracking-widest uppercase opacity-50">Syncing Regulations</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-16 font-['Inclusive_Sans']">
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight font-['Plus_Jakarta_Sans']">
          Your Regulations
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Regulatory intelligence tailored for{' '}
          <span className="text-gray-300">{meta?.company_name || companyName}</span>
          {' — '}
          <span className="text-indigo-400/80 uppercase text-[11px] font-bold tracking-wider">{meta?.sector || sector}</span>
        </p>
      </div>

      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 border border-white/5 rounded-3xl bg-white/[0.02]">
          <p className="text-gray-400 font-medium text-center">
            Your sector is currently up to date. No immediate regulatory impacts detected.
          </p>
        </div>
      )}

      {/* ── Cards grid ── */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item, idx) => (
            <RegCard key={idx} item={item} idx={idx} />
          ))}
        </div>
      )}

      {/* ── Detail modal ── */}
      <AnimatePresence>
        {modal && <DetailModal item={modal} onClose={() => setModal(null)} />}
      </AnimatePresence>
    </div>
  );
};

// ─── Alert Inbox Tab ─────────────────────────────────────────────────────────

const AlertInboxTab = ({ alerts, setAlerts, refreshAlerts }) => {
  const [replyText, setReplyText] = useState({});
  const [replyModal, setReplyModal] = useState({ open: false, alertId: null });

  const handleAck = async () => {
    const responseText = replyText[replyModal.alertId] || '';
    const alertId = replyModal.alertId;
    setAlerts(alerts.map(a => a.id === alertId ? { ...a, status: 'ACKNOWLEDGED', ca_response: responseText, acknowledged_at: new Date().toISOString() } : a));
    setReplyModal({ open: false, alertId: null });

    try {
      await fetch(`${API}/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ca_response: responseText })
      });
      refreshAlerts();
    } catch (e) {
      console.error(e);
      refreshAlerts();
    }
  };

  const handleRead = async (id) => {
    setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'READ' } : a));
    try {
      await fetch(`${API}/alerts/${id}/read`, { method: 'PUT' });
      refreshAlerts();
    } catch (e) { console.error(e); refreshAlerts(); }
  };

  if (!alerts.length) return (
    <div className="p-20 text-center flex flex-col items-center gap-4 border border-white/5 rounded-3xl bg-white/[0.02]">
      <p className="text-gray-500 font-medium font-['Inclusive_Sans']">No alerts in your inbox.</p>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl font-['Inclusive_Sans']">
      <h2 className="text-2xl font-bold text-white tracking-tight font-['Plus_Jakarta_Sans'] mb-4">Alert Inbox</h2>
      
      {alerts.map(a => {
        const isEmergency = a.urgency === 'EMERGENCY';
        const isRead = a.status !== 'UNREAD';

        return (
          <div key={a.id} className={`group p-5 rounded-[24px] border transition-all duration-300 ${
            !isRead 
              ? 'bg-[#1C1F2E] border-indigo-500/30 shadow-[0_4px_20px_rgba(99,102,241,0.05)]' 
              : 'bg-[#1C1F2E]/40 border-white/5 hover:border-white/10'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-[0.1em] border ${
                  isEmergency 
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}>
                  {a.urgency}
                </span>
                {!isRead && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />}
              </div>
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {new Date(a.sent_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </span>
            </div>
            
            <div className="mb-3">
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Subject</p>
              <h3 className="text-base font-bold text-gray-100 font-['Plus_Jakarta_Sans']">{a.regulation_title}</h3>
            </div>

            <div className="p-4 bg-black/20 rounded-xl border border-white/5 mb-4">
              <p className="text-sm text-gray-300 leading-relaxed italic opacity-90">"{a.message}"</p>
            </div>

            <p className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] mb-4">Origin: Executive Council</p>
            
            {a.status !== 'ACKNOWLEDGED' ? (
              <div className="flex gap-3 pt-4 border-t border-white/5">
                {a.status === 'UNREAD' && (
                  <button 
                    onClick={() => handleRead(a.id)} 
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Mark as Read
                  </button>
                )}
                <button 
                  onClick={() => setReplyModal({ open: true, alertId: a.id })} 
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20"
                >
                  Acknowledge
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-white/5">
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl">
                  <p className="text-[9px] text-emerald-400 mb-2 font-black uppercase tracking-[0.2em]">Response</p>
                  <p className="text-xs text-gray-400 font-medium leading-relaxed">{a.ca_response}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {replyModal.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#1C1F2E] border border-white/10 rounded-[32px] w-full max-w-lg p-10 shadow-2xl"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold text-white font-['Plus_Jakarta_Sans']">Acknowledge Alert</h3>
              <button onClick={() => setReplyModal({ open: false, alertId: null })} className="text-gray-500 hover:text-white text-xl">✕</button>
            </div>
            
            <div className="mb-8">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2">Subject</p>
              <p className="text-gray-200 font-semibold">{alerts.find(a => a.id === replyModal.alertId)?.regulation_title}</p>
            </div>

            <div className="mb-10">
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">Your Response</label>
              <textarea 
                className="w-full bg-black/40 border border-white/10 rounded-2xl p-6 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[160px] transition-all resize-none"
                placeholder="Detail the actions taken or planned regarding this alert..."
                value={replyText[replyModal.alertId] || ''}
                onChange={e => setReplyText({...replyText, [replyModal.alertId]: e.target.value})}
              />
            </div>

            <div className="flex gap-4 justify-end">
              <button 
                onClick={() => setReplyModal({ open: false, alertId: null })} 
                className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-white uppercase tracking-widest"
              >
                Cancel
              </button>
              <button 
                onClick={handleAck} 
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/25"
              >
                Send
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// ─── Filing Requests Tab ─────────────────────────────────────────────────────

const FilingRequestsTab = ({ requests, refreshRequests }) => {
  const [filingModal, setFilingModal] = useState({ open: false, request: null, caName: '', portal: 'GST Portal' });

  const getPortal = (form) => {
    if (form.includes('GST')) return 'GST Portal';
    if (form.includes('ITR') || form.includes('15CA')) return 'Income Tax Portal';
    if (form.includes('MGT') || form.includes('AOC') || form.includes('DIR')) return 'MCA21';
    return 'Other';
  };

  const handleProgress = async (id) => {
    await fetch(`${API}/filing-requests/${id}/progress`, { method: 'PUT' });
    refreshRequests();
  };

  const handleConfirmFiled = async () => {
    const { request, caName, portal } = filingModal;
    await fetch(`${API}/filing-requests/${request.id}/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ca_name: caName || 'CA', form_name: request.form_name, portal })
    });
    setFilingModal({ open: false, request: null, caName: '', portal: '' });
    refreshRequests();
  };

  const openModal = (r) => {
    setFilingModal({ open: true, request: r, caName: '', portal: getPortal(r.form_name) });
  };

  if (!requests.length) return <div className="p-8 text-center text-gray-400 border border-white/5 rounded-xl bg-white/2">No pending filing requests.</div>;

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden pb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-black/20 text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Form</th>
              <th className="px-6 py-4">Requested</th>
              <th className="px-6 py-4">Deadline</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {requests.map(r => (
              <tr key={r.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 font-bold text-white">{r.form_name}</td>
                <td className="px-6 py-4 text-gray-400">{new Date(r.requested_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">{r.deadline}</td>
                <td className="px-6 py-4"><StatusBadge s={r.status} /></td>
                <td className="px-6 py-4 text-right">
                  {r.status === 'PENDING' && (
                    <button onClick={() => handleProgress(r.id)} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors">
                      Start Filing
                    </button>
                  )}
                  {r.status === 'IN_PROGRESS' && (
                    <button onClick={() => openModal(r)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-bold uppercase transition-colors shadow-lg shadow-indigo-500/20">
                      Mark as Filed
                    </button>
                  )}
                  {r.status === 'FILED' && (
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-green-400 text-xs">{r.ack_number}</span>
                      <span className="text-gray-500 text-[10px]">{r.ack_portal}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filingModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
              <h3 className="text-lg font-bold text-white font-['Plus_Jakarta_Sans']">Confirm Filing</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Form</label>
                <div className="bg-black/30 border border-white/5 rounded-lg px-3 py-2 text-gray-300 text-sm">
                  {filingModal.request.form_name}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Your Name</label>
                <input 
                  type="text" 
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Rahul Sharma"
                  value={filingModal.caName}
                  onChange={e => setFilingModal({...filingModal, caName: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Portal</label>
                <select 
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={filingModal.portal}
                  onChange={e => setFilingModal({...filingModal, portal: e.target.value})}
                >
                  <option value="GST Portal">GST Portal</option>
                  <option value="MCA21">MCA21</option>
                  <option value="Income Tax Portal">Income Tax Portal</option>
                  <option value="TRACES">TRACES</option>
                  <option value="SEBI SCORES">SEBI SCORES</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button onClick={() => setFilingModal({ open: false, request: null })} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white">Cancel</button>
                <button onClick={handleConfirmFiled} className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg">Confirm Filed →</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── Main Dashboard ───────────────────────────────────────────────────────────

const Dashboard = () => {
  const location = useLocation();
  const { cin }  = useParams();
  const [data, setData]       = useState(location.state?.analysisResult || null);
  const [loading, setLoading] = useState(!data);
  const [error, setError]     = useState(null);
  const [activeTab, setTab]   = useState('overview');

  // Polled data
  const [alerts, setAlerts] = useState([]);
  const [requests, setRequests] = useState([]);

  const fetchDynamicData = () => {
    if (!cin) return;
    fetch(`${API}/alerts/${cin}`).then(r => r.ok && r.json()).then(setAlerts).catch(() => {});
    fetch(`${API}/filing-requests/${cin}`).then(r => r.ok && r.json()).then(setRequests).catch(() => {});
  };

  useEffect(() => {
    fetchDynamicData(); // Initial fetch
    const interval = setInterval(fetchDynamicData, 5000);
    return () => clearInterval(interval);
  }, [cin]);

  useEffect(() => {
    if (!data && cin) {
      analyzeCompany(cin)
        .then(setData)
        .catch(err => {
          console.error(err);
          setData({
            company_name: 'Example Corp Ltd', cin, city: 'Mumbai', sector: 'Manufacturing',
            risk_score: 78, risk_bucket: 'HIGH',
            top_factors: ['GST Filings Pending (3 months) × 1 (+18 pts)', 'Late Annual Return (MGT-7) × 1 (+15 pts)'],
            violations: [{ rule: 'Failure to file MGT-7', severity: 'HIGH', description: 'Annual return for FY 2023-24 not filed.', penalty_reference: 'Sec 92(4)', penalty_amount_inr: 50000 }],
            remediation_steps: '1. File pending GSTR-3B returns.\n2. File MGT-7 with MCA.',
            relevant_regulations: [],
            compliance_summary: { annual_returns_filed: false, overdue_filings: 2, filing_delay_days_avg: 45, violations_last_12m: 2, penalty_paid_inr: 65000, gst_pending_months: 3 },
          });
          setError('Backend unavailable. Showing demo data.');
        })
        .finally(() => setLoading(false));
    }
  }, [cin, data]);

  if (loading) return <LoadingSpinner message="Fetching analysis results…" />;
  if (!data)   return <div className="p-8 text-center text-red-400">Failed to load data.</div>;

  const unreadAlerts = alerts.filter(a => a.status === 'UNREAD').length;
  
  const SIDEBAR_NAV = [
    { id: 'overview',      label: 'Dashboard',    icon: LayoutDashboard },
    { id: 'risk',           label: 'Risk Analyser', icon: ShieldAlert },
    { id: 'tax',           label: 'Tax Intelligence', icon: CreditCard },
    { id: 'ca_audit',      label: 'CA Audit',      icon: FileText },
    { id: 'regulations',   label: 'Your Regulations', icon: ShieldCheck },
    { id: 'live_updates',  label: 'Live Updates', icon: Rss },
    { id: 'alerts',        label: 'Alert Inbox',   icon: Bell, badge: unreadAlerts },
    { id: 'filings',       label: 'Filing Reqs',   icon: Check },
  ];

  return (
    <div className="flex h-screen bg-[#0E121E] overflow-hidden text-white font-sans animate-fade-in w-full absolute top-0 left-0 z-50">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-[#0A0D14] flex flex-col justify-between py-8 px-6 border-r border-white/5 shrink-0">
        <div>
          <Link to="/" className="block mb-10 hover:opacity-80 transition-opacity">
            <h1 className="text-2xl font-bold text-white tracking-tight">ComplianceX</h1>
          </Link>
          <nav className="space-y-2">
            {SIDEBAR_NAV.map(nav => {
              const Icon = nav.icon;
              const isActive = activeTab === nav.id;
              return (
                <button 
                  key={nav.id} 
                  onClick={() => setTab(nav.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${isActive ? 'bg-indigo-600/10 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-indigo-400' : 'opacity-70'}`} />
                    <span className="font-semibold text-sm">{nav.label}</span>
                  </div>
                  {nav.badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{nav.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0A0F1E] w-full relative">
        
        {/* CONTENT SCROLL AREA */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>
          )}

          {activeTab === 'overview'     && <OverviewTab data={data} cin={cin} alerts={alerts} setTab={setTab} />}
          {activeTab === 'live_updates' && <LiveUpdatesTab cin={cin} companyName={data.company_name} sector={data.sector} />}
          {activeTab === 'risk'          && <RiskAnalyserTab cin={cin} />}
          {activeTab === 'tax'          && <TaxTab cin={cin} companyName={data.company_name} />}
          {activeTab === 'ca_audit'     && <CAAuditTab cin={cin} />}
          {activeTab === 'regulations'  && <RegulationsTab cin={cin} sector={data.sector} companyName={data.company_name} />}
          {activeTab === 'alerts'       && <AlertInboxTab alerts={alerts} setAlerts={setAlerts} refreshAlerts={fetchDynamicData} />}
          {activeTab === 'filings'      && <FilingRequestsTab requests={requests} refreshRequests={fetchDynamicData} />}
        </div>
      </main>

    </div>
  );
};

export default Dashboard;
