import React, { useState, useEffect } from 'react';
import { User, TimeLog } from './types';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import TimeTrackerView from './components/TimeTrackerView';
import SettingsView from './components/SettingsView';
import AdminPanel from './components/AdminPanel';
import { Shield, Clock, Key, AlertCircle, Mail, Lock, HelpCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { logoZuki } from './utils/assets';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('itp_token'));
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<TimeLog[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Login states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Password reset states
  const [resetMode, setResetMode] = useState<'none' | 'request' | 'verify'>('none');
  const [resetUsernameOrEmail, setResetUsernameOrEmail] = useState('');
  const [resetUsername, setResetUsername] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [loginSuccessMessage, setLoginSuccessMessage] = useState('');

  // 1. Initial auth check on mount
  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = localStorage.getItem('itp_token');
      if (!storedToken) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const response = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${storedToken}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          setUser(userData);
          setToken(storedToken);
          setActiveTab(userData.role === 'admin' ? 'admin' : 'dashboard');
        } else {
          // Token expired or invalid
          localStorage.removeItem('itp_token');
          setToken(null);
        }
      } catch (err) {
        console.error('Error verifying existing token:', err);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, []);

  // 2. Fetch logs once authenticated
  const fetchLogs = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/logs', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const logsData = await response.json();
        setLogs(logsData);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  useEffect(() => {
    if (user && token) {
      fetchLogs();
      // Poll logs every 15 seconds to sync timer states and changes smoothly
      const interval = setInterval(fetchLogs, 15000);
      return () => clearInterval(interval);
    }
  }, [user, token]);

  // 3. Login Submit Action
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError('Both username and password are required.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Invalid credentials');
      }

      const data = await response.json();
      localStorage.setItem('itp_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setActiveTab(data.user.role === 'admin' ? 'admin' : 'dashboard');
    } catch (err: any) {
      setLoginError(err.message || 'Server connection failed.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 4. Logout Action
  const handleLogout = () => {
    localStorage.removeItem('itp_token');
    setToken(null);
    setUser(null);
    setLogs([]);
    setUsername('');
    setPassword('');
    setLoginError('');
    setLoginSuccessMessage('');
  };

  // 4.1 Forgot Password Request
  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUsernameOrEmail.trim()) {
      setResetErrorMessage('Please enter your username or email address.');
      return;
    }

    setIsResetLoading(true);
    setResetErrorMessage('');
    setResetSuccessMessage('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: resetUsernameOrEmail.trim() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to trigger password reset request.');
      }

      const data = await response.json();
      setResetUsername(data.username);
      setMaskedEmail(data.email || 'your registered Gmail');
      setResetSuccessMessage(data.message);
      setResetMode('verify');
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Error processing reset request.');
    } finally {
      setIsResetLoading(false);
    }
  };

  // 4.2 Submit Reset Password with OTP
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !newPassword.trim()) {
      setResetErrorMessage('Both verification code and new password are required.');
      return;
    }

    if (newPassword.length < 6) {
      setResetErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setIsResetLoading(true);
    setResetErrorMessage('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: resetUsername,
          otp: resetCode.trim(),
          newPassword: newPassword.trim(),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update your password.');
      }

      const data = await response.json();
      setLoginSuccessMessage(data.message);
      setLoginError('');
      setResetMode('none');
      setResetUsernameOrEmail('');
      setResetUsername('');
      setResetCode('');
      setNewPassword('');
    } catch (err: any) {
      setResetErrorMessage(err.message || 'Error updating password.');
    } finally {
      setIsResetLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen w-screen bg-brand-brown flex flex-col items-center justify-center font-sans">
        <div className="h-14 w-14 rounded-2xl bg-brand-brown-card border border-brand-peach/20 flex items-center justify-center text-brand-peach font-serif italic font-bold text-2xl animate-pulse shadow-2xl">
          Z
        </div>
        <p className="text-xs text-brand-peach/60 font-mono mt-4 tracking-wider uppercase">Authenticating Portal Session...</p>
      </div>
    );
  }

  // Logged-Out Login Screen
  if (!user || !token) {
    return (
      <div className="min-h-screen bg-brand-brown flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-brand-peach/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-brand-peach/5 blur-3xl pointer-events-none" />

        <div className="w-full max-w-md z-10 space-y-6">
          {/* Logo Heading */}
          <div className="text-center flex flex-col items-center">
            <div className="flex items-center justify-center mb-4">
              <img 
                src={logoZuki} 
                alt="Zuki Logo" 
                referrerPolicy="no-referrer"
                className="h-[165px] w-[177px] object-contain"
              />
            </div>
            <h1 className="h-[65px] w-[262.594px] text-[41px] font-serif font-bold tracking-tight text-brand-peach flex items-center justify-center mx-auto">Zuki Creatives</h1>
            <p className="h-[28px] w-[192px] text-[13px] text-brand-peach/60 mt-1.5 font-mono uppercase tracking-widest flex items-center justify-center mx-auto">Internal Team Portal</p>
          </div>

          {/* Form Card Container */}
          <div className="bg-brand-brown-card/80 backdrop-blur-md p-8 rounded-3xl border border-brand-peach/10 shadow-2xl shadow-black/80 space-y-6">
            
            {resetMode === 'none' && (
              <>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-brand-cream tracking-tight">Sign In</h2>
                  <p className="text-xs text-brand-peach/70">Provide your designated team credentials to access the console.</p>
                </div>

                {loginSuccessMessage && (
                  <div className="flex items-start space-x-2.5 p-3.5 bg-brand-peach/10 border border-brand-peach/20 text-brand-peach rounded-xl text-xs">
                    <CheckCircle2 size={16} className="shrink-0 text-brand-peach mt-0.5" />
                    <span>{loginSuccessMessage}</span>
                  </div>
                )}

                {loginError && (
                  <div className="flex items-center space-x-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-medium">
                    <AlertCircle size={15} className="shrink-0 text-rose-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-peach/40">
                        <Shield size={14} />
                      </div>
                      <input
                        id="input-username"
                        type="text"
                        required
                        disabled={isLoggingIn}
                        placeholder="zuki_dev"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-brand-brown/40 border border-brand-peach/10 focus:border-brand-peach/50 text-brand-cream text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 placeholder:text-brand-peach/30 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetMode('request');
                          setResetErrorMessage('');
                          setResetSuccessMessage('');
                          setLoginSuccessMessage('');
                        }}
                        className="text-[10px] font-mono text-brand-peach/60 hover:text-brand-peach transition-all cursor-pointer hover:underline"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-peach/40">
                        <Key size={14} />
                      </div>
                      <input
                        id="input-password"
                        type="password"
                        required
                        disabled={isLoggingIn}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-brand-brown/40 border border-brand-peach/10 focus:border-brand-peach/50 text-brand-cream text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 placeholder:text-brand-peach/30 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <button
                    id="btn-login-submit"
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-peach/10 cursor-pointer"
                  >
                    {isLoggingIn ? 'Verifying Authorization...' : 'Unlock Portal'}
                  </button>
                </form>
              </>
            )}

            {resetMode === 'request' && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setResetMode('none')}
                      className="p-1.5 text-brand-peach/60 hover:text-brand-peach bg-brand-brown/30 hover:bg-brand-brown/60 border border-brand-peach/10 rounded-lg transition-all cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <h2 className="text-xl font-bold text-brand-cream tracking-tight">Reset Password</h2>
                  </div>
                  <p className="text-xs text-brand-peach/70">Enter your VA username or registered email address to receive a 6-digit verification code sent from our agency email.</p>
                </div>

                {resetErrorMessage && (
                  <div className="flex items-center space-x-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-medium">
                    <AlertCircle size={15} className="shrink-0 text-rose-400" />
                    <span>{resetErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">
                      Username or Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-peach/40">
                        <Mail size={14} />
                      </div>
                      <input
                        type="text"
                        required
                        disabled={isResetLoading}
                        placeholder="e.g. va_member"
                        value={resetUsernameOrEmail}
                        onChange={(e) => setResetUsernameOrEmail(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-brand-brown/40 border border-brand-peach/10 focus:border-brand-peach/50 text-brand-cream text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 placeholder:text-brand-peach/30 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isResetLoading}
                    className="w-full py-3 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-peach/10 cursor-pointer"
                  >
                    {isResetLoading ? 'Sending Reset Code...' : 'Send Verification Code'}
                  </button>
                </form>
              </>
            )}

            {resetMode === 'verify' && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setResetMode('request')}
                      className="p-1.5 text-brand-peach/60 hover:text-brand-peach bg-brand-brown/30 hover:bg-brand-brown/60 border border-brand-peach/10 rounded-lg transition-all cursor-pointer"
                    >
                      <ArrowLeft size={14} />
                    </button>
                    <h2 className="text-xl font-bold text-brand-cream tracking-tight">Verify Reset</h2>
                  </div>
                  <p className="text-xs text-brand-cream/80 leading-normal">
                    A 6-digit verification code has been dispatched to <strong className="text-brand-peach">{maskedEmail}</strong>. Please retrieve it from your inbox.
                  </p>
                </div>

                {resetSuccessMessage && (
                  <div className="p-3 bg-brand-peach/10 border border-brand-peach/20 text-brand-peach rounded-xl text-[11px] leading-relaxed">
                    {resetSuccessMessage}
                  </div>
                )}

                {resetErrorMessage && (
                  <div className="flex items-center space-x-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-medium">
                    <AlertCircle size={15} className="shrink-0 text-rose-400" />
                    <span>{resetErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">
                      Verification Code (6-Digits)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-peach/40">
                        <CheckCircle2 size={14} />
                      </div>
                      <input
                        type="text"
                        required
                        disabled={isResetLoading}
                        maxLength={6}
                        placeholder="123456"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-9 pr-4 py-2.5 bg-brand-brown/40 border border-brand-peach/10 focus:border-brand-peach/50 text-brand-cream text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 placeholder:text-brand-peach/30 transition-all font-mono tracking-[4px] font-bold text-center"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-brand-peach/40">
                        <Lock size={14} />
                      </div>
                      <input
                        type="password"
                        required
                        disabled={isResetLoading}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-brand-brown/40 border border-brand-peach/10 focus:border-brand-peach/50 text-brand-cream text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 placeholder:text-brand-peach/30 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isResetLoading}
                    className="w-full py-3 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-peach/10 cursor-pointer"
                  >
                    {isResetLoading ? 'Updating Password...' : 'Complete Password Reset'}
                  </button>
                </form>
              </>
            )}

          </div>
        </div>
      </div>
    );
  }

  // Logged-In Layout
  return (
    <div className="min-h-screen bg-brand-brown flex font-sans text-brand-cream">
      {/* Sidebar Navigation */}
      <Sidebar 
        user={user} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
      />

      {/* Main View Area */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeTab === 'dashboard' && (
          <DashboardView 
            user={user} 
            logs={logs} 
            onNavigateToTracker={() => setActiveTab('tracker')} 
          />
        )}
        {activeTab === 'tracker' && (
          <TimeTrackerView 
            user={user} 
            logs={logs} 
            onRefreshLogs={fetchLogs} 
            token={token} 
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView user={user} onUserUpdate={(updatedUser) => setUser(updatedUser)} token={token} />
        )}
        {activeTab === 'admin' && user.role === 'admin' && (
          <AdminPanel 
            user={user} 
            logs={logs} 
            onRefreshLogs={fetchLogs} 
            token={token} 
          />
        )}
      </main>
    </div>
  );
}
