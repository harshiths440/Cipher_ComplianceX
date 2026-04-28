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
import { LayoutDashboard, CreditCard, TrendingUp, BarChart2, FileText, Settings, HelpCircle, Search, Bell, Plus, ArrowUpRight, MoreHorizontal, Check, AlertCircle, Activity, Star, Rss } from 'lucide-react';

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
    COMPLIANT: 'bg-green-500/15 text-green-400 border-green-500/30',
    VERIFIED:  'bg-green-500/15 text-green-400 border-green-500/30',
    AT_RISK:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    OUTDATED:  'bg-red-500/15 text-red-400 border-red-500/30',
    DEFAULTING:'bg-red-500/15 text-red-400 border-red-500/30',
    PAID:      'bg-green-500/15 text-green-400 border-green-500/30',
    MISSED:    'bg-red-500/15 text-red-400 border-red-500/30',
    UPCOMING:  'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${map[s] ?? 'text-gray-400'}`}>
      {s}
    </span>
  );
};

// ─── Tax Analysis Tab ────────────────────────────────────────────────────────

const TaxTab = ({ cin }) => {
  const [tax, setTax] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch(`${API}/tax/${cin}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setTax)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [cin]);

  if (loading) return <LoadingSpinner message="Running Tax Expert analysis…" />;
  if (err)     return <div className="p-6 text-red-400 text-sm">Failed: {err}</div>;
  if (!tax)    return null;

  const at = tax.advance_tax;
  const dotColor = { PAID:'bg-green-400', MISSED:'bg-red-500', UPCOMING:'bg-gray-500' };

  return (
    <div className="space-y-8 pb-16">

      {/* ── Header row ── */}
      <div className="bg-[var(--color-brand-card)] border border-white/10 rounded-2xl p-6 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Tax Liability</p>
          <p className="text-4xl font-black text-white">{fmt(tax.total_tax_liability)}</p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Effective Rate</span>
          <span className="text-lg font-bold text-indigo-400">{(tax.effective_rate * 100).toFixed(1)}%</span>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          {(tax.risk_flags || []).slice(0, 3).map((f, i) => (
            <span key={i} className="text-xs bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-full max-w-xs truncate" title={f}>
              ⚠ {f}
            </span>
          ))}
        </div>
      </div>

      {/* ── Advance Tax Timeline ── */}
      <div className="bg-[var(--color-brand-card)] border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-6">Advance Tax Timeline</h3>
        <div className="relative flex justify-between items-start">
          {/* connector line */}
          <div className="absolute top-3 left-0 right-0 h-px bg-white/10 z-0" />
          {at.installments.map((inst, i) => (
            <div key={i} className="relative z-10 flex flex-col items-center gap-2 w-1/4 px-2">
              <div className={`w-6 h-6 rounded-full border-2 border-[var(--color-brand-card)] ${dotColor[inst.status] ?? 'bg-gray-500'}`} />
              <span className="text-xs font-semibold text-gray-300">{inst.due}</span>
              <span className="text-xs text-gray-500">{inst.percent}%</span>
              <span className="text-xs font-bold text-white">{fmt(inst.amount)}</span>
              <StatusBadge s={inst.status} />
            </div>
          ))}
        </div>
        {at.shortfall > 0 && (
          <div className="mt-6 flex gap-6 p-4 bg-red-500/5 border border-red-500/20 rounded-xl">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Shortfall</p>
              <p className="text-red-400 font-bold">{fmt(at.shortfall)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Interest Liability (§234B/C)</p>
              <p className="text-red-400 font-bold">{fmt(at.interest_liability)}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── TDS Table ── */}
      <div className="bg-[var(--color-brand-card)] border border-white/10 rounded-2xl p-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">TDS Obligations</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-white/10">
              <th className="text-left pb-3 pr-4">Type</th>
              <th className="text-left pb-3 pr-4">Section</th>
              <th className="text-right pb-3 pr-4">Est. Volume</th>
              <th className="text-right pb-3 pr-4">Rate</th>
              <th className="text-right pb-3 pr-4">TDS Due</th>
              <th className="text-left pb-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(tax.tds_obligations || []).map((t, i) => (
              <tr key={i} className="hover:bg-white/3 transition-colors">
                <td className="py-3 pr-4 font-medium text-white">{t.type}</td>
                <td className="py-3 pr-4 text-indigo-400 font-mono text-xs">{t.section}</td>
                <td className="py-3 pr-4 text-right text-gray-300">{fmt(t.estimated_annual)}</td>
                <td className="py-3 pr-4 text-right text-gray-300">{(t.tds_rate * 100).toFixed(0)}%</td>
                <td className="py-3 pr-4 text-right font-semibold text-white">{fmt(t.tds_due)}</td>
                <td className="py-3"><StatusBadge s={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
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
          {(tax.savings_opportunities || []).map((s, i) => (
            <div key={i} className={`p-5 rounded-xl border transition-all ${s.applicable ? 'border-green-500/30 bg-green-500/5' : 'border-white/5 bg-white/2 opacity-40'}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono font-bold text-indigo-400">§ {s.section}</span>
                {s.applicable && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Applicable</span>}
              </div>
              <p className="text-xs text-gray-400 mb-3 leading-relaxed">{s.description}</p>
              {s.applicable && (
                <p className="text-lg font-black text-green-400">Save {fmt(s.estimated_saving)}</p>
              )}
            </div>
          ))}
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
                  {f.regulation_date && (
                    <div className="text-xs text-gray-600">
                      Regulation effective: <span className="text-gray-400">{f.regulation_date}</span>
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

// ─── Overview Tab (existing content) ────────────────────────────────────────

const OverviewTab = ({ data, cin, alerts }) => {
  const taxData = [
    { name: 'Jan', val: 20 }, { name: 'Feb', val: 35 }, { name: 'Mar', val: 50 },
    { name: 'Apr', val: 40 }, { name: 'May', val: 60 }, { name: 'Jun', val: 55 },
    { name: 'Jul', val: 70 }, { name: 'Aug', val: 45 }, { name: 'Sep', val: 65 },
    { name: 'Oct', val: 90 }, { name: 'Nov', val: 30 }, { name: 'Dec', val: 50 },
  ];

  const riskData = [
    { name: 'Critical', value: 40, color: '#8B5CF6' }, // purple
    { name: 'High', value: 30, color: '#60A5FA' }, // light blue
    { name: 'Medium', value: 30, color: '#374151' }, // gray
  ];

  const recentAlerts = (alerts || []).slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      
      {/* LEFT COLUMN */}
      <div className="lg:col-span-2 space-y-6">
        {/* Total Tax / Bar Chart */}
        <div className="bg-[#1C1F2E] rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 z-0" />
          <div className="relative z-10 flex justify-between items-start mb-6">
            <div>
              <p className="text-white font-semibold text-lg">Total Penalty Exposure</p>
              <h2 className="text-4xl font-black text-white mt-2">
                {data.compliance_summary?.penalty_paid_inr 
                  ? `₹${data.compliance_summary.penalty_paid_inr.toLocaleString()}` 
                  : '₹65,000.00'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">October's increase in risk <span className="text-indigo-400 font-bold">+{data.risk_score || 0} pts</span></p>
            </div>
            <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors">
              Monthly <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          
          <div className="h-48 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taxData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} />
                <Bar dataKey="val" radius={[6, 6, 6, 6]}>
                  {taxData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.name === 'Oct' ? '#8B5CF6' : '#4C51bf'} opacity={entry.name === 'Oct' ? 1 : 0.4} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Breakdown / Donut */}
        <div className="bg-[#1C1F2E] rounded-3xl p-6 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
           <div className="w-full md:w-1/2 flex justify-center items-center relative">
              <div className="h-48 w-48 relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={riskData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                      {riskData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <Activity className="w-8 h-8 text-white opacity-80" />
                </div>
              </div>
           </div>
           <div className="w-full md:w-1/2">
             <h3 className="text-white font-semibold text-lg mb-2">October's Risk Score</h3>
             <h2 className="text-4xl font-black text-white mb-6">{data.risk_score || 0} / 100</h2>
             <div className="space-y-3">
               {riskData.map((item, i) => (
                 <div key={i} className="flex items-center gap-3">
                   <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
                   <span className="text-gray-300 text-sm font-medium">{item.name} Violations</span>
                 </div>
               ))}
             </div>
           </div>
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
            <button className="w-14 h-14 rounded-full border border-dashed border-gray-500 flex items-center justify-center text-gray-400 hover:text-white hover:border-white transition-colors group">
              <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {['GSTR-3B', 'MGT-7', 'AOC-4', 'KYC'].map((action, i) => (
                <button key={i} className="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 hover:bg-indigo-600 hover:text-white transition-colors shrink-0 shadow-lg border border-white/5">
                  {action.substring(0, 3)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Alerts */}
        <div>
          <h3 className="text-white font-semibold text-lg mb-4">Recent Alerts</h3>
          <div className="space-y-4">
            {recentAlerts.length > 0 ? recentAlerts.map(a => (
              <div key={a.id} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-xl transition-colors">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${a.urgency === 'EMERGENCY' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-white text-sm font-semibold truncate">{a.regulation_title}</h4>
                  <p className="text-gray-400 text-xs truncate">{a.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-gray-500 block">{new Date(a.sent_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  {a.status === 'UNREAD' && <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block mt-1" />}
                </div>
              </div>
            )) : (
              <div className="text-gray-500 text-sm p-4 bg-white/5 rounded-xl border border-white/5">No recent alerts.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Live Updates Tab (company-specific) ────────────────────────────────────

const LIVE_CATEGORY_STYLES = {
  GST:        { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  Securities: { bg: 'rgba(99,102,241,0.12)', text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  Tax:        { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', border: 'rgba(234,179,8,0.3)' },
  Corporate:  { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  General:    { bg: 'rgba(148,163,184,0.12)',text: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
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
        const items = (d.items || []).map(item => ({
          ...item,
          impact_label: item.impact_label || item.severity || 'LOW',
        }));
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

      {/* ── Impact filter pills only ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-600 uppercase tracking-wider font-bold mr-1">Impact:</span>
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
              {lvl === 'All' ? 'All Impact' : lvl}
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

  // ── Card ──
  const RegCard = ({ item, idx }) => {
    const cs  = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.General;
    const isViolation = item.relevance_score >= 3;
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.05, duration: 0.28, ease: 'easeOut' }}
        onClick={() => setModal(item)}
        className={`bg-[#111827] rounded-xl p-5 flex flex-col gap-3 cursor-pointer transition-all
          ${ isViolation
              ? 'border border-red-500/25 hover:border-red-500/50 hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]'
              : 'border border-white/8 hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.1)]'
          }`}
      >
        {/* Top row: source icon + name + date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: cs.text }}>
            <span>{item.source_icon}</span>
            <span>{item.source}</span>
          </div>
          <span className="text-[11px] text-gray-500">{item.date}</span>
        </div>

        {/* Category badge */}
        <span
          className="self-start text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
          style={{ background: cs.bg, color: cs.text, borderColor: cs.border }}
        >
          {item.category}
        </span>

        {/* Title */}
        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">{item.title}</h3>

        {/* Why this affects you chip */}
        {item.relevance_reason && (
          <div className="mt-auto">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
              💡 {item.relevance_reason}
            </span>
          </div>
        )}

        {/* Bottom: violation badge OR standard affects-you badge */}
        <div className="flex items-center justify-between pt-1">
          {isViolation
            ? <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">⚠️ Active violation related</span>
            : <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/20">✓ Affects You</span>
          }
          {item.severity === 'HIGH' && (
            <span className="text-[10px] text-red-400 font-semibold">HIGH SEVERITY</span>
          )}
        </div>
      </motion.div>
    );
  };

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
      <p className="text-sm font-medium">Fetching your regulations…</p>
    </div>
  );

  return (
    <div className="space-y-6 pb-16">

      {/* ── Tab header ── */}
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          📡 Your Regulations
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Showing regulations that affect{' '}
          <span className="text-gray-200 font-medium">{meta?.company_name || companyName}</span>
          {' · '}
          <span className="text-indigo-400 font-semibold">{meta?.sector || sector}</span>
        </p>
      </div>

      {/* ── Debug panel ── */}
      {meta?.debug && (
        <div className="bg-[#0d1117] border border-white/5 rounded-xl px-4 py-3 font-mono text-[11px] text-gray-500 space-y-1">
          <p><span className="text-gray-600">company_sector:</span> <span className="text-yellow-400">"{meta.debug.company_sector}"</span></p>
          <p><span className="text-gray-600">matched_categories:</span> <span className="text-green-400">[{meta.debug.matched_categories.map(c => `"${c}"`).join(', ')}]</span></p>
          <p><span className="text-gray-600">total_before_filter:</span> <span className="text-blue-400">{meta.debug.total_before_filter}</span>
             <span className="text-gray-600 ml-4">total_after_filter:</span> <span className="text-blue-400">{meta.debug.total_after_filter}</span></p>
        </div>
      )}

      {/* ── Empty state ── */}
      {items.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 border border-green-500/20 rounded-2xl bg-green-500/5">
          <span className="text-4xl">✅</span>
          <p className="text-green-400 font-semibold text-center">
            No regulations currently affect your company's sector
          </p>
          {meta?.debug && (
            <p className="text-xs text-gray-600">
              Sector "{meta.debug.company_sector}" matched [{meta.debug.matched_categories.join(', ')}] — 0 of {meta.debug.total_before_filter} news items scored &gt; 0
            </p>
          )}
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
    
    // Optimistic update
    setAlerts(alerts.map(a => a.id === alertId ? { ...a, status: 'ACKNOWLEDGED', ca_response: responseText, acknowledged_at: new Date().toISOString() } : a));
    setReplyModal({ open: false, alertId: null });
    alert("✅ Acknowledged");

    try {
      await fetch(`${API}/alerts/${alertId}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ca_response: responseText })
      });
      refreshAlerts();
    } catch (e) {
      console.error(e);
      refreshAlerts(); // Revert on error
    }
  };

  const handleRead = async (id) => {
    // Optimistic update
    setAlerts(alerts.map(a => a.id === id ? { ...a, status: 'READ' } : a));
    try {
      await fetch(`${API}/alerts/${id}/read`, { method: 'PUT' });
      refreshAlerts();
    } catch (e) { 
      console.error(e); 
      refreshAlerts(); // Revert on error
    }
  };

  if (!alerts.length) return (
    <div className="p-16 text-center text-green-400 border border-green-500/20 rounded-xl bg-green-500/5 flex flex-col items-center gap-4">
      <span className="text-4xl">✅</span>
      <p className="font-semibold">No alerts from executives — you're all clear</p>
    </div>
  );

  return (
    <div className="space-y-4 pb-16">
      {alerts.map(a => {
        const isEmergency = a.urgency === 'EMERGENCY';
        const isHigh = a.urgency === 'HIGH';
        
        const badgeClass = isEmergency ? 'bg-red-500 text-white' : isHigh ? 'bg-orange-500 text-white' : 'bg-yellow-500 text-black';
        const borderClass = isEmergency ? 'border-red-500 animate-[pulse_2s_ease-in-out_infinite]' : isHigh ? 'border-orange-500' : 'border-yellow-500/50';
        const bgClass = a.status === 'UNREAD' ? 'bg-white/10 border-l-4 border-l-indigo-500' : 'bg-[var(--color-brand-card)]';
        
        return (
          <div key={a.id} className={`p-5 rounded-xl border ${borderClass} ${bgClass} transition-colors`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${badgeClass}`}>
                  {isEmergency ? '🔴 ' : ''}{a.urgency}
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-sm text-gray-400">{new Date(a.sent_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                <StatusBadge s={a.status} />
              </div>
            </div>
            
            <p className="text-sm text-gray-400 mb-1">Re: <span className="font-bold text-white">{a.regulation_title}</span></p>
            <p className="text-gray-300 text-sm mb-4 bg-black/30 p-4 rounded-xl border-l-4 border-indigo-500">"{a.message}"</p>
            <p className="text-xs text-gray-500 mb-6 font-semibold uppercase tracking-wider">Sent by: Executive</p>
            
            {a.status !== 'ACKNOWLEDGED' ? (
              <div className="flex gap-3 mt-4 border-t border-white/10 pt-4">
                {a.status === 'UNREAD' && (
                  <button onClick={() => handleRead(a.id)} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-medium transition-colors">
                    Mark as Read
                  </button>
                )}
                <button onClick={() => setReplyModal({ open: true, alertId: a.id })} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
                  Acknowledge + Reply →
                </button>
              </div>
            ) : (
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl">
                  <p className="text-xs text-green-400 mb-2 font-bold uppercase tracking-wider">Your response ({new Date(a.acknowledged_at).toLocaleString()}):</p>
                  <p className="text-sm text-gray-200">{a.ca_response}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {replyModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">✅ Acknowledge Alert</h3>
              <button onClick={() => setReplyModal({ open: false, alertId: null })} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-4">Re: <span className="text-white font-semibold">{alerts.find(a => a.id === replyModal.alertId)?.regulation_title}</span></p>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Your response:</label>
            <textarea 
              className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[120px] mb-4"
              placeholder='e.g. "Filing in progress, will complete by Friday"'
              value={replyText[replyModal.alertId] || ''}
              onChange={e => setReplyText({...replyText, [replyModal.alertId]: e.target.value})}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setReplyModal({ open: false, alertId: null })} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
              <button onClick={handleAck} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">Send Acknowledgement →</button>
            </div>
          </div>
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
            <div className="p-5 border-b border-white/10 bg-white/5">
              <h3 className="text-lg font-bold flex items-center gap-2">✅ Confirm Filing</h3>
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
    { id: 'live_updates',  label: 'Live Updates',  icon: Rss },
    { id: 'tax',           label: 'Tax Analysis',  icon: BarChart2 },
    { id: 'ca_audit',      label: 'CA Audit',      icon: FileText },
    { id: 'regulations',   label: '📡 Your Regulations', icon: Settings },
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

          {activeTab === 'overview'     && <OverviewTab data={data} cin={cin} alerts={alerts} />}
          {activeTab === 'live_updates' && <LiveUpdatesTab cin={cin} companyName={data.company_name} sector={data.sector} />}
          {activeTab === 'tax'          && <TaxTab cin={cin} />}
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
