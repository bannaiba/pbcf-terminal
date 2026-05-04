import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import FundOverview from './pages/FundOverview';
import PerformanceDashboard from './pages/PerformanceDashboard';
import './styles/global.css';

const Navigation = () => {
  return (
    <nav className="glass-panel" style={navStyle}>
      <div className="logo" style={logoStyle}>
        <div className="logo-shape"></div>
        <span style={{ fontWeight: 600, letterSpacing: '1px' }}>PBCF</span>
      </div>
      <div className="nav-links" style={navLinksStyle}>
        <NavLink 
          to="/" 
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
          end
        >
          Fund Overview
        </NavLink>
        <NavLink 
          to="/dashboard" 
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Performance Dashboard
        </NavLink>
      </div>
    </nav>
  );
};

const navStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '8px 24px',
  margin: '24px auto',
  width: 'fit-content',
  borderRadius: '100px', // pill shape
  position: 'sticky',
  top: '24px',
  zIndex: 100,
  gap: '32px'
};

const logoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '1.1rem',
  borderRight: '1px solid rgba(255,255,255,0.1)',
  paddingRight: '24px'
};

const navLinksStyle = {
  display: 'flex',
  gap: '8px'
};

const linkStyle = {
  padding: '8px 16px',
  borderRadius: '100px',
  transition: 'var(--transition-fast)',
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
  fontSize: '0.9rem'
};

const activeLinkStyle = {
  background: 'rgba(255, 255, 255, 0.1)',
  color: 'var(--color-text-primary)'
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navigation />
        <main className="container" style={{ flex: 1, paddingBottom: '64px' }}>
          <Routes>
            <Route path="/" element={<FundOverview />} />
            <Route path="/dashboard" element={<PerformanceDashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
