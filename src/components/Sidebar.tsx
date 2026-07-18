import React from 'react';
import { LayoutDashboard, Clock, Settings, ShieldAlert, LogOut, User as UserIcon } from 'lucide-react';
import { User } from '../types';
import { logoZuki } from '../utils/assets';

interface SidebarProps {
  user: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ user, activeTab, setActiveTab, onLogout }: SidebarProps) {
  const menuItems = user.role === 'admin'
    ? [{ id: 'admin', label: 'Admin Panel', icon: ShieldAlert }]
    : [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'tracker', label: 'Time Tracker', icon: Clock },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];

  if (user.role === 'admin') {
    menuItems.push({ id: 'admin', label: 'Admin Panel', icon: ShieldAlert });
  }

  return (
    <aside className="w-64 bg-brand-brown-card text-brand-cream flex flex-col border-r border-brand-peach/10 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-brand-peach/10 flex items-center space-x-3">
        <div className="h-10 flex items-center justify-center">
          <img 
            src={logoZuki} 
            alt="Zuki" 
            referrerPolicy="no-referrer"
            className="h-full object-contain"
          />
        </div>
        <div>
          <h1 className="font-serif font-bold text-base tracking-tight text-brand-peach">Zuki Portal</h1>
          <span className="text-[10px] text-brand-peach/50 font-mono tracking-widest uppercase">Admin/VA Console</span>
        </div>
      </div>

      {/* User Information Display */}
      <div className="p-4 mx-4 my-4 bg-brand-brown/30 border border-brand-peach/10 rounded-2xl flex items-center space-x-3">
        <div className="h-10 w-10 rounded-full bg-brand-peach/10 flex items-center justify-center border border-brand-peach/20 text-brand-peach font-serif italic font-bold overflow-hidden shrink-0">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt={user.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          ) : (
            user.name.substring(0, 1)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-brand-cream truncate">{user.name}</h2>
          <div className="flex items-center space-x-1 mt-0.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wide uppercase ${
              user.role === 'admin' 
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/20' 
                : user.role === 'developer'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20'
                : 'bg-brand-peach/20 text-brand-peach border border-brand-peach/20'
            }`}>
              {user.role}
            </span>
            <span className="text-[10px] text-brand-peach/50 font-mono">₱{user.hourlyRate}/hr</span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-brand-peach text-brand-brown font-bold shadow-md shadow-brand-peach/10'
                  : 'text-brand-peach/70 hover:bg-brand-peach/10 hover:text-brand-cream'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout Footer */}
      <div className="p-4 border-t border-brand-peach/10">
        <button
          id="btn-logout"
          onClick={onLogout}
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium text-brand-peach/60 hover:bg-rose-500/10 hover:text-rose-300 border border-transparent hover:border-rose-500/10 transition-all duration-200 cursor-pointer"
        >
          <LogOut size={18} />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
