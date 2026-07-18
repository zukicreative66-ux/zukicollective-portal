import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Users, Search, DollarSign, Clock, FileDown, 
  Edit3, Check, X, AlertCircle, Trash2, Calendar, 
  Settings, Folder, Kanban, UserCheck, AlertTriangle, Briefcase,
  UserPlus, Mail, Copy, Eye, EyeOff
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
  const [editUserNotification, setEditUserNotification] = useState('09:00');
  const [editUserCap, setEditUserCap] = useState('');

  // Status banners
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Export reports state
  const [selectedExportVa, setSelectedExportVa] = useState<User | null>(null);
  const [exportTimeframe, setExportTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('month');

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'va' | 'developer'>('va');
  const [inviteRate, setInviteRate] = useState('200');
  const [inviteWorkType, setInviteWorkType] = useState<'part-time' | 'full-time'>('part-time');
  const [inviteStart, setInviteStart] = useState('09:00');
  const [inviteEnd, setInviteEnd] = useState('17:00');
  const [inviteCap, setInviteCap] = useState('160');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ message: string; tempCredentials?: { username: string; password: string } } | null>(null);
  const [showTempPassword, setShowTempPassword] = useState(false);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setErrorMessage('');
    setInviteResult(null);
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim(),
          role: inviteRole,
          hourlyRate: parseFloat(inviteRate) || 200,
          workType: inviteWorkType,
          scheduleStart: inviteStart,
          scheduleEnd: inviteEnd,
          monthlyHoursCap: parseInt(inviteCap) || 160,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invite failed.');
      setInviteResult(data);
      setInviteEmail('');
      setInviteName('');
      setShowInviteForm(false);
      fetchUsers();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setInviteLoading(false);
    }
  };


  const exportToCSV = (va: User, timeframe: 'today' | 'week' | 'month' | 'all') => {
    const vaLogs = logs.filter(l => l.username === va.username);
    const now = new Date();
    
    // boundaries
    const todayStr = now.toISOString().split('T')[0];
    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0,0,0,0);

    const filteredLogs = vaLogs.filter(log => {
      const logStart = new Date(log.startTime);
      if (timeframe === 'today') {
        return log.startTime.startsWith(todayStr);
      }
      if (timeframe === 'week') {
        return logStart >= startOfWeek;
      }
      if (timeframe === 'month') {
        return logStart >= startOfMonth;
      }
      return true; // all
    });

    let totalMins = 0;
    const rows = filteredLogs.map(log => {
      const logStart = new Date(log.startTime);
      let duration = log.durationMinutes || 0;
      if (!log.endTime) {
        duration = Math.floor((Date.now() - logStart.getTime()) / 60000);
      }
      totalMins += duration;
      const hours = (duration / 60).toFixed(2);
      const rate = va.hourlyRate || 200;
      const payout = (duration / 60 * rate).toFixed(2);
      
      return [
        `"${log.id}"`,
        `"${log.startTime}"`,
        `"${log.endTime || 'ACTIVE'}"`,
        `"${duration}"`,
        `"${hours}"`,
        `"${va.workType || 'Standard'}"`,
        `"${rate}"`,
        `"${payout}"`,
        `"${(log.description || '').replace(/"/g, '""')}"`
      ];
    });

    const headers = ["Log ID", "Start Time", "End Time", "Duration (Minutes)", "Duration (Hours)", "Work Type", "Hourly Rate (PHP)", "Payout (PHP)", "Task Details"];
    const csvContent = [
      `"VA Name:","${va.name}"`,
      `"Username:","@${va.username}"`,
      `"Email:","${va.email}"`,
      `"Report Timeframe:","${timeframe.toUpperCase()}"`,
      `"Total Hours Worked:","${(totalMins / 60).toFixed(2)}"`,
      `"Hourly Rate:","PHP ${va.hourlyRate || 200}"`,
      `"Total Estimated Payout:","PHP ${(totalMins / 60 * (va.hourlyRate || 200)).toFixed(2)}"`,
      "",
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `VA_Report_${va.username}_${timeframe}_${todayStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccessMessage(`CSV Report for @${va.username} generated and downloaded successfully!`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const exportToPDF = (va: User, timeframe: 'today' | 'week' | 'month' | 'all') => {
    const vaLogs = logs.filter(l => l.username === va.username);
    const now = new Date();
    
    // boundaries
    const todayStr = now.toISOString().split('T')[0];
    const startOfWeek = new Date();
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0,0,0,0);

    const filteredLogs = vaLogs.filter(log => {
      const logStart = new Date(log.startTime);
      if (timeframe === 'today') {
        return log.startTime.startsWith(todayStr);
      }
      if (timeframe === 'week') {
        return logStart >= startOfWeek;
      }
      if (timeframe === 'month') {
        return logStart >= startOfMonth;
      }
      return true; // all
    });

    let totalMins = 0;
    const logsHtml = filteredLogs.map(log => {
      const logStart = new Date(log.startTime);
      let duration = log.durationMinutes || 0;
      if (!log.endTime) {
        duration = Math.floor((Date.now() - logStart.getTime()) / 60000);
      }
      totalMins += duration;
      const hours = (duration / 60).toFixed(2);
      const rate = va.hourlyRate || 200;
      const payout = (duration / 60 * rate).toFixed(2);

      const formattedStart = new Date(log.startTime).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
      const formattedEnd = log.endTime ? new Date(log.endTime).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      }) : 'ACTIVE';

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 10px 8px; font-family: monospace;">${formattedStart}</td>
          <td style="padding: 10px 8px; font-family: monospace;">${formattedEnd}</td>
          <td style="padding: 10px 8px; text-align: center;">${hours} hrs</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace;">₱${rate.toFixed(2)}</td>
          <td style="padding: 10px 8px; text-align: right; font-family: monospace; font-weight: bold;">₱${parseFloat(payout).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
          <td style="padding: 10px 8px; color: #4a5568; max-width: 220px; word-break: break-all;">${(log.description || 'N/A').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
        </tr>
      `;
    }).join('');

    const rate = va.hourlyRate || 200;
    const totalHrs = totalMins / 60;
    const totalPayout = totalHrs * rate;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to generate and print the PDF report.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Productivity Report - ${va.name}</title>
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #2d3748;
              margin: 0;
              padding: 40px;
            }
            .header-container {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #e0a96d;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .logo-area h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 800;
              color: #1a202c;
              letter-spacing: -0.5px;
            }
            .logo-area p {
              margin: 4px 0 0 0;
              font-size: 11px;
              color: #718096;
              text-transform: uppercase;
              font-weight: bold;
              letter-spacing: 1px;
            }
            .report-badge {
              background-color: #feebc8;
              color: #c05621;
              padding: 6px 12px;
              border-radius: 20px;
              font-weight: bold;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .details-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 30px;
            }
            .details-card {
              background-color: #f7fafc;
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 15px;
            }
            .details-card h3 {
              margin: 0 0 10px 0;
              font-size: 12px;
              text-transform: uppercase;
              color: #718096;
              letter-spacing: 0.5px;
            }
            .details-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 6px;
              font-size: 12px;
            }
            .details-row span:first-child {
              color: #718096;
            }
            .details-row span:last-child {
              font-weight: 600;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background-color: #f7fafc;
              color: #4a5568;
              font-size: 10px;
              text-transform: uppercase;
              font-weight: bold;
              padding: 10px 8px;
              text-align: left;
              border-bottom: 2px solid #e2e8f0;
            }
            .summary-totals {
              margin-left: auto;
              width: 300px;
              background-color: #fdf6e2;
              border: 1px solid #fbd38d;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 40px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
              font-size: 13px;
            }
            .total-row:last-child {
              margin-bottom: 0;
              border-top: 1px solid #fbd38d;
              padding-top: 8px;
              font-size: 16px;
              font-weight: bold;
              color: #c05621;
            }
            .footer {
              border-top: 1px solid #e2e8f0;
              padding-top: 20px;
              text-align: center;
              font-size: 10px;
              color: #a0aec0;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="logo-area">
              <h1>Zuki Creatives Portal</h1>
              <p>VA Productivity Statement & Settlement Report</p>
            </div>
            <div>
              <span class="report-badge">${timeframe} report</span>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-card">
              <h3>Associate Details</h3>
              <div class="details-row">
                <span>Full Name:</span>
                <span>${va.name}</span>
              </div>
              <div class="details-row">
                <span>Username:</span>
                <span>@${va.username}</span>
              </div>
              <div class="details-row">
                <span>Email Address:</span>
                <span>${va.email}</span>
              </div>
              <div class="details-row">
                <span>Agreement Type:</span>
                <span style="text-transform: capitalize;">${va.workType || 'part-time'}</span>
              </div>
            </div>

            <div class="details-card">
              <h3>Settlement & Limits</h3>
              <div class="details-row">
                <span>Standard Shift:</span>
                <span>${va.scheduleStart || 'N/A'} - ${va.scheduleEnd || 'N/A'}</span>
              </div>
              <div class="details-row">
                <span>Hourly Rate:</span>
                <span>₱${rate.toFixed(2)} / hr</span>
              </div>
              <div class="details-row">
                <span>Monthly Hours Capped:</span>
                <span>50.00 hours</span>
              </div>
              <div class="details-row">
                <span>Report Generated:</span>
                <span>${new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>

          <h3 style="font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #4a5568; margin-bottom: 12px;">Detailed Time Log Ledger</h3>
          <table>
            <thead>
              <tr>
                <th style="padding: 10px 8px;">Start Time</th>
                <th style="padding: 10px 8px;">End Time</th>
                <th style="padding: 10px 8px; text-align: center;">Duration</th>
                <th style="padding: 10px 8px; text-align: right;">Rate</th>
                <th style="padding: 10px 8px; text-align: right;">Calculated Pay</th>
                <th style="padding: 10px 8px;">Description / Assigned Tasks</th>
              </tr>
            </thead>
            <tbody>
              ${logsHtml || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #a0aec0; font-style: italic;">No log records found for this period.</td></tr>'}
            </tbody>
          </table>

          <div class="summary-totals">
            <div class="total-row">
              <span>Aggregated Duration:</span>
              <span>${totalHrs.toFixed(2)} hrs</span>
            </div>
            <div class="total-row">
              <span>Settlement Rate:</span>
              <span>₱${rate.toFixed(2)} / hr</span>
            </div>
            <div class="total-row">
              <span>Total Settlement Pay:</span>
              <span>₱${totalPayout.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 80px; margin-bottom: 40px; font-size: 12px;">
            <div style="border-top: 1px solid #718096; width: 200px; text-align: center; padding-top: 8px;">
              Virtual Assistant Signature
            </div>
            <div style="border-top: 1px solid #718096; width: 200px; text-align: center; padding-top: 8px;">
              Authorized Administrator Sign
            </div>
          </div>

          <div class="footer">
            This report is a system-generated statement of hours logged under the Zuki Creatives Portal. 
            Confidential. © ${new Date().getFullYear()} Zuki Creatives.
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setSuccessMessage(`PDF Report for @${va.username} opened in a new print window.`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

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
    if (!token) return;
    fetchUsers();
    fetchTasks();
  }, [token]);

  // Calculate team wide metrics
  const totalMinutes = useMemo(() => logs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0), [logs]);
  const totalHours = useMemo(() => (totalMinutes / 60).toFixed(1), [totalMinutes]);

  const totalCost = useMemo(() => logs.reduce((sum, l) => {
    const matchedUser = usersList.find(u => u.username === l.username);
    const rate = matchedUser ? matchedUser.hourlyRate : (l.role === 'admin' ? 75 : 200);
    const hours = (l.durationMinutes || 0) / 60;
    return sum + (hours * rate);
  }, 0), [logs, usersList]);

  const activeWorkers = useMemo(() => logs.filter(l => !l.endTime), [logs]);
  const uniqueUsernames = useMemo(() => Array.from(new Set(logs.map(l => l.username))), [logs]);

  const filteredLogs = useMemo(() => logs.filter(log => {
    if (filterUser !== 'all' && log.username !== filterUser) return false;
    if (filterType !== 'all') {
      if (filterType === 'manual' && !log.isManual) return false;
      if (filterType === 'timer' && log.isManual) return false;
      if (filterType === 'active' && log.endTime) return false;
    }
    return true;
  }), [logs, filterUser, filterType]);

  // Export to CSV Utility (PESOS)
  const handleExportCSV = () => {
    try {
      const headers = ['Date', 'Worker Name', 'Role', 'Log Type', 'Hours Logged', 'Hourly Rate (PHP)', 'Total Liabilities (PHP)', 'Task Description'];
      const rows = filteredLogs.map(log => {
        const date = new Date(log.startTime).toLocaleDateString();
        const roleStr = log.role.toUpperCase();
        const typeStr = !log.endTime ? 'ACTIVE' : (log.isManual ? 'MANUAL' : 'TIMER');
        const hrs = (log.durationMinutes / 60).toFixed(2);
        
        const matchedUser = usersList.find(u => u.username === log.username);
        const rate = matchedUser ? matchedUser.hourlyRate : (log.role === 'admin' ? 75 : 200);
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
    setEditUserNotification(u.notificationTime || '09:00');
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
          hourlyRate: parseFloat(editUserRate) || 200,
          scheduleStart: editUserStart,
          scheduleEnd: editUserEnd,
          notificationTime: editUserNotification,
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
                      const rate = matchedUser ? matchedUser.hourlyRate : (log.role === 'admin' ? 75 : 200);
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
                            ) : !log.endTime ? (
                              <span className="inline-flex items-center text-amber-400 font-medium">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse mr-1.5"></span>
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
                              !log.endTime 
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' 
                                : log.isManual 
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/20' 
                                : 'bg-brand-peach/10 text-brand-peach border border-brand-peach/20'
                            }`}>
                              {!log.endTime ? 'ACTIVE' : (log.isManual ? 'MANUAL' : 'TIMER')}
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
        <div className="space-y-6">

          {/* Invite New VA */}
          <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide flex items-center gap-2">
                  <UserPlus size={18} /> Invite New Team Member
                </h2>
                <p className="text-xs text-brand-cream/60 mt-0.5">Send a Supabase email invite to onboard a new VA. They'll choose their own username and password via the invite link.</p>
              </div>
              <button
                onClick={() => { setShowInviteForm(!showInviteForm); setInviteResult(null); setErrorMessage(''); }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  showInviteForm
                    ? 'bg-brand-brown border-brand-peach/20 text-brand-cream/60 hover:text-brand-cream'
                    : 'bg-brand-peach/10 border-brand-peach/20 text-brand-peach hover:bg-brand-peach/20'
                }`}
              >
                {showInviteForm ? <><X size={13} /> Cancel</> : <><Mail size={13} /> Send Invite</>}
              </button>
            </div>

            {/* Invite result banner */}
            {inviteResult && (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                <p className="text-sm text-emerald-300 font-medium flex items-center gap-2">
                  <Check size={15} className="shrink-0" /> {inviteResult.message}
                </p>
                {inviteResult.tempCredentials && (
                  <div className="bg-brand-brown/40 border border-brand-peach/15 rounded-xl p-3 space-y-2 font-mono text-xs">
                    <p className="text-brand-peach/60 uppercase tracking-widest text-[9px] font-bold">Temporary Credentials</p>
                    <div className="flex items-center justify-between">
                      <span className="text-brand-cream/70">Username:</span>
                      <span className="text-brand-peach font-bold">{inviteResult.tempCredentials.username}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-brand-cream/70">Password:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-brand-peach font-bold">
                          {showTempPassword ? inviteResult.tempCredentials.password : '••••••••••'}
                        </span>
                        <button onClick={() => setShowTempPassword(!showTempPassword)} className="text-brand-peach/40 hover:text-brand-peach transition-colors cursor-pointer">
                          {showTempPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                        <button
                          onClick={() => { navigator.clipboard.writeText(inviteResult!.tempCredentials!.password); }}
                          className="text-brand-peach/40 hover:text-brand-peach transition-colors cursor-pointer"
                          title="Copy password"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px] text-brand-cream/30 mt-1">Share these securely. The VA should change their password after first login.</p>
                  </div>
                )}
              </div>
            )}

            {showInviteForm && (
              <form onSubmit={handleSendInvite} className="space-y-4 pt-2 border-t border-brand-peach/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Email Address *</label>
                    <input type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      placeholder="va@example.com"
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream placeholder:text-brand-peach/25 focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 font-mono" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Full Name *</label>
                    <input type="text" required value={inviteName} onChange={e => setInviteName(e.target.value)}
                      placeholder="Jane Santos"
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream placeholder:text-brand-peach/25 focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Role</label>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)}
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream focus:outline-none focus:ring-1 focus:ring-brand-peach/20 cursor-pointer">
                      <option value="va">Virtual Assistant (VA)</option>
                      <option value="developer">Developer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Work Type</label>
                    <select value={inviteWorkType} onChange={e => setInviteWorkType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream focus:outline-none focus:ring-1 focus:ring-brand-peach/20 cursor-pointer">
                      <option value="part-time">Part-Time</option>
                      <option value="full-time">Full-Time</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Hourly Rate (₱)</label>
                    <input type="number" min="0" value={inviteRate} onChange={e => setInviteRate(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream font-mono focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Monthly Hours Cap</label>
                    <input type="number" min="1" value={inviteCap} onChange={e => setInviteCap(e.target.value)}
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream font-mono focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Shift Start</label>
                    <input type="text" value={inviteStart} onChange={e => setInviteStart(e.target.value)} placeholder="09:00"
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream font-mono focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40" />
                  </div>
                  <div>
                    <label className="block text-[9px] font-mono font-bold uppercase tracking-widest text-brand-peach/50 mb-1.5">Shift End</label>
                    <input type="text" value={inviteEnd} onChange={e => setInviteEnd(e.target.value)} placeholder="17:00"
                      className="w-full px-3 py-2 bg-brand-brown/40 border border-brand-peach/15 rounded-xl text-sm text-brand-cream font-mono focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40" />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={inviteLoading}
                    className="px-6 py-2.5 bg-brand-peach hover:bg-brand-peach-hover disabled:opacity-50 text-brand-brown font-bold text-sm rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-brand-peach/10">
                    <Mail size={14} />
                    {inviteLoading ? 'Sending invite…' : 'Send Invite Email'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* VA Shift Hours & Earnings Summary Table/Record */}
          <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg space-y-4">
            <div>
              <h2 className="font-serif font-bold text-brand-peach text-lg tracking-wide">VA Hours & Earnings Report Ledger</h2>
              <p className="text-xs text-brand-cream/60">Real-time consolidated statement of hours logged and liabilities calculated at each VA's designated hourly rate (Standard rate: ₱200/hr).</p>
            </div>

            {isLoadingUsers ? (
              <div className="p-4 text-center text-brand-peach/50 text-xs">Generating report ledger...</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-brand-peach/10 bg-brand-brown/20">
                <table className="w-full border-collapse text-left text-xs text-brand-cream/80">
                  <thead className="bg-brand-brown/60 font-mono font-bold uppercase text-brand-peach/70 border-b border-brand-peach/10">
                    <tr>
                      <th className="px-4 py-3">Virtual Assistant</th>
                      <th className="px-4 py-3">Today's Hours</th>
                      <th className="px-4 py-3">Today's Pay</th>
                      <th className="px-4 py-3">Weekly Hours</th>
                      <th className="px-4 py-3">Weekly Pay</th>
                      <th className="px-4 py-3">Monthly Hours</th>
                      <th className="px-4 py-3">Monthly Pay</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Reports</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-peach/10 font-mono">
                    {(() => {
                      const vaUsers = usersList.filter(u => u.role !== 'admin');
                      if (vaUsers.length === 0) {
                        return (
                          <tr>
                            <td colSpan={9} className="px-4 py-6 text-center text-brand-cream/30 italic">No Virtual Assistant records configured.</td>
                          </tr>
                        );
                      }

                      return vaUsers.map((va) => {
                        const vaLogs = logs.filter(l => l.username === va.username);
                        const now = new Date();
                        
                        // Today filter boundary
                        const todayStr = now.toISOString().split('T')[0];

                        // Week boundary (Sunday of current week)
                        const startOfWeek = new Date();
                        startOfWeek.setDate(now.getDate() - now.getDay());
                        startOfWeek.setHours(0, 0, 0, 0);

                        // Month boundary (1st of current month)
                        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                        startOfMonth.setHours(0, 0, 0, 0);

                        let minsToday = 0;
                        let minsWeek = 0;
                        let minsMonth = 0;

                        vaLogs.forEach(log => {
                          const logStart = new Date(log.startTime);
                          let duration = log.durationMinutes || 0;
                          if (!log.endTime) {
                            duration = Math.floor((Date.now() - logStart.getTime()) / 60000);
                          }

                          // Today
                          if (log.startTime.startsWith(todayStr)) {
                            minsToday += duration;
                          }
                          // This Week
                          if (logStart >= startOfWeek) {
                            minsWeek += duration;
                          }
                          // This Month
                          if (logStart >= startOfMonth) {
                            minsMonth += duration;
                          }
                        });

                        const hrsToday = minsToday / 60;
                        const hrsWeek = minsWeek / 60;
                        const hrsMonth = minsMonth / 60;

                        const rate = va.hourlyRate || 200;
                        const payToday = hrsToday * rate;
                        const payWeek = hrsWeek * rate;
                        const payMonth = hrsMonth * rate;

                        const isClockedIn = logs.some(l => l.username === va.username && !l.endTime);

                        return (
                          <tr key={va.id} className="hover:bg-brand-brown/40 transition-colors">
                            <td className="px-4 py-3 font-sans font-bold text-brand-cream flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-brand-peach/10 border border-brand-peach/20 overflow-hidden flex items-center justify-center text-[10px] italic">
                                {va.photoUrl ? (
                                  <img src={va.photoUrl} alt={va.name} className="h-full w-full object-cover" />
                                ) : (
                                  va.name.substring(0, 1)
                                )}
                              </div>
                              <div>
                                <span className="block leading-tight text-xs">{va.name}</span>
                                <span className="text-[10px] font-mono text-brand-peach/60 leading-none">@{va.username}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-semibold text-brand-cream">{hrsToday.toFixed(1)} hrs</td>
                            <td className="px-4 py-3 text-brand-peach font-bold">₱{payToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-brand-cream/80">{hrsWeek.toFixed(1)} hrs</td>
                            <td className="px-4 py-3 text-brand-peach">₱{payWeek.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-brand-cream/80">{hrsMonth.toFixed(1)} hrs / {va.monthlyHoursCap}h</td>
                            <td className="px-4 py-3 text-brand-peach">₱{payMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3">
                              {isClockedIn ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-bold uppercase tracking-wider animate-pulse">
                                  ● Working
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-brown text-brand-cream/40 border border-brand-peach/5 text-[9px] font-bold uppercase tracking-wider">
                                  Offline
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => {
                                  setSelectedExportVa(va);
                                  setExportTimeframe('month'); // default to month
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-brand-peach/15 text-brand-peach hover:bg-brand-peach hover:text-brand-brown border border-brand-peach/20 hover:border-transparent text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Export PDF or CSV Productivity Statement"
                              >
                                <FileDown size={11} /> Export
                              </button>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

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
                              setEditUserRate('200');
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
                        <span className="text-[9px] font-mono text-brand-peach/50 uppercase block mb-1">Notification Time</span>
                        {isEditingUser ? (
                          <input
                            type="text"
                            value={editUserNotification}
                            placeholder="08:45"
                            onChange={(e) => setEditUserNotification(e.target.value)}
                            className="w-full bg-brand-brown border border-brand-peach/20 rounded px-2 py-1 text-brand-cream text-center font-mono text-[11px]"
                          />
                        ) : (
                          <span className="font-mono text-brand-cream">{u.notificationTime || '09:00'}</span>
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
                  if (filterTaskUser !== 'all' && t.userName !== filterTaskUser) return false;
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
                          const owner = usersList.find(u => u.username === task.userName);
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
                                    <img src={owner.photoUrl} alt={task.userName} className="h-full w-full object-cover" />
                                  ) : (
                                    <span className="font-serif text-[8px] font-bold text-brand-peach">{(owner?.name || task.userName).substring(0, 1)}</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-brand-cream/60 truncate">
                                  {owner?.name || task.userName}
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

      {/* EXPORT PORTAL MODAL */}
      {selectedExportVa && (
        <div className="fixed inset-0 bg-brand-brown/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in" id="export-modal">
          <div className="bg-brand-brown-card border border-brand-peach/20 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5 relative">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif font-bold text-brand-peach text-lg tracking-wide">Generate Productivity Report</h3>
                <p className="text-xs text-brand-cream/60">Export a pristine settlement statement and work ledger.</p>
              </div>
              <button 
                onClick={() => setSelectedExportVa(null)}
                className="text-brand-peach/40 hover:text-brand-peach p-1 hover:bg-brand-peach/10 rounded-lg transition-colors cursor-pointer"
                id="close-export-modal"
              >
                <X size={18} />
              </button>
            </div>

            {/* Associate Card */}
            <div className="p-3 bg-brand-brown/40 border border-brand-peach/10 rounded-2xl flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-brand-peach/10 border border-brand-peach/20 overflow-hidden flex items-center justify-center font-bold font-serif italic text-sm">
                {selectedExportVa.photoUrl ? (
                  <img src={selectedExportVa.photoUrl} alt={selectedExportVa.name} className="h-full w-full object-cover" />
                ) : (
                  selectedExportVa.name.substring(0, 1)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-brand-cream text-sm leading-tight truncate">{selectedExportVa.name}</h4>
                <p className="text-xs text-brand-cream/40 font-mono">@{selectedExportVa.username} • {selectedExportVa.email}</p>
                <p className="text-[10px] text-brand-peach/80 font-mono mt-0.5">Rate: ₱{(selectedExportVa.hourlyRate || 200).toFixed(2)}/hr • Limit: {selectedExportVa.monthlyHoursCap || 50}h/mo</p>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest">Select Report Timeframe</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'today', label: 'Today', desc: "Today's log entries" },
                  { id: 'week', label: 'This Week', desc: 'Current calendar week' },
                  { id: 'month', label: 'This Month', desc: 'Current calendar month' },
                  { id: 'all', label: 'All History', desc: 'All logs since seed' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setExportTimeframe(item.id as any)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      exportTimeframe === item.id 
                        ? 'bg-brand-peach/15 border-brand-peach text-brand-peach shadow-inner' 
                        : 'bg-brand-brown/20 border-brand-peach/10 hover:border-brand-peach/30 text-brand-cream/80'
                    }`}
                  >
                    <span className="text-xs font-bold font-mono">{item.label}</span>
                    <span className="text-[9px] opacity-60 mt-0.5 leading-snug">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-brand-peach/10 flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => {
                  exportToPDF(selectedExportVa, exportTimeframe);
                  setSelectedExportVa(null);
                }}
                className="flex-1 py-2.5 px-4 bg-brand-peach text-brand-brown hover:bg-brand-peach/90 font-mono font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                id="export-pdf-btn"
              >
                <FileDown size={14} /> Export PDF Report
              </button>
              <button
                onClick={() => {
                  exportToCSV(selectedExportVa, exportTimeframe);
                  setSelectedExportVa(null);
                }}
                className="flex-1 py-2.5 px-4 bg-brand-brown hover:bg-brand-brown/70 border border-brand-peach/20 hover:border-brand-peach/40 text-brand-cream font-mono font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                id="export-csv-btn"
              >
                <FileDown size={14} /> Export CSV Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
