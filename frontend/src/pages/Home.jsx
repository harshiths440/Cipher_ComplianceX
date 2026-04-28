import React, { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCompanies, analyzeCompany } from '../api/client'
import { motion } from 'framer-motion'
import { ChevronDown, Building2, ShieldCheck, Activity, Loader2, ArrowRight, Check, Rss, Scale, Calculator, ShieldAlert, CalendarClock } from 'lucide-react'
import RegulatoryNews from '../components/RegulatoryNews'

const doctors = [
  { icon: Rss,            name: 'News Reader',   desc: 'Monitors every new regulation from MCA, SEBI, GST, Income Tax',   color: 'text-purple-400' },
  { icon: Scale,          name: 'Rule Checker',  desc: 'Checks your company against every active compliance rule',      color: 'text-emerald-400' },
  { icon: Calculator,     name: 'Tax Expert',    desc: 'Calculates tax liability and identifies savings opportunities',    color: 'text-blue-400' },
  { icon: ShieldAlert,    name: 'Risk Detector', desc: 'Scores your company 0–100 and explains every risk factor',          color: 'text-rose-400' },
  { icon: CalendarClock,  name: 'Secretary',     desc: 'Manages your compliance calendar and never misses a deadline',        color: 'text-cyan-400' },
]

const container = { hidden: { opacity:0 }, visible: { opacity:1, transition:{ staggerChildren:0.1 } } }
const item      = { hidden: { opacity:0, y:20 }, visible: { opacity:1, y:0, transition:{ duration:0.5, ease:'easeOut' } } }

export default function Home() {
  const [companies,   setCompanies]   = useState([])
  const [selectedCin, setSelectedCin] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [isOpen,      setIsOpen]      = useState(false)
  const [activeDoc,   setActiveDoc]   = useState(0)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    getCompanies()
      .then(data => { setCompanies(data||[]); if(data?.length) setSelectedCin(data[0].cin) })
      .catch(() => {
        const mock = [
          { cin:'U72900KA2018PTC123456', name:'Technova Solutions Pvt Ltd' },
          { cin:'U65910MH2013PTC445566', name:'Pinnacle Capital Advisors Pvt Ltd' },
        ]
        setCompanies(mock); setSelectedCin(mock[0].cin)
      })
  }, [])

  const handleAnalyze = async () => {
    if (!selectedCin) return
    setLoading(true); setError(null)
    try {
      const result = await analyzeCompany(selectedCin)
      navigate(`/dashboard/${selectedCin}`, { state:{ analysisResult:result } })
    } catch {
      setError('Failed to analyze. Is the backend running?')
      setLoading(false)
    }
  }

  return (
    <div className="flex-grow flex flex-col items-center justify-center px-4 py-12 relative min-h-screen bg-[#0A0F1E] overflow-hidden">

      {/* Background glows */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-grid-pattern" />
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-indigo-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-500/5 rounded-full blur-[100px]" style={{ animationDelay:'2s' }} />
      </div>

      <div className="z-10 w-full max-w-7xl flex flex-col items-center">
        {/* Hero */}
        <motion.div className="text-center max-w-4xl w-full mb-24 relative flex flex-col justify-center min-h-[500px] items-center" initial="hidden" animate="visible" variants={container}>
          <motion.h1 variants={item}
            className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-500 mb-6 tracking-tight leading-tight pb-2 drop-shadow-sm">
            Your Company's AI Compliance 
          </motion.h1>
          <motion.p variants={item} className="text-xl text-gray-300 max-w-2xl mx-auto mb-12 drop-shadow-sm">
            Powered by 5 specialist AI agents monitoring MCA, SEBI, GST, and Income Tax in real time.
          </motion.p>

          <motion.div variants={item} className="flex flex-col items-center max-w-xl mx-auto space-y-4 w-full">
            <div className="w-full relative group" ref={dropdownRef}>
              <div 
                onClick={() => !loading && setIsOpen(!isOpen)}
                className={`w-full bg-[#111827]/90 backdrop-blur-md border ${isOpen ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.2)]' : 'border-white/10'} hover:border-white/20 rounded-xl p-4 cursor-pointer transition-all flex items-center justify-between ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="text-left overflow-hidden">
                    <h3 className="text-white font-semibold text-lg truncate">
                      {companies.find(c => c.cin === selectedCin)?.name || 'Select a company...'}
                    </h3>
                    <p className="text-gray-400 text-sm truncate">
                      {selectedCin ? `CIN: ${selectedCin}` : 'Click to choose from your portfolio'}
                    </p>
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-300 shrink-0 ml-2 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} />
              </div>

              {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#1F2937]/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto">
                  {companies.map(c => (
                    <div 
                      key={c.cin} 
                      onClick={() => { setSelectedCin(c.cin); setIsOpen(false); }}
                      className={`p-4 flex items-center justify-between cursor-pointer transition-colors border-b border-white/5 last:border-0 ${selectedCin === c.cin ? 'bg-indigo-500/10' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex flex-col overflow-hidden pr-4 text-left">
                        <span className={`font-medium truncate ${selectedCin === c.cin ? 'text-indigo-400' : 'text-gray-200'}`}>{c.name}</span>
                        <span className="text-xs text-gray-500 truncate">{c.cin}</span>
                      </div>
                      {selectedCin === c.cin && <Check className="w-5 h-5 text-indigo-400 shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleAnalyze} disabled={!selectedCin || loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-semibold py-4 rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-[0_0_30px_rgba(99,102,241,0.35)] hover:shadow-[0_0_40px_rgba(99,102,241,0.5)]">
              {loading
                ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</>
                : <><span>Analyze Compliance</span><ArrowRight className="w-5 h-5" /></>
              }
            </button>

            {error && <div className="text-red-400 text-sm bg-red-400/10 py-2 px-4 rounded-xl w-full text-center">{error}</div>}
          </motion.div>
        </motion.div>

        {/* Specialist Agents Section */}
        <div className="w-full max-w-7xl mx-auto py-16 px-4 flex flex-col items-center relative mb-12">
          
          {/* Top Header */}
          <motion.div initial={{ opacity: 0, y: -20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="text-center mb-16 max-w-3xl">
            <h2 className="text-sm font-bold tracking-widest text-indigo-400 uppercase mb-4">Meet the Team</h2>
            <h3 className="text-4xl md:text-5xl font-black text-white leading-tight mb-6">
              5 AI Agents <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">working for you.</span>
            </h3>
            <p className="text-gray-400 text-lg">
              Each agent is specialized in a specific domain, working together to keep your compliance perfect.
            </p>
          </motion.div>

          {/* Horizontal Cards Grid */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {doctors.map((doc, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ duration: 0.5, delay: idx * 0.1, ease: "easeOut" }}
                className="bg-[#111827]/80 backdrop-blur-md border border-white/5 rounded-3xl p-6 flex flex-col items-center text-center group hover:border-indigo-500/30 hover:bg-[#151D2C] transition-all shadow-xl hover:-translate-y-2 relative overflow-hidden"
              >
                {/* Premium Icon Container */}
                <div className="relative shrink-0 mb-6 mt-2">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                  <div className="relative w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-xl">
                    <doc.icon className={`w-10 h-10 ${doc.color}`} strokeWidth={1.5} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col items-center">
                  <h4 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-300 transition-colors">{doc.name}</h4>
                  <p className="text-sm text-gray-400 leading-relaxed mb-6 flex-grow">{doc.desc}</p>
                  
                  {/* Tags */}
                  <div className="flex flex-wrap justify-center gap-2 mt-auto">
                    <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] text-gray-400 border border-white/5">Auto-updates</span>
                    <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] text-gray-400 border border-white/5">24/7 Monitoring</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <RegulatoryNews />
      </div>
    </div>
  )
}
