import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, IndianRupee, Clock, Send, Plus, X, Activity, FileSignature, Bell, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ActivityFeed from '../components/ActivityFeed';

const API = 'http://localhost:8000';

const fmt = (n) => `₹${n?.toLocaleString('en-IN') ?? 0}`;

const StatusBadge = ({ s }) => {
  if (s === 'PENDING') return <span className="bg-gray-500/10 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">Pending</span>;
  if (s === 'IN_PROGRESS') return <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase animate-pulse">In Progress</span>;
  if (s === 'FILED') return <span className="bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase flex items-center gap-1"><span className="text-green-500">✓</span> Filed</span>;
  if (s === 'VERIFIED') return <span className="bg-green-500/10 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">Verified</span>;
  if (s === 'AT_RISK') return <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">At Risk</span>;
  if (s === 'OUTDATED') return <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">Outdated</span>;
  return <span className="bg-gray-500/10 text-gray-400 border border-gray-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase">{s}</span>;
};

const ExecutiveDashboard = () => {
  const { cin: cinParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Priority: URL param → sessionStorage → undefined
  const cin = cinParam || sessionStorage.getItem('executiveCin') || undefined;

  const [data, setData] = useState(location.state?.executiveData);

  // Modals state
  const [alertModal, setAlertModal] = useState({ open: false, item: null, urgency: 'HIGH', message: '' });
  const [filingModal, setFilingModal] = useState({ open: false, form: 'GSTR-3B', reg: '', deadline: '' });
  const [newsModal, setNewsModal] = useState(null);

  // Live filings list
  const [filings, setFilings] = useState(data?.filing_requests || []);
  const [alertsSent, setAlertsSent] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([
    "Am I personally liable for any of these violations?",
    "What's my highest penalty risk right now?",
    "Which violation should I fix first?",
    "How can I reduce my tax liability legally?",
  ]);
  const newsDetailCache = useRef({});
  const prevAlertsRef = useRef([]);        // for detecting new acknowledgements
  const [toast, setToast] = useState(null); // { message, id }

  // ALL HOOKS MUST BE ABOVE ANY EARLY RETURNS
  useEffect(() => {
    if (!data && cin) {
      fetch(`${API}/executive/${cin}`)
        .then(r => r.json())
        .then(res => {
          setData(res);
          setFilings(res.filing_requests || []);
          setAlertsSent(res.alerts_sent || []);
          sessionStorage.setItem('executiveCin', cin);
        })
        .catch(console.error);
    }
  }, [cin, data]);

  // Fix 1: if signature_required is empty after data loads, fetch /analyze
  useEffect(() => {
    if (!data || !cin) return;
    if ((data.signature_required || []).length === 0) {
      fetch(`${API}/analyze/${cin}`, { method: 'POST' })
        .then(r => r.ok ? r.json() : null)
        .then(res => {
          if (!res) return;
          const fallbackSigs = (res.violations || []).filter(v =>
            v.severity === 'HIGH' || v.severity === 'CRITICAL'
          ).map(v => ({
            item: v.description || v.rule,
            reason: v.description || 'This violation requires executive action.',
            deadline: 'Immediate',
            penalty: v.penalty || 'See violation details',
            law_ref: v.law_reference || 'N/A',
          }));
          if (fallbackSigs.length > 0) {
            setData(prev => ({ ...prev, signature_required: fallbackSigs }));
          }
        })
        .catch(console.error);
    }
  }, [data, cin]);

  // Fix 5: build dynamic questions from live data
  useEffect(() => {
    if (!data) return;
    const qs = [];
    const advanceTax = data.what_if?.scenarios || [];
    const missedInstallments = advanceTax.filter(s => s.urgency === 'HIGH').length;
    const outdated = data.ca_summary?.outdated_count || 0;
    const exposure = data.total_exposure || 0;
    const savings = advanceTax.length;
    if (missedInstallments > 0) qs.push('How much interest am I accruing on missed advance tax?');
    if (outdated > 0) qs.push('Which CA filings need immediate attention?');
    if (exposure > 0) qs.push("What's my highest penalty risk right now?");
    if (savings > 0) qs.push('How can I reduce my tax liability legally?');
    qs.push('Am I personally liable for any of these violations?');
    setSuggestedQuestions([...new Set(qs)].slice(0, 5));
  }, [data]);

  // Fix 1 + Fix 3: poll alerts every 5 s; fire toast on new acknowledgements
  useEffect(() => {
    if (!cin) return;
    const fetchAlerts = () => {
      fetch(`${API}/alerts/${cin}`)
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          const arr = Array.isArray(list) ? list : [];
          // Fix 3: detect newly acknowledged
          const prev = prevAlertsRef.current;
          arr.forEach(a => {
            if (a.status === 'ACKNOWLEDGED') {
              const wasAcknowledged = prev.some(p => p.id === a.id && p.status === 'ACKNOWLEDGED');
              if (!wasAcknowledged) {
                const toastId = Date.now();
                setToast({ message: `CA responded to your alert — ${a.regulation_title}`, id: toastId });
                setTimeout(() => setToast(t => t?.id === toastId ? null : t), 4000);
              }
            }
          });
          prevAlertsRef.current = arr;
          setAlertsSent(arr);
        })
        .catch(console.error);
    };
    fetchAlerts(); // immediate first fetch
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, [cin]);

  const refreshFilings = async () => {
    try {
      const res = await fetch(`${API}/filing-requests/${cin}`);
      const list = await res.json();
      setFilings(list);
    } catch (e) { console.error(e); }
  };

  // Guard: no CIN available at all
  if (!cin) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-white flex-col gap-4">
        <p className="text-gray-400">No company selected.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium"
        >
          Select a Company
        </button>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-white">Loading Executive View...</div>;

  const { company, total_exposure, signature_required, regulatory_impact, ca_summary } = data;

  // Handlers
  const openAlertModal = (sig) => {
    setAlertModal({
      open: true,
      item: sig,
      urgency: 'HIGH',
      message: `Please confirm ${sig.item} has been actioned per ${sig.law_ref}. Deadline is ${sig.deadline}. Penalty: ${sig.penalty}`
    });
  };

  const sendAlert = async () => {
    try {
      await fetch(`${API}/alerts/${cin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.name,
          regulation_title: alertModal.item.item,
          regulation_category: 'Compliance Action',
          message: alertModal.message,
          urgency: alertModal.urgency
        })
      });
      alert('Alert sent to CA');
      setAlertModal({ open: false, item: null, urgency: 'HIGH', message: '' });
    } catch (e) {
      alert('Failed to send alert');
    }
  };

  const sendFilingRequest = async () => {
    try {
      await fetch(`${API}/filing-requests/${cin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company.name,
          form_name: filingModal.form,
          regulation_ref: filingModal.reg,
          deadline: filingModal.deadline
        })
      });
      setFilingModal({ open: false, form: 'GSTR-3B', reg: '', deadline: '' });
      refreshFilings();
    } catch (e) {
      alert('Failed to send filing request');
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
        
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold">{company.name}</h1>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
                  Executive View
                </span>
              </div>
              <div className="text-gray-400 text-sm flex gap-2 items-center">
                <span className="font-mono">{cin}</span>
                <span>•</span>
                <span className="bg-white/10 px-2 py-0.5 rounded text-xs">{company.sector}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ROW 1: 3 Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-[#111827] border border-red-500/20 rounded-2xl p-6 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-red-500/10 text-red-400 rounded-lg"><IndianRupee className="w-5 h-5" /></div>
              <h3 className="text-sm text-gray-400 font-medium uppercase tracking-wider">Total ₹ Exposure</h3>
            </div>
            <p className="text-4xl font-black text-red-500">{fmt(total_exposure)}</p>
          </div>
          
          <div className="bg-[#111827] border border-yellow-500/20 rounded-2xl p-6 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded-lg"><AlertTriangle className="w-5 h-5" /></div>
              <h3 className="text-sm text-gray-400 font-medium uppercase tracking-wider">Items Needing Signature</h3>
            </div>
            <p className="text-4xl font-black text-yellow-500">{signature_required.length}</p>
          </div>

          {/* Fix 4: Live Alerts Sent stat card */}
          {(() => {
            const allAck = alertsSent.length > 0 && alertsSent.every(a => a.status === 'ACKNOWLEDGED');
            return (
              <div className={`bg-[#111827] border rounded-2xl p-6 relative overflow-hidden group transition-colors ${
                allAck ? 'border-emerald-500/30' : 'border-white/10'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${allAck ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                    {allAck ? <CheckCircle className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                  </div>
                  <h3 className="text-sm text-gray-400 font-medium uppercase tracking-wider">Alerts Sent to CA</h3>
                </div>
                <div className="flex items-end gap-2">
                  <p className={`text-4xl font-black ${allAck ? 'text-emerald-400' : 'text-indigo-400'}`}>{alertsSent.length}</p>
                  {allAck && <span className="text-emerald-400 text-sm font-semibold mb-1 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> All Acknowledged</span>}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ROW 2: Signatures Panel */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2"><FileSignature className="w-6 h-6 text-yellow-400" /> What Needs Your Signature</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {signature_required.length === 0 ? (
              <p className="text-gray-400 col-span-2">No pending items.</p>
            ) : signature_required.map((sig, i) => {
              const isUrgent = sig.deadline.toLowerCase().includes('immediate');
              return (
                <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-white pr-4">{sig.item}</h3>
                      {isUrgent && <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold animate-pulse">URGENT</span>}
                    </div>
                    <p className="text-sm text-gray-400 mb-4">{sig.reason}</p>
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Deadline:</span>
                        <span className={isUrgent ? 'text-red-400 font-medium' : 'text-white'}>{sig.deadline}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Penalty Risk:</span>
                        <span className="text-red-400">{sig.penalty}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Law Ref:</span>
                        <span className="text-indigo-400 font-mono text-xs">{sig.law_ref}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openAlertModal(sig)} className="w-full bg-white/5 hover:bg-indigo-600 border border-white/10 hover:border-indigo-500 text-white py-2 rounded-lg text-sm font-medium transition-all flex justify-center items-center gap-2 group">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 group-hover:text-white" /> Alert CA
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ROW 3: CA Filing Tracker */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-indigo-400" /> CA Filing Tracker</h2>
            <button onClick={() => setFilingModal({ ...filingModal, open: true })} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Request Filing
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/20 text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Form</th>
                  <th className="px-6 py-4">Deadline</th>
                  <th className="px-6 py-4">Requested</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Ack Number</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filings.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No filing requests found.</td></tr>
                ) : filings.map(f => (
                  <tr key={f.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 font-bold text-white">{f.form_name}</td>
                    <td className="px-6 py-4">{f.deadline}</td>
                    <td className="px-6 py-4 text-gray-400">{new Date(f.requested_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4"><StatusBadge s={f.status} /></td>
                    <td className="px-6 py-4">
                      {f.status === 'FILED' ? (
                        <div className="flex flex-col">
                          <span className="font-mono text-green-400">{f.ack_number}</span>
                          <span className="text-xs text-gray-500">{f.ack_portal}</span>
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ROW 4: Regulatory Impact Feed */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold">Regulatory Impact Feed</h2>
            <p className="text-sm text-gray-400 mt-1">Filtered for {company.sector}</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {regulatory_impact.map((news, i) => (
              <div key={i} onClick={() => setNewsModal(news)} className="bg-black/20 border border-white/5 rounded-xl p-5 hover:border-indigo-500/50 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold border border-red-500/30">Affects You</span>
                  <span className="text-xs text-gray-500">{news.date}</span>
                </div>
                <h3 className="font-bold text-white mb-2 line-clamp-2 group-hover:text-indigo-300 transition-colors">{news.title}</h3>
                {/* Fix 4: Why this affects you chip */}
                {news.relevance_reason && (
                  <span className="inline-block bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2">
                    You are {company.sector} — {news.relevance_reason}
                  </span>
                )}
                <p className="text-sm text-gray-400 mb-4 line-clamp-3">{news.what_changed}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Hits: <span className="text-gray-300">{news.who_it_hits}</span></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ROW 5: CA Audit Summary */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden mb-16">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold">CA Audit Summary</h2>
          </div>
          <div className="p-6">
            {/* Banner */}
            {ca_summary.outdated_count === 0 && ca_summary.at_risk_count === 0 ? (
              <div className="flex items-center gap-3 p-4 mb-6 bg-green-500/10 border border-green-500/30 rounded-xl">
                <span className="text-2xl">✅</span><p className="text-green-400 font-semibold">All recent filings match active regulations.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-yellow-400 font-semibold">Potential compliance drift detected in past CA filings.</p>
                  <p className="text-yellow-400/70 text-xs mt-1">{ca_summary.outdated_count} outdated, {ca_summary.at_risk_count} at risk.</p>
                </div>
              </div>
            )}

            {/* Table — Fix 2: verified_filings with Alert CA on OUTDATED rows */}
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/20 text-gray-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Form</th>
                    <th className="px-4 py-3">Filed Date</th>
                    <th className="px-4 py-3">Filed By</th>
                    <th className="px-4 py-3">Audit Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(ca_summary?.verified_filings || []).length === 0 ? (
                    <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">No verified filings found.</td></tr>
                  ) : (ca_summary?.verified_filings || []).slice(0, 5).map((f, i) => (
                    <tr key={i} className={`hover:bg-white/5 ${f.status === 'OUTDATED' ? 'bg-red-500/5' : ''}`}>
                      <td className="px-4 py-3 font-semibold text-white">{f.form}</td>
                      <td className="px-4 py-3 text-gray-400">{f.filed_date}</td>
                      <td className="px-4 py-3 text-gray-400">{f.filed_by}</td>
                      <td className="px-4 py-3"><StatusBadge s={f.status} /></td>
                      <td className="px-4 py-3">
                        {f.status === 'OUTDATED' ? (
                          <button
                            onClick={() => openAlertModal({ item: `Re-file ${f.form}`, reason: `${f.form} is outdated against current regulations.`, deadline: 'Immediate', penalty: 'Regulatory non-compliance', law_ref: 'N/A' })}
                            className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-lg font-semibold transition-colors"
                          >
                            Alert CA
                          </button>
                        ) : <span className="text-gray-600 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ROW 6: Activity Feed */}
        <div className="mb-8">
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-indigo-500 rounded" />
            System Activity
          </h2>
          <ActivityFeed cin={cin} companyName={company.name} />
        </div>

        {/* ROW 7: Alerts Sent to CA */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden mb-16">
          <div className="p-6 border-b border-white/10 flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold">&#128232; Alerts Sent to CA</h2>
            <span className="ml-auto text-xs text-gray-500">Live &#8226; updates every 5s</span>
          </div>
          {alertsSent.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="font-medium">No alerts sent yet.</p>
              <p className="text-sm mt-1">Use the "Alert CA" buttons above to dispatch compliance actions.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {alertsSent.map((a, i) => {
                const isAck = a.status === 'ACKNOWLEDGED';
                const isRead = a.status === 'READ';
                return (
                  <div key={a.id ?? i} className={`px-6 py-4 transition-colors ${
                    isAck ? 'border-l-2 border-emerald-500 bg-emerald-500/3' : ''
                  }`}>
                    {/* Compact header row */}
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest flex-shrink-0 ${
                        a.urgency === 'EMERGENCY' ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : a.urgency === 'HIGH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      }`}>{a.urgency}</span>
                      <p className="font-semibold text-white text-sm flex-1 truncate">{a.regulation_title}</p>
                      <div className="text-right flex-shrink-0 flex items-center gap-2">
                        <span className="text-xs text-gray-500">{a.sent_at ? new Date(a.sent_at).toLocaleDateString('en-IN') : '—'}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          isAck ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : isRead ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {isAck ? '✅ Acknowledged' : isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                    </div>
                    {/* Fix 2: Expanded CA response on ACKNOWLEDGED */}
                    {isAck && a.ca_response && (
                      <div className="mt-3 ml-0 bg-indigo-950/60 border border-indigo-500/20 rounded-xl p-4">
                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mb-2">CA Response</p>
                        <p className="text-sm text-gray-200 leading-relaxed italic">&ldquo;{a.ca_response}&rdquo;</p>
                        {a.acknowledged_at && (
                          <p className="text-[11px] text-gray-500 mt-2">
                            &mdash; Replied at {new Date(a.acknowledged_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Fix 3: Toast notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 40, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 40, x: 20 }}
            className="fixed bottom-6 right-6 z-[100] bg-[#0d1f18] border border-emerald-500/40 text-emerald-300 px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-sm"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-sm font-semibold leading-snug">{toast.message}</p>
            <button onClick={() => setToast(null)} className="ml-2 text-emerald-500/60 hover:text-emerald-400">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}

      {/* Alert Modal */}
      <AnimatePresence>
        {alertModal.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold flex items-center gap-2"><AlertTriangle className="text-yellow-500 w-5 h-5" /> Send Alert to CA</h3>
                <button onClick={() => setAlertModal({ ...alertModal, open: false })} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Regarding</p>
                  <p className="font-semibold text-white">{alertModal.item?.item}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-400 mb-2">Urgency</p>
                  <div className="flex gap-2">
                    {['LOW', 'HIGH', 'EMERGENCY'].map(u => (
                      <button 
                        key={u} 
                        onClick={() => setAlertModal({ ...alertModal, urgency: u })}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                          alertModal.urgency === u 
                            ? u === 'EMERGENCY' ? 'bg-red-500 text-white border-red-500' 
                            : u === 'HIGH' ? 'bg-orange-500 text-white border-orange-500' 
                            : 'bg-yellow-500 text-black border-yellow-500'
                            : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'
                        }`}
                      >
                        {u === 'LOW' ? '🟡' : u === 'HIGH' ? '🟠' : '🔴'} {u}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-400 mb-2">Message</p>
                  <textarea 
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500 min-h-[120px]"
                    value={alertModal.message}
                    onChange={(e) => setAlertModal({ ...alertModal, message: e.target.value })}
                  />
                </div>
                
                <div className="flex gap-3 justify-end pt-2">
                  <button onClick={() => setAlertModal({ ...alertModal, open: false })} className="px-5 py-2.5 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5">Cancel</button>
                  <button onClick={sendAlert} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center gap-2">
                    Send Alert <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filing Request Modal */}
      <AnimatePresence>
        {filingModal.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold flex items-center gap-2">📋 Request CA Filing</h3>
                <button onClick={() => setFilingModal({ ...filingModal, open: false })} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Form</label>
                  <select 
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none"
                    value={filingModal.form}
                    onChange={e => setFilingModal({ ...filingModal, form: e.target.value })}
                  >
                    {['GSTR-3B', 'GSTR-1', 'MGT-7', 'AOC-4', 'DIR-3 KYC', 'ITR-6', 'Form 15CA'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Regulation (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. GST Notification 14/2026"
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none"
                    value={filingModal.reg}
                    onChange={e => setFilingModal({ ...filingModal, reg: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Deadline</label>
                  <input 
                    type="date" 
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-indigo-500 focus:outline-none"
                    value={filingModal.deadline}
                    onChange={e => setFilingModal({ ...filingModal, deadline: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button onClick={() => setFilingModal({ ...filingModal, open: false })} className="px-5 py-2.5 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5">Cancel</button>
                  <button onClick={sendFilingRequest} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium flex items-center gap-2">
                    Send Request <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* News Detail Modal */}
      <AnimatePresence>
        {newsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setNewsModal(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-white/10 flex justify-between items-start bg-white/5">
                <div>
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold border border-red-500/30 uppercase tracking-wider mb-2 inline-block">Regulatory Impact Alert</span>
                  <h3 className="text-2xl font-bold text-white leading-tight">{newsModal.title}</h3>
                </div>
                <button onClick={() => setNewsModal(null)} className="text-gray-400 hover:text-white p-1 bg-black/20 rounded-lg"><X className="w-6 h-6" /></button>
              </div>
              <div className="p-6 overflow-y-auto space-y-6">
                <div>
                  <h4 className="text-indigo-400 text-sm font-bold uppercase tracking-wider mb-2">What Changed</h4>
                  <p className="text-gray-300 leading-relaxed bg-white/5 p-4 rounded-xl border border-white/5">{newsModal.what_changed}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <h4 className="text-gray-500 text-xs font-bold uppercase mb-1">Who it hits</h4>
                    <p className="text-white font-medium">{newsModal.who_it_hits}</p>
                  </div>
                  <div className="bg-red-500/5 p-4 rounded-xl border border-red-500/20">
                    <h4 className="text-red-400 text-xs font-bold uppercase mb-1">Penalty</h4>
                    <p className="text-red-300 font-medium">{newsModal.penalty}</p>
                  </div>
                </div>
                <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl">
                  <h4 className="text-orange-400 text-xs font-bold uppercase mb-2">Action Required</h4>
                  <ul className="list-disc pl-5 text-gray-300 space-y-1">
                    {newsModal.what_to_do?.map((act, i) => <li key={i}>{act}</li>)}
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default ExecutiveDashboard;
