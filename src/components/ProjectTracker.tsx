import React, { useState, useEffect } from 'react';
import { Plus, CheckSquare, Clock, AlertTriangle, Play, CheckCircle2, ChevronRight, Sparkles, Folder, Trash2, Calendar } from 'lucide-react';
import { User, Task } from '../types';

interface ProjectTrackerProps {
  user: User;
  token: string | null;
}

export default function ProjectTracker({ user, token }: ProjectTrackerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [project, setProject] = useState('General');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'Todo' | 'In Progress' | 'In Review' | 'Completed'>('Todo');

  const fetchTasks = async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [token]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !project.trim()) {
      setErrorMsg('Task Title and Project category are required.');
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: title.trim(),
          project: project.trim(),
          status,
          priority,
          description: description.trim()
        })
      });

      if (!res.ok) {
        throw new Error('Failed to create new task');
      }

      setSuccessMsg('Task created and logged successfully!');
      setTitle('');
      setDescription('');
      setShowCreateForm(false);
      fetchTasks();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleUpdateStatus = async (taskId: string, nextStatus: 'Todo' | 'In Progress' | 'In Review' | 'Completed') => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      });

      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSuccessMsg('Task deleted successfully.');
        fetchTasks();
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  // Group tasks by status
  const columns: Array<{
    id: 'Todo' | 'In Progress' | 'In Review' | 'Completed';
    label: string;
    bgColor: string;
    textColor: string;
    borderColor: string;
  }> = [
    { id: 'Todo', label: 'To Do', bgColor: 'bg-brand-brown/40', textColor: 'text-brand-cream/60', borderColor: 'border-brand-peach/10' },
    { id: 'In Progress', label: 'In Progress', bgColor: 'bg-amber-500/5', textColor: 'text-amber-300', borderColor: 'border-amber-500/20' },
    { id: 'In Review', label: 'In Review', bgColor: 'bg-indigo-500/5', textColor: 'text-indigo-300', borderColor: 'border-indigo-500/20' },
    { id: 'Completed', label: 'Completed', bgColor: 'bg-emerald-500/5', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' }
  ];

  return (
    <div className="space-y-6">
      {/* Tracker Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-bold text-brand-peach text-xl tracking-wide flex items-center gap-2">
            <CheckSquare size={20} /> Project Task Board
          </h2>
          <p className="text-xs text-brand-cream/60">Organize, transition, and detail your active responsibilities on the team.</p>
        </div>
        <button
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setErrorMsg('');
          }}
          className="px-4 py-2.5 bg-brand-peach hover:bg-brand-peach-hover text-brand-brown font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 self-start shadow-md shadow-brand-peach/5 cursor-pointer"
        >
          <Plus size={14} />
          {showCreateForm ? 'Cancel Creation' : 'Create New Task'}
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-500/15 border border-rose-500/20 text-rose-300 text-xs rounded-xl">
          ⚠️ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
          ✓ {successMsg}
        </div>
      )}

      {/* Task Creation Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateTask} className="bg-brand-brown-card/70 p-6 rounded-2xl border border-brand-peach/10 space-y-4 animate-fade-in max-w-2xl">
          <h3 className="font-serif font-bold text-brand-cream text-sm uppercase tracking-wider">New Task Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Task Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Clean up duplicated email lists"
                className="w-full px-3 py-2.5 text-xs bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 text-brand-cream"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Project / Category</label>
              <input
                type="text"
                required
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g. Lead Generation"
                className="w-full px-3 py-2.5 text-xs bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 text-brand-cream"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
                className="w-full px-3 py-2.5 text-xs bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 text-brand-cream font-mono"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Starting Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 text-xs bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 text-brand-cream font-mono"
              >
                <option value="Todo">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="In Review">In Review</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail the target goals, steps, or instructions of this task..."
              className="w-full px-3 py-2.5 text-xs bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-peach/20 focus:border-brand-peach/40 text-brand-cream placeholder:text-brand-peach/20"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-brand-peach hover:bg-brand-peach-hover text-brand-brown font-bold rounded-xl text-xs transition-all shadow-lg shadow-brand-peach/5 cursor-pointer"
          >
            Confirm & Log Task
          </button>
        </form>
      )}

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {columns.map((col) => {
          const columnTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className={`flex flex-col p-4 rounded-2xl border ${col.bgColor} ${col.borderColor} min-h-[300px]`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-brand-peach/10">
                <span className={`text-xs font-mono font-bold uppercase tracking-wider ${col.textColor}`}>
                  {col.label}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-brown text-brand-peach/70">
                  {columnTasks.length}
                </span>
              </div>

              {/* Task Cards List */}
              <div className="flex-1 space-y-3 overflow-y-auto max-h-[450px] pr-1">
                {columnTasks.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-brand-cream/30 italic border border-dashed border-brand-peach/5 rounded-xl">
                    No tasks in {col.label}
                  </div>
                ) : (
                  columnTasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-brand-brown-card/95 p-4 rounded-xl border border-brand-peach/10 hover:border-brand-peach/20 shadow-md space-y-3 transition-all"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="px-2 py-0.5 rounded bg-brand-brown text-[9px] font-mono font-bold text-brand-peach tracking-wide flex items-center gap-1 border border-brand-peach/5">
                          <Folder size={10} /> {task.project}
                        </span>
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          task.priority === 'High' 
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/20'
                            : task.priority === 'Medium'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20'
                        }`}>
                          {task.priority}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-xs font-semibold text-brand-cream leading-snug">{task.title}</h4>
                        {task.description && (
                          <p className="text-[10px] text-brand-cream/50 mt-1 leading-relaxed line-clamp-3">
                            {task.description}
                          </p>
                        )}
                      </div>

                      {/* Transition controls */}
                      <div className="pt-2 border-t border-brand-peach/5 flex items-center justify-between text-[10px]">
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="text-brand-peach/40 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-all cursor-pointer"
                          title="Delete Task"
                        >
                          <Trash2 size={12} />
                        </button>

                        <div className="flex items-center gap-1.5">
                          {col.id !== 'Todo' && (
                            <button
                              onClick={() => {
                                const states: ('Todo' | 'In Progress' | 'In Review' | 'Completed')[] = ['Todo', 'In Progress', 'In Review', 'Completed'];
                                const currIdx = states.indexOf(col.id);
                                handleUpdateStatus(task.id, states[currIdx - 1]);
                              }}
                              className="px-1.5 py-0.5 bg-brand-brown hover:bg-brand-brown/70 text-brand-peach/80 rounded border border-brand-peach/10 cursor-pointer text-[9px]"
                            >
                              ◀ Back
                            </button>
                          )}
                          {col.id !== 'Completed' && (
                            <button
                              onClick={() => {
                                const states: ('Todo' | 'In Progress' | 'In Review' | 'Completed')[] = ['Todo', 'In Progress', 'In Review', 'Completed'];
                                const currIdx = states.indexOf(col.id);
                                handleUpdateStatus(task.id, states[currIdx + 1]);
                              }}
                              className="px-1.5 py-0.5 bg-brand-peach/20 hover:bg-brand-peach/30 text-brand-peach font-bold rounded border border-brand-peach/20 cursor-pointer text-[9px]"
                            >
                              Move ▶
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
