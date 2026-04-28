import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:8000';
const CATEGORIES = ['All', 'GST', 'Corporate', 'Tax', 'Securities', 'General'];
const PAGE_SIZE = 6;

const CATEGORY_STYLES = {
  GST:        { bg: 'rgba(34,197,94,0.1)',   text: '#4ade80', border: 'rgba(34,197,94,0.25)' },
  Securities: { bg: 'rgba(99,102,241,0.1)',  text: '#818cf8', border: 'rgba(99,102,241,0.25)' },
  Tax:        { bg: 'rgba(234,179,8,0.1)',   text: '#facc15', border: 'rgba(234,179,8,0.25)' },
  Corporate:  { bg: 'rgba(249,115,22,0.1)',  text: '#fb923c', border: 'rgba(249,115,22,0.25)' },
  General:    { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.25)' },
};

const SEVERITY_COLORS = {
  HIGH:   { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444', border: 'rgba(239,68,68,0.4)' },
  MEDIUM: { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b', border: 'rgba(245,158,11,0.4)' },
  LOW:    { bg: 'rgba(34,197,94,0.15)',   text: '#22c55e', border: 'rgba(34,197,94,0.4)' },
};

// ─── Company-type tag mapping ─────────────────────────────────────────────────
const CATEGORY_TAGS = {
  GST:        ['Manufacturing', 'Retail', 'Healthcare', 'Real Estate', 'EdTech'],
  Corporate:  ['All Companies', 'Private Ltd', 'OPC', 'Listed Companies'],
  Tax:        ['All Companies', 'NBFC', 'IT Services', 'Large Businesses'],
  Securities: ['Listed Companies', 'NBFC', 'Brokers', 'Investors'],
};

/** Derive a deduplicated tag list from category + who_it_hits. */
const getItemTags = (item) => {
  const base = CATEGORY_TAGS[item.category] || [];
  const extra = [];
  const hits  = (item.who_it_hits || '').toLowerCase();
  if (hits.includes('turnover above') && hits.includes('5'))  extra.push('Turnover >₹5Cr');
  if (hits.includes('listed'))    extra.push('Listed Co.');
  if (hits.includes('nbfc'))      extra.push('NBFC');
  if (hits.includes('small'))     extra.push('Small Co.');
  if (hits.includes('director'))  extra.push('Directors');
  if (hits.includes('all'))       extra.push('All Companies');
  // Merge, deduplicate, preserve base order
  const seen = new Set(base);
  const merged = [...base];
  for (const t of extra) { if (!seen.has(t)) { seen.add(t); merged.push(t); } }
  return merged;
};

// ─── Skeleton ────────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: 20 }} className="animate-pulse space-y-3">
    <div style={{ display:'flex', justifyContent:'space-between' }}>
      <div style={{ height:14, background:'rgba(255,255,255,0.08)', borderRadius:6, width:96 }} />
      <div style={{ height:18, background:'rgba(255,255,255,0.08)', borderRadius:6, width:60 }} />
    </div>
    <div style={{ height:14, background:'rgba(255,255,255,0.08)', borderRadius:6, width:'100%' }} />
    <div style={{ height:14, background:'rgba(255,255,255,0.08)', borderRadius:6, width:'80%' }} />
    <div style={{ height:12, background:'rgba(255,255,255,0.08)', borderRadius:6, width:80 }} />
  </div>
);

// ─── Stale Banner ─────────────────────────────────────────────────────────────
const StaleBanner = ({ category, date }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
    borderRadius: 10, padding: '10px 16px', marginBottom: 16,
    color: '#f59e0b', fontSize: 13, fontWeight: 500,
  }}>
    <span style={{ fontSize: 16 }}>⚠️</span>
    <span>No recent <strong>{category}</strong> updates — last update was <strong>{date}</strong></span>
  </div>
);

// ─── News Card ────────────────────────────────────────────────────────────────
const NewsCard = ({ item, index, stale, onClick, activeFilter }) => {
  const cat = item.category || 'General';
  const cs  = CATEGORY_STYLES[cat] || CATEGORY_STYLES.General;

  // Build tags and cap at 3 visible
  const allTags    = getItemTags(item);
  const visibleTags = allTags.slice(0, 3);
  const overflowCount = allTags.length - visibleTags.length;

  // A tag is "active" if its category matches the active filter pill
  const isFilterActive = activeFilter && activeFilter !== 'All';
  const activeCatTags  = isFilterActive ? (CATEGORY_TAGS[activeFilter] || []) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: stale ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      onClick={onClick}
      style={{
        background: '#111827',
        border: `1px ${stale ? 'dashed' : 'solid'} ${stale ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 12, padding: 20, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 0,
        transition: 'all 0.25s ease',
      }}
      whileHover={{ y: -4, boxShadow: '0 0 20px rgba(99,102,241,0.18)' }}
    >
      {/* Source + Category badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#818cf8' }}>
          <span style={{ fontSize: 15 }}>{item.source_icon}</span>{item.source}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          padding: '2px 8px', borderRadius: 99, border: `1px solid ${cs.border}`,
          background: cs.bg, color: cs.text, whiteSpace: 'nowrap',
        }}>{cat}</span>
      </div>

      {/* Title */}
      <p style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', lineHeight: 1.5, marginBottom: 14, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', flexGrow: 1 }}>
        {item.title}
      </p>

      {/* Company-type tags */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {visibleTags.map(tag => {
            const highlighted = isFilterActive && activeCatTags.includes(tag);
            return (
              <span key={tag} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 99,
                background: highlighted ? 'rgba(99,102,241,0.18)' : '#1E2433',
                border: `1px solid ${highlighted ? 'rgba(99,102,241,0.5)' : '#2D3748'}`,
                color: highlighted ? '#a5b4fc' : '#94A3B8',
                fontWeight: highlighted ? 600 : 400,
                transition: 'all 0.2s',
              }}>
                {tag}
              </span>
            );
          })}
          {overflowCount > 0 && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 99,
              background: '#1E2433', border: '1px solid #2D3748', color: '#64748b',
            }}>
              +{overflowCount} more
            </span>
          )}
        </div>
      )}

      {/* Date */}
      <p style={{ fontSize: 11, color: '#64748b', marginTop: 0 }}>{item.date}</p>
    </motion.div>
  );
};

// ─── Dots Loader ──────────────────────────────────────────────────────────────
const DotsLoader = () => {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '60px 0' }}>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.2)' }} />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#818cf8' }}
        />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔍</div>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500 }}>Analyzing regulatory update{dots}</p>
    </div>
  );
};

// ─── News Detail Modal ────────────────────────────────────────────────────────
const NewsDetailModal = ({ item, onClose, analysisCache }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const key = item.title;
    if (analysisCache.current.has(key)) {
      setAnalysis(analysisCache.current.get(key));
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(false);
    fetch(`${API_BASE}/news/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: item.title, link: item.link, source: item.source, category: item.category }),
    })
      .then(r => r.json())
      .then(data => {
        analysisCache.current.set(key, data);
        setAnalysis(data);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [item, analysisCache]);

  const sev = analysis?.severity || 'MEDIUM';
  const sc = SEVERITY_COLORS[sev] || SEVERITY_COLORS.MEDIUM;

  const SectionLabel = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 10px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px 16px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 680,
            maxHeight: '90vh', overflowY: 'auto',
            background: '#0d1117',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '28px 28px 24px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          }}
        >
          {/* ── Header row ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#818cf8' }}>
              <span style={{ fontSize: 18 }}>{item.source_icon}</span>{item.source}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {!loading && !fetchError && (
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '3px 10px', borderRadius: 99,
                  background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
                }}>{sev}</span>
              )}
              <button
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>
          </div>

          {/* ── Company-type tags ── */}
          {(() => {
            const tags = getItemTags(item);
            if (!tags.length) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {tags.map(tag => (
                  <span key={tag} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 99,
                    background: '#1E2433', border: '1px solid #2D3748',
                    color: '#94A3B8', fontWeight: 400,
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* ── Content ── */}
          {loading ? (
            <DotsLoader />
          ) : fetchError ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <p style={{ fontSize: 14, marginBottom: 20 }}>Couldn't analyze this article right now.</p>
              <a href={item.link} target="_blank" rel="noopener noreferrer"
                style={{ color: '#818cf8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                🔗 Read original article →
              </a>
            </div>
          ) : analysis && (
            <>
              {/* Rule name */}
              <div style={{ marginBottom: 6 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>📋 Rule Name</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>{analysis.rule_name}</p>
              </div>

              {/* What changed */}
              <SectionLabel>What Changed</SectionLabel>
              <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>{analysis.what_changed}</p>

              {/* VS Before (only if not null) */}
              {analysis.compared_to_before && (
                <>
                  <SectionLabel>VS Before</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#f87171', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Before</p>
                      <p style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>{analysis.compared_to_before}</p>
                    </div>
                    <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>After</p>
                      <p style={{ fontSize: 13, color: '#86efac', lineHeight: 1.6 }}>{analysis.what_changed}</p>
                    </div>
                  </div>
                </>
              )}

              {/* Who it hits */}
              <SectionLabel>Who It Hits</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: '12px 16px' }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>🎯</span>
                <p style={{ fontSize: 14, color: '#c7d2fe', lineHeight: 1.6 }}>{analysis.who_it_hits}</p>
              </div>

              {/* What to do */}
              <SectionLabel>What You Need To Do</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(analysis.what_to_do || []).map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ minWidth: 26, height: 26, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                    <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, paddingTop: 3 }}>{step}</p>
                  </div>
                ))}
              </div>

              {/* Deadline + Penalty cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 22 }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>📅 Deadline</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: analysis.deadline ? '#f1f5f9' : '#475569' }}>
                    {analysis.deadline || 'Not specified'}
                  </p>
                </div>
                <div style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 12, padding: '14px 16px' }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>⚠️ Penalty</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: analysis.penalty ? '#fca5a5' : '#475569' }}>
                    {analysis.penalty || 'Not specified'}
                  </p>
                </div>
              </div>

              {/* Footer actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <a
                  href={item.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#818cf8', textDecoration: 'none', padding: '8px 16px', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, transition: 'all 0.2s' }}
                >
                  🔗 Read full circular →
                </a>
                <button
                  onClick={onClose}
                  style={{ fontSize: 13, fontWeight: 600, color: '#64748b', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}
                >
                  ✕ Close
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const RegulatoryNews = () => {
  const [allItems, setAllItems]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState(null);
  const analysisCache                   = useRef(new Map());

  // Escape key to close modal
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelectedItem(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/news?limit=50`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setAllItems(data.items || []);
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  // ── Filtering logic ──────────────────────────────────────────────────────
  const liveItems = activeFilter === 'All'
    ? allItems
    : allItems.filter(i => i.category === activeFilter);

  // For stale fallback: find the most recent item ever for this category
  const staleItem = (activeFilter !== 'All' && liveItems.length === 0)
    ? (allItems.find(i => i.category === activeFilter) || null)
    : null;

  const isStale       = staleItem !== null;
  const itemsToShow   = liveItems.length > 0 ? liveItems : (staleItem ? [staleItem] : []);
  const visibleItems  = itemsToShow.slice(0, visibleCount);
  const hasMore       = visibleCount < itemsToShow.length;
  const totallyEmpty  = !loading && itemsToShow.length === 0;

  return (
    <section style={{ width: '100%', marginTop: 80, marginBottom: 32 }}>
      {/* ── Section header ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>📡 Live Regulatory Updates</h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4ade80', fontWeight: 600 }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#4ade80', opacity: 0.7, animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite' }} />
              <span style={{ position: 'relative', display: 'inline-flex', borderRadius: '50%', width: 8, height: 8, background: '#22c55e' }} />
            </span>
            Live
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
          {isStale ? `Showing last known ${activeFilter} update` : 'Showing recent regulatory updates'}
        </p>
      </div>

      {/* ── Filter pills ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => { setActiveFilter(cat); setVisibleCount(PAGE_SIZE); }}
            style={{
              padding: '6px 16px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s ease',
              background: activeFilter === cat ? '#4f46e5' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${activeFilter === cat ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
              color: activeFilter === cat ? '#fff' : '#94a3b8',
              boxShadow: activeFilter === cat ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
            }}
          >{cat}</button>
        ))}
      </div>

      {/* ── Stale banner ── */}
      {isStale && staleItem && (
        <StaleBanner category={activeFilter} date={staleItem.date} />
      )}

      {/* ── Grid ── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeletons" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
          </motion.div>
        ) : totallyEmpty ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', padding: '64px 0', color: '#475569' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ fontSize: 15, fontWeight: 500 }}>No {activeFilter === 'All' ? '' : activeFilter + ' '}updates found</p>
          </motion.div>
        ) : (
          <motion.div key="cards"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {visibleItems.map((item, idx) => (
              <NewsCard
                key={`${item.link}-${idx}`}
                item={item}
                index={idx}
                stale={isStale}
                activeFilter={activeFilter}
                onClick={() => setSelectedItem(item)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Load more ── */}
      {!loading && hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            style={{ padding: '10px 24px', fontSize: 13, fontWeight: 600, color: '#818cf8', background: 'transparent', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }}
          >Load More</button>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {selectedItem && (
        <NewsDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          analysisCache={analysisCache}
        />
      )}
    </section>
  );
};

export default RegulatoryNews;
