import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { loadPortalEnvironment } from "./auth-env";

const app = express();
const PORT = Number(process.env.PORT || 3000);

const isVercel = !!process.env.VERCEL;
const portalEnv = loadPortalEnvironment();
const ORIGINAL_DB_FILE = path.join(process.cwd(), "db_data.json");
const DB_FILE = isVercel 
  ? path.join("/tmp", "db_data.json") 
  : ORIGINAL_DB_FILE;

// Parse Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || "https://yksuujwiczjpidigumnm.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const useSupabase = !!supabaseServiceKey;
const supabase = useSupabase ? createClient(supabaseUrl, supabaseServiceKey!) : null;

if (useSupabase) {
  console.log(`[Database] Running with Supabase active at: ${supabaseUrl}`);
} else {
  console.log(`[Database] Running with local JSON database fallback: ${DB_FILE}`);
}

const resetTokens = new Map<string, { email: string; otp: string; expiresAt: number; attempts: number }>();
const sessionStore = new Map<string, { userId: string; expiresAt: number }>();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash) return false;

  if (storedHash.startsWith("scrypt$")) {
    const [, salt, expectedHash] = storedHash.split("$");
    if (!salt || !expectedHash) return false;

    const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
    if (derivedKey.length !== expectedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(derivedKey, "hex"), Buffer.from(expectedHash, "hex"));
  }

  return crypto.createHash("sha256").update(password).digest("hex") === storedHash;
}

function getSessionCookieOptions() {
  const isSecure = process.env.NODE_ENV === "production" || isVercel;
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

function setSessionCookie(res: express.Response, token: string) {
  res.cookie("portal_session", token, getSessionCookieOptions());
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie("portal_session", { path: "/" });
}

function readSessionToken(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)portal_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function sendResetEmail(email: string, username: string, otp: string): Promise<boolean> {
  const host = process.env.AGENCY_EMAIL_SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.AGENCY_EMAIL_SMTP_PORT || "465");
  const user = process.env.AGENCY_EMAIL_USER;
  const pass = process.env.AGENCY_EMAIL_PASS;

  if (!user || !pass) {
    console.log(`\n=============================================================`);
    console.log(`[SMTP ALERT] Agency SMTP credentials not configured in environment variables.`);
    console.log(`[PASSWORD RESET CODE FOR ${username}]: ${otp}`);
    console.log(`=============================================================\n`);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from: `"Zuki Agency Admin" <${user}>`,
      to: email,
      subject: "Zuki Creatives Portal - VA Password Reset Code",
      text: `Hello ${username},\n\nYou requested to reset your password on the Zuki Creatives Portal.\n\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in 15 minutes.\n\nBest regards,\nZuki Agency Admin`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; background-color: #fcfbf7; color: #2c1a11; border: 1px solid #dfd3c3; border-radius: 12px; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #c8956e; font-family: Georgia, serif; margin-bottom: 20px; text-align: center;">Zuki Creatives VA Portal</h2>
          <p>Hello <strong>${username}</strong>,</p>
          <p>You requested a password reset for your Virtual Assistant account.</p>
          <div style="background-color: #f1ebd9; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; border: 1px solid #e3dec3;">
            <p style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8c7a6b;">Your Verification Code</p>
            <span style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #c8956e;">${otp}</span>
          </div>
          <p style="font-size: 12px; color: #8c7a6b; line-height: 1.5;">This verification code is valid for 15 minutes. If you did not make this request, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #dfd3c3; margin: 20px 0;" />
          <p style="font-size: 11px; color: #a69585; text-align: center; margin: 0;">Zuki Creatives Agency &copy; 2026</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SMTP SUCCESS] Password reset code sent successfully via email to ${email}`);
    return true;
  } catch (err) {
    console.error(`[SMTP ERROR] Failed to send email via SMTP:`, err);
    return false;
  }
}

// Unified Database Structures
interface DBUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  name: string;
  role: "admin" | "va" | "developer";
  hourlyRate: number;
  workType: 'part-time' | 'full-time';
  scheduleStart: string;
  scheduleEnd: string;
  photoUrl?: string;
  monthlyHoursCap: number;
}

interface DBLog {
  id: string;
  userId: string;
  username: string;
  name: string;
  role: "admin" | "va" | "developer";
  startTime: string;
  endTime: string | null;
  description: string;
  isManual: boolean;
  durationMinutes: number;
}

interface DBTask {
  id: string;
  userId: string;
  userName: string;
  title: string;
  project: string;
  status: 'Todo' | 'In Progress' | 'In Review' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  description: string;
  createdAt: string;
}

interface DBStructure {
  users: DBUser[];
  logs: DBLog[];
  tasks: DBTask[];
}

function getSeededUsers(): DBUser[] {
  const adminUsername = portalEnv.devUserName;
  const adminEmail = portalEnv.devUserEmail;
  const adminPassword = portalEnv.devUserPassword;
  const adminName = portalEnv.devUserFullName;
  
  const izavaUsername = portalEnv.izaVaUsername;
  const izavaEmail = portalEnv.izaVaEmail;
  const izavaName = portalEnv.izaVaName;
  const izavaPassword = portalEnv.izaVaPassword;

  return [
    {
      id: "user-admin",
      username: adminUsername,
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      name: adminName,
      role: "admin",
      hourlyRate: 250,
      workType: "full-time",
      scheduleStart: "09:00",
      scheduleEnd: "17:00",
      photoUrl: "",
      monthlyHoursCap: 160,
    },
    {
      id: "user-izava",
      username: izavaUsername,
      email: izavaEmail,
      passwordHash: hashPassword(izavaPassword),
      name: izavaName,
      role: "va",
      hourlyRate: 150,
      workType: "full-time",
      scheduleStart: "09:00",
      scheduleEnd: "17:00",
      photoUrl: "",
      monthlyHoursCap: 160,
    }
  ];
}

function getDefaultDB(): DBStructure {
  const adminUsername = portalEnv.devUserName;
  const adminName = portalEnv.devUserFullName;

  return {
    users: getSeededUsers(),
    logs: [
      {
        id: "log-1",
        userId: "user-maria",
        username: "va_member_a",
        name: "VA Member A",
        role: "va",
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2).toISOString(),
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 2 + 4 * 60 * 60 * 1000).toISOString(),
        description: "Updated client sheets, parsed email queues, and organized calendar events for next week.",
        isManual: false,
        durationMinutes: 240,
      },
      {
        id: "log-2",
        userId: "user-maria",
        username: "va_member_a",
        name: "VA Member A",
        role: "va",
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 1).toISOString(),
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 1 + 5.5 * 60 * 60 * 1000).toISOString(),
        description: "Conducted onboarding calling support and formatted the quarterly metric visual deck.",
        isManual: false,
        durationMinutes: 330,
      },
      {
        id: "log-3",
        userId: "user-admin",
        username: adminUsername,
        name: adminName,
        role: "admin",
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 1.5).toISOString(),
        endTime: new Date(Date.now() - 24 * 60 * 60 * 1000 * 1.5 + 3 * 60 * 60 * 1000).toISOString(),
        description: "Fixed CORS issues, configured system environment variables, and optimized Docker container ingress pipelines.",
        isManual: false,
        durationMinutes: 180,
      },
    ],
    tasks: [
      {
        id: "task-1",
        userId: "user-maria",
        userName: "VA Member A",
        title: "Clean Client Sheets database",
        project: "Database Setup",
        status: "In Progress",
        priority: "High",
        description: "Go through Google Sheets row duplication and run cleanups on customer phone lists.",
        createdAt: new Date().toISOString()
      },
      {
        id: "task-2",
        userId: "user-maria",
        userName: "VA Member A",
        title: "Draft email outreach sequence",
        project: "Marketing Outreach",
        status: "Todo",
        priority: "Medium",
        description: "Write the 3-step follow up campaign for new registered webinar attendees.",
        createdAt: new Date().toISOString()
      },
      {
        id: "task-3",
        userId: "user-juan",
        userName: "VA Member B",
        title: "Format metric report deck",
        project: "Monthly Reporting",
        status: "Completed",
        priority: "High",
        description: "Apply company custom palette, fix line graphs, and export slide deck in PDF format.",
        createdAt: new Date().toISOString()
      }
    ]
  };
}

// Fallback Local File Handlers
function readDB(): DBStructure {
  try {
    const defaultDB = getDefaultDB();
    if (isVercel && !fs.existsSync(DB_FILE)) {
      try {
        if (fs.existsSync(ORIGINAL_DB_FILE)) {
          fs.copyFileSync(ORIGINAL_DB_FILE, DB_FILE);
          console.log(`[Database] Copied initial database file to writable Vercel /tmp space.`);
        } else {
          fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf8");
          console.log(`[Database] Initialized empty database file in writable Vercel /tmp space.`);
        }
      } catch (err) {
        console.error("[Database Error] Failed to initialize file in /tmp, using defaultDB directly:", err);
        return defaultDB;
      }
    } else if (!isVercel && !fs.existsSync(DB_FILE)) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2), "utf8");
      } catch (err) {
        console.error("[Database Error] Failed to write local DB file:", err);
      }
      return defaultDB;
    }

    const raw = fs.readFileSync(DB_FILE, "utf8");
    const db = JSON.parse(raw);

    if (!db.tasks) db.tasks = [];
    if (!db.users) db.users = [];

    // Filter local db users to ONLY contain admin and iza_va
    const adminUsername = (process.env.DEV_USER_NAME || "admin").toLowerCase().trim();
    const izavaUsername = (process.env.IZA_VA_USERNAME || "va_member").toLowerCase().trim();
    db.users = db.users.filter((u: any) => {
      const uName = (u.username || "").toLowerCase().trim();
      return uName === adminUsername || uName === izavaUsername;
    });

    let migrated = false;
    db.users = db.users.map((u: any) => {
      let pwd = u.passwordHash;
      if (pwd && pwd.length !== 64) {
        pwd = hashPassword(pwd);
        migrated = true;
      }
      let email = u.email;
      if (!email) {
        email = u.username === adminUsername ? (process.env.DEV_USER_EMAIL || "admin@example.com") : (process.env.IZA_VA_EMAIL || "va_member@example.com");
        migrated = true;
      }
      return {
        ...u,
        email,
        passwordHash: pwd,
        workType: u.workType || (u.role === 'admin' ? 'full-time' : 'full-time'),
        scheduleStart: u.scheduleStart || "09:00",
        scheduleEnd: u.scheduleEnd || "17:00",
        monthlyHoursCap: u.monthlyHoursCap || 160,
        photoUrl: u.photoUrl || "",
      };
    });

    const usersToVerify = defaultDB.users;
    usersToVerify.forEach(seeded => {
      const exists = db.users.some((u: any) => u.username.toLowerCase().trim() === seeded.username.toLowerCase().trim());
      if (!exists) {
        db.users.push(seeded);
        migrated = true;
      }
    });

    if (migrated || raw.includes("va_team")) {
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
      } catch (err) {
        console.error("[Database Warning] Could not save migration changes (likely read-only context):", err);
      }
    }

    return db;
  } catch (err) {
    console.error("Error reading database file, resetting to default:", err);
    return getDefaultDB();
  }
}

function writeDB(data: DBStructure) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing database file:", err);
  }
}

// Ensure database is initialized and credentials are synced asynchronously
readDB();
syncEnvCredentials().catch(err => {
  console.error("[Startup Sync Alert] Failed to run credential sync on initialization:", err);
});

// Dynamic casing detection and column mapping layer for Supabase/PostgreSQL compatibility
let usersColumnCasing: "camel" | "snake" | "lowercase" | null = null;
let logsColumnCasing: "camel" | "snake" | "lowercase" | null = null;
let tasksColumnCasing: "camel" | "snake" | "lowercase" | null = null;

async function detectUserCasing() {
  if (usersColumnCasing) return usersColumnCasing;
  if (!supabase) return "camel";
  try {
    const { data, error } = await supabase.from("users").select("*").limit(1);
    if (!error && data && data.length > 0) {
      const keys = Object.keys(data[0]);
      if (keys.includes("password_hash")) {
        usersColumnCasing = "snake";
      } else if (keys.includes("passwordhash")) {
        usersColumnCasing = "lowercase";
      } else {
        usersColumnCasing = "camel";
      }
    } else {
      usersColumnCasing = "snake";
    }
  } catch (e) {
    usersColumnCasing = "snake";
  }
  return usersColumnCasing;
}

async function detectLogCasing() {
  if (logsColumnCasing) return logsColumnCasing;
  if (!supabase) return "camel";
  try {
    const { data, error } = await supabase.from("logs").select("*").limit(1);
    if (!error && data && data.length > 0) {
      const keys = Object.keys(data[0]);
      if (keys.includes("user_id")) {
        logsColumnCasing = "snake";
      } else if (keys.includes("userid")) {
        logsColumnCasing = "lowercase";
      } else {
        logsColumnCasing = "camel";
      }
    } else {
      logsColumnCasing = "snake";
    }
  } catch (e) {
    logsColumnCasing = "snake";
  }
  return logsColumnCasing;
}

async function detectTaskCasing() {
  if (tasksColumnCasing) return tasksColumnCasing;
  if (!supabase) return "camel";
  try {
    const { data, error } = await supabase.from("tasks").select("*").limit(1);
    if (!error && data && data.length > 0) {
      const keys = Object.keys(data[0]);
      if (keys.includes("user_id")) {
        tasksColumnCasing = "snake";
      } else if (keys.includes("userid")) {
        tasksColumnCasing = "lowercase";
      } else {
        tasksColumnCasing = "camel";
      }
    } else {
      tasksColumnCasing = "snake";
    }
  } catch (e) {
    tasksColumnCasing = "snake";
  }
  return tasksColumnCasing;
}

function mapUserFromDb(row: any): DBUser {
  if (!row) return row;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.passwordHash ?? row.password_hash ?? row.passwordhash ?? "",
    name: row.name,
    role: row.role,
    hourlyRate: Number(row.hourlyRate ?? row.hourly_rate ?? row.hourlyrate ?? 0),
    workType: row.workType ?? row.work_type ?? row.worktype ?? "full-time",
    scheduleStart: row.scheduleStart ?? row.schedule_start ?? row.schedulestart ?? "09:00",
    scheduleEnd: row.scheduleEnd ?? row.schedule_end ?? row.scheduleend ?? "17:00",
    photoUrl: row.photoUrl ?? row.photo_url ?? row.photourl ?? "",
    monthlyHoursCap: Number(row.monthlyHoursCap ?? row.monthly_hours_cap ?? row.monthlyhourscap ?? 160),
  };
}

function mapLogFromDb(row: any): DBLog {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.userId ?? row.user_id ?? row.userid ?? "",
    username: row.username ?? "",
    name: row.name ?? "",
    role: row.role ?? "va",
    startTime: row.startTime ?? row.start_time ?? row.starttime ?? "",
    endTime: row.endTime ?? row.end_time ?? row.endtime ?? null,
    description: row.description ?? "",
    isManual: !!(row.isManual ?? row.is_manual ?? row.ismanual ?? false),
    durationMinutes: Number(row.durationMinutes ?? row.duration_minutes ?? row.durationminutes ?? 0),
  };
}

function mapTaskFromDb(row: any): DBTask {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.userId ?? row.user_id ?? row.userid ?? "",
    userName: row.userName ?? row.user_name ?? row.username ?? "",
    title: row.title ?? "",
    project: row.project ?? "",
    status: row.status ?? "Todo",
    priority: row.priority ?? "Medium",
    description: row.description ?? "",
    createdAt: row.createdAt ?? row.created_at ?? row.createdat ?? new Date().toISOString(),
  };
}

async function mapUserToDb(user: Partial<DBUser>): Promise<any> {
  const casing = await detectUserCasing();
  const mapped: any = { ...user };
  
  if (casing === "snake") {
    if (user.passwordHash !== undefined) { mapped.password_hash = user.passwordHash; delete mapped.passwordHash; }
    if (user.hourlyRate !== undefined) { mapped.hourly_rate = user.hourlyRate; delete mapped.hourlyRate; }
    if (user.workType !== undefined) { mapped.work_type = user.workType; delete mapped.workType; }
    if (user.scheduleStart !== undefined) { mapped.schedule_start = user.scheduleStart; delete mapped.scheduleStart; }
    if (user.scheduleEnd !== undefined) { mapped.schedule_end = user.scheduleEnd; delete mapped.scheduleEnd; }
    if (user.photoUrl !== undefined) { mapped.photo_url = user.photoUrl; delete mapped.photoUrl; }
    if (user.monthlyHoursCap !== undefined) { mapped.monthly_hours_cap = user.monthlyHoursCap; delete mapped.monthlyHoursCap; }
  } else if (casing === "lowercase") {
    if (user.passwordHash !== undefined) { mapped.passwordhash = user.passwordHash; delete mapped.passwordHash; }
    if (user.hourlyRate !== undefined) { mapped.hourlyrate = user.hourlyRate; delete mapped.hourlyRate; }
    if (user.workType !== undefined) { mapped.worktype = user.workType; delete mapped.workType; }
    if (user.scheduleStart !== undefined) { mapped.schedulestart = user.scheduleStart; delete mapped.scheduleStart; }
    if (user.scheduleEnd !== undefined) { mapped.scheduleend = user.scheduleEnd; delete mapped.scheduleEnd; }
    if (user.photoUrl !== undefined) { mapped.photourl = user.photoUrl; delete mapped.photoUrl; }
    if (user.monthlyHoursCap !== undefined) { mapped.monthlyhourscap = user.monthlyHoursCap; delete mapped.monthlyHoursCap; }
  }
  return mapped;
}

async function mapLogToDb(log: Partial<DBLog>): Promise<any> {
  const casing = await detectLogCasing();
  const mapped: any = { ...log };
  
  if (casing === "snake") {
    if (log.userId !== undefined) { mapped.user_id = log.userId; delete mapped.userId; }
    if (log.startTime !== undefined) { mapped.start_time = log.startTime; delete mapped.startTime; }
    if (log.endTime !== undefined) { mapped.end_time = log.endTime; delete mapped.endTime; }
    if (log.isManual !== undefined) { mapped.is_manual = log.isManual; delete mapped.isManual; }
    if (log.durationMinutes !== undefined) { mapped.duration_minutes = log.durationMinutes; delete mapped.durationMinutes; }
  } else if (casing === "lowercase") {
    if (log.userId !== undefined) { mapped.userid = log.userId; delete mapped.userId; }
    if (log.startTime !== undefined) { mapped.starttime = log.startTime; delete mapped.startTime; }
    if (log.endTime !== undefined) { mapped.endtime = log.endTime; delete mapped.endTime; }
    if (log.isManual !== undefined) { mapped.ismanual = log.isManual; delete mapped.isManual; }
    if (log.durationMinutes !== undefined) { mapped.durationminutes = log.durationMinutes; delete mapped.durationMinutes; }
  }
  return mapped;
}

async function mapTaskToDb(task: Partial<DBTask>): Promise<any> {
  const casing = await detectTaskCasing();
  const mapped: any = { ...task };
  
  if (casing === "snake") {
    if (task.userId !== undefined) { mapped.user_id = task.userId; delete mapped.userId; }
    if (task.userName !== undefined) { mapped.user_name = task.userName; delete mapped.userName; }
    if (task.createdAt !== undefined) { mapped.created_at = task.createdAt; delete mapped.createdAt; }
  } else if (casing === "lowercase") {
    if (task.userId !== undefined) { mapped.userid = task.userId; delete mapped.userId; }
    if (task.userName !== undefined) { mapped.username = task.userName; delete mapped.userName; }
    if (task.createdAt !== undefined) { mapped.createdat = task.createdAt; delete mapped.createdAt; }
  }
  return mapped;
}

function sanitizePostgrestString(val: string): string {
  // PostgREST filter injection mitigation: sanitize control characters that can manipulate search filters
  return val.replace(/[(),'"]/g, "").trim();
}

// Unified Database Adapter Layer
const dbAdapter = {
  async getUsers(): Promise<DBUser[]> {
    const adminUsername = (process.env.DEV_USER_NAME || "admin").toLowerCase().trim();
    const izavaUsername = (process.env.IZA_VA_USERNAME || "va_member").toLowerCase().trim();
    let allUsers: DBUser[] = [];
    if (supabase) {
      const { data, error } = await supabase.from("users").select("*");
      if (!error && data) {
        allUsers = data.map(mapUserFromDb);
      } else {
        console.error("[Supabase Error] getUsers fallback to local:", error);
        const db = readDB();
        allUsers = db.users;
      }
    } else {
      const db = readDB();
      allUsers = db.users;
    }
    return allUsers.filter(u => {
      const uname = (u.username || "").toLowerCase().trim();
      return uname === adminUsername || uname === izavaUsername;
    });
  },

  async getUserByUsername(username: string): Promise<DBUser | null> {
    const cleanUsername = sanitizePostgrestString(username).toLowerCase().trim();
    if (!cleanUsername) return null;

    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .ilike("username", cleanUsername);
      if (!error && data && data.length > 0) {
        return mapUserFromDb(data[0]);
      }
      if (error) {
        console.error("[Supabase Error] getUserByUsername fallback:", error);
      }
    }

    const db = readDB();
    return db.users.find(u => u.username.toLowerCase().trim() === cleanUsername) || null;
  },

  async getUserById(id: string): Promise<DBUser | null> {
    let user: DBUser | null = null;
    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) user = mapUserFromDb(data);
    } else {
      const db = readDB();
      user = db.users.find(u => u.id === id) || null;
    }

    return user;
  },

  async getUserByEmailOrUsername(searchStr: string): Promise<DBUser | null> {
    const cleanSearch = sanitizePostgrestString(searchStr.toLowerCase()).trim();
    if (!cleanSearch) return null;

    if (supabase) {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .or(`username.ilike.${cleanSearch},email.ilike.${cleanSearch}`)
        .maybeSingle();
      if (!error && data) return mapUserFromDb(data);
    }

    const db = readDB();
    return db.users.find(u => u.username.toLowerCase().trim() === cleanSearch || u.email.toLowerCase().trim() === cleanSearch) || null;
  },

  async updateUser(id: string, updates: Partial<DBUser>): Promise<DBUser> {
    if (supabase) {
      const dbUpdates = await mapUserToDb(updates);
      const { data, error } = await supabase
        .from("users")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) {
        const mappedUser = mapUserFromDb(data);
        if (updates.name) {
          const logCasing = await detectLogCasing();
          const updateObj = { name: updates.name };
          const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
          await supabase.from("logs").update(updateObj).eq(logUserIdKey, id);
        }
        return mappedUser;
      }
      console.error("[Supabase Error] updateUser fallback:", error);
    }
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...updates };
      if (updates.name) {
        db.logs.forEach(log => {
          if (log.userId === id) log.name = updates.name!;
        });
      }
      writeDB(db);
      return db.users[idx];
    }
    throw new Error("User not found");
  },

  async getTasks(userId?: string): Promise<DBTask[]> {
    if (supabase) {
      let query = supabase.from("tasks").select("*");
      if (userId) {
        const taskCasing = await detectTaskCasing();
        const taskUserIdKey = taskCasing === "snake" ? "user_id" : (taskCasing === "lowercase" ? "userid" : "userId");
        query = query.eq(taskUserIdKey, userId);
      }
      const orderCol = (await detectTaskCasing()) === "snake" ? "created_at" : "createdAt";
      const { data, error } = await query.order(orderCol, { ascending: false });
      if (!error && data) {
        return data.map(mapTaskFromDb);
      }
      console.error("[Supabase Error] getTasks fallback:", error);
    }
    const db = readDB();
    if (userId) return db.tasks.filter(t => t.userId === userId);
    return db.tasks;
  },

  async createTask(task: DBTask): Promise<DBTask> {
    if (supabase) {
      const dbTask = await mapTaskToDb(task);
      const { data, error } = await supabase
        .from("tasks")
        .insert(dbTask)
        .select()
        .maybeSingle();
      if (!error && data) return mapTaskFromDb(data);
      console.error("[Supabase Error] createTask fallback:", error);
    }
    const db = readDB();
    db.tasks.unshift(task);
    writeDB(db);
    return task;
  },

  async updateTask(id: string, updates: Partial<DBTask>): Promise<DBTask> {
    if (supabase) {
      const dbUpdates = await mapTaskToDb(updates);
      const { data, error } = await supabase
        .from("tasks")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) return mapTaskFromDb(data);
      console.error("[Supabase Error] updateTask fallback:", error);
    }
    const db = readDB();
    const idx = db.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      db.tasks[idx] = { ...db.tasks[idx], ...updates };
      writeDB(db);
      return db.tasks[idx];
    }
    throw new Error("Task not found");
  },

  async deleteTask(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (!error) return true;
      console.error("[Supabase Error] deleteTask fallback:", error);
    }
    const db = readDB();
    const idx = db.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      db.tasks.splice(idx, 1);
      writeDB(db);
      return true;
    }
    return false;
  },

  async getLogs(userId?: string): Promise<DBLog[]> {
    if (supabase) {
      let query = supabase.from("logs").select("*");
      if (userId) {
        const logCasing = await detectLogCasing();
        const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
        query = query.eq(logUserIdKey, userId);
      }
      const orderCol = (await detectLogCasing()) === "snake" ? "start_time" : "startTime";
      const { data, error } = await query.order(orderCol, { ascending: false });
      if (!error && data) {
        return data.map(mapLogFromDb);
      }
      console.error("[Supabase Error] getLogs fallback:", error);
    }
    const db = readDB();
    if (userId) return db.logs.filter(l => l.userId === userId);
    return db.logs;
  },

  async getActiveLog(userId: string): Promise<DBLog | null> {
    if (supabase) {
      const logCasing = await detectLogCasing();
      const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
      const endTimeKey = logCasing === "snake" ? "end_time" : (logCasing === "lowercase" ? "endtime" : "endTime");
      const { data, error } = await supabase
        .from("logs")
        .select("*")
        .eq(logUserIdKey, userId)
        .is(endTimeKey, null)
        .maybeSingle();
      if (!error && data) return mapLogFromDb(data);
      if (error) console.error("[Supabase Error] getActiveLog fallback:", error);
    }
    const db = readDB();
    return db.logs.find(l => l.userId === userId && l.endTime === null) || null;
  },

  async createLog(log: DBLog): Promise<DBLog> {
    if (supabase) {
      const dbLog = await mapLogToDb(log);
      const { data, error } = await supabase
        .from("logs")
        .insert(dbLog)
        .select()
        .maybeSingle();
      if (!error && data) return mapLogFromDb(data);
      console.error("[Supabase Error] createLog fallback:", error);
    }
    const db = readDB();
    db.logs.unshift(log);
    writeDB(db);
    return log;
  },

  async updateLog(id: string, updates: Partial<DBLog>): Promise<DBLog> {
    if (supabase) {
      const dbUpdates = await mapLogToDb(updates);
      const { data, error } = await supabase
        .from("logs")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) return mapLogFromDb(data);
      console.error("[Supabase Error] updateLog fallback:", error);
    }
    const db = readDB();
    const idx = db.logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      db.logs[idx] = { ...db.logs[idx], ...updates };
      writeDB(db);
      return db.logs[idx];
    }
    throw new Error("Log not found");
  },

  async deleteLog(id: string): Promise<boolean> {
    if (supabase) {
      const { error } = await supabase.from("logs").delete().eq("id", id);
      if (!error) return true;
      console.error("[Supabase Error] deleteLog fallback:", error);
    }
    const db = readDB();
    const idx = db.logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      db.logs.splice(idx, 1);
      writeDB(db);
      return true;
    }
    return false;
  }
};

app.use(express.json());

app.get(["/db_data.json", "/metadata.json", "/package.json", "/.env"], (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Normalize API paths for both local Express and Vercel serverless routing.
// Vercel rewrites /api/* requests through the serverless entrypoint, so we
// also accept root-level API-like paths such as /auth/login and /logs.
app.use((req, res, next) => {
  const path = req.path || "";
  const isApiLikeRoute = path.startsWith("/auth/") || path.startsWith("/users") || path.startsWith("/tasks") || path.startsWith("/logs");

  if (isApiLikeRoute && !path.startsWith("/api")) {
    req.url = `/api${req.url}`;
  }

  next();
});

// 1. Security baseline headers middleware
app.use((req, res, next) => {
  // Prevent browser MIME-sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent clickjacking: allow iframe embed only from same origin or standard Studio platforms
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // Mitigate XSS
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // Limit referrer leakage
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // Strict Transport Security (HSTS) in production
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
  next();
});

// 2. IP Rate limiting system (in-memory, lightweight)
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

function ipRateLimiter(windowMs: number, maxRequests: number, message: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const ip = Array.isArray(rawIp) ? rawIp[0] : (typeof rawIp === "string" ? rawIp.split(",")[0].trim() : "unknown");
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    const limit = ipRateLimits.get(key);
    if (!limit) {
      ipRateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (now > limit.resetTime) {
      ipRateLimits.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (limit.count >= maxRequests) {
      res.status(429).json({ error: message });
      return;
    }

    limit.count += 1;
    next();
  };
}

// Global API rate limiting to protect database and resources
app.use("/api", ipRateLimiter(60000, 150, "Too many API requests from this IP. Please slow down."));

// 3. Brute force defense system: track username-based lockouts
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

// Token validation middleware
async function getUserFromToken(authHeader?: string, req?: express.Request) {
  const token = req ? readSessionToken(req) : (authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);
  if (!token) return null;

  try {
    if (useSupabase && supabase) {
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
      if (error || !authUser) {
        return null;
      }
      return await dbAdapter.getUserByEmailOrUsername(authUser.email!);
    }

    const username = Buffer.from(token, "base64").toString("utf8");
    return await dbAdapter.getUserByUsername(username);
  } catch (e) {
    return null;
  }
}

// 1. Auth Endpoint (Protected with IP rate limiting and username brute force lockout)
app.post("/api/auth/login", ipRateLimiter(60000, 10, "Too many login attempts from this IP. Please try again in 1 minute."), async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const cleanUsername = username.toLowerCase().trim();

    // Check username brute-force lockout status
    const lockData = loginAttempts.get(cleanUsername);
    if (lockData && Date.now() < lockData.lockUntil) {
      const remainingMin = Math.ceil((lockData.lockUntil - Date.now()) / 60000);
      res.status(429).json({ error: `This account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMin} minute(s).` });
      return;
    }

    const user = await dbAdapter.getUserByUsername(username);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }

    let authToken = "";
    let loginSuccess = false;
    const passwordMatches = verifyPassword(password, user.passwordHash);

    if (useSupabase && supabase) {
      // Attempt native Supabase Auth (GoTrue) login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (!authError && authData?.session) {
        authToken = authData.session.access_token;
        loginSuccess = true;
      } else {
        // Automatic on-the-fly migration to GoTrue Auth
        // If the login failed on Supabase but the password matches our local hash, auto-register them in Supabase Auth!
        if (passwordMatches) {
          console.log(`[Supabase Auth] Migrating existing user ${user.username} with email ${user.email} to GoTrue Auth...`);
          if (supabase.auth.admin) {
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
              email: user.email,
              password: password,
              email_confirm: true,
            });

            if (!createError) {
              // Retry signing in now that they are registered in GoTrue
              const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: password,
              });
              if (!retryError && retryData?.session) {
                authToken = retryData.session.access_token;
                loginSuccess = true;
              } else {
                console.error("[Supabase Auth] Retry sign-in failed post-creation:", retryError);
              }
            } else {
              console.error("[Supabase Auth] Automatic GoTrue provisioning failed:", createError);
            }
          } else {
            console.warn("[Supabase Auth] admin auth is not available. Falling back to local token generation.");
            // Generate standard fallback token for valid password matching local DB hash
            authToken = Buffer.from(user.username).toString("base64");
            loginSuccess = true;
          }
        }
      }
    } else {
      // Local JSON DB fallback login check
      if (passwordMatches) {
        authToken = Buffer.from(user.username).toString("base64");
        loginSuccess = true;
      }
    }

    if (!loginSuccess) {
      const currentAttempts = lockData ? lockData.count : 0;
      const newCount = currentAttempts + 1;
      if (newCount >= 5) {
        loginAttempts.set(cleanUsername, {
          count: newCount,
          lockUntil: Date.now() + 15 * 60 * 1000, // 15 minute lockout
        });
        res.status(429).json({ error: "Too many failed attempts. This account has been locked for 15 minutes." });
      } else {
        loginAttempts.set(cleanUsername, {
          count: newCount,
          lockUntil: 0,
        });
        const remaining = 5 - newCount;
        res.status(401).json({ error: `Invalid username or password. You have ${remaining} attempt(s) remaining.` });
      }
      return;
    }

    // Login success: reset failed login attempts
    loginAttempts.delete(cleanUsername);

    if (passwordMatches && !user.passwordHash.startsWith("scrypt$")) {
      await dbAdapter.updateUser(user.id, { passwordHash: hashPassword(password) });
    }

    setSessionCookie(res, authToken);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        hourlyRate: user.hourlyRate,
        workType: user.workType,
        scheduleStart: user.scheduleStart,
        scheduleEnd: user.scheduleEnd,
        monthlyHoursCap: user.monthlyHoursCap,
        photoUrl: user.photoUrl,
      },
    });
  } catch (error: any) {
    console.error("[Login Handler Exception]:", error);
    res.status(500).json({ error: "Internal Server Error during authentication login check.", details: error.message });
  }
});

// 2. Me Endpoint
app.get("/api/auth/me", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      hourlyRate: user.hourlyRate,
      workType: user.workType,
      scheduleStart: user.scheduleStart,
      scheduleEnd: user.scheduleEnd,
      monthlyHoursCap: user.monthlyHoursCap,
      photoUrl: user.photoUrl,
    },
  });
});

app.post("/api/auth/logout", async (req, res) => {
  const sessionToken = readSessionToken(req);
  if (sessionToken) {
    sessionStore.delete(sessionToken);
  }
  clearSessionCookie(res);
  res.json({ success: true });
});

// 2.0a Password Reset Request (Forgot Password - Protected with IP rate limiter)
app.post("/api/auth/forgot-password", ipRateLimiter(60000, 5, "Too many password reset requests. Please try again in 1 minute."), async (req, res) => {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
      res.status(400).json({ error: "Username or email is required" });
      return;
    }

    const user = await dbAdapter.getUserByEmailOrUsername(usernameOrEmail);

    if (!user) {
      res.json({
        success: true,
        message: "If the account exists, a 6-digit verification code has been sent to your registered Gmail.",
        username: usernameOrEmail,
      });
      return;
    }

    const emailStr = user.email ? user.email.trim() : "";
    if (!emailStr) {
      res.status(400).json({ error: `The user account "${user.username}" does not have a registered email address configured.` });
      return;
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    resetTokens.set(user.username.toLowerCase(), {
      email: emailStr,
      otp,
      expiresAt: Date.now() + 15 * 60 * 1000,
      attempts: 0,
    });

    const parts = emailStr.split("@");
    let maskedEmail = emailStr;
    if (parts.length === 2) {
      const namePart = parts[0];
      const domainPart = parts[1];
      if (namePart.length > 2) {
        maskedEmail = namePart.charAt(0) + "*".repeat(namePart.length - 2) + namePart.charAt(namePart.length - 1) + "@" + domainPart;
      } else {
        maskedEmail = namePart.charAt(0) + "*@" + domainPart;
      }
    }

    const sent = await sendResetEmail(emailStr, user.username, otp);

    res.json({
      success: true,
      message: `A 6-digit verification code has been sent to your registered email: ${maskedEmail}.`,
      username: user.username,
      email: maskedEmail,
      realSent: sent,
    });
  } catch (error: any) {
    console.error("[ForgotPassword Error]:", error);
    res.status(500).json({ error: error.message || "An internal error occurred during forgot password request." });
  }
});

// 2.0b Password Reset Verification & Update (Protected with IP rate limiter)
app.post("/api/auth/reset-password", ipRateLimiter(60000, 5, "Too many reset verification attempts. Please try again in 1 minute."), async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;
    if (!username || !otp || !newPassword) {
      res.status(400).json({ error: "Username, verification code, and new password are required" });
      return;
    }

    const cleanUsername = username.toLowerCase().trim();
    const tokenData = resetTokens.get(cleanUsername);
    if (!tokenData) {
      res.status(400).json({ error: "No active password reset request found for this user." });
      return;
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(cleanUsername);
      res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      return;
    }

    // Enforce server-side password validation
    if (newPassword.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters long." });
      return;
    }

    if (tokenData.attempts >= 3) {
      resetTokens.delete(cleanUsername);
      res.status(400).json({ error: "Too many failed attempts with this verification code. Please request a new code." });
      return;
    }

    if (tokenData.otp !== otp.trim()) {
      tokenData.attempts += 1;
      if (tokenData.attempts >= 3) {
        resetTokens.delete(cleanUsername);
        res.status(400).json({ error: "Invalid verification code. This code has been invalidated due to too many failed attempts." });
      } else {
        const remaining = 3 - tokenData.attempts;
        res.status(400).json({ error: `Invalid verification code. You have ${remaining} attempt(s) remaining.` });
      }
      return;
    }

    const user = await dbAdapter.getUserByUsername(username);
    if (!user) {
      res.status(404).json({ error: "User not found during reset." });
      return;
    }

    await dbAdapter.updateUser(user.id, { passwordHash: hashPassword(newPassword) });

    // If Supabase is active, update their password in GoTrue Auth
    if (useSupabase && supabase) {
      const emailStr = user.email ? user.email.trim() : "";
      if (emailStr) {
        if (supabase.auth.admin) {
          const { error: updateAuthError } = await supabase.auth.admin.updateUserById(user.id, {
            password: newPassword,
          });
          if (updateAuthError) {
            console.log("[Supabase Auth] updateUserById failed during reset, attempting admin.createUser fallback. Error:", updateAuthError);
            // Auto-register/provision in GoTrue Auth if they didn't exist there yet
            const { error: createAuthError } = await supabase.auth.admin.createUser({
              email: emailStr,
              password: newPassword,
              email_confirm: true,
            });
            if (createAuthError) {
              console.error("[Supabase Auth] Failed to provision/reset password in Supabase Auth GoTrue:", createAuthError);
            }
          }
        } else {
          console.warn("[Supabase Auth] admin auth is not available, skipping GoTrue password reset sync.");
        }
      } else {
        console.warn(`[Supabase Auth Warning] User ${user.username} has no email configured, skipping GoTrue credentials sync.`);
      }
    }

    // Invalidate token immediately after use (single-use constraint)
    resetTokens.delete(cleanUsername);

    res.json({
      success: true,
      message: "Password updated successfully! You can now log in with your new password.",
    });
  } catch (error: any) {
    console.error("[ResetPassword Error]:", error);
    res.status(500).json({ error: error.message || "An internal error occurred during password reset." });
  }
});

// 2.1 Get users (Admin only)
app.get("/api/users", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const users = await dbAdapter.getUsers();
  const cleanUsers = users.map(({ passwordHash, ...u }) => u);
  res.json(cleanUsers);
});

// 2.2 Update own profile (VAs can edit photo, name)
app.patch("/api/users/profile", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { name, photoUrl } = req.body;
  
  const updates: Partial<DBUser> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: "Invalid name. Must be between 1 and 100 characters." });
      return;
    }
    // Simple XSS sanitization (remove HTML tag brackets)
    updates.name = name.replace(/[<>]/g, "").trim();
  }
  
  if (photoUrl !== undefined) {
    if (typeof photoUrl !== "string" || photoUrl.length > 500) {
      res.status(400).json({ error: "Invalid photo URL. Maximum length is 500 characters." });
      return;
    }
    updates.photoUrl = photoUrl.trim();
  }

  try {
    const updatedUser = await dbAdapter.updateUser(user.id, updates);
    const { passwordHash, ...cleanUser } = updatedUser;
    res.json(cleanUser);
  } catch (err: any) {
    res.status(404).json({ error: "User profile update failed." });
  }
});

// 2.3 Update user (Admin edit VA: name, workType, scheduleStart, scheduleEnd, monthlyHoursCap, hourlyRate)
app.patch("/api/users/:id", async (req, res) => {
  const adminUser = await getUserFromToken(req.headers.authorization, req);
  if (!adminUser || adminUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const { name, workType, scheduleStart, scheduleEnd, monthlyHoursCap, hourlyRate } = req.body;
  
  const updates: Partial<DBUser> = {};
  if (name !== undefined) updates.name = name;
  if (workType !== undefined) {
    updates.workType = workType;
    if (hourlyRate === undefined) {
      updates.hourlyRate = workType === 'part-time' ? 200 : 150;
    }
  }
  if (scheduleStart !== undefined) updates.scheduleStart = scheduleStart;
  if (scheduleEnd !== undefined) updates.scheduleEnd = scheduleEnd;
  if (monthlyHoursCap !== undefined) updates.monthlyHoursCap = Number(monthlyHoursCap);
  if (hourlyRate !== undefined) updates.hourlyRate = Number(hourlyRate);
  
  try {
    const updatedUser = await dbAdapter.updateUser(req.params.id, updates);
    const { passwordHash, ...cleanUser } = updatedUser;
    res.json(cleanUser);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// 2.4 Tasks APIs
app.get("/api/tasks", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  if (user.role === "admin") {
    const tasks = await dbAdapter.getTasks();
    res.json(tasks);
  } else {
    const tasks = await dbAdapter.getTasks(user.id);
    res.json(tasks);
  }
});

app.post("/api/tasks", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { title, project, status, priority, description } = req.body;
  if (!title || !project) {
    res.status(400).json({ error: "Title and Project are required" });
    return;
  }

  // Server-side strict validations
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
    res.status(400).json({ error: "Title must be a non-empty string and less than 200 characters." });
    return;
  }
  if (typeof project !== "string" || project.trim().length === 0 || project.length > 100) {
    res.status(400).json({ error: "Project must be a non-empty string and less than 100 characters." });
    return;
  }
  
  const allowedStatuses = ["Todo", "In Progress", "In Review", "Completed"];
  const finalStatus = status || "Todo";
  if (!allowedStatuses.includes(finalStatus)) {
    res.status(400).json({ error: "Invalid task status." });
    return;
  }

  const allowedPriorities = ["Low", "Medium", "High"];
  const finalPriority = priority || "Medium";
  if (!allowedPriorities.includes(finalPriority)) {
    res.status(400).json({ error: "Invalid task priority." });
    return;
  }

  if (description !== undefined && (typeof description !== "string" || description.length > 2000)) {
    res.status(400).json({ error: "Description must be a string and less than 2000 characters." });
    return;
  }

  const cleanTitle = title.replace(/[<>]/g, "").trim();
  const cleanProject = project.replace(/[<>]/g, "").trim();
  const cleanDescription = (description || "").replace(/[<>]/g, "").trim();
  
  const newTask: DBTask = {
    id: "task-" + Math.random().toString(36).substr(2, 9),
    userId: user.id,
    userName: user.name,
    title: cleanTitle,
    project: cleanProject,
    status: finalStatus as any,
    priority: finalPriority as any,
    description: cleanDescription,
    createdAt: new Date().toISOString()
  };
  
  const created = await dbAdapter.createTask(newTask);
  res.status(201).json(created);
});

app.patch("/api/tasks/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { title, project, status, priority, description } = req.body;
  
  try {
    const tasks = await dbAdapter.getTasks();
    const task = tasks.find(t => t.id === req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    
    if (task.userId !== user.id && user.role !== "admin") {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    
    const updates: Partial<DBTask> = {};
    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
        res.status(400).json({ error: "Title must be a non-empty string and less than 200 characters." });
        return;
      }
      updates.title = title.replace(/[<>]/g, "").trim();
    }
    if (project !== undefined) {
      if (typeof project !== "string" || project.trim().length === 0 || project.length > 100) {
        res.status(400).json({ error: "Project must be a non-empty string and less than 100 characters." });
        return;
      }
      updates.project = project.replace(/[<>]/g, "").trim();
    }
    if (status !== undefined) {
      const allowedStatuses = ["Todo", "In Progress", "In Review", "Completed"];
      if (!allowedStatuses.includes(status)) {
        res.status(400).json({ error: "Invalid task status." });
        return;
      }
      updates.status = status;
    }
    if (priority !== undefined) {
      const allowedPriorities = ["Low", "Medium", "High"];
      if (!allowedPriorities.includes(priority)) {
        res.status(400).json({ error: "Invalid task priority." });
        return;
      }
      updates.priority = priority;
    }
    if (description !== undefined) {
      if (typeof description !== "string" || description.length > 2000) {
        res.status(400).json({ error: "Description must be less than 2000 characters." });
        return;
      }
      updates.description = description.replace(/[<>]/g, "").trim();
    }
    
    const updated = await dbAdapter.updateTask(req.params.id, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: "Task update failed." });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const tasks = await dbAdapter.getTasks();
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  
  if (task.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Permission denied" });
    return;
  }
  
  await dbAdapter.deleteTask(req.params.id);
  res.json({ success: true });
});

// 3. Get Logs Endpoint
app.get("/api/logs", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (user.role === "admin") {
    const logs = await dbAdapter.getLogs();
    res.json(logs);
  } else {
    const logs = await dbAdapter.getLogs(user.id);
    res.json(logs);
  }
});

// 4. Create manual log or clock-in
app.post("/api/logs", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { startTime, endTime, description, isManual, durationMinutes } = req.body;

  if (!startTime) {
    res.status(400).json({ error: "startTime is required" });
    return;
  }

  // If clock-in, check if there is an active timer already
  if (!endTime && !isManual) {
    const activeLog = await dbAdapter.getActiveLog(user.id);
    if (activeLog) {
      res.status(400).json({ error: "You already have an active running timer." });
      return;
    }
  }

  const newLog: DBLog = {
    id: "log-" + Math.random().toString(36).substr(2, 9),
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    startTime,
    endTime: endTime || null,
    description: description || "",
    isManual: !!isManual,
    durationMinutes: durationMinutes || 0,
  };

  const created = await dbAdapter.createLog(newLog);
  res.status(201).json(created);
});

// 5. Clock-out Endpoint
app.post("/api/logs/clock-out", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { description } = req.body;

  const activeLog = await dbAdapter.getActiveLog(user.id);
  if (!activeLog) {
    res.status(400).json({ error: "No active running timer found to clock out." });
    return;
  }

  const endTime = new Date().toISOString();
  const diffMs = new Date(endTime).getTime() - new Date(activeLog.startTime).getTime();
  const durationMinutes = Math.max(1, Math.round(diffMs / 60000)); // Minimum 1 minute

  const updated = await dbAdapter.updateLog(activeLog.id, {
    endTime,
    description: description || activeLog.description || "Completed tracking shift.",
    durationMinutes,
  });

  res.json(updated);
});

// 6. Delete Log
app.delete("/api/logs/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const logs = await dbAdapter.getLogs();
  const log = logs.find((l) => l.id === req.params.id);

  if (!log) {
    res.status(404).json({ error: "Log not found" });
    return;
  }

  // Only the owner or an admin can delete logs
  if (log.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Permission denied" });
    return;
  }

  await dbAdapter.deleteLog(req.params.id);
  res.json({ success: true });
});

// 7. Admin edit log (update description / duration / endTime)
app.patch("/api/logs/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization, req);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const { description, durationMinutes, startTime, endTime } = req.body;
  
  const updates: Partial<DBLog> = {};
  if (description !== undefined) updates.description = description;
  if (durationMinutes !== undefined) updates.durationMinutes = Number(durationMinutes);
  if (startTime !== undefined) updates.startTime = startTime;
  if (endTime !== undefined) updates.endTime = endTime;

  try {
    const updated = await dbAdapter.updateLog(req.params.id, updates);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

async function syncEnvCredentials() {
  const adminUsername = portalEnv.devUserName;
  const adminEmail = portalEnv.devUserEmail;
  const adminPassword = portalEnv.devUserPassword;
  const adminName = portalEnv.devUserFullName;

  const incomingHash = hashPassword(adminPassword);

  const izavaUsername = portalEnv.izaVaUsername;
  const izavaEmail = portalEnv.izaVaEmail;
  const izavaName = portalEnv.izaVaName;
  const izavaPassword = portalEnv.izaVaPassword;
  const izavaHash = hashPassword(izavaPassword);

  // Sync admin and iza_va in local database
  try {
    const db = readDB();
    let updatedLocal = false;

    // 1. Sync Admin User
    const localAdmin = db.users.find(u => u.username.toLowerCase().trim() === adminUsername.toLowerCase().trim());
    if (localAdmin) {
      if (localAdmin.passwordHash !== incomingHash || localAdmin.email !== adminEmail || localAdmin.name !== adminName) {
        console.log(`[Credentials Sync] Updating admin password/email/name in local DB to match environment variables...`);
        localAdmin.passwordHash = incomingHash;
        localAdmin.email = adminEmail;
        localAdmin.name = adminName;
        updatedLocal = true;
      }
    } else {
      console.log(`[Credentials Sync] Admin user "${adminUsername}" not found in local DB. Creating...`);
      const newAdmin: DBUser = {
        id: "user-admin",
        username: adminUsername,
        email: adminEmail,
        passwordHash: incomingHash,
        name: adminName,
        role: "admin",
        hourlyRate: 250,
        workType: "full-time",
        scheduleStart: "09:00",
        scheduleEnd: "17:00",
        photoUrl: "",
        monthlyHoursCap: 160,
      };
      db.users.push(newAdmin);
      updatedLocal = true;
    }

    // 2. Sync iza_va User
    const localIzava = db.users.find(u => u.username.toLowerCase().trim() === izavaUsername.toLowerCase().trim());
    if (localIzava) {
      if (localIzava.passwordHash !== izavaHash || localIzava.email !== izavaEmail || localIzava.name !== izavaName || localIzava.username !== izavaUsername) {
        console.log(`[Credentials Sync] Updating VA user password/email/name in local DB to match environment variables...`);
        localIzava.username = izavaUsername;
        localIzava.email = izavaEmail;
        localIzava.name = izavaName;
        localIzava.passwordHash = izavaHash;
        updatedLocal = true;
      }
    } else {
      console.log(`[Credentials Sync] User "${izavaUsername}" not found in local DB. Creating...`);
      const newIzava: DBUser = {
        id: "user-izava",
        username: izavaUsername,
        email: izavaEmail,
        passwordHash: izavaHash,
        name: izavaName,
        role: "va",
        hourlyRate: 150,
        workType: "full-time",
        scheduleStart: "09:00",
        scheduleEnd: "17:00",
        photoUrl: "",
        monthlyHoursCap: 160,
      };
      db.users.push(newIzava);
      updatedLocal = true;
    }

    if (updatedLocal) {
      writeDB(db);
    }
  } catch (err) {
    console.error("[Credentials Sync Error] Local sync failed:", err);
  }

  // Sync in Supabase if active
  if (useSupabase && supabase) {
    try {
      // 1. Sync Admin User
      const { data: dbUser, error: dbError } = await supabase
        .from("users")
        .select("*")
        .eq("username", adminUsername)
        .maybeSingle();

      if (dbError) {
        console.error("[Credentials Sync Error] Supabase admin query failed:", dbError);
      } else if (dbUser) {
        const mappedUser = mapUserFromDb(dbUser);
        if (mappedUser.passwordHash !== incomingHash || mappedUser.email !== adminEmail || mappedUser.name !== adminName) {
          console.log(`[Credentials Sync] Updating admin credentials in Supabase...`);
          const dbUpdates = await mapUserToDb({ passwordHash: incomingHash, email: adminEmail, name: adminName });
          await supabase.from("users").update(dbUpdates).eq("id", mappedUser.id);
        }

        // Also ensure password is in sync in Supabase Auth (GoTrue)
        if (supabase.auth.admin) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(mappedUser.id, {
            password: adminPassword,
          });
          if (authUpdateError) {
            await supabase.auth.admin.createUser({
              email: adminEmail,
              password: adminPassword,
              email_confirm: true,
            });
          }
        }
      } else {
        console.log(`[Credentials Sync] Admin user "${adminUsername}" not found in Supabase. Creating...`);
        const newAdmin: DBUser = {
          id: "user-admin",
          username: adminUsername,
          email: adminEmail,
          passwordHash: incomingHash,
          name: adminName,
          role: "admin",
          hourlyRate: 250,
          workType: "full-time",
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
          photoUrl: "",
          monthlyHoursCap: 160,
        };
        const dbInsert = await mapUserToDb(newAdmin);
        await supabase.from("users").insert([dbInsert]);
        if (supabase.auth.admin) {
          await supabase.auth.admin.createUser({
            email: adminEmail,
            password: adminPassword,
            email_confirm: true,
          });
        }
      }

      // 2. Sync VA User
      const { data: dbVa, error: dbVaError } = await supabase
        .from("users")
        .select("*")
        .eq("username", izavaUsername)
        .maybeSingle();

      if (dbVaError) {
        console.error("[Credentials Sync Error] Supabase VA user query failed:", dbVaError);
      } else if (dbVa) {
        const mappedVa = mapUserFromDb(dbVa);
        if (mappedVa.passwordHash !== izavaHash || mappedVa.email !== izavaEmail || mappedVa.name !== izavaName || mappedVa.username !== izavaUsername) {
          console.log(`[Credentials Sync] Updating VA user credentials in Supabase...`);
          const dbUpdates = await mapUserToDb({
            username: izavaUsername,
            email: izavaEmail,
            name: izavaName,
            passwordHash: izavaHash,
          });
          await supabase.from("users").update(dbUpdates).eq("id", mappedVa.id);
        }

        // Also ensure password is in sync in Supabase Auth (GoTrue)
        if (supabase.auth.admin) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(mappedVa.id, {
            password: izavaPassword,
          });
          if (authUpdateError) {
            await supabase.auth.admin.createUser({
              email: izavaEmail,
              password: izavaPassword,
              email_confirm: true,
            });
          }
        }
      } else {
        console.log(`[Credentials Sync] User "${izavaUsername}" not found in Supabase. Creating...`);
        const newIzava: DBUser = {
          id: "user-izava",
          username: izavaUsername,
          email: izavaEmail,
          passwordHash: izavaHash,
          name: izavaName,
          role: "va",
          hourlyRate: 150,
          workType: "full-time",
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
          photoUrl: "",
          monthlyHoursCap: 160,
        };
        const dbInsert = await mapUserToDb(newIzava);
        await supabase.from("users").insert([dbInsert]);
        if (supabase.auth.admin) {
          await supabase.auth.admin.createUser({
            email: izavaEmail,
            password: izavaPassword,
            email_confirm: true,
          });
        }
      }
    } catch (err) {
      console.error("[Credentials Sync Error] Supabase sync failed:", err);
    }
  }
}

// Setup Vite & Static Fallback
async function startServer() {
  // Sync admin and custom VA credentials from environment variables on startup
  try {
    await syncEnvCredentials();
  } catch (err) {
    console.error("[Startup Sync Alert] Failed to run credential sync on startup:", err);
  }

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running full-stack on http://0.0.0.0:${PORT}`);
  });
}

// Only start the standalone HTTP listener if not running as a Vercel serverless function
if (!process.env.VERCEL) {
  startServer();
}

export default app;
