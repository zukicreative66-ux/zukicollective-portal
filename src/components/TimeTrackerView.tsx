import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Clock, Play, Square, AlertCircle, FileText, CheckCircle2, Trash2, Plus, Kanban, ArrowRight } from 'lucide-react';
import { User, TimeLog } from '../types';
import ProjectTracker from './ProjectTracker';

interface TimeTrackerViewProps {
  user: User;
  logs: TimeLog[];
  onRefreshLogs: () => void;
  token: string;
}

export default function TimeTrackerView({ user, logs, onRefreshLogs, token }: TimeTrackerViewProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Tab within tracker view
  const [subTab, setSubTab] = useState<'tracker' | 'project'>('tracker');

  // Manual log form states
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualHours, setManualHours] = useState('');
  const [manualMinutes, setManualMinutes] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const activeLog = useMemo(
    () => logs.find((l) => l.userId === user.id && !l.endTime) || null,
    [logs, user.id]
  );

  const userLogs = useMemo(
    () => logs.filter((l) => l.userId === user.id),
    [logs, user.id]
  );

  useEffect(() => {
    if (activeLog) {
      const calculateElapsed = () => {
        const start = new Date(activeLog.startTime).getTime();
        const now = Date.now();
        const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
        setElapsedSeconds(diffSecs);
      };

      calculateElapsed();
      timerRef.current = setInterval(calculateElapsed, 1000);
    } else {
      setElapsedSeconds(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeLog]);

  // Formatter for seconds -> HH:MM:SS
  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 1. Clock In Action
  const handleClockIn = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startTime: new Date().toISOString(),
          description: '',
          isManual: false,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to clock in');
      }

      setSuccessMessage('Successfully clocked in. Shift timer started!');
      onRefreshLogs();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred during clock-in');
    } finally {
      setIsSubmitting(false);
    }
  }, [token, onRefreshLogs]);

  // 2. Clock Out Action
  const handleClockOut = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage('Please describe the work/tasks completed during this shift before clocking out.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const response = await fetch('/api/logs/clock-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ description }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to clock out');
      }

      setSuccessMessage('Shift logged successfully! Great work.');
      setDescription('');
      onRefreshLogs();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred during clock-out');
    } finally {
      setIsSubmitting(false);
    }
  }, [description, token, onRefreshLogs]);

  // 3. Submit Manual Log Action
  const handleManualSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const hours = parseInt(manualHours) || 0;
    const mins = parseInt(manualMinutes) || 0;
    const totalMins = hours * 60 + mins;

    if (totalMins <= 0) {
      setErrorMessage('Please specify a positive log duration (hours or minutes).');
      return;
    }
    if (!manualDescription.trim()) {
      setErrorMessage('Please describe the task details.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const end = new Date(manualDate + 'T17:00:00');
      const start = new Date(end.getTime() - totalMins * 60000);

      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          description: manualDescription,
          isManual: true,
          durationMinutes: totalMins,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to submit manual log');
      }

      setSuccessMessage('Manual log recorded successfully!');
      setManualHours('');
      setManualMinutes('');
      setManualDescription('');
      setShowManualForm(false);
      onRefreshLogs();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred during submission');
    } finally {
      setIsSubmitting(false);
    }
  }, [manualDate, manualDescription, manualHours, manualMinutes, token, onRefreshLogs]);

  // 4. Delete Log Action
  const handleDeleteLog = useCallback(async (logId: string) => {
    if (!confirm('Are you sure you want to delete this time log record?')) return;
    try {
      const response = await fetch(`/api/logs/${logId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete');
      }
      setSuccessMessage('Log record deleted successfully.');
      onRefreshLogs();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  }, [token, onRefreshLogs]);

  const isLate = useMemo(() => {
    if (!user.scheduleStart || user.role === 'admin') return false;

    const todayStr = new Date().toISOString().split('T')[0];
    const loggedToday = userLogs.some(log => log.startTime.startsWith(todayStr));
    if (loggedToday) return false;

    const [schedHour, schedMin] = user.scheduleStart.split(':').map(Number);
    const now = new Date();
    const schedMinutes = schedHour * 60 + schedMin;
    const currMinutes = now.getHours() * 60 + now.getMinutes();

    return currMinutes > schedMinutes + 5;
  }, [user.scheduleStart, user.role, userLogs]);

  return (
    <div className="space-y-8 animate-fade-in text-brand-cream">
      {/* Sub-tab Navigation Bar */}
      <div className="flex border-b border-brand-peach/10 pb-1 gap-2">
        <button
          onClick={() => setSubTab('tracker')}
          className={`px-5 py-3 text-sm font-semibold transition-all rounded-t-xl cursor-pointer flex items-center gap-2 ${
            subTab === 'tracker'
              ? 'bg-brand-brown-card text-brand-peach border-t-2 border-brand-peach border-x border-brand-peach/10'
              : 'text-brand-cream/50 hover:text-brand-cream'
          }`}
        >
          <Clock size={16} /> Live Shift Logger
        </button>
        <button
          onClick={() => setSubTab('project')}
          className={`px-5 py-3 text-sm font-semibold transition-all rounded-t-xl cursor-pointer flex items-center gap-2 ${
            subTab === 'project'
              ? 'bg-brand-brown-card text-brand-peach border-t-2 border-brand-peach border-x border-brand-peach/10'
              : 'text-brand-cream/50 hover:text-brand-cream'
          }`}
        >
          <Kanban size={16} /> Project Task Board
        </button>
      </div>

      {/* Dynamic Alerts */}
      {errorMessage && (
        <div className="flex items-center space-x-3 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl">
          <AlertCircle size={18} className="shrink-0 text-rose-400" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center space-x-3 p-4 bg-brand-peach/10 border border-brand-peach/20 text-brand-peach rounded-xl">
          <CheckCircle2 size={18} className="shrink-0 text-brand-peach" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Lateness Notification Notice */}
      {isLate && !activeLog && (
        <div className="flex items-center gap-3.5 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl animate-pulse">
          <AlertCircle size={20} className="shrink-0 text-amber-400" />
          <div>
            <span className="text-sm font-bold block">⚠️ Daily Shift Lateness Alert</span>
            <span className="text-xs text-brand-cream/80">
              Your scheduled shift start time was <strong>{user.scheduleStart}</strong> today. Please clock in as soon as possible to record your activity.
            </span>
          </div>
        </div>
      )}

      {subTab === 'project' ? (
        <ProjectTracker user={user} token={token} />
      ) : (
        <>
          {/* Main Clocking / Live Tracker Module */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Side: Clock In Panel */}
            <div className="bg-brand-brown-card p-8 rounded-2xl border border-brand-peach/10 shadow-lg flex flex-col justify-between h-fit lg:col-span-1">
              <div>
                <h2 className="font-serif font-bold text-brand-peach text-xl tracking-wide">Shift Tracker</h2>
                <p className="text-xs text-brand-cream/60 mt-1 leading-relaxed">Clock-in to log working hours dynamically in real-time.</p>
              </div>

              <div className="my-10 flex flex-col items-center">
                {/* The Timer Stopwatch Ring Display */}
                <div className={`h-48 w-48 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-500 ${
                  activeLog 
                    ? 'border-brand-peach bg-brand-peach/5 shadow-2xl shadow-brand-peach/5' 
                    : 'border-brand-peach/15 bg-brand-brown/40'
                }`}>
                  <Clock size={32} className={activeLog ? 'text-brand-peach animate-pulse' : 'text-brand-peach/30'} />
                  <span className={`text-3xl font-mono font-bold mt-2 ${activeLog ? 'text-brand-peach' : 'text-brand-peach/40'}`}>
                    {formatTime(elapsedSeconds)}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-brand-peach/50 mt-1">
                    {activeLog ? 'Active Timer' : 'Offline'}
                  </span>
                </div>
              </div>

              <div>
                {!activeLog ? (
                  <button
                    id="btn-clock-in"
                    onClick={handleClockIn}
                    disabled={isSubmitting}
                    className="w-full py-4 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl shadow-lg shadow-brand-peach/10 text-sm transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Play size={16} className="mr-2 fill-current" />
                    Start Clock-In Timer
                  </button>
                ) : (
                  <div className="text-center p-3 bg-brand-brown border border-brand-peach/10 rounded-xl">
                    <span className="text-xs font-mono text-brand-peach/70">
                      Started at: {new Date(activeLog.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Side: Task Entry / Clock Out Panel */}
            <div className="bg-brand-brown-card p-8 rounded-2xl border border-brand-peach/10 shadow-lg lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-serif font-bold text-brand-peach text-xl tracking-wide">Task Submission</h2>
                  <button
                    id="btn-toggle-manual"
                    onClick={() => {
                      setShowManualForm(!showManualForm);
                      setErrorMessage('');
                      setSuccessMessage('');
                    }}
                    className="text-xs font-semibold text-brand-peach/70 hover:text-brand-peach flex items-center cursor-pointer transition-colors"
                  >
                    {showManualForm ? "Use Live Clock-in" : "Log Retrospectively"}
                  </button>
                </div>
                <p className="text-xs text-brand-cream/60">Describe the concrete achievements built or tasks addressed during this shift.</p>
              </div>

              {/* Render Manual Form or Live Submission */}
              {showManualForm ? (
                <form onSubmit={handleManualSubmit} className="space-y-4 my-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Date worked</label>
                      <input
                        type="date"
                        required
                        value={manualDate}
                        onChange={(e) => setManualDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 text-brand-cream font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Hours</label>
                      <input
                        type="number"
                        placeholder="e.g. 4"
                        min="0"
                        max="24"
                        value={manualHours}
                        onChange={(e) => setManualHours(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 text-brand-cream font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Minutes</label>
                      <input
                        type="number"
                        placeholder="e.g. 30"
                        min="0"
                        max="59"
                        value={manualMinutes}
                        onChange={(e) => setManualMinutes(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 text-brand-cream font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Work Description</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Summarize your work. Example: Answered VA customer ticket queues, formatted the spreadsheet..."
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      className="w-full px-4 py-3 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 text-brand-cream placeholder:text-brand-peach/30"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold rounded-xl shadow-lg shadow-brand-peach/10 text-sm transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Plus size={16} className="mr-2" />
                    Submit Retrospective Log
                  </button>
                </form>
              ) : (
                <form onSubmit={handleClockOut} className="space-y-4 my-6">
                  <div>
                    <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Live Shift Notes</label>
                    <textarea
                      disabled={!activeLog || isSubmitting}
                      rows={4}
                      placeholder={
                        activeLog 
                          ? "Type details of what you are working on before checking out. Be descriptive!" 
                          : "Start a Live Clock-In timer on the left to write and log your shift notes here."
                      }
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className={`w-full px-4 py-3 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 text-brand-cream placeholder:text-brand-peach/30 ${
                        !activeLog ? 'opacity-40 cursor-not-allowed' : ''
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    id="btn-clock-out"
                    disabled={!activeLog || isSubmitting}
                    className={`w-full py-3 font-bold rounded-xl text-sm transition-all flex items-center justify-center cursor-pointer shadow-lg ${
                      activeLog 
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/10' 
                        : 'bg-brand-brown/50 text-brand-peach/30 border border-brand-peach/5 shadow-none cursor-not-allowed'
                    }`}
                  >
                    <Square size={14} className="mr-2 fill-current" />
                    Clock Out & Complete Shift
                  </button>
                </form>
              )}

              <div className="p-4 bg-brand-brown/30 border border-brand-peach/10 rounded-xl flex items-start space-x-3">
                <FileText size={16} className="text-brand-peach/60 mt-0.5 shrink-0" />
                <p className="text-[11px] leading-relaxed text-brand-cream/60">
                  Logged hours feed directly into payroll calculations. For retroactive corrections to finished logs, contact the system administrator (<span className="font-mono text-brand-peach">zuki_dev</span>).
                </p>
              </div>
            </div>
          </div>

          {/* User Logs Table List */}
          <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg">
            <h2 className="font-serif font-bold text-brand-peach text-xl tracking-wide mb-4">Your Finished Timesheets</h2>
            
            {userLogs.length === 0 ? (
              <div className="p-8 text-center bg-brand-brown/30 rounded-xl border border-dashed border-brand-peach/15">
                <span className="text-2xl">⏳</span>
                <p className="text-sm font-semibold text-brand-peach/80 mt-2">No completed logs recorded</p>
                <p className="text-xs text-brand-cream/50">Start clocking in above to fill out your task record.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-brand-peach/10 bg-brand-brown/20">
                <table className="w-full border-collapse text-left text-sm text-brand-cream/80">
                  <thead className="bg-brand-brown/60 text-xs font-mono font-bold uppercase text-brand-peach/70 border-b border-brand-peach/10">
                    <tr>
                      <th scope="col" className="px-6 py-4">Date</th>
                      <th scope="col" className="px-6 py-4">Time Interval</th>
                      <th scope="col" className="px-6 py-4">Duration</th>
                      <th scope="col" className="px-6 py-4">Type</th>
                      <th scope="col" className="px-6 py-4">Task Details</th>
                      <th scope="col" className="px-6 py-4">Est. Cost</th>
                      <th scope="col" className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-peach/10">
                    {userLogs.map((log) => {
                      const date = new Date(log.startTime).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                      const start = new Date(log.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      const end = log.endTime 
                        ? new Date(log.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Active';
                      const hrs = (log.durationMinutes / 60).toFixed(1);
                      const costEst = (parseFloat(hrs) * user.hourlyRate).toFixed(2);

                      return (
                        <tr key={log.id} className="hover:bg-brand-brown/40 transition-colors">
                          <td className="px-6 py-4 font-mono font-medium text-brand-cream">{date}</td>
                          <td className="px-6 py-4 text-xs font-mono text-brand-peach/80">
                            {start} – {end}
                          </td>
                          <td className="px-6 py-4 font-semibold text-brand-cream">
                            {!log.endTime ? (
                              <span className="inline-flex items-center text-rose-400 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse mr-1.5"></span>
                                Active
                              </span>
                            ) : (
                              `${hrs} hrs`
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border ${
                              log.isManual 
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/20' 
                                : 'bg-brand-peach/10 text-brand-peach border border-brand-peach/20'
                            }`}>
                              {log.isManual ? 'MANUAL' : 'TIMER'}
                            </span>
                          </td>
                          <td className="px-6 py-4 max-w-xs truncate text-brand-cream/80" title={log.description}>
                            {log.description || <span className="italic text-brand-peach/40">No notes provided</span>}
                          </td>
                          <td className="px-6 py-4 font-mono text-brand-peach font-bold">₱{costEst}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleDeleteLog(log.id)}
                              className="text-brand-peach/40 hover:text-rose-400 p-1.5 rounded-xl hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
