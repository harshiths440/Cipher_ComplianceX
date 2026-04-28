import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCompanies, analyzeCompany } from '../api/client';
import { motion } from 'framer-motion';
import { ChevronDown, Building2, ShieldCheck, Activity, Loader2, ArrowRight } from 'lucide-react';
import RegulatoryNews from '../components/RegulatoryNews';

const doctors = [
  { emoji: '📡', name: 'The News Reader', desc: 'Monitors every new regulation from MCA, SEBI, GST, Income Tax' },
  { emoji: '⚖️', name: 'The Rule Checker', desc: 'Checks your company against every active compliance rule' },
  { emoji: '🧮', name: 'The Tax Expert', desc: 'Calculates tax liability and identifies savings opportunities' },
  { emoji: '📊', name: 'The Risk Detector', desc: 'Scores your company 0–100 and explains every risk factor' },
  { emoji: '🏛️', name: 'The Secretary', desc: 'Manages your compliance calendar and never misses a deadline' }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const Home = () => {
  const [companies, setCompanies] = useState([]);
  const [selectedCin, setSelectedCin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const data = await getCompanies();
        setCompanies(data || []);
        if (data && data.length > 0) {
          setSelectedCin(data[0].cin);
        }
      } catch (err) {
        console.error("Failed to load companies, using mock data for UI demo");
        setCompanies([
          { cin: 'L12345MH2000PLC123456', name: 'Reliance Industries Limited' },
          { cin: 'U78901TG2015PTC987654', name: 'TechNova Solutions Pvt Ltd' },
          { cin: 'L00000DL1990PLC000000', name: 'Example Corp Ltd' }
        ]);
        setSelectedCin('L12345MH2000PLC123456');
      }
    };
    fetchCompanies();
  }, []);

  const handleAnalyze = async () => {
    if (!selectedCin) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeCompany(selectedCin);
      navigate(`/dashboard/${selectedCin}`, { state: { analysisResult: result } });
    } catch (err) {
      console.error(err);
      setError('Failed to analyze company. Please ensure backend is running.');
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow flex flex-col items-center justify-center px-4 py-12 relative min-h-screen bg-[#0A0F1E] overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] bg-indigo-500/10 rounded-full blur-[120px] animate-slow-pulse pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-indigo-500/10 rounded-full blur-[100px] animate-slow-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="z-10 w-full max-w-7xl flex flex-col items-center">
        {/* Hero Section */}
        <motion.div 
          className="text-center max-w-4xl w-full mb-16"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <motion.h1 
            variants={itemVariants}
            className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-500 mb-6 tracking-tight leading-tight pb-2"
          >
            Your Company's AI Compliance Doctor
          </motion.h1>
          <motion.p 
            variants={itemVariants}
            className="text-xl text-gray-400 max-w-2xl mx-auto mb-12"
          >
            Powered by 5 specialist AI agents monitoring MCA, SEBI, GST, and Income Tax in real time.
          </motion.p>

          <motion.div 
            variants={itemVariants}
            className="flex flex-col items-center max-w-lg mx-auto space-y-6 w-full"
          >
            <div className="w-full relative group">
              <select
                value={selectedCin}
                onChange={(e) => setSelectedCin(e.target.value)}
                className="w-full bg-[#1F2937] border border-white/10 rounded-xl px-5 py-4 text-gray-200 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 appearance-none text-lg transition-all shadow-lg hover:border-white/20 cursor-pointer"
                disabled={loading}
              >
                <option value="" disabled>Select a company...</option>
                {companies.map(c => (
                  <option key={c.cin} value={c.cin}>{c.name} ({c.cin})</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-indigo-400 group-hover:text-indigo-300 transition-colors">
                <ChevronDown className="w-5 h-5" />
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!selectedCin || loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-semibold py-4 px-8 rounded-xl transition-all flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                  <span>5 AI Doctors examining...</span>
                </>
              ) : (
                <>
                  <span>Analyze Compliance</span>
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
            
            {error && <div className="text-red-400 text-sm mt-2 bg-red-400/10 py-2 px-4 rounded-lg w-full text-center">{error}</div>}
          </motion.div>
        </motion.div>

        {/* Stats Bar */}
        <motion.div 
          className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 border-y border-white/5 py-8"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center space-y-2">
            <Building2 className="w-8 h-8 text-indigo-400 mb-1" />
            <span className="text-2xl font-bold text-white">1.5M+</span>
            <span className="text-sm text-gray-400 font-medium">Companies Monitored</span>
          </motion.div>
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center space-y-2 md:border-x border-white/5 md:px-6">
            <ShieldCheck className="w-8 h-8 text-indigo-400 mb-1" />
            <span className="text-2xl font-bold text-white">6</span>
            <span className="text-sm text-gray-400 font-medium">Regulatory Bodies Tracked</span>
          </motion.div>
          <motion.div variants={itemVariants} className="flex flex-col items-center justify-center space-y-2">
            <Activity className="w-8 h-8 text-indigo-400 mb-1" />
            <span className="text-2xl font-bold text-white">Real-time</span>
            <span className="text-sm text-gray-400 font-medium">Risk Detection</span>
          </motion.div>
        </motion.div>

        {/* Doctor Cards */}
        <motion.div 
          className="w-full"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <motion.h3 variants={itemVariants} className="text-center text-sm font-semibold tracking-widest text-indigo-400 uppercase mb-8">
            Meet Your Specialist Agents
          </motion.h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {doctors.map((doc, idx) => (
              <motion.div 
                key={idx} 
                variants={itemVariants}
                className="relative bg-[#111827] border-l-[3px] border-indigo-500 rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] group"
              >
                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                <div className="text-[2rem] mb-4 group-hover:scale-110 transition-transform origin-left">{doc.emoji}</div>
                <h4 className="font-bold text-white mb-2 text-sm md:text-base">{doc.name}</h4>
                <p className="text-xs text-gray-400 leading-relaxed">{doc.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Regulatory News Section */}
        <RegulatoryNews />
      </div>
    </div>
  );
};

export default Home;

