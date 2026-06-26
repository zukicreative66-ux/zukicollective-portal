import React, { useState, useEffect } from 'react';
import { 
  Shield, Users, Search, DollarSign, Clock, FileDown, 
  Edit3, Check, X, AlertCircle, Trash2, Calendar, 
  Settings, Folder, Kanban, UserCheck, AlertTriangle, Briefcase 
} from 'lucide-react';
import { User, TimeLog, Task } from '../types';

interface AdminPanelProps {
  user: User;
  logs: TimeLog[];
  onRefreshLogs: () => void;
  token: string;
}

export default function AdminPanel({ user, logs, onRefreshLogs, token }: AdminPanelProps) {
  // Navigation tabs within Admin Panel
  const [adminTab, setAdminTab] = useState<'ledger' | 'users' | 'tasks'>('ledger');
  
  // State for loaded users and tasks
  const [usersList, setUsersList] = useState<User[]>([]);
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Filter states
  const [filterUser, setFilterUser] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterTaskUser, setFilterTaskUser] = useState('all');

  // Edit log state
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editDuration, setEditDuration] = useState('');

  // Edit user profile state (Admin override)
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserWorkType, setEditUserWorkType] = useState<'full-time' | 'part-time'>('part-time');
  const [editUserRate, setEditUserRate] = useState('');
  const [editUserStart, setEditUserStart] = useState('');
  const [editUserEnd, setEditUserEnd] = useState('');
  const [editUserCap, setEditUserCap] = useState('');

  // Status banners
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch all users
  const fetchUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Fetch all tasks
  const fetchTasks = async () => {
    try {
      setIsLoadingTasks(true);
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasksList(data);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setIsLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchTasks();
  }, [token, logs]); // refresh when logs sync or tab loads

  // Calculate team wide metrics
  const totalMinutes = logs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // Dynamic cost calculation based on actual rate in logs, or lookup usersList hourlyRate!
  const totalCost = logs.reduce((sum, l) => {
    // Find rate of log's user, or default to their logged role
    const matchedUser = usersList.find(u => u.username === l.username);
    const rate = matchedUser ? matchedUser.hourlyRate : (l.role === 'admin' ? 75 : l.role === 'developer' ? 200 : 150);
    const hours = l.durationMinutes / 60;
    return sum + (hours * rate);
  }, 0);

  const activeWorkers = logs.filter(l => l.endTime === null);
  const uniqueUsernames = Array.from(new Set(logs.map(l => l.username)));

  // Filter logs list
  const filteredLogs = logs.filter(log => {
    if (filterUser !== 'all' && log.username !== filterUser) return false;
    if (filterType !== 'all') {
      if (filterType === 'manual' && !log.isManual) return false;
      if (filterType === 'timer' && log.isManual) return false;
      if (filterType === 'active' && log.endTime !== null) return false;
    }
    return true;
  });

  // Export to CSV Utility (PESOS)
  const handleExportCSV = () => {
    try {
      const headers = ['Date', 'Worker Name', 'Role', 'Log Type', 'Hours Logged', 'Hourly Rate (PHP)', 'Total Liabilities (PHP)', 'Task Description'];
      const rows = filteredLogs.map(log => {
        const date = new Date(log.startTime).toLocaleDateString();
        const roleStr = log.role.toUpperCase();
        const typeStr = log.endTime === null ? 'ACTIVE' : (log.isManual ? 'MANUAL' : 'TIMER');
        const hrs = (log.durationMinutes / 60).toFixed(2);
        
        const matchedUser = usersList.find(u => u.username === log.username);
        const rate = matchedUser ? matchedUser.hourlyRate : (log.role === 'admin' ? 75 : 150);
        const total = (parseFloat(hrs) * rate).toFixed(2);
        const cleanDesc = log.description.replace(/"/g, '""');

        return [
          date,
          log.name,
          roleStr,
          typeStr,
          hrs,
          rate,
          total,
          `"${cleanDesc}"`
        ];
      });

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Zuki_Creatives_Payroll_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setSuccessMessage('Payroll Timesheet exported as CSV successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage('Export failed: ' + err.message);
    }
  };

  // Admin start edit for time log
  const handleStartEdit = (log: TimeLog) => {
    setEditingLogId(log.id);
    setEditDescription(log.description);
    setEditDuration(log.durationMinutes.toString());
    setErrorMessage('');
    setSuccessMessage('');
  };

  // Admin save edit for time log
  const handleSaveEdit = async (logId: string) => {
    if (!editDescription.trim()) {
      setErrorMessage('Description cannot be empty');
      return;
    }
    const mins = parseInt(editDuration);
    if (isNaN(mins) || mins < 0) {
      setErrorMessage('Duration must be a positive number of minutes');
      return;
    }

    try {
      const response = await fetch(`/api/logs/${logId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          description: editDescription,
          durationMinutes: mins,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update log');
      }

      setSuccessMessage('Log entry updated successfully!');
      setEditingLogId(null);
      onRefreshLogs();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Delete Log Record
  const handleDeleteLog = async (logId: string) => {
    if (!confirm('Are you sure you want to delete this time log? This cannot be undone.')) return;
    try {
      const response = await fetch(`/api/logs/${logId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to delete log');
      }
      setSuccessMessage('Log deleted successfully.');
      onRefreshLogs();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Start edit for user settings
  const handleStartEditUser = (u: User) => {
    setEditingUserId(u.id);
    setEditUserName(u.name);
    setEditUserWorkType(u.workType);
    setEditUserRate(u.hourlyRate.toString());
    setEditUserStart(u.scheduleStart);
    setEditUserEnd(u.scheduleEnd);
    setEditUserCap(u.monthlyHoursCap.toString());
  };

  // Save updated user settings
  const handleSaveUserOverride = async (userId: string) => {
    if (!editUserName.trim() || !editUserStart || !editUserEnd) {
      setErrorMessage('Name and Daily Shifts are required.');
      return;
    }

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editUserName.trim(),
          workType: editUserWorkType,
          hourlyRate: parseFloat(editUserRate) || (editUserWorkType === 'part-time' ? 200 : 150),
          scheduleStart: editUserStart,
          scheduleEnd: editUserEnd,
          monthlyHoursCap: parseInt(editUserCap) || 160
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update employee configurations.');
      }

      setSuccessMessage('Employee profile configuration saved successfully!');
      setEditingUserId(null);
      fetchUsers();
      onRefreshLogs();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Compute Latenesses across all scheduled VAs today
  const getLateVAsList = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const lateVAs: Array<{ user: User; minutesLate: number }> = [];

    // Filter only VA accounts (role === 'va')
    const vaUsers = usersList.filter(u => u.role === 'va');

    vaUsers.forEach(u => {
      // Check if they clocked in today
      const clockedInToday = logs.some(log => log.username === u.username && log.startTime.startsWith(todayStr));
      if (clockedInToday) return; // not late

      if (!u.scheduleStart) return;

      // Calculate minutes difference
      const [schedHour, schedMin] = u.scheduleStart.split(':').map(Number);
      const now = new Date();
      const currHour = now.getHours();
      const currMin = now.getMinutes();

      const schedMinutes = schedHour * 60 + schedMin;
      const currMinutes = currHour * 60 + currMin;

      // 5 mins grace
      if (currMinutes > schedMinutes + 5) {
        lateVAs.push({
          user: u,
          minutesLate: currMinutes - schedMinutes
        });
      }
    });

    return lateVAs;
  };

  const lateVAs = getLateVAsList();

  return (
    <div className="space-y-8 animate-fade-in text-brand-cream">
      {/* Admin Title Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/15 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-brand-peach/10 border border-brand-peach/20 flex items-center justify-center text-brand-peach">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-xl font-serif font-bold tracking-tight text-brand-cream flex items-center gap-2">
              Administrative Console
            </h1>
            <p className="text-xs text-brand-cream/60">Manage VA schedules, audit completed work logs, and monitor live tasks.</p>
          </div>
        </div>
      </div>

      {/* Admin Sub-tabs */}
      <div className="flex border-b border-brand-peach/10 pb-1 gap-2">
        <button
          onClick={() => setAdminTab('ledger')}
          className={`px-5 py-3 text-sm font-semibold transition-all rounded-t-xl cursor-pointer flex items-center gap-2 ${
            adminTab === 'ledger'
              ? 'bg-brand-brown-card text-brand-peach border-t-2 border-brand-peach border-x border-brand-peach/10'
              : 'text-brand-cream/50 hover:text-brand-cream'
          }`}
        >
          <Clock size={16} /> VA Shift Logs
        </button>
        <button
          onClick={() => setAdminTab('users')}
          className={`px-5 py-3 text-sm font-semibold transition-all rounded-t-xl cursor-pointer flex items-center gap-2 ${
            adminTab === 'users'
              ? 'bg-brand-brown-card text-brand-peach border-t-2 border-brand-peach border-x border-brand-peach/10'
              : 'text-brand-cream/50 hover:text-brand-cream'
          }`}
        >
          <Users size={16} /> VA & Schedule Override
        </button>
        <button
          onClick={() => setAdminTab('tasks')}
          className={`px-5 py-3 text-sm font-semibold transition-all rounded-t-xl cursor-pointer flex items-center gap-2 ${
            adminTab === 'tasks'
              ? 'bg-brand-brown-card text-brand-peach border-t-2 border-brand-peach border-x border-brand-peach/10'
              : 'text-brand-cream/50 hover:text-brand-cream'
          }`}
        >
          <Kanban size={16} /> Team Tasks Monitor
        </button>
      </div>

      {/* Admin Alerts */}
      {errorMessage && (
        <div className="flex items-center space-x-3 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl">
          <AlertCircle size={18} className="shrink-0 text-rose-400" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center space-x-3 p-4 bg-brand-peach/10 border border-brand-peach/20 text-brand-peach rounded-xl">
          <Check size={18} className="shrink-0 text-brand-peach" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {/* Lateness Alarm Section - Triggers when VAs are late */}
      {lateVAs.length > 0 && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3 animate-pulse">
          <h3 className="text-amber-400 font-bold text-sm flex items-center gap-2">
            <AlertTriangle size={18} /> Team Shift Lateness Notice
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {lateVAs.map(({ user: va, minutesLate }) => (
              <div key={va.id} className="bg-brand-brown-card/70 p-3 rounded-xl border border-amber-500/10 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-brand-cream block">{va.name}</span>
                  <span className="text-brand-cream/60">Schedule: {va.scheduleStart} – {va.scheduleEnd}</span>
                </div>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 font-mono font-bold rounded">
                  Late {Math.floor(minutesLate / 60) > 0 ? `${Math.floor(minutesLate / 60)}h ` : ''}{minutesLate % 60}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {adminTab === 'ledger' && (
        <>
          {/* Employee Logs Ledger Table */}
          <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">Employee Work Logs Ledger</h2>
                <p className="text-xs text-brand-cream/60">Review finished VA shift logs, edit durations, or remove invalid reports.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Filter Member</label>
                  <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="px-3 py-2 bg-brand-brown/40 border border-brand-peach/10 rounded-xl text-xs text-brand-cream font-mono focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 cursor-pointer"
                  >
                    <option value="all">All Members</option>
                    {uniqueUsernames.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Filter Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 bg-brand-brown/40 border border-brand-peach/10 rounded-xl text-xs text-brand-cream font-mono focus:outline-none focus:ring-2 focus:ring-brand-peach/5 focus:border-brand-peach/50 cursor-pointer"
                  >
                    <option value="all">All Logs</option>
                    <option value="timer">Live Timer Logs</option>
                    <option value="manual">Manual Logs</option>
                    <option value="active">Active Only</option>
                  </select>
                </div>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center bg-brand-brown/30 rounded-xl border border-dashed border-brand-peach/15">
                <p className="text-sm font-semibold text-brand-peach/80">No matching logs found</p>
                <p className="text-xs text-brand-cream/50 mt-1">Try adjusting your active search filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-brand-peach/10 bg-brand-brown/20">
                <table className="w-full border-collapse text-left text-sm text-brand-cream/80">
                  <thead className="bg-brand-brown/60 text-xs font-mono font-bold uppercase text-brand-peach/70 border-b border-brand-peach/10">
                    <tr>
                      <th scope="col" className="px-6 py-4">Employee</th>
                      <th scope="col" className="px-6 py-4">Date</th>
                      <th scope="col" className="px-6 py-4">Duration</th>
                      <th scope="col" className="px-6 py-4">Log Type</th>
                      <th scope="col" className="px-6 py-4">Task Details & Description</th>
                      <th scope="col" className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-peach/10">
                    {filteredLogs.map((log) => {
                      const date = new Date(log.startTime).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                      const isEditing = editingLogId === log.id;
                      
                      // Find rate in userList
                      const matchedUser = usersList.find(u => u.username === log.username);
                      const rate = matchedUser ? matchedUser.hourlyRate : (log.role === 'admin' ? 75 : 150);
                      const totalHrs = (log.durationMinutes / 60);
                      const cost = "₱" + (totalHrs * rate).toFixed(2);

                      return (
                        <tr key={log.id} className="hover:bg-brand-brown/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-2.5">
                              <div className="h-8 w-8 rounded-full bg-brand-peach/10 border border-brand-peach/20 text-brand-peach flex items-center justify-center font-serif italic font-bold text-xs overflow-hidden">
                                {matchedUser?.photoUrl ? (
                                  <img src={matchedUser.photoUrl} alt={log.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  log.name.substring(0, 1).toUpperCase()
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-brand-cream block leading-tight">{log.name}</span>
                                <span className="text-[10px] font-mono text-brand-peach/50 uppercase tracking-wider">{log.role}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 font-mono font-medium text-brand-cream/80">{date}</td>

                          <td className="px-6 py-4">
                            {isEditing ? (
                              <div className="flex items-center space-x-1.5">
                                <input
                                  type="number"
                                  value={editDuration}
                                  onChange={(e) => setEditDuration(e.target.value)}
                                  className="w-20 px-2.5 py-1 text-xs bg-brand-brown border border-brand-peach/20 rounded-lg text-brand-cream font-mono focus:outline-none focus:ring-1 focus:ring-brand-peach"
                                />
                                <span className="text-xs font-mono text-brand-peach/50">min</span>
                              </div>
                            ) : log.endTime === null ? (
                              <span className="inline-flex items-center text-rose-400 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse mr-1.5"></span>
                                Active
                              </span>
                            ) : (
                              <span className="font-semibold text-brand-cream font-mono">
                                {totalHrs.toFixed(1)} hrs
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border ${
                              log.endTime === null 
                                ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' 
                                : log.isManual 
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/20' 
                                : 'bg-brand-peach/10 text-brand-peach border border-brand-peach/20'
                            }`}>
                              {log.endTime === null ? 'ACTIVE' : (log.isManual ? 'MANUAL' : 'TIMER')}
                            </span>
                          </td>

                          <td className="px-6 py-4 max-w-sm">
                            {isEditing ? (
                              <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-1.5 text-xs bg-brand-brown border border-brand-peach/20 rounded-lg text-brand-cream focus:outline-none focus:ring-1 focus:ring-brand-peach focus:border-brand-peach placeholder:text-brand-peach/30"
                              />
                            ) : (
                              <p className="text-xs text-brand-cream/80 leading-relaxed line-clamp-2" title={log.description}>
                                {log.description || <span className="italic text-brand-peach/40">No notes provided</span>}
                              </p>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={() => handleSaveEdit(log.id)}
                                  className="p-1.5 bg-brand-peach hover:bg-brand-peach-hover text-brand-brown rounded-lg transition-colors cursor-pointer"
                                  title="Save Edit"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingLogId(null)}
                                  className="p-1.5 bg-brand-brown border border-brand-peach/10 hover:bg-brand-brown-card text-brand-cream rounded-lg transition-colors cursor-pointer"
                                  title="Cancel Edit"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={() => handleStartEdit(log)}
                                  className="text-brand-peach/40 hover:text-brand-peach p-1.5 rounded-lg hover:bg-brand-peach/10 transition-colors cursor-pointer"
                                  title="Edit Record Duration/Details"
                                >
                                  <Edit3 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="text-brand-peach/40 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            )}
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

      {adminTab === 'users' && (
        <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg space-y-6">
          <div>
            <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">VA Profiles & Schedule Configurations</h2>
            <p className="text-xs text-brand-cream/60">Manage each VA's shift parameters, hourly rates, work types, and monthly hour caps.</p>
          </div>

          {isLoadingUsers ? (
            <div className="p-8 text-center text-brand-peach/50 text-xs">Loading employee registry...</div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {usersList.filter(u => u.role !== 'admin').map((u) => {
                const isEditingUser = editingUserId === u.id;
                
                return (
                  <div key={u.id} className="p-5 bg-brand-brown/30 border border-brand-peach/10 rounded-2xl flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between transition-all">
                    {/* Visual Avatar and Name */}
                    <div className="flex items-center space-x-4">
                      <div className="h-14 w-14 rounded-full bg-brand-peach/10 border-2 border-brand-peach/20 overflow-hidden flex items-center justify-center shrink-0">
                        {u.photoUrl ? (
                          <img src={u.photoUrl} alt={u.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="font-serif font-bold text-brand-peach text-lg">{u.name.substring(0, 1)}</span>
                        )}
                      </div>
                      <div>
                        {isEditingUser ? (
                          <input
                            type="text"
                            value={editUserName}
                            onChange={(e) => setEditUserName(e.target.value)}
                            className="px-3 py-1 bg-brand-brown border border-brand-peach/25 rounded text-sm text-brand-cream font-bold focus:outline-none focus:ring-1 focus:ring-brand-peach"
                          />
                        ) : (
                          <h3 className="font-serif font-bold text-brand-cream text-base">{u.name}</h3>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-brand-peach/60 uppercase">@{u.username}</span>
                          <span className="text-brand-peach/20">•</span>
                          <span className="px-2 py-0.5 rounded bg-brand-peach/10 text-brand-peach text-[9px] font-mono font-bold uppercase border border-brand-peach/10">
                            {u.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Operational Configurations Controls */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 max-w-2xl text-xs">
                      <div>
                        <span className="text-[9px] font-mono text-brand-peach/50 uppercase block mb-1">Engagement Type</span>
                        {isEditingUser ? (
                          <select
                            value={editUserWorkType}
                            onChange={(e: any) => {
                              const val = e.target.value;
                              setEditUserWorkType(val);
                              // Auto set rates based on choice
                              setEditUserRate(val === 'part-time' ? '200' : '150');
                            }}
                            className="bg-brand-brown border border-brand-peach/20 rounded px-2 py-1 text-brand-cream"
                          >
                            <option value="part-time">Part-Time</option>
                            <option value="full-time">Full-Time</option>
                          </select>
                        ) : (
                          <span className="font-mono font-bold text-brand-cream capitalize flex items-center gap-1">
                            <Briefcase size={12} className="text-brand-peach/60" /> {u.workType}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-brand-peach/50 uppercase block mb-1">Hourly rate</span>
                        {isEditingUser ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono">₱</span>
                            <input
                              type="number"
                              value={editUserRate}
                              onChange={(e) => setEditUserRate(e.target.value)}
                              className="w-16 bg-brand-brown border border-brand-peach/20 rounded px-1.5 py-0.5 text-brand-cream text-center font-mono"
                            />
                          </div>
                        ) : (
                          <span className="font-mono font-bold text-brand-peach">₱{u.hourlyRate}/hr</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-brand-peach/50 uppercase block mb-1">Shift Schedule</span>
                        {isEditingUser ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editUserStart}
                              placeholder="09:00"
                              onChange={(e) => setEditUserStart(e.target.value)}
                              className="w-14 bg-brand-brown border border-brand-peach/20 rounded px-1 py-0.5 text-brand-cream text-center font-mono text-[11px]"
                            />
                            <span>-</span>
                            <input
                              type="text"
                              value={editUserEnd}
                              placeholder="17:00"
                              onChange={(e) => setEditUserEnd(e.target.value)}
                              className="w-14 bg-brand-brown border border-brand-peach/20 rounded px-1 py-0.5 text-brand-cream text-center font-mono text-[11px]"
                            />
                          </div>
                        ) : (
                          <span className="font-mono text-brand-cream">{u.scheduleStart} - {u.scheduleEnd}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[9px] font-mono text-brand-peach/50 uppercase block mb-1">Monthly Cap</span>
                        {isEditingUser ? (
                          <div className="flex items-center gap-1 font-mono">
                            <input
                              type="number"
                              value={editUserCap}
                              onChange={(e) => setEditUserCap(e.target.value)}
                              className="w-14 bg-brand-brown border border-brand-peach/20 rounded px-1.5 py-0.5 text-brand-cream text-center"
                            />
                            <span>hrs</span>
                          </div>
                        ) : (
                          <span className="font-mono text-brand-cream">{u.monthlyHoursCap} hrs cap</span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="shrink-0 flex items-center justify-end w-full lg:w-auto">
                      {isEditingUser ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveUserOverride(u.id)}
                            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <Check size={14} /> Save Override
                          </button>
                          <button
                            onClick={() => setEditingUserId(null)}
                            className="p-2.5 bg-brand-brown border border-brand-peach/20 hover:bg-brand-brown-card text-brand-cream rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <X size={14} /> Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEditUser(u)}
                          className="px-4 py-2 bg-brand-peach/10 hover:bg-brand-peach/20 text-brand-peach border border-brand-peach/20 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <Edit3 size={12} /> Configure parameters
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {adminTab === 'tasks' && (
        <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">Central Team Tasks Monitor</h2>
              <p className="text-xs text-brand-cream/60">Review all active projects, priorities, and task progression logged across VAs.</p>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Filter by VA</label>
              <select
                value={filterTaskUser}
                onChange={(e) => setFilterTaskUser(e.target.value)}
                className="px-3 py-2 bg-brand-brown/40 border border-brand-peach/10 rounded-xl text-xs text-brand-cream font-mono focus:outline-none focus:ring-2 focus:ring-brand-peach/5 cursor-pointer"
              >
                <option value="all">All VAs</option>
                {usersList.filter(u => u.role === 'va').map(u => (
                  <option key={u.id} value={u.username}>{u.name} ({u.username})</option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingTasks ? (
            <div className="p-8 text-center text-brand-peach/50 text-xs">Loading task registry...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {['Todo', 'In Progress', 'In Review', 'Completed'].map((statusOption) => {
                const statusFilteredTasks = tasksList.filter(t => {
                  if (t.status !== statusOption) return false;
                  if (filterTaskUser !== 'all' && t.username !== filterTaskUser) return false;
                  return true;
                });

                return (
                  <div key={statusOption} className="flex flex-col p-4 bg-brand-brown/20 rounded-2xl border border-brand-peach/10 min-h-[350px]">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-peach/10">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-brand-peach/70">
                        {statusOption === 'Todo' ? 'To Do' : statusOption === 'In Progress' ? 'In Progress' : statusOption === 'In Review' ? 'In Review' : 'Completed'}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-brown text-brand-peach">
                        {statusFilteredTasks.length}
                      </span>
                    </div>

                    <div className="space-y-3 overflow-y-auto max-h-[450px]">
                      {statusFilteredTasks.length === 0 ? (
                        <div className="text-center py-10 text-[10px] text-brand-cream/30 italic">No tasks here</div>
                      ) : (
                        statusFilteredTasks.map((task) => {
                          const owner = usersList.find(u => u.username === task.username);
                          return (
                            <div key={task.id} className="bg-brand-brown-card p-3 rounded-xl border border-brand-peach/5 space-y-2.5">
                              {/* Task header tags */}
                              <div className="flex items-center justify-between gap-1 text-[9px]">
                                <span className="font-mono bg-brand-brown text-brand-peach border border-brand-peach/5 px-1.5 py-0.5 rounded">
                                  {task.project}
                                </span>
                                <span className={`font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                                  task.priority === 'High' 
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/20'
                                    : task.priority === 'Medium'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
                                }`}>
                                  {task.priority}
                                </span>
                              </div>

                              <div>
                                <h4 className="text-xs font-semibold text-brand-cream line-clamp-2 leading-snug">{task.title}</h4>
                                {task.description && (
                                  <p className="text-[10px] text-brand-cream/50 mt-1 line-clamp-2">{task.description}</p>
                                )}
                              </div>

                              {/* Owner Profile footer */}
                              <div className="pt-2 border-t border-brand-peach/5 flex items-center gap-1.5">
                                <div className="h-5 w-5 rounded-full bg-brand-peach/10 flex items-center justify-center overflow-hidden shrink-0">
                                  {owner?.photoUrl ? (
                                    <img src={owner.photoUrl} alt={task.username} className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="font-serif text-[8px] font-bold text-brand-peach">{(owner?.name || task.username).substring(0, 1)}</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-brand-cream/60 truncate">
                                  {owner?.name || task.username}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
