import React from 'react';
import { Clock, TrendingUp, Award, Calendar, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react';
import { User, TimeLog } from '../types';
import { coverZuki } from '../utils/assets';

interface DashboardViewProps {
  user: User;
  logs: TimeLog[];
  onNavigateToTracker: () => void;
}

export default function DashboardView({ user, logs, onNavigateToTracker }: DashboardViewProps) {
  // Filter logs for this user (or show all for admin)
  const myLogs = user.role === 'admin' ? logs : logs.filter(l => l.userId === user.id);
  
  const totalMinutes = myLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const totalEarningsVal = parseFloat(totalHours) * user.hourlyRate;
  const totalEarnings = "₱" + totalEarningsVal.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  const completedLogsCount = myLogs.filter(l => l.endTime).length;
  const activeTimer = myLogs.find(l => !l.endTime);

  // Calculate current calendar month logged hours for Capping
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthLogs = myLogs.filter(log => {
    const logDate = new Date(log.startTime);
    return logDate.getMonth() === currentMonth && logDate.getFullYear() === currentYear;
  });
  const monthlyMinutes = thisMonthLogs.reduce((sum, log) => sum + (log.durationMinutes || 0), 0);
  const monthlyHours = parseFloat((monthlyMinutes / 60).toFixed(1));
  const monthlyHoursCap = user.monthlyHoursCap || 160;
  const remainingHours = Math.max(0, parseFloat((monthlyHoursCap - monthlyHours).toFixed(1)));
  const capPercent = Math.min(100, Math.round((monthlyHours / monthlyHoursCap) * 100));

  // Calculate stats for the last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      dateStr: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateRaw: d.toISOString().split('T')[0],
      minutes: 0,
    };
  }).reverse();

  myLogs.forEach(log => {
    if (log.endTime) {
      const logDate = log.startTime.split('T')[0];
      const match = last7Days.find(day => day.dateRaw === logDate);
      if (match) {
        match.minutes += log.durationMinutes;
      }
    }
  });

  const maxMinutes = Math.max(...last7Days.map(d => d.minutes), 60); // min ceiling is 1 hour

  return (
    <div className="space-y-8 animate-fade-in text-brand-cream">
      {/* Header Banner */}
      <div 
        style={{ 
          backgroundImage: `linear-gradient(to right, #1e1414 45%, rgba(30, 20, 20, 0.85) 65%, rgba(30, 20, 20, 0.1) 100%), url('${coverZuki}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'right center'
        }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-3xl border border-brand-peach/15 shadow-2xl shadow-black/80 relative overflow-hidden min-h-[220px]"
      >
        <div className="z-10 max-w-xl">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand-peach">Zuki Workspace Console</span>
          <h1 className="text-3xl md:text-4xl font-serif font-bold text-brand-cream tracking-tight mt-1">
            Welcome back, <span className="text-brand-peach italic">{user.name}</span>!
          </h1>
          <p className="text-brand-cream/80 text-sm mt-2 leading-relaxed">
            {user.role === 'admin' 
              ? "Administrator panel active. Complete operations reviews, coordinate system metrics, and manage logs."
              : `Work logs are fully synchronized. You have logged ${totalHours} hours at a billing rate of ₱${user.hourlyRate}/hr.`
            }
          </p>
        </div>
        
        <div className="z-10 shrink-0">
          {activeTimer ? (
            <div className="flex items-center space-x-4 bg-brand-brown-card/90 backdrop-blur border border-brand-peach/20 px-5 py-4 rounded-2xl shadow-lg">
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-peach opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand-peach"></span>
              </span>
              <div>
                <p className="text-[10px] font-mono text-brand-peach font-bold uppercase tracking-wider">Active Shift Timer</p>
                <button 
                  onClick={onNavigateToTracker}
                  className="text-xs font-semibold text-brand-cream flex items-center hover:text-brand-peach transition-colors cursor-pointer mt-0.5"
                >
                  Go to Tracker <ChevronRight size={14} className="ml-0.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onNavigateToTracker}
              className="px-6 py-3.5 bg-brand-peach hover:bg-brand-peach-hover text-brand-brown font-bold rounded-xl shadow-xl shadow-brand-peach/10 text-sm transition-all flex items-center cursor-pointer"
            >
              <Clock size={16} className="mr-2" />
              Clock In Now
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI 1: Hours */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-brand-peach/60 tracking-wider">Total Hours Logged</span>
            <h3 className="text-3xl font-serif font-bold text-brand-peach tracking-tight mt-1">{totalHours}h</h3>
            <p className="text-xs text-brand-cream/60 mt-1 font-mono">From {completedLogsCount} sessions</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-brand-brown border border-brand-peach/10 flex items-center justify-center text-brand-peach shadow-inner">
            <Clock size={20} />
          </div>
        </div>

        {/* KPI 2: Earnings / Cost */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-brand-peach/60 tracking-wider">
              {user.role === 'admin' ? "Total Liabilities" : "Estimated Earnings"}
            </span>
            <h3 className="text-2xl font-serif font-bold text-brand-peach tracking-tight mt-1 truncate max-w-[160px]">{totalEarnings}</h3>
            <p className="text-xs text-brand-cream/60 mt-1 font-mono">Pesos (₱) currency system</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-brand-peach/10 border border-brand-peach/20 flex items-center justify-center text-brand-peach">
            <span className="text-lg font-bold font-serif italic">₱</span>
          </div>
        </div>

        {/* KPI 3: Status */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-brand-peach/60 tracking-wider">Active Sessions</span>
            <h3 className="text-3xl font-serif font-bold text-brand-peach tracking-tight mt-1">
              {activeTimer ? "1 Session" : "Inactive"}
            </h3>
            <p className="text-xs text-brand-cream/60 mt-1 font-mono">
              {activeTimer ? "Clocked in right now" : "All timers completed"}
            </p>
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${
            activeTimer 
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
              : 'bg-brand-brown border-brand-peach/10 text-brand-peach/40'
          }`}>
            <span className={`relative flex h-2.5 w-2.5 ${activeTimer ? 'visible' : 'hidden'}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
            </span>
            {!activeTimer && <Award size={20} />}
          </div>
        </div>

        {/* KPI 4: Monthly Hour Limit Capping */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between w-full">
            <div>
              <span className="text-[10px] font-mono font-bold uppercase text-brand-peach/60 tracking-wider block">Monthly Hour Cap</span>
              <h3 className="text-2xl font-serif font-bold text-brand-peach tracking-tight mt-1">
                {monthlyHours} / {monthlyHoursCap}h
              </h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-brand-brown border border-brand-peach/10 flex items-center justify-center text-brand-peach shrink-0">
              <Calendar size={16} />
            </div>
          </div>
          
          {/* Cap Progress Bar */}
          <div className="mt-4 space-y-1">
            <div className="w-full bg-brand-brown/60 h-2 rounded-full overflow-hidden border border-brand-peach/10">
              <div 
                style={{ width: `${capPercent}%` }}
                className={`h-full rounded-full transition-all duration-500 ${
                  capPercent > 90 
                    ? 'bg-rose-500' 
                    : capPercent > 70 
                    ? 'bg-amber-500' 
                    : 'bg-brand-peach'
                }`}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] font-mono text-brand-peach/60">
              <span>{capPercent}% used</span>
              <span>{remainingHours}h left</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics & Activity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Weekly Hours (Custom SVG/CSS Chart) */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">Weekly Distribution</h2>
              <p className="text-xs text-brand-cream/60 mt-0.5">Daily tracking totals in hours over the last 7 days</p>
            </div>
            <span className="px-2.5 py-1 bg-brand-brown rounded-full font-mono text-[10px] font-bold text-brand-peach border border-brand-peach/10">
              7 Days
            </span>
          </div>

          <div className="flex items-end justify-between h-56 px-2 mt-4">
            {last7Days.map((day, idx) => {
              const hours = (day.minutes / 60).toFixed(1);
              const pct = maxMinutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
              return (
                <div key={idx} className="flex flex-col items-center flex-1 group">
                  <div className="relative w-full flex justify-center mb-2">
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-brand-brown border border-brand-peach/25 text-brand-peach text-[10px] font-mono px-2 py-1 rounded shadow-md z-10 whitespace-nowrap">
                      {hours} hours
                    </div>
                    {/* The bar itself */}
                    <div 
                      style={{ height: `${Math.max(pct, 4)}%` }}
                      className={`w-10 sm:w-12 rounded-t-lg transition-all duration-500 ${
                        parseFloat(hours) > 0 
                          ? 'bg-gradient-to-t from-brand-peach-dark to-brand-peach shadow-lg shadow-brand-peach/10 hover:brightness-110' 
                          : 'bg-brand-brown/50 border border-brand-peach/5'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-medium text-brand-peach/60 mt-2">{day.dateStr}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Work Details List */}
        <div className="bg-brand-brown-card p-6 rounded-2xl border border-brand-peach/10 shadow-lg flex flex-col h-[348px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">Recent Shift Notes</h2>
              <p className="text-xs text-brand-cream/60 mt-0.5">Your latest logged sessions</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
            {myLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4">
                <span className="text-3xl">☕</span>
                <p className="text-sm font-semibold text-brand-peach/80 mt-2">No active history</p>
                <p className="text-xs text-brand-cream/50 max-w-[200px] mt-1">Clock in or submit retrospective log to record activities.</p>
              </div>
            ) : (
              myLogs.slice(0, 5).map((log, index) => {
                const formattedDate = new Date(log.startTime).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                });
                const hours = (log.durationMinutes / 60).toFixed(1);

                return (
                  <div key={log.id || index} className="p-3 bg-brand-brown/40 border border-brand-peach/10 rounded-xl hover:bg-brand-brown/60 transition-all duration-200">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-mono font-bold text-brand-peach/50">{formattedDate}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                        !log.endTime 
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : 'bg-brand-peach/10 text-brand-peach border-brand-peach/20'
                      }`}>
                        {!log.endTime ? 'ACTIVE' : `${hours}h`}
                      </span>
                    </div>
                    <p className="text-xs text-brand-cream/80 line-clamp-2 mt-1 leading-relaxed">
                      {log.description || "No description provided."}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
