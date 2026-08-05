import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
app.set("trust proxy", 1);
const PORT = 3000;

const isVercel = !!process.env.VERCEL;
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
const authActionRateLimits = new Map<string, { count: number; resetTime: number }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getClientIp(req: express.Request): string {
  const rawIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
  if (Array.isArray(rawIp)) return rawIp[0];
  if (typeof rawIp === "string") return rawIp.split(",")[0].trim();
  return "unknown";
}

function getRateLimitIdentity(req: express.Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1] || "";
    // Keep token material out of memory keys by hashing before use.
    if (token.length > 20) {
      const tokenFingerprint = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
      return `token:${tokenFingerprint}`;
    }
  }
  return `ip:${getClientIp(req)}`;
}

function sanitizeAuthIdentifier(value: string): string {
  return value.toLowerCase().trim().slice(0, 80);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function enforceAuthActionLimit(
  action: string,
  identifier: string,
  windowMs: number,
  maxRequests: number,
): { blocked: boolean; retryAfterSeconds?: number } {
  const key = `${action}:${sanitizeAuthIdentifier(identifier)}`;
  const now = Date.now();

  if (authActionRateLimits.size > 5000) {
    for (const [k, v] of authActionRateLimits.entries()) {
      if (now > v.resetTime) authActionRateLimits.delete(k);
    }
  }

  const current = authActionRateLimits.get(key);

  if (!current || now > current.resetTime) {
    authActionRateLimits.set(key, { count: 1, resetTime: now + windowMs });
    return { blocked: false };
  }

  if (current.count >= maxRequests) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetTime - now) / 1000)),
    };
  }

  current.count += 1;
  return { blocked: false };
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, storedHash?: string): boolean {
  if (!storedHash) return false;
  return crypto.createHash("sha256").update(password).digest("hex") === storedHash;
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
  notificationTime: string;
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
  const adminUsername = process.env.DEV_USER_NAME || "admin";
  const adminName = process.env.DEV_USER_FULLNAME || "Admin User";
  const adminEmail = process.env.DEV_USER_EMAIL || "admin@example.com";
  const adminPassword = process.env.DEV_USER_PASSWORD || "admin123";

  const izavaUsername = process.env.IZA_VA_USERNAME || "iza_va";
  const izavaName = process.env.IZA_VA_NAME || "Iza";
  const izavaEmail = process.env.IZA_VA_EMAIL || "zuki8020@example.com";
  const izavaPassword = process.env.IZA_VA_PASSWORD || "iza123";

  const alliyahUsername = process.env.ALLIYAH_VA_USERNAME || "alliyah_va";
  const alliyahName = process.env.ALLIYAH_VA_NAME || "Alliyah";
  const alliyahEmail = process.env.ALLIYAH_VA_EMAIL || "alliyah@example.com";
  const alliyahPassword = process.env.ALLIYAH_VA_PASSWORD || "alliyah123";

  return [
    {
      id: "user-admin",
      username: adminUsername,
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      name: adminName,
      role: "admin",
      hourlyRate: 0,
      workType: "full-time",
      scheduleStart: "09:00",
      scheduleEnd: "17:00",
      notificationTime: "09:00",
      photoUrl: "",
      monthlyHoursCap: 160,
    },
    {
      id: "user-iza",
      username: izavaUsername,
      email: izavaEmail,
      passwordHash: hashPassword(izavaPassword),
      name: izavaName,
      role: "va",
      hourlyRate: 200,
      workType: "part-time",
      scheduleStart: "08:00",
      scheduleEnd: "16:00",
      notificationTime: "09:00",
      photoUrl: "",
      monthlyHoursCap: 50,
    },
    {
      id: "user-alliyah",
      username: alliyahUsername,
      email: alliyahEmail,
      passwordHash: hashPassword(alliyahPassword),
      name: alliyahName,
      role: "va",
      hourlyRate: 200,
      workType: "part-time",
      scheduleStart: "08:00",
      scheduleEnd: "16:00",
      notificationTime: "09:00",
      photoUrl: "",
      monthlyHoursCap: 50,
    },
  ];
}

function getDefaultDB(): DBStructure {
  const adminUsername = process.env.DEV_USER_NAME || "admin";
  const adminName = process.env.DEV_USER_FULLNAME || "Admin User";

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
    tasks: []
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

    // Note: do NOT filter users here — invited/dynamic users must persist across restarts
    // Seeded users are enforced below via usersToVerify

    const adminUsername = (process.env.DEV_USER_NAME || "admin").toLowerCase().trim();
    const izavaUsername = (process.env.IZA_VA_USERNAME || "va_member").toLowerCase().trim();
    const alliyahUsername = (process.env.ALLIYAH_VA_USERNAME || "alliyah_va").toLowerCase().trim();
    const allowedUsernames = new Set([adminUsername, izavaUsername, alliyahUsername]);
    let migrated = false;
    db.users = db.users.map((u: any) => {
      let pwd = u.passwordHash;
      if (pwd && pwd.length !== 64) {
        pwd = hashPassword(pwd);
        migrated = true;
      }
      let email = u.email;
      if (!email) {
        if (u.username === adminUsername) {
          email = process.env.DEV_USER_EMAIL || "admin@example.com";
        } else if (u.username === alliyahUsername) {
          email = process.env.ALLIYAH_VA_EMAIL || "va_member@example.com";
        } else {
          email = process.env.IZA_VA_EMAIL || "va_member@example.com";
        }
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

    const seenUsernames = new Set<string>();
    db.users = db.users.filter((u: any) => {
      const normalized = (u.username || "").toLowerCase().trim();
      if (!allowedUsernames.has(normalized)) return false;
      if (seenUsernames.has(normalized)) return false;
      seenUsernames.add(normalized);
      return true;
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

function isUuidLike(value?: string | null): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
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
    notificationTime: row.notificationTime ?? row.notification_time ?? row.notificationtime ?? "09:00",
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
    if (user.notificationTime !== undefined) { mapped.notification_time = user.notificationTime; delete mapped.notificationTime; }
    if (user.photoUrl !== undefined) { mapped.photo_url = user.photoUrl; delete mapped.photoUrl; }
    if (user.monthlyHoursCap !== undefined) { mapped.monthly_hours_cap = user.monthlyHoursCap; delete mapped.monthlyHoursCap; }
  } else if (casing === "lowercase") {
    if (user.passwordHash !== undefined) { mapped.passwordhash = user.passwordHash; delete mapped.passwordHash; }
    if (user.hourlyRate !== undefined) { mapped.hourlyrate = user.hourlyRate; delete mapped.hourlyRate; }
    if (user.workType !== undefined) { mapped.worktype = user.workType; delete mapped.workType; }
    if (user.scheduleStart !== undefined) { mapped.schedulestart = user.scheduleStart; delete mapped.scheduleStart; }
    if (user.scheduleEnd !== undefined) { mapped.scheduleend = user.scheduleEnd; delete mapped.scheduleEnd; }
    if (user.notificationTime !== undefined) { mapped.notificationtime = user.notificationTime; delete mapped.notificationTime; }
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

async function findSupabaseAuthUserIdsByEmail(email: string): Promise<string[]> {
  if (!supabase?.auth?.admin) return [];

  const cleanEmail = email.toLowerCase().trim();
  if (!cleanEmail) return [];

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error || !data?.users) {
    console.error("[Supabase Auth] listUsers failed while resolving email:", error);
    return [];
  }

  return data.users
    .filter((candidate) => (candidate.email || "").toLowerCase().trim() === cleanEmail)
    .map((candidate) => candidate.id)
    .filter(Boolean);
}

async function supabaseAuthUserExistsByEmail(email: string): Promise<boolean> {
  const matchedIds = await findSupabaseAuthUserIdsByEmail(email);
  return matchedIds.length > 0;
}

async function syncSupabaseAuthPasswordByEmail(email: string, password: string): Promise<boolean> {
  if (!supabase?.auth?.admin) return false;

  const cleanEmail = email.toLowerCase().trim();
  const matchedIds = await findSupabaseAuthUserIdsByEmail(cleanEmail);

  if (matchedIds.length === 0) {
    const { error: createError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
    });
    if (createError) {
      console.error(`[Supabase Auth] createUser failed while syncing password for ${cleanEmail}:`, createError);
      return false;
    }
    return true;
  }

  for (const authUserId of matchedIds) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, { password });
    if (updateError) {
      console.error(`[Supabase Auth] updateUserById failed while syncing password for ${cleanEmail} (${authUserId}):`, updateError);
      return false;
    }
  }

  return true;
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
    return allUsers;
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
    }
    if (!user) {
      const db = readDB();
      user = db.users.find(u => u.id === id) || null;
    }

     if (user) {
      return user;
    }
    return null;
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
    console.log(`[DB Adapter] updateUser called for ID: ${id} with updates:`, Object.keys(updates));
    let updatedUser: DBUser | null = null;
    
    if (supabase) {
      const dbUpdates = await mapUserToDb(updates);
      console.log(`[DB Adapter] Updating Supabase with:`, dbUpdates);
      
      // Try update with all fields first
      let { data, error } = await supabase
        .from("users")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
        
      // If notification_time column doesn't exist, retry without it
      if (error && error.code === 'PGRST204' && error.message.includes('notification_time')) {
        console.log(`[DB Adapter] notification_time column not found in Supabase, retrying without it`);
        const { notification_time, notificationtime, ...dbUpdatesWithoutNotif } = dbUpdates;
        if (Object.keys(dbUpdatesWithoutNotif).length > 0) {
          const retry = await supabase
            .from("users")
            .update(dbUpdatesWithoutNotif)
            .eq("id", id)
            .select()
            .maybeSingle();
          data = retry.data;
          error = retry.error;
        } else {
          // Only notification_time was provided and this schema does not support it.
          data = null;
          error = null;
        }
      }
      
      if (!error && data) {
        updatedUser = mapUserFromDb(data);
        console.log(`[DB Adapter] Supabase update success for user: ${updatedUser.username}`);
        if (updates.name) {
          const logCasing = await detectLogCasing();
          const updateObj = { name: updates.name };
          const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
          await supabase.from("logs").update(updateObj).eq(logUserIdKey, id);
        }
      } else if (!error) {
        // Some schemas/return settings can apply update but return no row payload.
        const resolvedUser = await dbAdapter.getUserById(id);
        if (resolvedUser) {
          updatedUser = resolvedUser;
          console.log(`[DB Adapter] Supabase update applied; resolved updated user by id: ${resolvedUser.username}`);
          if (updates.name) {
            const logCasing = await detectLogCasing();
            const updateObj = { name: updates.name };
            const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
            await supabase.from("logs").update(updateObj).eq(logUserIdKey, id);
          }
        } else {
          console.error("[Supabase Error] updateUser fallback: update returned no row and user could not be resolved by id");
        }
      } else {
        console.error("[Supabase Error] updateUser fallback:", error);
      }
    }
    
    // Always update local DB
    const db = readDB();
    let idx = db.users.findIndex(u => u.id === id);
    console.log(`[DB Adapter] Found user at index ${idx} in local DB`);
    
    if (idx === -1) {
      const resolvedUser = await dbAdapter.getUserById(id);
      if (resolvedUser) {
        idx = db.users.findIndex(u => u.username.toLowerCase().trim() === resolvedUser.username.toLowerCase().trim());
        console.log(`[DB Adapter] Resolved user by username, new index: ${idx}`);
      }
    }
    
    if (idx !== -1) {
      db.users[idx] = { ...db.users[idx], ...updates };
      console.log(`[DB Adapter] Updated local user: ${db.users[idx].username}`);
      
      if (updates.name) {
        db.logs.forEach(log => {
          if (log.userId === id || (idx !== -1 && log.userId === db.users[idx].id)) {
            log.name = updates.name!;
          }
        });
      }
      
      writeDB(db);
      console.log(`[DB Adapter] Local DB written successfully`);
      return updatedUser || db.users[idx];
    }
    
    if (updatedUser) {
      console.log(`[DB Adapter] Returning Supabase-only update result`);
      return updatedUser;
    }
    
    console.error(`[DB Adapter] User ${id} not found in any database`);
    throw new Error("User not found");
  },

  async createUser(user: DBUser): Promise<DBUser> {
    let created: DBUser | null = null;
    if (supabase) {
      const dbUser = await mapUserToDb(user);
      const { data, error } = await supabase
        .from("users")
        .insert([dbUser])
        .select()
        .maybeSingle();
      if (!error && data) {
        created = mapUserFromDb(data);
      } else if (error) {
        console.error("[Supabase Error] createUser:", error);
      }
    }
    const db = readDB();
    const alreadyExists = db.users.some(u => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
    if (!alreadyExists) {
      db.users.push(created || user);
      writeDB(db);
    }
    return created || user;
  },

  async deleteUser(id: string): Promise<boolean> {
    let deletedFromSupabase = false;
    if (supabase) {
      const { error } = await supabase.from("users").delete().eq("id", id);
      if (error) {
        console.error("[Supabase Error] deleteUser:", error);
      } else {
        deletedFromSupabase = true;
        console.log(`[Supabase] User ${id} deleted from Supabase`);
      }
    }
    
    // Always attempt local deletion regardless of Supabase success
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx !== -1) {
      const deletedUser = db.users[idx];
      db.users.splice(idx, 1);
      writeDB(db);
      console.log(`[Local DB] User ${deletedUser.username} (${id}) deleted from local database`);
      return true;
    }
    
    console.log(`[Local DB] User ${id} not found in local database`);
    return deletedFromSupabase; // Return true if at least Supabase deletion worked
  },

  async getTasks(userId?: string): Promise<DBTask[]> {
    let supabaseTasks: DBTask[] = [];
    if (supabase && (!userId || isUuidLike(userId))) {
      let query = supabase.from("tasks").select("*");
      if (userId) {
        const taskCasing = await detectTaskCasing();
        const taskUserIdKey = taskCasing === "snake" ? "user_id" : (taskCasing === "lowercase" ? "userid" : "userId");
        query = query.eq(taskUserIdKey, userId);
      }
      const orderCol = (await detectTaskCasing()) === "snake" ? "created_at" : "createdAt";
      const { data, error } = await query.order(orderCol, { ascending: false });
      if (!error && data) {
        supabaseTasks = data.map(mapTaskFromDb);
      } else {
        console.error("[Supabase Error] getTasks fallback:", error);
      }
    } else if (userId && !isUuidLike(userId)) {
      console.log(`[Supabase] Skipping task lookup for non-UUID user id: ${userId}`);
    }
    const db = readDB();
    const localTasks = userId ? db.tasks.filter(t => t.userId === userId) : db.tasks;

    // Merge local and Supabase results so legacy/local tasks remain operable.
    const mergedMap = new Map<string, DBTask>();
    localTasks.forEach((task) => mergedMap.set(task.id, task));
    supabaseTasks.forEach((task) => mergedMap.set(task.id, task));

    return Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  },

  async getTaskById(id: string): Promise<DBTask | null> {
    let supabaseTask: DBTask | null = null;
    if (supabase && isUuidLike(id)) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) {
        supabaseTask = mapTaskFromDb(data);
      } else if (error) {
        console.error("[Supabase Error] getTaskById fallback:", error);
      }
    }

    const db = readDB();
    const localTask = db.tasks.find((t) => t.id === id) || null;
    return supabaseTask || localTask;
  },

  async createTask(task: DBTask): Promise<DBTask> {
    let createdTask: DBTask | null = null;
    if (supabase && isUuidLike(task.userId) && isUuidLike(task.id)) {
      const dbTask = await mapTaskToDb(task);
      const { data, error } = await supabase
        .from("tasks")
        .insert(dbTask)
        .select()
        .maybeSingle();
      if (!error && data) createdTask = mapTaskFromDb(data);
      else console.error("[Supabase Error] createTask fallback:", error);
    } else if (supabase && (!isUuidLike(task.userId) || !isUuidLike(task.id))) {
      console.log(`[Supabase] Skipping task insert for non-UUID identifier: ${task.id}`);
    }
    const db = readDB();
    const taskToSave = createdTask || task;
    db.tasks.unshift(taskToSave);
    writeDB(db);
    return taskToSave;
  },

  async updateTask(id: string, updates: Partial<DBTask>): Promise<DBTask> {
    let updatedTask: DBTask | null = null;
    if (supabase && isUuidLike(id)) {
      const dbUpdates = await mapTaskToDb(updates);
      const { data, error } = await supabase
        .from("tasks")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) updatedTask = mapTaskFromDb(data);
      else console.error("[Supabase Error] updateTask fallback:", error);
    } else if (supabase && !isUuidLike(id)) {
      console.log(`[Supabase] Skipping task update for non-UUID identifier: ${id}`);
    }
    const db = readDB();
    const idx = db.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      db.tasks[idx] = { ...db.tasks[idx], ...updates };
      writeDB(db);
      return updatedTask || db.tasks[idx];
    }
    if (updatedTask) return updatedTask;
    throw new Error("Task not found");
  },

  async deleteTask(id: string): Promise<boolean> {
    let deletedFromSupabase = false;
    if (supabase && isUuidLike(id)) {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (!error) deletedFromSupabase = true;
      else console.error("[Supabase Error] deleteTask fallback:", error);
    } else if (supabase && !isUuidLike(id)) {
      console.log(`[Supabase] Skipping task delete for non-UUID identifier: ${id}`);
    }
    const db = readDB();
    const idx = db.tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      db.tasks.splice(idx, 1);
      writeDB(db);
      return true;
    }
    return deletedFromSupabase;
  },

  async getLogs(userId?: string): Promise<DBLog[]> {
    let supabaseLogs: DBLog[] = [];
    if (supabase && (!userId || isUuidLike(userId))) {
      let query = supabase.from("logs").select("*");
      if (userId) {
        const logCasing = await detectLogCasing();
        const logUserIdKey = logCasing === "snake" ? "user_id" : (logCasing === "lowercase" ? "userid" : "userId");
        query = query.eq(logUserIdKey, userId);
      }
      const orderCol = (await detectLogCasing()) === "snake" ? "start_time" : "startTime";
      const { data, error } = await query.order(orderCol, { ascending: false });
      if (!error && data) {
        supabaseLogs = data.map(mapLogFromDb);
      } else {
        console.error("[Supabase Error] getLogs fallback:", error);
      }
    } else if (userId && !isUuidLike(userId)) {
      console.log(`[Supabase] Skipping log lookup for non-UUID user id: ${userId}`);
    }
    const db = readDB();
    const localLogs = userId ? db.logs.filter(l => l.userId === userId) : db.logs;
    
    // Merge logs from local DB and Supabase DB together, prioritizing Supabase DB values
    const mergedMap = new Map<string, DBLog>();
    localLogs.forEach(l => mergedMap.set(l.id, l));
    supabaseLogs.forEach(l => mergedMap.set(l.id, l));
    
    return Array.from(mergedMap.values()).sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();
      return bTime - aTime;
    });
  },

  async getLogById(id: string): Promise<DBLog | null> {
    let supabaseLog: DBLog | null = null;
    if (supabase && isUuidLike(id)) {
      const { data, error } = await supabase
        .from("logs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!error && data) {
        supabaseLog = mapLogFromDb(data);
      } else if (error) {
        console.error("[Supabase Error] getLogById fallback:", error);
      }
    }

    const db = readDB();
    const localLog = db.logs.find((l) => l.id === id) || null;
    return supabaseLog || localLog;
  },

  async getActiveLog(userId: string): Promise<DBLog | null> {
    if (supabase && isUuidLike(userId)) {
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
    } else if (supabase && !isUuidLike(userId)) {
      console.log(`[Supabase] Skipping active log lookup for non-UUID user id: ${userId}`);
    }
    const db = readDB();
    return db.logs.find(l => l.userId === userId && !l.endTime) || null;
  },

  async createLog(log: DBLog): Promise<DBLog> {
    let createdLog: DBLog | null = null;
    if (supabase && isUuidLike(log.userId) && isUuidLike(log.id)) {
      const dbLog = await mapLogToDb(log);
      const { data, error } = await supabase
        .from("logs")
        .insert(dbLog)
        .select()
        .maybeSingle();
      if (!error && data) createdLog = mapLogFromDb(data);
      else console.error("[Supabase Error] createLog fallback:", error);
    } else if (supabase && (!isUuidLike(log.userId) || !isUuidLike(log.id))) {
      console.log(`[Supabase] Skipping log insert for non-UUID identifier: ${log.id}`);
    }
    const db = readDB();
    const logToSave = createdLog || log;
    db.logs.unshift(logToSave);
    writeDB(db);
    return logToSave;
  },

  async updateLog(id: string, updates: Partial<DBLog>): Promise<DBLog> {
    let updatedLog: DBLog | null = null;
    if (supabase && isUuidLike(id)) {
      const dbUpdates = await mapLogToDb(updates);
      const { data, error } = await supabase
        .from("logs")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (!error && data) updatedLog = mapLogFromDb(data);
      else console.error("[Supabase Error] updateLog fallback:", error);
    } else if (supabase && !isUuidLike(id)) {
      console.log(`[Supabase] Skipping log update for non-UUID identifier: ${id}`);
    }
    const db = readDB();
    const idx = db.logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      db.logs[idx] = { ...db.logs[idx], ...updates };
      writeDB(db);
      return updatedLog || db.logs[idx];
    }
    if (updatedLog) return updatedLog;
    throw new Error("Log not found");
  },

  async deleteLog(id: string): Promise<boolean> {
    let deletedFromSupabase = false;
    if (supabase && isUuidLike(id)) {
      const { error } = await supabase.from("logs").delete().eq("id", id);
      if (!error) deletedFromSupabase = true;
      else console.error("[Supabase Error] deleteLog fallback:", error);
    } else if (supabase && !isUuidLike(id)) {
      console.log(`[Supabase] Skipping log delete for non-UUID identifier: ${id}`);
    }
    const db = readDB();
    const idx = db.logs.findIndex(l => l.id === id);
    if (idx !== -1) {
      db.logs.splice(idx, 1);
      writeDB(db);
      return true;
    }
    return deletedFromSupabase;
  }
};

app.use(express.json({ limit: "20kb" }));

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
  if (req.path.startsWith("/api/auth")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

// 2. IP Rate limiting system (in-memory, lightweight)
const ipRateLimits = new Map<string, { count: number; resetTime: number }>();

function ipRateLimiter(windowMs: number, maxRequests: number, message: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const identity = getRateLimitIdentity(req);
    const key = `${req.path}:${identity}`;
    const now = Date.now();

    if (ipRateLimits.size > 5000) {
      for (const [k, v] of ipRateLimits.entries()) {
        if (now > v.resetTime) ipRateLimits.delete(k);
      }
    }

    const limit = ipRateLimits.get(key);
    if (!limit) {
      const resetTime = now + windowMs;
      ipRateLimits.set(key, { count: 1, resetTime });
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(maxRequests - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
      return next();
    }

    if (now > limit.resetTime) {
      const resetTime = now + windowMs;
      ipRateLimits.set(key, { count: 1, resetTime });
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(maxRequests - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetTime / 1000)));
      return next();
    }

    if (limit.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((limit.resetTime - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(limit.resetTime / 1000)));
      res.status(429).json({ error: message });
      return;
    }

    limit.count += 1;
    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, maxRequests - limit.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(limit.resetTime / 1000)));
    next();
  };
}

// Global API rate limiting. Authenticated requests are keyed by token identity,
// which avoids shared VPN IP collisions for active VA sessions.
app.use("/api", ipRateLimiter(60000, 600, "Too many API requests right now. Please slow down and retry."));

// 3. Brute force defense system: track username-based lockouts
const loginAttempts = new Map<string, { count: number; lockUntil: number }>();

// Token validation middleware
async function getUserFromToken(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(`[getUserFromToken] No valid auth header provided`);
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    if (useSupabase && supabase) {
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
      if (error || !authUser) {
        console.log(`[getUserFromToken] Supabase auth failed, falling back to legacy token. Error:`, error);
        // Fallback to legacy base64 token if Supabase verification fails
        try {
          const username = Buffer.from(token, "base64").toString("utf8");
          return await dbAdapter.getUserByUsername(username);
        } catch (e) {
          return null;
        }
      }
      console.log(`[getUserFromToken] Supabase auth success! User email: ${authUser.email}, ID: ${authUser.id}`);
      const dbUser = await dbAdapter.getUserByEmailOrUsername(authUser.email!);
      if (!dbUser) {
        console.log(`[getUserFromToken] PROBLEM: User ${authUser.email} authenticated in Supabase but NOT FOUND in database!`);
      } else {
        console.log(`[getUserFromToken] Found user in DB: ${dbUser.username} (Role: ${dbUser.role})`);
      }
      return dbUser;
    } else {
      const username = Buffer.from(token, "base64").toString("utf8");
      return await dbAdapter.getUserByUsername(username);
    }
  } catch (e) {
    console.log(`[getUserFromToken] Exception:`, e);
    return null;
  }
}

// 1. Auth Endpoint (Protected with IP rate limiting and username brute force lockout)
app.post("/api/auth/login", ipRateLimiter(60000, 60, "Too many login attempts from this network. Please try again in 1 minute."), async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`[Login] Attempt for username: ${username}`);
    
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const cleanUsername = username.toLowerCase().trim();
    if (!/^[a-zA-Z0-9_@.\-]{3,80}$/.test(cleanUsername)) {
      await sleep(350);
      res.status(400).json({ error: "Invalid username format." });
      return;
    }
    if (typeof password !== "string" || password.length < 6 || password.length > 128) {
      await sleep(350);
      res.status(400).json({ error: "Invalid password format." });
      return;
    }

    const accountLoginLimit = enforceAuthActionLimit("login-account", cleanUsername, 15 * 60 * 1000, 20);
    if (accountLoginLimit.blocked) {
      res.setHeader("Retry-After", String(accountLoginLimit.retryAfterSeconds || 60));
      res.status(429).json({ error: "Too many login attempts for this account. Please try again later." });
      return;
    }

    // Check username brute-force lockout status
    const lockData = loginAttempts.get(cleanUsername);
    if (lockData && Date.now() < lockData.lockUntil) {
      const remainingMin = Math.ceil((lockData.lockUntil - Date.now()) / 60000);
      res.status(429).json({ error: `This account is temporarily locked due to too many failed login attempts. Please try again in ${remainingMin} minute(s).` });
      return;
    }

    const user = await dbAdapter.getUserByEmailOrUsername(username);
    if (!user) {
      console.log(`[Login] FAILED: User not found for username: ${username}`);
      await sleep(450);
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
    
    console.log(`[Login] Found user: ${user.username} (ID: ${user.id}, Role: ${user.role}, Email: ${user.email})`);

    let token = "";
    let loginSuccess = false;

    if (useSupabase && supabase) {
      // Attempt native Supabase Auth (GoTrue) login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      });

      if (!authError && authData?.session) {
        token = authData.session.access_token;
        loginSuccess = true;
      } else {
        // If the password matches the local hash, treat the local DB as the source of truth
        // and re-sync Supabase Auth before retrying the login.
        const passwordMatches = verifyPassword(password, user.passwordHash);
        if (passwordMatches) {
          console.log(`[Supabase Auth] Password matched local DB for ${user.username}; syncing Auth password for ${user.email}.`);
          const synced = await syncSupabaseAuthPasswordByEmail(user.email, password);
          if (synced) {
            const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
              email: user.email,
              password,
            });
            if (!retryError && retryData?.session) {
              token = retryData.session.access_token;
              loginSuccess = true;
            } else {
              console.error("[Supabase Auth] Retry sign-in failed after password sync:", retryError);
            }
          }
        }
      }
    } else {
      // Local JSON DB fallback login check
      const passwordMatches = verifyPassword(password, user.passwordHash);
      if (passwordMatches) {
        token = Buffer.from(user.username).toString("base64");
        loginSuccess = true;
      }
    }

    if (!loginSuccess) {
      const currentAttempts = lockData ? lockData.count : 0;
      const newCount = currentAttempts + 1;
      await sleep(450);
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

    console.log(`[Login] SUCCESS: User ${user.username} logged in with role: ${user.role}`);
    
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
        notificationTime: user.notificationTime,
        monthlyHoursCap: user.monthlyHoursCap,
        photoUrl: user.photoUrl,
      },
      token,
    });
  } catch (error: any) {
    console.error("[Login Handler Exception]:", error);
    res.status(500).json({ error: "Internal Server Error during authentication login check.", details: error.message });
  }
});

// 2. Me Endpoint
app.get("/api/auth/me", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    hourlyRate: user.hourlyRate,
    workType: user.workType,
    scheduleStart: user.scheduleStart,
    scheduleEnd: user.scheduleEnd,
    notificationTime: user.notificationTime,
    monthlyHoursCap: user.monthlyHoursCap,
    photoUrl: user.photoUrl,
  });
});

// 2.0a Password Reset Request (Forgot Password - Protected with IP rate limiter)
app.post("/api/auth/forgot-password", ipRateLimiter(60000, 30, "Too many password reset requests from this network. Please try again in 1 minute."), async (req, res) => {
  try {
    const { usernameOrEmail } = req.body;
    if (!usernameOrEmail) {
      res.status(400).json({ error: "Username or email is required" });
      return;
    }

    const cleanIdentifier = sanitizeAuthIdentifier(String(usernameOrEmail));
    const ip = getClientIp(req);
    const perAccountResetLimit = enforceAuthActionLimit("forgot-password-account", cleanIdentifier, 15 * 60 * 1000, 3);
    if (perAccountResetLimit.blocked) {
      res.setHeader("Retry-After", String(perAccountResetLimit.retryAfterSeconds || 60));
      res.status(429).json({ error: "Too many password reset requests for this account. Please try again later." });
      return;
    }
    const perIpResetLimit = enforceAuthActionLimit("forgot-password-ip", ip, 15 * 60 * 1000, 45);
    if (perIpResetLimit.blocked) {
      res.setHeader("Retry-After", String(perIpResetLimit.retryAfterSeconds || 60));
      res.status(429).json({ error: "Too many password reset requests from this network. Please try again later." });
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

    await sendResetEmail(emailStr, user.username, otp);

    res.json({
      success: true,
      message: `A 6-digit verification code has been sent to your registered email: ${maskedEmail}.`,
      username: user.username,
      email: maskedEmail,
    });
  } catch (error: any) {
    console.error("[ForgotPassword Error]:", error);
    res.status(500).json({ error: error.message || "An internal error occurred during forgot password request." });
  }
});

// 2.0b Password Reset Verification & Update (Protected with IP rate limiter)
app.post("/api/auth/reset-password", ipRateLimiter(60000, 40, "Too many reset verification attempts from this network. Please try again in 1 minute."), async (req, res) => {
  try {
    const { username, otp, newPassword } = req.body;
    if (!username || !otp || !newPassword) {
      res.status(400).json({ error: "Username, verification code, and new password are required" });
      return;
    }

    const cleanUsername = username.toLowerCase().trim();
    const ip = getClientIp(req);
    const perAccountResetAttemptLimit = enforceAuthActionLimit("reset-password-account", cleanUsername, 15 * 60 * 1000, 10);
    if (perAccountResetAttemptLimit.blocked) {
      res.setHeader("Retry-After", String(perAccountResetAttemptLimit.retryAfterSeconds || 60));
      res.status(429).json({ error: "Too many reset verification attempts for this account. Please try again later." });
      return;
    }
    const perIpResetAttemptLimit = enforceAuthActionLimit("reset-password-ip", ip, 15 * 60 * 1000, 80);
    if (perIpResetAttemptLimit.blocked) {
      res.setHeader("Retry-After", String(perIpResetAttemptLimit.retryAfterSeconds || 60));
      res.status(429).json({ error: "Too many reset verification attempts from this network. Please try again later." });
      return;
    }

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
    if (newPassword.length < 8 || newPassword.length > 128) {
      res.status(400).json({ error: "Password must be between 8 and 128 characters." });
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      res.status(400).json({ error: "Password must include uppercase, lowercase, and a number." });
      return;
    }

    if (tokenData.attempts >= 3) {
      resetTokens.delete(cleanUsername);
      res.status(400).json({ error: "Too many failed attempts with this verification code. Please request a new code." });
      return;
    }

    if (!timingSafeStringEqual(tokenData.otp, otp.trim())) {
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

// 2.5 Check username availability (public)
app.get("/api/auth/check-username", async (req, res) => {
  const { username } = req.query;
  if (!username || typeof username !== "string") {
    res.status(400).json({ error: "username query param is required" });
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    res.json({ available: false, reason: "Invalid format" });
    return;
  }
  const existing = await dbAdapter.getUserByUsername(username);
  res.json({ available: !existing });
});

// 2.6 Invite a new VA/user (Admin only)
app.post("/api/auth/invite", async (req, res) => {
  console.log(`[Invite] Received invite request`);
  
  const adminUser = await getUserFromToken(req.headers.authorization);
  if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "developer")) {
    console.log(`[Invite] BLOCKED: Unauthorized access attempt`);
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  console.log(`[Invite] Admin user verified: ${adminUser.username}`);

  const { email, name, role = "va", hourlyRate = 200, workType = "part-time",
          scheduleStart = "09:00", scheduleEnd = "17:00", monthlyHoursCap = 160 } = req.body;

  console.log(`[Invite] Request data - Email: ${email}, Name: ${name}, Role: ${role}`);

  if (!email || typeof email !== "string" || !email.includes("@")) {
    console.log(`[Invite] BLOCKED: Invalid email format`);
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    console.log(`[Invite] BLOCKED: Name is required`);
    res.status(400).json({ error: "Full name is required." });
    return;
  }
  if (!["va", "developer", "admin"].includes(role)) {
    console.log(`[Invite] BLOCKED: Invalid role: ${role}`);
    res.status(400).json({ error: "Invalid role. Must be va or developer." });
    return;
  }

  console.log(`[Invite] Checking for existing user with email: ${email.trim()}`);
  const existing = await dbAdapter.getUserByEmailOrUsername(email.trim());
  if (existing) {
    console.log(`[Invite] BLOCKED: User already exists - ${existing.name} (@${existing.username})`);
    res.status(409).json({ 
      error: `A user with this email already exists: ${existing.name} (@${existing.username}). Please delete this user first if you want to re-invite them.`,
      existingUser: {
        id: existing.id,
        name: existing.name,
        username: existing.username,
        email: existing.email
      }
    });
    return;
  }

  console.log(`[Invite] No existing user found. Proceeding with invite.`);
  const userId = "user-" + crypto.randomBytes(8).toString("hex");
  console.log(`[Invite] Generated user ID: ${userId}`);
  console.log(`[Invite] Mode check - useSupabase: ${useSupabase}, supabase available: ${!!supabase}`);

  if (useSupabase && supabase) {
    console.log(`[Invite] Using Supabase mode - creating user directly with temporary password`);
    try {
      // Generate temporary password and username
      const tempPassword = crypto.randomBytes(8).toString("hex"); // 16 character password
      const baseUsername = email.trim().split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20) + "_va";
      let finalUsername = baseUsername;
      let counter = 1;
      while (await dbAdapter.getUserByUsername(finalUsername)) {
        finalUsername = baseUsername + counter;
        counter++;
      }

      console.log(`[Invite] Generated username: ${finalUsername}, Creating user in Supabase Auth...`);
      
      // Create user directly in Supabase Auth with temporary password
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email.trim(),
        password: tempPassword,
        email_confirm: true, // Auto-confirm email so they can login immediately
        user_metadata: {
          name: name.trim(),
          role,
          username: finalUsername
        }
      });

      console.log(`[Invite] Supabase Auth createUser response - Data:`, authData?.user?.id, `Error:`, authError);

      if (authError) {
        console.error(`[Invite] Supabase user creation error:`, authError);
        res.status(500).json({ error: `Failed to create user in Supabase: ${authError.message}` });
        return;
      }

      // Create user in database
      const newUser: DBUser = {
        id: authData?.user?.id || userId,
        username: finalUsername,
        email: email.trim(),
        passwordHash: hashPassword(tempPassword), // Store hashed password for local auth fallback
        name: name.trim(),
        role: role as any,
        hourlyRate: Number(hourlyRate) || 200,
        workType: workType as any,
        scheduleStart: scheduleStart || "09:00",
        scheduleEnd: scheduleEnd || "17:00",
        notificationTime: "09:00",
        photoUrl: "",
        monthlyHoursCap: Number(monthlyHoursCap) || 160,
      };
      await dbAdapter.createUser(newUser);

      console.log(`[Invite] User created successfully in both Auth and Database.`);
      res.json({
        success: true,
        message: `User created successfully! Share these temporary login credentials with ${name.trim()}.`,
        tempCredentials: { 
          username: finalUsername, 
          email: email.trim(),
          password: tempPassword 
        },
        user: {
          id: newUser.id,
          name: newUser.name,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        }
      });
    } catch (err: any) {
      console.error("[Invite Error] Exception caught:", err);
      console.error("[Invite Error] Stack trace:", err.stack);
      res.status(500).json({ error: err.message || "Failed to create user." });
    }
  } else {
    console.log(`[Invite] Using local mode (Supabase not configured)`);
    // Local mode: create user with temporary credentials
    const tempPassword = crypto.randomBytes(5).toString("hex");
    const baseUsername = email.trim().split("@")[0].replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 20) + "_va";
    let finalUsername = baseUsername;
    let counter = 1;
    while (await dbAdapter.getUserByUsername(finalUsername)) {
      finalUsername = baseUsername + counter;
      counter++;
    }

    console.log(`[Invite] Created local user with username: ${finalUsername}`);

    const newUser: DBUser = {
      id: userId,
      username: finalUsername,
      email: email.trim(),
      passwordHash: hashPassword(tempPassword),
      name: name.trim(),
      role: role as any,
      hourlyRate: Number(hourlyRate) || 200,
      workType: workType as any,
      scheduleStart: scheduleStart || "09:00",
      scheduleEnd: scheduleEnd || "17:00",
      notificationTime: "09:00",
      photoUrl: "",
      monthlyHoursCap: Number(monthlyHoursCap) || 160,
    };
    await dbAdapter.createUser(newUser);

    res.json({
      success: true,
      message: "User created (Supabase not configured — invite email not sent). Share the temporary credentials below.",
      tempCredentials: { username: finalUsername, password: tempPassword },
    });
  }
});

// 2.7 Accept invite — new user sets their username + password via Supabase invite token
app.post("/api/auth/accept-invite", async (req, res) => {
  const { accessToken, username, password } = req.body;

  if (!accessToken || !username || !password) {
    res.status(400).json({ error: "Access token, username, and password are required." });
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    res.status(400).json({ error: "Username must be 3-30 characters: letters, numbers, underscores only." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  if (!useSupabase || !supabase) {
    res.status(501).json({ error: "Invite acceptance requires Supabase to be configured on the server." });
    return;
  }

  try {
    // Exchange invite token for session
    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: "",
    });

    if (sessionError || !sessionData?.user) {
      res.status(401).json({ error: "Invalid or expired invite link. Please request a new one from the admin." });
      return;
    }

    const supabaseUser = sessionData.user;
    const userEmail = supabaseUser.email!;

    // Check username availability
    const existingByUsername = await dbAdapter.getUserByUsername(username);
    if (existingByUsername) {
      res.status(409).json({ error: "That username is already taken. Please choose another." });
      return;
    }

    // Find pre-created pending user entry
    let user = await dbAdapter.getUserByEmailOrUsername(userEmail);

    if (user) {
      await dbAdapter.updateUser(user.id, {
        username,
        passwordHash: hashPassword(password),
      });
      user = { ...user, username, passwordHash: hashPassword(password) };
    } else {
      // No pending record — create fresh
      const newUser: DBUser = {
        id: supabaseUser.id,
        username,
        email: userEmail,
        passwordHash: hashPassword(password),
        name: supabaseUser.user_metadata?.name || username,
        role: (supabaseUser.user_metadata?.role as any) || "va",
        hourlyRate: 200,
        workType: "part-time",
        scheduleStart: "09:00",
        scheduleEnd: "17:00",
        notificationTime: "09:00",
        photoUrl: "",
        monthlyHoursCap: 160,
      };
      await dbAdapter.createUser(newUser);
      user = newUser;
    }

    // Sync password into Supabase GoTrue
    if ((supabase.auth as any).admin) {
      await (supabase.auth as any).admin.updateUserById(supabaseUser.id, { password });
    }

    const token = Buffer.from(username).toString("base64");
    const { passwordHash: _ph, ...cleanUser } = user;
    res.json({ success: true, token, user: cleanUser });
  } catch (err: any) {
    console.error("[Accept Invite Error]:", err);
    res.status(500).json({ error: err.message || "Failed to complete account setup." });
  }
});

// 2.1 Get users (Admin only)
app.get("/api/users", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user || (user.role !== "admin" && user.role !== "developer")) {
    console.log(`[Get Users] BLOCKED: Unauthorized access attempt by ${user?.username || 'unknown'} (role: ${user?.role || 'none'})`);
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  console.log(`[Get Users] Request by admin: ${user.username}`);
  const users = await dbAdapter.getUsers();
  const cleanUsers = users.map(({ passwordHash, ...u }) => u);
  console.log(`[Get Users] Returning ${cleanUsers.length} users`);
  res.json(cleanUsers);
});

// 2.2 Update own profile (VAs can edit photo, name)
app.patch("/api/users/profile", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
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
    if (typeof photoUrl !== "string" || photoUrl.length > 5000000) {
      res.status(400).json({ error: "Invalid photo. Upload size exceeds maximum limits." });
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
  const adminUser = await getUserFromToken(req.headers.authorization);
  if (!adminUser || adminUser.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  
  const userId = req.params.id;
  const { name, username, password, workType, scheduleStart, scheduleEnd, notificationTime, monthlyHoursCap, hourlyRate } = req.body;
  
  console.log(`[Update User] Request to update user ID: ${userId}`);
  console.log(`[Update User] Updates:`, { name, username, workType, scheduleStart, scheduleEnd, notificationTime, monthlyHoursCap, hourlyRate, hasPassword: !!password });
  
  const updates: Partial<DBUser> = {};
  if (name !== undefined) updates.name = name;
  if (username !== undefined) {
    const cleanUsername = String(username).toLowerCase().trim();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      res.status(400).json({ error: "Username must be 3-30 chars and contain only lowercase letters, numbers, and underscores." });
      return;
    }

    const users = await dbAdapter.getUsers();
    const duplicate = users.find(u => u.id !== userId && u.username.toLowerCase().trim() === cleanUsername);
    if (duplicate) {
      res.status(409).json({ error: "Username is already in use." });
      return;
    }

    updates.username = cleanUsername;
  }

  if (password !== undefined) {
    const cleanPassword = String(password);
    if (cleanPassword.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    updates.passwordHash = hashPassword(cleanPassword);
  }

  if (workType !== undefined) {
    updates.workType = workType;
    if (hourlyRate === undefined) {
      updates.hourlyRate = 200;
    }
  }
  if (scheduleStart !== undefined) updates.scheduleStart = scheduleStart;
  if (scheduleEnd !== undefined) updates.scheduleEnd = scheduleEnd;
  if (notificationTime !== undefined) updates.notificationTime = notificationTime;
  if (monthlyHoursCap !== undefined) updates.monthlyHoursCap = Number(monthlyHoursCap);
  if (hourlyRate !== undefined) updates.hourlyRate = Number(hourlyRate);
  
  try {
    console.log(`[Update User] Calling dbAdapter.updateUser with:`, updates);
    const updatedUser = await dbAdapter.updateUser(userId, updates);

    if (password !== undefined && useSupabase && supabase?.auth?.admin) {
      const authTargetEmail = updatedUser.email || (await dbAdapter.getUserById(userId))?.email || "";
      const authPasswordSynced = await syncSupabaseAuthPasswordByEmail(authTargetEmail, String(password));
      if (!authPasswordSynced) {
        res.status(500).json({ error: "Profile was updated, but password update failed in Supabase Auth." });
        return;
      }
    }

    console.log(`[Update User] SUCCESS: User updated:`, updatedUser.username);
    const { passwordHash, ...cleanUser } = updatedUser;
    res.json(cleanUser);
  } catch (err: any) {
    console.error(`[Update User] ERROR:`, err);
    res.status(404).json({ error: err.message });
  }
});

// 2.3 Delete User (Admin only)
app.delete("/api/users/:id", async (req, res) => {
  const adminUser = await getUserFromToken(req.headers.authorization);
  if (!adminUser || (adminUser.role !== "admin" && adminUser.role !== "developer")) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const userId = req.params.id;
  console.log(`[Delete User] Request to delete user ID: ${userId} by admin: ${adminUser.username}`);

  // Prevent admin from deleting themselves
  if (userId === adminUser.id) {
    console.log(`[Delete User] BLOCKED: Admin attempted to delete their own account`);
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  // Check if user exists
  const users = await dbAdapter.getUsers();
  const userToDelete = users.find(u => u.id === userId);
  
  if (!userToDelete) {
    console.log(`[Delete User] ERROR: User ${userId} not found`);
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Optionally, you can prevent deletion of other admin accounts
  if (userToDelete.role === "admin" && adminUser.role !== "admin") {
    console.log(`[Delete User] BLOCKED: Cannot delete admin user ${userToDelete.username}`);
    res.status(403).json({ error: "Cannot delete admin accounts" });
    return;
  }

  try {
    console.log(`[Delete User] Attempting to delete user: ${userToDelete.username} (${userId})`);
    const deleted = await dbAdapter.deleteUser(userId);
    
    if (deleted) {
      console.log(`[Delete User] SUCCESS: User ${userToDelete.name} deleted successfully`);
      res.json({ success: true, message: `User ${userToDelete.name} has been deleted successfully` });
    } else {
      console.log(`[Delete User] WARNING: Delete returned false for user ${userId}`);
      res.status(500).json({ error: "Failed to delete user from database" });
    }
  } catch (err: any) {
    console.error(`[Delete User] EXCEPTION:`, err);
    res.status(500).json({ error: err.message || "Failed to delete user" });
  }
});

// 2.4 Tasks APIs
app.get("/api/tasks", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  if (user.role === "admin") {
    const tasks = await dbAdapter.getTasks();
    const users = await dbAdapter.getUsers();
    const vaUsers = users.filter((u) => u.role === "va");
    const vaIds = new Set(vaUsers.map((u) => u.id));
    const vaUsernames = new Set(vaUsers.map((u) => u.username));

    const vaOnlyTasks = tasks.filter((task) => {
      return vaIds.has(task.userId) || vaUsernames.has(task.userName);
    });

    res.json(vaOnlyTasks);
  } else {
    const tasks = await dbAdapter.getTasks(user.id);
    res.json(tasks);
  }
});

app.post("/api/tasks", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
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
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { title, project, status, priority, description } = req.body;
  
  try {
    const task = await dbAdapter.getTaskById(req.params.id);
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
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const task = await dbAdapter.getTaskById(req.params.id);
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  
  if (task.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Permission denied" });
    return;
  }
  
  const deleted = await dbAdapter.deleteTask(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  res.json({ success: true });
});

// 3. Get Logs Endpoint
app.get("/api/logs", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
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
  const user = await getUserFromToken(req.headers.authorization);
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
  const user = await getUserFromToken(req.headers.authorization);
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
  const minutes = diffMs / 60000;
  const durationMinutes = Math.max(0, Math.round(minutes));

  const updated = await dbAdapter.updateLog(activeLog.id, {
    endTime,
    description: description || activeLog.description || "Completed tracking shift.",
    durationMinutes,
  });

  res.json(updated);
});

// 6. Delete Log
app.delete("/api/logs/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const log = await dbAdapter.getLogById(req.params.id);

  if (!log) {
    res.status(404).json({ error: "Log not found" });
    return;
  }

  // Only the owner or an admin can delete logs
  if (log.userId !== user.id && user.role !== "admin") {
    res.status(403).json({ error: "Permission denied" });
    return;
  }

  const deleted = await dbAdapter.deleteLog(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Log not found" });
    return;
  }

  res.json({ success: true });
});

// 7. Admin edit log (update description / duration / endTime)
app.patch("/api/logs/:id", async (req, res) => {
  const user = await getUserFromToken(req.headers.authorization);
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
  const adminUsername = process.env.DEV_USER_NAME || "admin";
  const adminEmail = process.env.DEV_USER_EMAIL || "admin@example.com";
  const adminPassword = process.env.DEV_USER_PASSWORD || "admin123";
  const adminName = process.env.DEV_USER_FULLNAME || "Admin User";

  const incomingHash = hashPassword(adminPassword);

  const izavaUsername = process.env.IZA_VA_USERNAME || "va_member";
  const izavaEmail = process.env.IZA_VA_EMAIL || "va_member@example.com";
  const izavaName = process.env.IZA_VA_NAME || "VA Member";
  const izavaPassword = process.env.IZA_VA_PASSWORD || "izava123";
  const izavaHash = hashPassword(izavaPassword);

  const alliyahUsername = process.env.ALLIYAH_VA_USERNAME || "alliyah_va";
  const alliyahEmail = process.env.ALLIYAH_VA_EMAIL || "va_member@example.com";
  const alliyahName = process.env.ALLIYAH_VA_NAME || "Alliyah";
  const alliyahPassword = process.env.ALLIYAH_VA_PASSWORD || "va_member123";
  const alliyahHash = hashPassword(alliyahPassword);

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
        notificationTime: "09:00",
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
        hourlyRate: 200,
        workType: "full-time",
        scheduleStart: "09:00",
        scheduleEnd: "17:00",
        notificationTime: "09:00",
        photoUrl: "",
        monthlyHoursCap: 160,
      };
      db.users.push(newIzava);
      updatedLocal = true;
    }

    // 3. Sync alliyah_va User
    const localAlliyah = db.users.find(u => u.username.toLowerCase().trim() === alliyahUsername.toLowerCase().trim());
    if (localAlliyah) {
      if (localAlliyah.passwordHash !== alliyahHash || localAlliyah.email !== alliyahEmail || localAlliyah.name !== alliyahName || localAlliyah.username !== alliyahUsername) {
        console.log(`[Credentials Sync] Updating Alliyah user password/email/name in local DB to match environment variables...`);
        localAlliyah.username = alliyahUsername;
        localAlliyah.email = alliyahEmail;
        localAlliyah.name = alliyahName;
        localAlliyah.passwordHash = alliyahHash;
        updatedLocal = true;
      }
    } else {
      console.log(`[Credentials Sync] User "${alliyahUsername}" not found in local DB. Creating...`);
      const newAlliyah: DBUser = {
        id: "user-alliyah",
        username: alliyahUsername,
        email: alliyahEmail,
        passwordHash: alliyahHash,
        name: alliyahName,
        role: "va",
        hourlyRate: 200,
        workType: "part-time",
        scheduleStart: "09:00",
        scheduleEnd: "17:00",
        notificationTime: "09:00",
        photoUrl: "",
        monthlyHoursCap: 160,
      };
      db.users.push(newAlliyah);
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
          notificationTime: "09:00",
          photoUrl: "",
          monthlyHoursCap: 160,
        };
        const dbInsert = await mapUserToDb(newAdmin);
        console.log(`[Credentials Sync] Inserting admin into database...`);
        const { data: insertData, error: insertError } = await supabase.from("users").insert([dbInsert]).select();
        if (insertError) {
          console.error(`[Credentials Sync] FAILED to insert admin into database:`, insertError);
        } else {
          console.log(`[Credentials Sync] Admin user inserted successfully:`, insertData);
        }
        if (supabase.auth.admin) {
          console.log(`[Credentials Sync] Creating admin in Supabase Auth...`);
          const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: adminEmail,
            password: adminPassword,
            email_confirm: true,
          });
          if (authError) {
            console.error(`[Credentials Sync] FAILED to create admin in Auth:`, authError);
          } else {
            console.log(`[Credentials Sync] Admin created in Auth successfully. ID: ${authData.user?.id}`);
          }
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
          hourlyRate: 200,
          workType: "full-time",
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
          notificationTime: "09:00",
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

      // 3. Sync Alliyah VA User
      const { data: dbAlliyah, error: dbAlliyahError } = await supabase
        .from("users")
        .select("*")
        .eq("username", alliyahUsername)
        .maybeSingle();

      if (dbAlliyahError) {
        console.error("[Credentials Sync Error] Supabase Alliyah user query failed:", dbAlliyahError);
      } else if (dbAlliyah) {
        const mappedAlliyah = mapUserFromDb(dbAlliyah);
        if (mappedAlliyah.passwordHash !== alliyahHash || mappedAlliyah.email !== alliyahEmail || mappedAlliyah.name !== alliyahName || mappedAlliyah.username !== alliyahUsername) {
          console.log(`[Credentials Sync] Updating Alliyah user credentials in Supabase...`);
          const dbUpdates = await mapUserToDb({
            username: alliyahUsername,
            email: alliyahEmail,
            name: alliyahName,
            passwordHash: alliyahHash,
          });
          await supabase.from("users").update(dbUpdates).eq("id", mappedAlliyah.id);
        }

        if (supabase.auth.admin) {
          const { error: authUpdateError } = await supabase.auth.admin.updateUserById(mappedAlliyah.id, {
            password: alliyahPassword,
          });
          if (authUpdateError) {
            await supabase.auth.admin.createUser({
              email: alliyahEmail,
              password: alliyahPassword,
              email_confirm: true,
            });
          }
        }
      } else {
        console.log(`[Credentials Sync] User "${alliyahUsername}" not found in Supabase. Creating...`);
        const newAlliyah: DBUser = {
          id: "user-alliyah",
          username: alliyahUsername,
          email: alliyahEmail,
          passwordHash: alliyahHash,
          name: alliyahName,
          role: "va",
          hourlyRate: 200,
          workType: "part-time",
          scheduleStart: "09:00",
          scheduleEnd: "17:00",
          notificationTime: "09:00",
          photoUrl: "",
          monthlyHoursCap: 160,
        };
        const dbInsert = await mapUserToDb(newAlliyah);
        await supabase.from("users").insert([dbInsert]);
        if (supabase.auth.admin) {
          await supabase.auth.admin.createUser({
            email: alliyahEmail,
            password: alliyahPassword,
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
