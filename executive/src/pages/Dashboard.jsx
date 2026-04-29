import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, IndianRupee, Clock, Send, Plus, X, Activity, FileSignature, LogOut, Bell, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API = 'http://localhost:8000';

const fmt = (n) => `₹${n?.toLocaleString('en-IN') ?? 0}`;

const FORM_CONTEXT = {
  'GSTR-3B': {
    urgency: 'MEDIUM',
    section: 'S.39 CGST Act',
    description: 'Monthly summary return — outward supplies, ITC claimed & net tax payable',
    now: 'GST summary return pending — late fee ₹50/day accruing',
    if_done: 'Avoid penalties, maintain ITC eligibility, stay GST-compliant',
  },
  'GSTR-1': {
    urgency: 'MEDIUM',
    section: 'S.37 CGST Act',
    description: 'Details of all outward supplies made during the month',
    now: 'Outward supply details not filed — recipients cannot claim ITC',
    if_done: 'Recipients unlock ITC claims; avoid ₹50/day late fee',
  },
  'MGT-7': {
    urgency: 'HIGH',
    section: 'S.92 Companies Act',
    description: 'Annual Return to be filed with MCA within 60 days of AGM',
    now: 'Annual Return overdue — ₹100/day penalty accumulating',
    if_done: 'Restore compliance standing and avoid director disqualification',
  },
  'AOC-4': {
    urgency: 'HIGH',
    section: 'S.137 Companies Act',
    description: 'Financial statements to be filed within 30 days of AGM',
    now: 'Financial statements not filed — MCA penalties applicable',
    if_done: 'Avoid ₹100/day fine; maintain good standing with ROC',
  },
  'DIR-3 KYC': {
    urgency: 'HIGH',
    section: 'Rule 12A Companies Rules',
    description: 'Annual KYC verification for all active DIN holders',
    now: 'DIN deactivated until KYC filed — director cannot sign documents',
    if_done: 'Reactivate DIN; resume signing authority immediately',
  },
  'ITR-6': {
    urgency: 'HIGH',
    section: 'S.139 Income Tax Act',
    description: 'Corporate income tax return for companies other than charitable',
    now: 'Tax return not filed — interest u/s 234A accruing at 1%/month',
    if_done: 'Stop interest accrual; avoid scrutiny and prosecution risk',
  },
  'FORM 15CA': {
    urgency: 'LOW',
    section: 'S.195 Income Tax Act',
    description: 'Declaration for foreign remittance payments above threshold',
    now: 'Foreign payment pending compliance declaration',
    if_done: 'Authorise remittance legally; avoid TDS default',
  },
  '26Q, 24Q': {
    urgency: 'HIGH',
    section: 'S.200 Income Tax Act',
    description: 'Quarterly TDS returns for non-salary (26Q) and salary (24Q) payments',
    now: 'TDS returns overdue — interest @ 1.5%/month on deposited amounts',
    if_done: 'Stop interest clock; enable deductees to claim TDS credit',
  },
};

const getFormContext = (formName) =>
  FORM_CONTEXT[formName] ||
  Object.entries(FORM_CONTEXT).find(([k]) =>
    formName?.toLowerCase().includes(k.toLowerCase())
  )?.[1] || {
    urgency: 'MEDIUM',
    section: null,
    description: 'Compliance filing request dispatched to CA.',
    now: 'Filing request is pending CA action',
    if_done: 'Filing completed and acknowledged',
  };

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
  let sessionData = {};
  try { sessionData = JSON.parse(sessionStorage.getItem('exec_session') || '{}'); } catch(e) {}
  const cin = cinParam || sessionData.cin || undefined;

  const [data, setData] = useState(location.state?.executiveData);

  // Modals state
  const [alertModal, setAlertModal] = useState({ open: false, item: null, urgency: 'HIGH', message: '' });
  const [filingModal, setFilingModal] = useState({ open: false, form: 'GSTR-3B', reg: '', deadline: '' });
  const [newsModal, setNewsModal] = useState(null);

  // Live filings list
  const [filings, setFilings] = useState(data?.filing_requests || []);
  const prevFilingsRef = useRef(data?.filing_requests || []);
  const [flashedRows, setFlashedRows] = useState({});   // id → true while green flash active
  const [whatIf, setWhatIf] = useState(null);
  const [sentScenarios, setSentScenarios] = useState({});

  // Live "Last CA Filing" stat (updated when a FILED event is detected)
  const [liveLastFiling, setLiveLastFiling] = useState(null);

  // Chat AI state — must be here unconditionally (React Rules of Hooks)
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // CA Responses — poll every 5s
  const [alertsSent, setAlertsSent] = useState([]);
  const prevAlertsRef = useRef([]);
  const [toast, setToast] = useState(null);
  const [filingToast, setFilingToast] = useState(null);

  // ALL HOOKS MUST BE ABOVE ANY EARLY RETURNS
  useEffect(() => {
    if (!data && cin) {
      fetch(`${API}/executive/${cin}`)
        .then(r => r.json())
        .then(res => {
          setData(res);
          setFilings(res.filing_requests || []);
          sessionStorage.setItem('exec_session', JSON.stringify({ ...sessionData, cin }));
        })
        .catch(console.error);
    }
  }, [cin, data]);

  // Fetch What-If tax scenarios
  useEffect(() => {
    if (cin) {
      fetch(`${API}/tax/${cin}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.what_if) setWhatIf(d.what_if); })
        .catch(console.error);
    }
  }, [cin]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  // Poll GET /alerts/{cin} every 5 s; fire toast when CA acknowledges
  useEffect(() => {
    if (!cin) return;
    const poll = () => {
      fetch(`${API}/alerts/${cin}`)
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          const arr = Array.isArray(list) ? list : [];
          const prev = prevAlertsRef.current;
          arr.forEach(a => {
            if (a.status === 'ACKNOWLEDGED') {
              const wasAck = prev.some(p => p.id === a.id && p.status === 'ACKNOWLEDGED');
              if (!wasAck) {
                const tid = Date.now();
                setToast({ message: `CA responded: "${a.ca_response}" — ${a.regulation_title}`, id: tid });
                setTimeout(() => setToast(t => t?.id === tid ? null : t), 5000);
              }
            }
          });
          prevAlertsRef.current = arr;
          setAlertsSent(arr);
        })
        .catch(console.error);
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [cin]);

  // Fix 1 — Poll /filing-requests/{cin} every 5 s
  useEffect(() => {
    if (!cin) return;
    const pollFilings = () => {
      fetch(`${API}/filing-requests/${cin}`)
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          const arr = Array.isArray(list) ? list : [];
          const prev = prevFilingsRef.current;

          arr.forEach(f => {
            const prevEntry = prev.find(p => p.id === f.id);
            // Fix 2 + 3 — detect new FILED transitions
            if (f.status === 'FILED' && prevEntry && prevEntry.status !== 'FILED') {
              // Flash the row green
              setFlashedRows(old => ({ ...old, [f.id]: true }));
              setTimeout(() => setFlashedRows(old => { const n = { ...old }; delete n[f.id]; return n; }), 1200);

              // Fix 4 — update stat card live
              setLiveLastFiling({
                form: f.form_name,
                date: f.filed_at ? new Date(f.filed_at).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
                ca: f.filed_by || 'CA',
              });

              // Fix 3 — filing confirmed toast
              const tid = Date.now();
              setFilingToast({
                id: tid,
                form: f.form_name,
                ca: f.filed_by || 'CA',
                ack: f.ack_number || '',
                portal: f.ack_portal || 'MCA21 Portal',
              });
              setTimeout(() => setFilingToast(t => t?.id === tid ? null : t), 6000);
            }
          });

          prevFilingsRef.current = arr;
          setFilings(arr);
        })
        .catch(console.error);
    };
    pollFilings();
    const iv = setInterval(pollFilings, 5000);
    return () => clearInterval(iv);
  }, [cin]);

  const refreshFilings = async () => {
    try {
      const res = await fetch(`${API}/filing-requests/${cin}`);
      const list = await res.json();
      setFilings(Array.isArray(list) ? list : []);
    } catch (e) { console.error(e); }
  };

  // Guard: no CIN available at all
  if (!cin) {
    return (
      <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-white flex-col gap-4">
        <p className="text-gray-400">No company selected.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium"
        >
          Select a Company
        </button>
      </div>
    );
  }

  if (!data) return <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-white">Loading Executive View...</div>;
  if (data.detail) return <div className="min-h-screen bg-[#0A0F1E] flex flex-col items-center justify-center text-white gap-4"><p className="text-red-400">Error loading dashboard: {data.detail}</p><button onClick={() => { sessionStorage.removeItem('exec_session'); navigate('/login'); }} className="bg-white/10 px-4 py-2 rounded-lg hover:bg-white/20">Return to Login</button></div>;
  if (!data.company) return <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center text-white">Invalid data format received.</div>;

  const { company, total_exposure, signature_required, regulatory_impact, ca_summary } = data;

  const handleAskAI = async (questionText = null) => {
    const q = questionText || chatInput;
    if (!q.trim() || chatLoading) return;

    const newHistory = [...chatHistory, { role: 'user', content: q }];
    setChatHistory(newHistory);
    setChatInput('');
    setChatLoading(true);

    const systemPrompt = `You are a compliance advisor for Indian companies. 
You are currently advising the executive of ${company?.name || 'the company'}, 
a ${company?.sector || ''} company based in ${company?.city || 'India'}.

Current compliance status:
- Total ₹ Exposure: ${total_exposure || 0}
- Active violations: ${JSON.stringify(signature_required || [])}
- CA Audit status: ${ca_summary?.at_risk_count || 0} filings at risk
- Relevant regulations: ${JSON.stringify((regulatory_impact || []).map(r => r.rule_name || r.title || r.item))}`;

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: systemPrompt, messages: newHistory })
      });
      const resData = await res.json();
      if (res.ok) {
        setChatHistory([...newHistory, { role: 'model', content: resData.reply }]);
      } else {
        setChatHistory([...newHistory, { role: 'model', content: 'Unable to reach AI — please try again.', error: true }]);
      }
    } catch (e) {
      setChatHistory([...newHistory, { role: 'model', content: 'Unable to reach AI — please try again.', error: true }]);
    } finally {
      setChatLoading(false);
    }
  };

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

  const handleSendScenario = async (scenario) => {
    setSentScenarios(prev => ({ ...prev, [scenario.id]: 'loading' }));
    try {
      const res = await fetch(`${API}/tax/${cin}/apply-saving`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: scenario.id,
          scenario_title: scenario.title,
          form: scenario.form,
          saving: scenario.saving,
          company_name: company.name
        })
      });
      if (res.ok) {
        setSentScenarios(prev => ({ ...prev, [scenario.id]: 'sent' }));
        refreshFilings();
      } else throw new Error();
    } catch (e) {
      setSentScenarios(prev => ({ ...prev, [scenario.id]: 'error' }));
    }
  };

  const logout = () => { sessionStorage.removeItem('exec_session'); navigate('/login') };

  return (
    <div className="min-h-screen bg-[#0A0F1E] text-white p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8 animate-fade-in">
        
        {/* Top Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/10 pb-6 gap-4">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl md:text-3xl font-bold">{company.name}</h1>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
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
          <button onClick={logout} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
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

          <div className="bg-[#111827] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg"><Clock className="w-5 h-5" /></div>
              <h3 className="text-sm text-gray-400 font-medium uppercase tracking-wider">Last CA Filing</h3>
            </div>
            {/* Fix 4 — live update when polling detects a new FILED */}
            <p className="text-lg font-bold text-white mb-1">
              {liveLastFiling?.form || ca_summary?.last_filed_form || 'No Filings'}
            </p>
            {(liveLastFiling || ca_summary?.last_filed_date) && (
              <p className="text-sm text-gray-400">
                {liveLastFiling
                  ? `${liveLastFiling.date} · by ${liveLastFiling.ca}`
                  : `${ca_summary.last_filed_date} · by ${ca_summary.last_ca_name}`}
              </p>
            )}
          </div>
        </div>

        {/* ROW 2: Signatures Panel */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2"><FileSignature className="w-6 h-6 text-yellow-400" /> What Needs Your Signature</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {(signature_required || []).length === 0 ? (
              <p className="text-gray-400 col-span-2">No pending items.</p>
            ) : (signature_required || []).map((sig, i) => {
              const isUrgent = (sig.deadline || '').toLowerCase().includes('immediate');
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
                        <span className="text-emerald-400 font-mono text-xs">{sig.law_ref}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => openAlertModal(sig)} className="w-full bg-white/5 hover:bg-emerald-600 border border-white/10 hover:border-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition-all flex justify-center items-center gap-2 group">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 group-hover:text-white" /> Alert CA
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ROW 3: CA Filing Tracker — What If Scenarios + Deduped Requests */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10 flex items-center justify-between">
            {/* Fix 5 — heading + pending badge */}
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-emerald-400" /> CA Filing Tracker</h2>
              {(() => {
                const pending = filings.filter(f => f.status === 'PENDING' || f.status === 'IN_PROGRESS');
                const allFiled = filings.length > 0 && pending.length === 0;
                if (filings.length === 0) return null;
                if (allFiled) return (
                  <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-bold">
                    All filed ✓
                  </span>
                );
                return (
                  <span className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2.5 py-0.5 rounded-full text-xs font-bold animate-pulse">
                    {pending.length} pending
                  </span>
                );
              })()}
            </div>
            <button onClick={() => setFilingModal({ ...filingModal, open: true })} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Request Filing
            </button>
          </div>

          {/* ── What If Scenarios ── */}
          {whatIf && whatIf.scenarios?.length > 0 && (
            <div className="p-6 pb-2">
              <div className="flex items-center gap-3 p-4 mb-6 bg-indigo-500/10 border border-indigo-500/30 rounded-xl">
                <span className="text-xl">⚡</span>
                <p className="text-indigo-300 font-bold text-sm">
                  {fmt(whatIf.total_potential_saving)} in total savings identified across {whatIf.total_scenarios} scenarios
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {whatIf.scenarios.map((s, i) => {
                  const sent = sentScenarios[s.id] === 'sent';
                  const sending = sentScenarios[s.id] === 'loading';
                  return (
                    <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-6 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${
                            s.urgency === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          }`}>{s.urgency} Urgency</span>
                          {s.days_to_act !== undefined && (
                            <span className="text-xs text-gray-500 font-semibold">
                              {s.days_to_act > 0 ? `${s.days_to_act} days to act` : 'Act immediately'}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-black text-white mb-4 leading-snug">{s.title}</h3>
                        <div className="space-y-3 mb-5">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Now</p>
                            <p className="text-sm text-rose-400/90 font-medium">{s.current}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">If Done</p>
                            <p className="text-sm text-emerald-400/90 font-medium">{s.if_done}</p>
                          </div>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Potential Saving</p>
                          <p className="text-xl font-black text-emerald-400">{fmt(s.saving)}</p>
                        </div>
                        <button
                          onClick={() => handleSendScenario(s)}
                          disabled={sent || sending}
                          className={`px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                            sent
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                              : sending
                              ? 'bg-indigo-600/50 text-white cursor-wait'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          }`}
                        >
                          {sent ? (
                            <span>&#10003; Sent to CA</span>
                          ) : sending ? (
                            <span>Sending&#8230;</span>
                          ) : (
                            <><Send className="w-3.5 h-3.5" /><span>Apply &#8594; Send to CA</span></>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Plain Filing Requests (deduped, excluding What If forms) ── */}
          {(() => {
            // Build set of form names already shown in What If scenarios
            const whatIfForms = new Set(
              (whatIf?.scenarios || []).map(s => (s.form || '').toLowerCase())
            );
            // Deduplicate by form_name, and skip forms already in What If
            const seen = {};
            const deduped = filings.filter(f => {
              const key = f.form_name?.toLowerCase();
              if (seen[key] || whatIfForms.has(key)) return false;
              seen[key] = true;
              return true;
            });
            if (deduped.length === 0) return null;
            return (
              <div className="p-6 pt-4">
                {whatIf?.scenarios?.length > 0 && (
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-4">Other Filing Requests</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {deduped.map((f, i) => {
                    const isFiled = f.status === 'FILED';
                    const isInProgress = f.status === 'IN_PROGRESS';
                    const isPending = f.status === 'PENDING';
                    const ctx = getFormContext(f.form_name);
                    const deadlineDate = f.deadline ? new Date(f.deadline) : null;
                    const today = new Date();
                    const daysLeft = deadlineDate ? Math.ceil((deadlineDate - today) / 86400000) : null;
                    const isOverdue = daysLeft !== null && daysLeft < 0;
                    const isDueSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                    const isFlashing = !!flashedRows[f.id];
                    return (
                      <motion.div
                        key={f.id ?? i}
                        animate={isFlashing ? { backgroundColor: ['#052e16', '#16a34a33', '#052e16'] } : {}}
                        transition={{ duration: 1.2, ease: 'easeInOut' }}
                        className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
                          isFiled ? 'bg-emerald-500/5 border-emerald-500/20'
                          : isOverdue ? 'bg-rose-500/5 border-rose-500/20'
                          : isInProgress ? 'bg-yellow-500/5 border-yellow-500/20'
                          : 'bg-black/30 border-white/5 hover:border-white/10'
                        }`}>
                        {/* Header: urgency + deadline */}
                        <div className="flex justify-between items-start mb-3">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${
                            ctx.urgency === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : ctx.urgency === 'LOW'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                          }`}>{ctx.urgency} Urgency</span>
                          {/* Fix 2 — visual status transitions */}
                          {f.status === 'IN_PROGRESS'
                            ? <span className="bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded text-xs font-semibold uppercase flex items-center gap-1.5 animate-pulse">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />CA is working on this...
                              </span>
                            : <StatusBadge s={f.status} />
                          }
                        </div>

                        {/* Form name + section */}
                        <div className="mb-1">
                          {ctx.section && (
                            <p className="text-[10px] font-mono text-indigo-400 mb-1">{ctx.section}</p>
                          )}
                          <h3 className="text-xl font-black text-white mb-2 leading-tight">{f.form_name}</h3>
                          <p className="text-xs text-gray-400 leading-relaxed mb-4">{ctx.description}</p>
                        </div>

                        {/* NOW / IF DONE */}
                        <div className="space-y-3 mb-4">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">Now</p>
                            <p className="text-sm text-rose-400/90 font-medium">{ctx.now}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-0.5">If Done</p>
                            <p className="text-sm text-emerald-400/90 font-medium">{ctx.if_done}</p>
                          </div>
                        </div>

                        {/* Deadline + Requested */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Deadline</p>
                            <p className={`text-sm font-semibold ${
                              isOverdue ? 'text-rose-400' : isDueSoon ? 'text-orange-400' : f.deadline ? 'text-white' : 'text-gray-600'
                            }`}>
                              {f.deadline
                                ? isOverdue ? `${Math.abs(daysLeft)}d overdue` : isDueSoon ? `Due in ${daysLeft}d` : f.deadline
                                : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Requested</p>
                            <p className="text-sm font-semibold text-gray-300">
                              {f.requested_at ? new Date(f.requested_at).toLocaleDateString('en-IN') : '—'}
                            </p>
                          </div>
                        </div>

                        {/* Fix 2 — Rich ack block for filed */}
                        {isFiled && (
                          <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
                            {f.ack_number && (
                              <p className="font-mono text-emerald-300 text-sm font-bold tracking-wider">{f.ack_number}</p>
                            )}
                            {f.ack_portal && (
                              <p className="text-xs text-gray-400">Filed via {f.ack_portal}</p>
                            )}
                            {f.filed_by && (
                              <p className="text-xs text-gray-500">
                                Filed by: <span className="text-gray-300">{f.filed_by}</span>
                                {f.filed_at && (
                                  <> &middot; {new Date(f.filed_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                                )}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Action */}
                        <div className="pt-4 border-t border-white/5">
                          {isFiled ? (
                            <p className="text-emerald-400 text-sm font-semibold">&#10003; Filed &amp; Acknowledged</p>
                          ) : (
                            <button
                              onClick={() => openAlertModal({ item: f.form_name, reason: ctx.now, deadline: f.deadline || 'N/A', penalty: 'N/A', law_ref: ctx.section || 'N/A' })}
                              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold border transition-all bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white"
                            >
                              <Send className="w-4 h-4" />
                              {isPending ? 'Send to CA' : 'Follow Up with CA'}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {(!whatIf?.scenarios?.length && filings.length === 0) && (
            <div className="p-12 text-center text-gray-500">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No filing requests yet.</p>
              <p className="text-sm mt-1">Click "Request Filing" to dispatch a task to your CA.</p>
            </div>
          )}
        </div>

        {/* ROW 4: Regulatory Impact Feed */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold">Regulatory Impact Feed</h2>
            <p className="text-sm text-gray-400 mt-1">Filtered for {company.sector}</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {(regulatory_impact || []).map((news, i) => (
              <div key={i} onClick={() => setNewsModal(news)} className="bg-black/20 border border-white/5 rounded-xl p-5 hover:border-emerald-500/50 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-3">
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold border border-red-500/30">Affects You</span>
                  <span className="text-xs text-gray-500">{news.date}</span>
                </div>
                <h3 className="font-bold text-white mb-2 line-clamp-2 group-hover:text-emerald-300 transition-colors">{news.title}</h3>
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
            {ca_summary?.outdated_count === 0 && ca_summary?.at_risk_count === 0 ? (
              <div className="flex items-center gap-3 p-4 mb-6 bg-green-500/10 border border-green-500/30 rounded-xl">
                <span className="text-2xl">✅</span><p className="text-green-400 font-semibold">All recent filings match active regulations.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="text-yellow-400 font-semibold">Potential compliance drift detected in past CA filings.</p>
                  <p className="text-yellow-400/70 text-xs mt-1">{ca_summary?.outdated_count || 0} outdated, {ca_summary?.at_risk_count || 0} at risk.</p>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="border border-white/10 rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-black/20 text-gray-400 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Form</th>
                    <th className="px-4 py-3">Filed Date</th>
                    <th className="px-4 py-3">Filed By</th>
                    <th className="px-4 py-3">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(data?.ca_summary?.verified_filings || []).slice(0, 5).map((f, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-semibold text-white">{f.form}</td>
                      <td className="px-4 py-3 text-gray-400">{f.filed_date}</td>
                      <td className="px-4 py-3 text-gray-400">{f.filed_by}</td>
                      <td className="px-4 py-3"><StatusBadge s={f.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        
        {/* ROW 6: Ask Compliance AI */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden flex flex-col mb-16">
          <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">🤖 Ask Compliance AI</h2>
              <p className="text-gray-400 text-sm mt-1">Powered by Gemini — answers based on your live data</p>
            </div>
            {chatHistory.length > 0 && (
              <button onClick={() => setChatHistory([])} className="bg-transparent border border-white/10 text-gray-400 rounded-lg px-3 py-1.5 text-xs cursor-pointer hover:text-white transition-colors">
                Clear Chat
              </button>
            )}
          </div>
          <div className="p-6 flex flex-col gap-4">
            {chatHistory.length === 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  "Am I personally liable for the GST default?",
                  "What's my worst penalty exposure?",
                  "Which violation should I fix first?",
                  "Is my CA compliant with new SEBI rules?"
                ].map((q, i) => (
                  <button key={i} onClick={() => handleAskAI(q)} className="bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-full px-4 py-2 text-sm text-slate-300 transition-colors cursor-pointer">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-black/20 border border-white/5 rounded-xl min-h-[200px] max-h-[400px] overflow-y-auto p-5 flex flex-col gap-4">
              {chatHistory.length === 0 ? (
                <p className="text-gray-500 text-sm text-center m-auto">No messages yet. Ask a question to get started.</p>
              ) : (
                chatHistory.map((msg, i) => (
                  <div key={i} className={`max-w-[80%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
                        {msg.content}
                      </div>
                    ) : (
                      <div className={`${msg.error ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-gray-800 text-gray-100 border border-white/10'} px-4 py-3 rounded-2xl rounded-bl-sm text-sm leading-relaxed`}>
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="self-start bg-gray-800 text-gray-400 border border-white/10 px-4 py-3 rounded-2xl rounded-bl-sm text-sm flex items-center gap-2">
                  <span className="animate-pulse">Gemini is thinking...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-3 mt-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAskAI()} placeholder="Type your question..." className="flex-1 bg-gray-800 border border-white/10 rounded-xl px-4 py-3 text-white outline-none text-sm focus:border-emerald-500 transition-colors" disabled={chatLoading} />
              <button onClick={() => handleAskAI()} disabled={!chatInput.trim() || chatLoading} className={`bg-emerald-600 hover:bg-emerald-500 text-white border-none rounded-xl px-5 font-semibold flex items-center gap-2 transition-all ${(!chatInput.trim() || chatLoading) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                Ask
              </button>
            </div>
          </div>
        </div>
        {/* CA Responses Panel */}
        {alertsSent.length > 0 && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center gap-3">
              <Bell className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold">Alerts &amp; CA Responses</h2>
              <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-widest">Live &middot; every 5s</span>
            </div>
            <div className="divide-y divide-white/5">
              {alertsSent.map((a, i) => {
                const isAck = a.status === 'ACKNOWLEDGED';
                const isRead = a.status === 'READ';
                return (
                  <div key={a.id ?? i} className={`px-5 py-4 transition-all ${isAck ? 'border-l-2 border-emerald-500 bg-emerald-500/[0.03]' : ''}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider border ${
                        a.urgency === 'EMERGENCY' ? 'bg-red-500/15 text-red-400 border-red-500/25'
                        : a.urgency === 'HIGH' ? 'bg-orange-500/15 text-orange-400 border-orange-500/25'
                        : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25'
                      }`}>{a.urgency}</span>
                      <p className="text-sm font-semibold text-white flex-1 truncate">{a.regulation_title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-gray-500">{a.sent_at ? new Date(a.sent_at).toLocaleDateString('en-IN') : '—'}</span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                          isAck ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          : isRead ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                          : 'bg-gray-500/15 text-gray-400 border-gray-500/25'
                        }`}>
                          {isAck ? '✅ Acknowledged' : isRead ? 'Read' : 'Unread'}
                        </span>
                      </div>
                    </div>
                    {isAck && a.ca_response && (
                      <div className="mt-2 bg-indigo-950/70 border border-indigo-500/20 rounded-xl px-4 py-3">
                        <p className="text-[9px] text-indigo-400 font-black uppercase tracking-widest mb-1">CA Response</p>
                        <p className="text-sm text-gray-100 leading-relaxed italic">&ldquo;{a.ca_response}&rdquo;</p>
                        {a.acknowledged_at && (
                          <p className="text-[10px] text-gray-500 mt-1.5">
                            &mdash; Replied {new Date(a.acknowledged_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* CA Response Toast (acknowledgement from CA portal alerts) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 right-6 z-[100] bg-[#0a1f14] border border-emerald-500/50 text-emerald-300 px-5 py-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm"
          >
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">CA Responded</p>
              <p className="text-sm font-medium leading-snug">{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-emerald-500/50 hover:text-emerald-400 flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fix 3 — Filing Confirmed Toast */}
      <AnimatePresence>
        {filingToast && (
          <motion.div
            key={filingToast.id}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            className="fixed bottom-24 right-6 z-[100] bg-[#0a1f14] border-2 border-emerald-500/60 rounded-2xl shadow-2xl w-80 overflow-hidden"
          >
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <p className="text-sm font-black text-emerald-400 uppercase tracking-widest">Filing Confirmed</p>
                <button onClick={() => setFilingToast(null)} className="ml-auto text-emerald-600 hover:text-emerald-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-white font-semibold mb-0.5">{filingToast.form} filed by {filingToast.ca}</p>
              {filingToast.ack && (
                <p className="font-mono text-emerald-300 text-xs font-bold mb-0.5">Ack No: {filingToast.ack}</p>
              )}
              <p className="text-xs text-gray-400 mb-3">Via: {filingToast.portal}</p>
              <p className="text-[10px] text-yellow-400/80 font-semibold uppercase tracking-wider">Risk score recalculating...</p>
            </div>
            <div className="h-1 bg-emerald-500/20">
              <motion.div
                className="h-full bg-emerald-500"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 6, ease: 'linear' }}
              />
            </div>
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
                    className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-emerald-500 min-h-[120px]"
                    value={alertModal.message}
                    onChange={(e) => setAlertModal({ ...alertModal, message: e.target.value })}
                  />
                </div>
                
                <div className="flex gap-3 justify-end pt-2">
                  <button onClick={() => setAlertModal({ ...alertModal, open: false })} className="px-5 py-2.5 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5">Cancel</button>
                  <button onClick={sendAlert} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-2">
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
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none"
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
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none"
                    value={filingModal.reg}
                    onChange={e => setFilingModal({ ...filingModal, reg: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Deadline</label>
                  <input 
                    type="date" 
                    className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500 focus:outline-none"
                    value={filingModal.deadline}
                    onChange={e => setFilingModal({ ...filingModal, deadline: e.target.value })}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-4">
                  <button onClick={() => setFilingModal({ ...filingModal, open: false })} className="px-5 py-2.5 rounded-lg font-medium text-gray-400 hover:text-white hover:bg-white/5">Cancel</button>
                  <button onClick={sendFilingRequest} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-2">
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
                  <h4 className="text-emerald-400 text-sm font-bold uppercase tracking-wider mb-2">What Changed</h4>
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
