export type UserRole = 'admin' | 'va' | 'developer';

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  hourlyRate: number; // can be backup, but we calculate based on workType
  workType: 'part-time' | 'full-time';
  scheduleStart: string; // e.g. "09:00" (24h format)
  scheduleEnd: string; // e.g. "17:00"
  photoUrl?: string; // base64 or url
  monthlyHoursCap: number; // monthly hours cap
}

export interface Task {
  id: string;
  userId: string;
  userName: string;
  title: string;
  project: string;
  status: 'Todo' | 'In Progress' | 'In Review' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  description: string;
  createdAt: string; // ISO string
}

export interface TimeLog {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: UserRole;
  startTime: string; // ISO String
  endTime: string | null; // ISO String or null if currently clock-in
  description: string;
  isManual: boolean;
  durationMinutes: number; // calculated at completion or manual input
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

