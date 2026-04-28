import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav className="w-full bg-[var(--color-brand-bg)] border-b border-[rgba(99,102,241,0.2)] pb-px relative z-50">
      <div className="absolute bottom-0 w-full h-[1px] glow-primary"></div>
      <div className="max-w-7xl mx-auto px-6 h-16 relative flex items-center justify-center">
        <Link to="/" className="font-bold text-2xl text-white tracking-wider hover:opacity-80 transition-opacity absolute left-1/2 -translate-x-1/2">
          ComplianceX
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
