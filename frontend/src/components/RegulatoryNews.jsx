import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:8000';

const CATEGORIES = ['All', 'GST', 'Corporate', 'Tax', 'Securities', 'General'];

const CATEGORY_STYLES = {
  GST:        { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20' },
  Securities: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  Tax:        { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  Corporate:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  General:    { bg: 'bg-gray-500/10',   text: 'text-gray-400',   border: 'border-gray-500/20'  },
};

const PAGE_SIZE = 6;

// ─── Skeleton Card ──────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="bg-[#111827] border border-white/5 rounded-xl p-5 space-y-3 animate-pulse">
    <div className="flex justify-between items-start">
      <div className="h-4 bg-white/10 rounded w-24" />
      <div className="h-5 bg-white/10 rounded w-16" />
    </div>
    <div className="space-y-2">
      <div className="h-4 bg-white/10 rounded w-full" />
      <div className="h-4 bg-white/10 rounded w-4/5" />
    </div>
    <div className="h-3 bg-white/10 rounded w-20 mt-2" />
  </div>
);

// ─── News Card ───────────────────────────────────────────────────────────────
const NewsCard = ({ item, index }) => {
  const catStyle = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.General;

  return (
    <motion.a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      className={[
        'group block bg-[#111827] border border-white/5 rounded-xl p-5 cursor-pointer',
        'transition-all duration-300',
        'hover:-translate-y-1 hover:border-indigo-500/40 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]',
      ].join(' ')}
    >
      {/* Top row */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
          <span className="text-base">{item.source_icon}</span>
          {item.source}
        </span>
        <span
          className={[
            'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
            catStyle.bg, catStyle.text, catStyle.border,
          ].join(' ')}
        >
          {item.category}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-100 leading-snug line-clamp-2 mb-3 group-hover:text-white transition-colors">
        {item.title}
      </p>

      {/* Date */}
      <p className="text-xs text-gray-500">{item.date}</p>
    </motion.a>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const RegulatoryNews = () => {
  const [allItems, setAllItems]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const fetchNews = useCallback(async (category) => {
    setLoading(true);
    setVisibleCount(PAGE_SIZE);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (category !== 'All') params.set('category', category);
      const res = await fetch(`${API_BASE}/news?${params.toString()}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setAllItems(data.items || []);
    } catch {
      setAllItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(activeFilter);
  }, [activeFilter, fetchNews]);

  const visibleItems = allItems.slice(0, visibleCount);
  const hasMore = visibleCount < allItems.length;

  return (
    <section className="w-full mt-20 mb-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">📡 Live Regulatory Updates</h2>
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </span>
        </div>
        <p className="text-sm text-gray-500">Showing recent regulatory updates</p>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={[
              'px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200',
              activeFilter === cat
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                : 'bg-white/5 border-white/10 text-gray-400 hover:border-indigo-500/50 hover:text-gray-200',
            ].join(' ')}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeletons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </motion.div>
        ) : allItems.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 text-gray-500"
          >
            No updates found for this category.
          </motion.div>
        ) : (
          <motion.div
            key="cards"
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {visibleItems.map((item, idx) => (
              <NewsCard key={`${item.link}-${idx}`} item={item} index={idx} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load More */}
      {!loading && hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            className="px-6 py-2.5 text-sm font-semibold text-indigo-300 border border-indigo-500/30 rounded-xl hover:bg-indigo-500/10 hover:border-indigo-500/60 transition-all duration-200"
          >
            Load More
          </button>
        </div>
      )}
    </section>
  );
};

export default RegulatoryNews;
