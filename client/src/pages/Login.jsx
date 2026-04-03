import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import loginVideo from '../assets/regi.mp4';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const rafLoop = () => {
      if (!vid.duration || isNaN(vid.duration)) {
        rafRef.current = requestAnimationFrame(rafLoop);
        return;
      }
      const t = vid.currentTime;
      const d = vid.duration;
      const fadeIn = 0.5;
      const fadeOut = 0.5;
      let op = 1;
      if (t < fadeIn) op = t / fadeIn;
      else if (t > d - fadeOut) op = (d - t) / fadeOut;
      vid.style.opacity = Math.max(0, Math.min(1, op));
      rafRef.current = requestAnimationFrame(rafLoop);
    };

    const onCanPlay = () => {
      vid.play().catch(() => { });
      rafRef.current = requestAnimationFrame(rafLoop);
    };

    const onEnded = () => {
      vid.style.opacity = 0;
      setTimeout(() => {
        vid.currentTime = 0;
        vid.play().catch(() => { });
      }, 100);
    };

    vid.addEventListener('canplay', onCanPlay);
    vid.addEventListener('ended', onEnded);
    return () => {
      vid.removeEventListener('canplay', onCanPlay);
      vid.removeEventListener('ended', onEnded);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      if (mode === 'login') {
        await login(email, form.password);
      } else {
        await register(form.username.trim(), email, form.password);
      }
      toast.success(mode === 'login' ? 'Access granted' : 'Account created');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        /* ── PAGE ── */
        .sl-page {
          min-height: 100vh;
          background: #41431B;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          font-family: 'DM Sans', sans-serif;
        }

        /* ── VIDEO ── */
        .sl-video-wrap {
          position: absolute;
          inset: 0;
          z-index: 0;
          overflow: hidden;
        }
        .sl-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
        }
        .sl-grad-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(65,67,27,0.52) 0%,
            rgba(65,67,27,0.32) 50%,
            rgba(65,67,27,0.52) 100%
          );
          pointer-events: none;
        }

        /* ── BG DECORATIONS ── */
        .sl-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(174,183,132,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(174,183,132,0.05) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 1;
        }
        .sl-corner {
          position: absolute;
          width: 200px;
          height: 200px;
          pointer-events: none;
          z-index: 1;
        }
        .sl-corner-tl {
          top: 0; left: 0;
          border-right: 1px solid rgba(174,183,132,0.1);
          border-bottom: 1px solid rgba(174,183,132,0.1);
          border-radius: 0 0 100% 0;
        }
        .sl-corner-br {
          bottom: 0; right: 0;
          border-left: 1px solid rgba(174,183,132,0.1);
          border-top: 1px solid rgba(174,183,132,0.1);
          border-radius: 100% 0 0 0;
        }

        /* ── CORNER LABELS ── */
        .sl-label-tr {
          position: absolute;
          top: 28px; right: 32px;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(174,183,132,0.35);
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 7px;
        }
        .sl-label-tr::before {
          content: '';
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #AEB784;
          animation: sl-pulse 2.2s infinite;
        }

        /* ── CENTER WRAP ── */
        .sl-center {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          max-width: 420px;
          padding: 24px 20px;
          animation: sl-rise 0.9s cubic-bezier(0.16,1,0.3,1) both;
        }

        /* ── BRAND MARK ── */
        .sl-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-bottom: 30px;
          animation: sl-rise 0.9s cubic-bezier(0.16,1,0.3,1) 0.05s both;
        }
        .sl-sigil svg {
          width: 52px;
          height: 52px;
          display: block;
          filter: drop-shadow(0 0 12px rgba(174,183,132,0.45));
        }
        .sl-brand-name {
          font-family: 'Playfair Display', serif;
          font-size: 52px;
          font-weight: 500;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-top: 4px;
        }
        .sl-brand-name .r1 { color: #F8F3E1; }
        .sl-brand-name .r2 { color: #AEB784; }
        .sl-brand-name .r3 { color: #E3DBBB; }
        .sl-brand-name .r4 { color: #F8F3E1; }
        .sl-brand-name .r5 { color: #AEB784; }
        .sl-brand-name .r6 { color: #E3DBBB; }
        .sl-brand-name .r7 { color: #F8F3E1; }
        .sl-brand-name sup {
          font-size: 11px;
          opacity: 0.35;
          vertical-align: super;
          margin-left: 2px;
          font-family: 'DM Sans', sans-serif;
        }
        .sl-tagline {
          font-family: 'Playfair Display', serif;
          font-size: 15px;
          font-style: italic;
          font-weight: 400;
          letter-spacing: 0.04em;
          text-align: center;
          line-height: 1.5;
          margin-top: 2px;
        }
        .sl-tagline .tg1 {
          color: #AEB784;
          font-weight: 500;
        }
        .sl-tagline .tg2 {
          color: rgba(227,219,187,0.7);
        }
        .sl-tagline .tg3 {
          color: #F8F3E1;
          font-weight: 500;
        }

        /* ── CARD ── */
        .sl-card {
          width: 100%;
          background: #F8F3E1;
          border-radius: 20px;
          padding: 36px 32px 28px;
          position: relative;
          overflow: hidden;
          animation: sl-rise 0.9s cubic-bezier(0.16,1,0.3,1) 0.12s both;
        }
        .sl-card::before {
          content: '';
          position: absolute;
          top: -50px; right: -50px;
          width: 180px; height: 180px;
          border-radius: 50%;
          background: rgba(174,183,132,0.1);
          pointer-events: none;
        }

        /* ── TABS ── */
        .sl-tabs {
          display: flex;
          background: rgba(65,67,27,0.07);
          border-radius: 10px;
          margin-bottom: 24px;
          padding: 3px;
          gap: 3px;
        }
        .sl-tab {
          flex: 1;
          padding: 9px;
          background: none;
          border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(65,67,27,0.38);
          cursor: pointer;
          border-radius: 7px;
          transition: all 0.22s;
        }
        .sl-tab.active {
          background: #41431B;
          color: #E3DBBB;
        }
        .sl-tab:hover:not(.active) { color: #41431B; }

        /* ── CARD HEADER ── */
        .sl-card-eyebrow {
          font-size: 10px;
          font-weight: 500;
          color: #AEB784;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin: 0 0 8px;
        }
        .sl-card-title {
          font-family: 'Playfair Display', serif;
          font-size: 28px;
          font-weight: 400;
          color: #41431B;
          margin: 0 0 4px;
          letter-spacing: -0.02em;
        }
        .sl-card-sub {
          font-size: 13px;
          color: rgba(65,67,27,0.42);
          margin: 0 0 24px;
        }

        /* ── INPUTS ── */
        .sl-label {
          display: block;
          font-family: 'DM Sans', sans-serif;
          font-size: 10px;
          font-weight: 500;
          color: rgba(65,67,27,0.48);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-bottom: 7px;
        }
        .sl-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(65,67,27,0.04);
          border: 1.5px solid rgba(65,67,27,0.12);
          border-radius: 10px;
          color: #41431B;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          padding: 11px 14px;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          letter-spacing: 0.01em;
        }
        .sl-input:focus {
          border-color: #AEB784;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(174,183,132,0.2);
        }
        .sl-input::placeholder { color: rgba(65,67,27,0.22); }

        /* ── BUTTON ── */
        .sl-btn {
          width: 100%;
          padding: 14px;
          background: #41431B;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #E3DBBB;
          cursor: pointer;
          transition: transform 0.18s, background 0.18s;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }
        .sl-btn:hover {
          transform: scale(1.015);
          background: #555828;
        }
        .sl-btn:active { transform: scale(0.99); }
        .sl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── CARD FOOTER ── */
        .sl-note {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          color: rgba(65,67,27,0.38);
          text-align: center;
          margin-top: 14px;
          letter-spacing: 0.03em;
        }
        .sl-note span {
          color: #41431B;
          font-weight: 500;
        }
        .sl-status {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid rgba(65,67,27,0.08);
        }
        .sl-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: #AEB784;
          animation: sl-pulse 2.2s infinite;
          flex-shrink: 0;
        }
        .sl-status-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px;
          color: rgba(65,67,27,0.38);
          letter-spacing: 0.04em;
        }

        /* ── ANIMATIONS ── */
        @keyframes sl-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 480px) {
          .sl-card { padding: 28px 22px 22px; }
          .sl-center { padding: 20px 16px; }
        }
      `}</style>

      <div className="sl-page">

        {/* ── Video Background ── */}
        <div className="sl-video-wrap">
          <video
            ref={videoRef}
            className="sl-video"
            muted
            playsInline
            autoPlay
            loop
          >
            <source src={loginVideo} type="video/mp4" />
          </video>
          <div className="sl-grad-overlay" />
        </div>

        {/* ── BG Decorations ── */}
        <div className="sl-grid" />
        <div className="sl-corner sl-corner-tl" />
        <div className="sl-corner sl-corner-br" />

        {/* ── Corner Labels ── */}
        <span className="sl-label-tr">Secure</span>

        {/* ── Centered Content ── */}
        <div className="sl-center">

          {/* Brand Mark */}
          <div className="sl-brand">
            <div className="sl-sigil">
              <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="22,4 40,14 40,30 22,40 4,30 4,14" stroke="#AEB784" strokeWidth="1.2" fill="rgba(174,183,132,0.07)" />
                <polygon points="22,10 35,17 35,27 22,34 9,27 9,17" stroke="rgba(174,183,132,0.3)" strokeWidth="0.7" fill="none" />
                <circle cx="22" cy="22" r="4" fill="#AEB784" />
                <line x1="22" y1="10" x2="22" y2="17" stroke="#AEB784" strokeWidth="0.8" />
                <line x1="22" y1="27" x2="22" y2="34" stroke="#AEB784" strokeWidth="0.8" />
                <line x1="9" y1="17" x2="15.5" y2="20.5" stroke="#AEB784" strokeWidth="0.8" />
                <line x1="28.5" y1="23.5" x2="35" y2="27" stroke="#AEB784" strokeWidth="0.8" />
                <line x1="9" y1="27" x2="15.5" y2="23.5" stroke="#AEB784" strokeWidth="0.8" />
                <line x1="28.5" y1="20.5" x2="35" y2="17" stroke="#AEB784" strokeWidth="0.8" />
              </svg>
            </div>
            <span className="sl-brand-name">
              <span className="r1">R</span><span className="r2">e</span><span className="r3">g</span><span className="r4">i</span><span className="r5">m</span><span className="r6">e</span><span className="r7">n</span><span className="r2">t</span><sup>®</sup>
            </span>
            <span className="sl-tagline">
              <span className="tg1">Guard the mission.</span>
              <span className="tg2"> · </span>
              <span className="tg3">Own the dark.</span>
            </span>
          </div>

          {/* Card */}
          <div className="sl-card">

            {/* Tabs */}
            <div className="sl-tabs">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`sl-tab${mode === m ? ' active' : ''}`}
                >
                  {m === 'login' ? 'Sign In' : 'Register'}
                </button>
              ))}
            </div>

            <p className="sl-card-eyebrow">Operator Access</p>
            <p className="sl-card-title">
              {mode === 'login' ? 'Welcome back.' : 'Join the unit.'}
            </p>
            <p className="sl-card-sub">
              {mode === 'login'
                ? 'Sign in to your operator account'
                : 'Create your operator account'}
            </p>

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {mode === 'register' && (
                <div>
                  <label className="sl-label">Username</label>
                  <input
                    className="sl-input"
                    type="text"
                    placeholder="operator_01"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    minLength={3}
                  />
                </div>
              )}
              <div>
                <label className="sl-label">Email Address</label>
                <input
                  className="sl-input"
                  type="email"
                  placeholder="analyst@sentinelops.mil"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                  required
                />
              </div>
              <div>
                <label className="sl-label">Password</label>
                <input
                  className="sl-input"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={8}
                />
              </div>
              <button type="submit" disabled={loading} className="sl-btn">
                <span>
                  {loading
                    ? '⟳ Authenticating...'
                    : mode === 'login'
                      ? 'Authenticate'
                      : 'Create Account'}
                </span>
                {!loading && <span style={{ fontSize: 16 }}>→</span>}
              </button>
            </form>

            {mode === 'register' && (
              <p className="sl-note">
                First registered user receives <span>admin</span> clearance
              </p>
            )}

            <div className="sl-status">
              <div className="sl-dot" />
              <span className="sl-status-text">Secure channel established · AES-256</span>
            </div>

          </div>

        </div>
      </div>
    </>
  );
}
