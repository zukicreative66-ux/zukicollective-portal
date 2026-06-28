import React, { useState } from 'react';
import { Settings, User as UserIcon, Shield, Clock, Award, Landmark } from 'lucide-react';
import { User } from '../types';

interface SettingsViewProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
  token: string | null;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80',
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80',
];

export default function SettingsView({ user, onUserUpdate, token }: SettingsViewProps) {
  const [name, setName] = useState(user.name);
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const readResponsePayload = async (response: Response) => {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setSaveStatus({ type: 'error', message: 'Name cannot be empty.' });
      return;
    }

    setIsSaving(true);
    setSaveStatus(null);

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          photoUrl: photoUrl.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile settings.');
      }

      const payload = await readResponsePayload(response);
      const updatedUser = payload && typeof payload === 'object' && 'user' in payload ? (payload as any).user : payload;
      onUserUpdate(updatedUser);
      setSaveStatus({ type: 'success', message: 'Profile settings updated successfully!' });
      setTimeout(() => setSaveStatus(null), 4000);
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || 'An error occurred.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl text-brand-cream">
      {/* Profile Header Card */}
      <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-brand-brown border-2 border-brand-peach/30 shadow-lg overflow-hidden flex items-center justify-center font-serif italic font-bold text-3xl text-brand-peach shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              user.name.substring(0, 1)
            )}
          </div>
          <div className="text-center md:text-left">
            <h2 className="text-xl font-serif font-bold text-brand-cream">{user.name}</h2>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start items-center mt-1">
              <span className="text-xs text-brand-peach/60 font-mono">ID: {user.username}</span>
              <span className="text-xs text-brand-peach/40">•</span>
              <span className="text-xs text-brand-peach/60 font-mono capitalize">{user.workType} Engagement</span>
            </div>
          </div>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-xs font-mono font-bold tracking-widest uppercase ${
          user.role === 'admin' 
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/20' 
            : 'bg-brand-peach/20 text-brand-peach border border-brand-peach/20'
        }`}>
          {user.role} ROLE
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Settings Form */}
        <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg lg:col-span-2 space-y-6">
          <div>
            <h3 className="font-serif font-bold text-brand-peach text-lg tracking-wide flex items-center gap-2">
              <UserIcon size={18} /> Edit Profile Details
            </h3>
            <p className="text-xs text-brand-cream/60">Manage your profile name and visual display avatar photo.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/10 focus:border-brand-peach/50 text-brand-cream transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-1.5">Profile Photo URL</label>
              <input
                type="text"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="Paste an image URL (Unsplash, Imgur, etc.)"
                className="w-full px-4 py-3 text-sm bg-brand-brown/40 border border-brand-peach/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-peach/10 focus:border-brand-peach/50 text-brand-cream font-mono transition-all"
              />
            </div>

            {/* Avatar Presets Selection */}
            <div>
              <label className="block text-xs font-mono font-bold text-brand-peach/60 uppercase tracking-widest mb-2">Or Choose from Presets</label>
              <div className="flex gap-4 flex-wrap">
                {AVATAR_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPhotoUrl(preset)}
                    className={`h-12 w-12 rounded-full overflow-hidden border-2 transition-all hover:scale-105 cursor-pointer ${
                      photoUrl === preset ? 'border-brand-peach scale-110 shadow-md shadow-brand-peach/25' : 'border-brand-peach/20 hover:border-brand-peach/50'
                    }`}
                  >
                    <img src={preset} alt={`preset-${idx}`} className="h-full w-full object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPhotoUrl('')}
                  className={`h-12 px-3 rounded-2xl text-xs font-mono transition-all border cursor-pointer ${
                    photoUrl === '' ? 'border-brand-peach bg-brand-peach/10 text-brand-peach' : 'border-brand-peach/10 text-brand-peach/60 hover:border-brand-peach/30'
                  }`}
                >
                  No Photo (Initials)
                </button>
              </div>
            </div>

            {/* Save Status Banner */}
            {saveStatus && (
              <div className={`p-4 rounded-xl text-xs font-medium flex items-center gap-2 border animate-fade-in ${
                saveStatus.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}>
                <span>{saveStatus.type === 'success' ? '✓' : '⚠️'}</span>
                <p>{saveStatus.message}</p>
              </div>
            )}

            <div className="pt-4 border-t border-brand-peach/10 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-3 bg-brand-peach hover:bg-brand-peach-hover text-brand-brown font-bold rounded-xl text-sm transition-all cursor-pointer shadow-lg shadow-brand-peach/5 disabled:opacity-50"
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile Settings'}
              </button>
            </div>
          </form>
        </div>

        {/* Schedule & Compensation Metadata Card (Read-only on this view) */}
        <div className="bg-brand-brown-card p-6 rounded-3xl border border-brand-peach/10 shadow-lg space-y-6">
          <div>
            <h3 className="font-serif font-bold text-brand-cream text-sm uppercase tracking-wider flex items-center gap-2">
              <Shield size={16} className="text-brand-peach" /> Employment Profile
            </h3>
            <p className="text-[11px] text-brand-cream/60 mt-1">Designated billing structures managed by supervisors.</p>
          </div>

          <div className="space-y-4">
            {/* Currency Block */}
            <div className="p-3 bg-brand-brown/30 border border-brand-peach/10 rounded-xl flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-brand-peach/10 flex items-center justify-center text-brand-peach text-sm font-bold shrink-0">
                ₱
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase text-brand-peach/60 block leading-tight">Compensation Rate</span>
                <p className="text-sm font-mono font-bold text-brand-cream">₱{user.hourlyRate} PHP / Hour</p>
              </div>
            </div>

            {/* Schedule Block */}
            <div className="p-3 bg-brand-brown/30 border border-brand-peach/10 rounded-xl flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-brand-peach/10 flex items-center justify-center text-brand-peach shrink-0">
                <Clock size={16} />
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase text-brand-peach/60 block leading-tight">Shift Schedule</span>
                <p className="text-sm font-mono font-bold text-brand-cream">{user.scheduleStart} - {user.scheduleEnd}</p>
              </div>
            </div>

            {/* Monthly Hours Cap Block */}
            <div className="p-3 bg-brand-brown/30 border border-brand-peach/10 rounded-xl flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-brand-peach/10 flex items-center justify-center text-brand-peach shrink-0">
                <Award size={16} />
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase text-brand-peach/60 block leading-tight">Monthly Hours Limit</span>
                <p className="text-sm font-mono font-bold text-brand-cream">{user.monthlyHoursCap} Hours Capped</p>
              </div>
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}
