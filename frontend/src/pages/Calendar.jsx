import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { getCompany } from '../api/client';
import CalendarRow from '../components/CalendarRow';
import LoadingSpinner from '../components/LoadingSpinner';

const Calendar = () => {
  const { cin } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [selectedAction, setSelectedAction] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [inProgressItems, setInProgressItems] = useState(new Set());

  useEffect(() => {
    const fetchCompanyData = async () => {
      try {
        const data = await getCompany(cin);
        setCompany(data);
      } catch (err) {
        console.error(err);
        // Fallback for UI if backend is not ready
        setCompany({
          cin: cin,
          name: 'Example Corp Ltd',
          annual_returns_filed: false,
          aoc4_filed: false,
          gst_pending_months: 2,
          tds_pending_quarters: 1,
          advance_tax_paid: false,
          dir3_kyc_done: true
        });
        setError('Backend unavailable. Showing demo data.');
      } finally {
        setLoading(false);
      }
    };
    fetchCompanyData();
  }, [cin]);

  const getActionContent = (name) => {
    if (name.includes('Annual Return (MGT-7)')) {
      return {
        title: "File Annual Return — MGT-7",
        steps: ["Log in to MCA21 V3 portal at mca.gov.in", "Navigate to E-File → Company Forms → MGT-7", "Fill in details for the financial year", "Attach audited financial statements", "Pay filing fee and submit", "Download acknowledgement receipt"],
        fee: "₹200 for companies with share capital < ₹1,00,000",
        law: "Companies Act 2013 — Section 92"
      };
    }
    if (name.includes('GST Monthly Return (GSTR-3B)')) {
      return {
        title: "File GST Return — GSTR-3B",
        steps: ["Log in to GST portal at gst.gov.in", "Go to Returns → Returns Dashboard", "Select financial year and tax period", "Fill in outward supplies and ITC details", "Pay any tax liability before filing", "Submit and file with DSC or EVC"],
        fee: "Late fee ₹50/day (₹20/day for NIL returns)",
        law: "CGST Act 2017 — Section 39"
      };
    }
    if (name.includes('Director KYC (DIR-3)')) {
      return {
        title: "Complete Director KYC — DIR-3 KYC",
        steps: ["Log in to MCA21 portal", "Go to MCA Services → e-KYC", "Enter DIN and verify mobile/email OTP", "Upload Aadhaar and PAN", "Submit form with DSC"],
        fee: "₹500 if filed after September 30",
        law: "Companies Act 2013 — Rule 12A"
      };
    }
    if (name.includes('Financial Statements (AOC-4)')) {
      return {
        title: "File Financial Statements — AOC-4",
        steps: ["Prepare audited balance sheet and P&L", "Get board approval via resolution", "Log in to MCA21 and select AOC-4", "Attach signed financial statements and auditor report", "Pay filing fee and submit"],
        fee: "₹200 per document",
        law: "Companies Act 2013 — Section 137"
      };
    }
    if (name.includes('Advance Tax')) {
      return {
        title: "Pay Advance Tax Installment",
        steps: ["Calculate estimated tax liability for the year", "Compute installment amount (15%/45%/75%/100%)", "Log in to income tax portal at incometax.gov.in", "Go to e-Pay Tax → Advance Tax (Code 100)", "Complete payment via net banking", "Save challan receipt"],
        fee: "Interest at 1% per month if unpaid — Section 234B",
        law: "Income Tax Act 1961 — Section 208"
      };
    }
    if (name.includes('TDS Return')) {
      return {
        title: "File TDS Return",
        steps: ["Compile all TDS deduction details for the quarter", "Prepare Form 24Q (salary) or 26Q (non-salary)", "Use NSDL RPU software to prepare return file", "Validate using FVU tool", "Upload on TIN-NSDL portal or TRACES", "Download Form 16/16A after processing"],
        fee: "₹200/day late fee under Section 234E",
        law: "Income Tax Act 1961 — Section 200"
      };
    }
    
    return {
      title: "Action Required",
      generic: "Contact your Company Secretary or CA to action this item. Refer to the relevant Act and Section shown in the Relevant Regulations section."
    };
  };

  const handleTakeAction = (name) => {
    setSelectedAction({ ...getActionContent(name), originalName: name });
  };

  const handleMarkInProgress = () => {
    if (selectedAction?.originalName) {
      setInProgressItems(prev => {
        const next = new Set(prev);
        next.add(selectedAction.originalName);
        return next;
      });
    }
    setSelectedAction(null);
    setToastMessage("Marked as In Progress");
    setTimeout(() => setToastMessage(null), 3000);
  };

  if (loading) return <LoadingSpinner message="Loading compliance calendar..." />;
  if (!company) return <div className="p-8 text-center text-red-500">Failed to load calendar.</div>;

  const currentYear = new Date().getFullYear();

  // Basic logic to generate calendar events based on requirements & company data
  const generateEvents = () => {
    const events = [];

    // Annual Return MGT-7
    events.push({
      id: 'mgt7',
      name: 'Annual Return (MGT-7)',
      dueDate: `30 Sep ${currentYear}`,
      status: company.annual_returns_filed === false ? 'Overdue' : 'Upcoming',
      daysText: company.annual_returns_filed === false ? 'Overdue by 150 days' : 'Due in 180 days'
    });

    // Financial Statements AOC-4
    events.push({
      id: 'aoc4',
      name: 'Financial Statements (AOC-4)',
      dueDate: `30 Oct ${currentYear}`,
      status: company.aoc4_filed === false ? 'Overdue' : 'Upcoming',
      daysText: company.aoc4_filed === false ? 'Overdue by 120 days' : 'Due in 210 days'
    });

    // Director KYC
    events.push({
      id: 'dir3',
      name: 'Director KYC (DIR-3)',
      dueDate: `30 Sep ${currentYear}`,
      status: company.dir3_kyc_done ? 'Filed' : 'Upcoming',
      daysText: company.dir3_kyc_done ? 'Completed' : 'Due in 180 days'
    });

    // Advance Tax
    events.push({
      id: 'advTax',
      name: 'Advance Tax (Next Installment)',
      dueDate: `15 Jun ${currentYear}`,
      status: company.advance_tax_paid === false ? 'Due Soon' : 'Upcoming',
      daysText: company.advance_tax_paid === false ? 'Due in 20 days' : 'Due in 75 days'
    });

    // GST
    if (company.gst_pending_months > 0) {
      for (let i = 0; i < company.gst_pending_months; i++) {
        events.push({
          id: `gst-${i}`,
          name: 'GST Monthly Return (GSTR-3B)',
          dueDate: `20th of Previous Month`,
          status: 'Overdue',
          daysText: `Overdue (${i+1} month${i > 0 ? 's' : ''})`
        });
      }
    }
    events.push({
      id: 'gst-next',
      name: 'GST Monthly Return (GSTR-3B)',
      dueDate: `20th of Current Month`,
      status: 'Due Soon',
      daysText: 'Due in 12 days'
    });

    // TDS
    if (company.tds_pending_quarters > 0) {
      events.push({
        id: 'tds-overdue',
        name: 'TDS Return (Pending Quarter)',
        dueDate: `Previous Quarter End`,
        status: 'Overdue',
        daysText: 'Overdue'
      });
    }
    events.push({
      id: 'tds-next',
      name: 'TDS Return (Current Quarter)',
      dueDate: `End of Current Quarter`,
      status: 'Upcoming',
      daysText: 'Due in 45 days'
    });

    return events;
  };

  const allEvents = generateEvents();
  const filteredEvents = filter === 'All' ? allEvents : allEvents.filter(e => e.status === filter);

  return (
    <div className="flex-grow max-w-5xl w-full mx-auto p-6 animate-fade-in">
      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded text-sm mb-4">{error}</div>}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Compliance Calendar</h1>
        <p className="text-gray-400 text-lg">{company.name}</p>
      </div>

      <div className="bg-[var(--color-brand-card)] border-glass rounded-xl overflow-hidden shadow-xl">
        <div className="flex border-b border-white/10 bg-black/20">
          {['All', 'Overdue', 'Due Soon', 'Upcoming', 'Filed'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`flex-1 py-4 text-sm font-semibold transition-all ${
                filter === tab 
                  ? 'text-[var(--color-brand-primary)] border-b-2 border-[var(--color-brand-primary)] bg-[var(--color-brand-primary)]/5' 
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex px-4 py-3 bg-white/[0.02] border-b border-white/5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="w-5/12 pl-6">Obligation</div>
          <div className="w-2/12">Due Date</div>
          <div className="w-2/12">Status</div>
          <div className="w-2/12">Timeline</div>
          <div className="w-1/12"></div>
        </div>

        <div className="divide-y divide-white/5 overflow-y-auto max-h-[600px] styled-scrollbar">
          {filteredEvents.length > 0 ? (
            filteredEvents.map(event => (
              <CalendarRow 
                key={event.id}
                obligationName={event.name}
                dueDate={event.dueDate}
                status={inProgressItems.has(event.name) ? 'In Progress' : event.status}
                daysText={event.daysText}
                onAction={handleTakeAction}
              />
            ))
          ) : (
            <div className="p-12 text-center text-gray-500 italic">
              No obligations found for the selected filter.
            </div>
          )}
        </div>
      </div>

      {/* Modal Overlay */}
      {selectedAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#1F2937] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-indigo-600/20">
              <h2 className="text-xl font-bold text-white">{selectedAction.title}</h2>
              <button 
                onClick={() => setSelectedAction(null)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6 overflow-y-auto styled-scrollbar text-gray-300">
              {selectedAction.generic ? (
                <p className="text-base leading-relaxed">{selectedAction.generic}</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider mb-3">Action Steps</h3>
                    <ul className="space-y-3">
                      {selectedAction.steps.map((step, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold mr-3 border border-indigo-500/30">
                            {idx + 1}
                          </span>
                          <span className="text-sm pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="bg-white/5 rounded-lg p-4 border border-white/5 space-y-3">
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Estimated Fee / Penalty</h3>
                      <p className="text-sm font-medium text-white">{selectedAction.fee}</p>
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Relevant Regulations</h3>
                      <p className="text-sm text-gray-300">{selectedAction.law}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-5 border-t border-white/10 bg-black/20 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedAction(null)}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                Close
              </button>
              {inProgressItems.has(selectedAction.originalName) ? (
                <button 
                  disabled
                  className="px-4 py-2 text-sm font-medium text-white bg-[#22C55E] rounded-lg cursor-not-allowed"
                >
                  ✓ Already In Progress
                </button>
              ) : (
                <button 
                  onClick={handleMarkInProgress}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
                >
                  Mark as In Progress
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
          <div className="bg-green-500/90 text-white px-4 py-3 rounded-lg shadow-lg font-medium text-sm flex items-center border border-green-400/30">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
