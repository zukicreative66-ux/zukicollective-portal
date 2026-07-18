import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, ArrowRight, Lock } from 'lucide-react';
import { logoZuki } from '../utils/assets';

interface AcceptInviteViewProps {
  accessToken: string;
  onInviteAccepted: (user: any, token: string) => void;
}

export default function AcceptInviteView({ accessToken, onInviteAccepted }: AcceptInviteViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  // Debounced username availability check
  useEffect(() => {
    if (!username || username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setUsernameAvailable(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(username)}`);
        const data = await res.json();
        setUsernameAvailable(data.available);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      setError('Username must be 3–30 characters using letters, numbers, or underscores only.');
      return;
    }
    if (usernameAvailable === false) {
      setError('That username is already taken. Please choose a different one.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account setup failed.');

      // Clear invite hash from URL bar
      window.history.replaceState(null, '', window.location.pathname);

      localStorage.setItem('itp_token', data.token);
      onInviteAccepted(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-brown flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center text-center">
          <img src={logoZuki} alt="Zuki" className="h-14 object-contain mb-4" />
          <h1 className="text-2xl font-serif font-bold text-brand-peach">Set Up Your Account</h1>
          <p className="text-sm text-brand-cream/60 mt-2 leading-relaxed max-w-xs">
            You've been invited to the Zuki Creatives Portal. Choose a username and password to activate your account.
          </p>
        </div>

        <div className="bg-brand-brown-card border border-brand-peach/15 rounded-3xl p-8 shadow-2xl shadow-black/60 space-y-5">
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-brand-peach/60 mb-1.5">
                Choose a Username
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-peach/40 font-mono text-sm">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. jane_va"
                  maxLength={30}
                  className="w-full pl-8 pr-10 py-3 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream placeholder:text-brand-peach/25 focus:outline-none focus:ring-2 focus:ring-brand-peach/20 focus:border-brand-peach/40 font-mono"
                />
                {username.length >= 3 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checkingUsername ? (
                      <span className="text-brand-peach/30 font-mono text-[10px]">…</span>
                    ) : usernameAvailable === true ? (
                      <CheckCircle2 size={15} className="text-emerald-400" />
                    ) : usernameAvailable === false ? (
                      <AlertCircle size={15} className="text-rose-400" />
                    ) : null}
                  </div>
                )}
              </div>
              {username.length >= 3 && !checkingUsername && usernameAvailable !== null && (
                <p className={`text-[10px] font-mono mt-1.5 ${usernameAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {usernameAvailable ? '✓ Username is available' : '✗ Username already taken — choose another'}
                </p>
              )}
              <p className="text-[10px] text-brand-cream/35 font-mono mt-1.5">Letters, numbers, underscores · 3–30 characters</p>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-brand-peach/60 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-peach/40" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 py-3 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream placeholder:text-brand-peach/25 focus:outline-none focus:ring-2 focus:ring-brand-peach/20 focus:border-brand-peach/40"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-brand-peach/60 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-peach/40" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-9 py-3 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream placeholder:text-brand-peach/25 focus:outline-none focus:ring-2 focus:ring-brand-peach/20 focus:border-brand-peach/40"
                />
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-[10px] font-mono mt-1.5 text-rose-400">✗ Passwords do not match</p>
              )}
              {confirmPassword.length > 0 && password === confirmPassword && password.length >= 6 && (
                <p className="text-[10px] font-mono mt-1.5 text-emerald-400">✓ Passwords match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || usernameAvailable === false || !accessToken}
              className="w-full py-3.5 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-brand-peach/10"
            >
              {isLoading ? 'Activating your account…' : (
                <> Activate Account <ArrowRight size={15} /> </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-brand-cream/30 font-mono">
          Zuki Creatives VA Portal &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
