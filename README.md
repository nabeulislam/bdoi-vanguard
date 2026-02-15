# BDOI Vanguard — Anti-Cheat System

A Valorant Vanguard-inspired anti-cheat monitor for BDOI (Bangladesh Olympiad in Informatics) contests. Silently monitors contestants during contest time and reports violations to admins via a real-time web dashboard.

**Top Priority: Zero false positives.** Every flag is backed by hard evidence. No auto-bans — all violations require human review.

## How It Works

```
Contestant PC                    Cloud                     Admin
┌───────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ BDOI Vanguard │       │    Supabase      │       │    Dashboard     │
│  (Tauri App)  │──────▶│                  │◀──────│   (Next.js)      │
│               │       │ • Auth           │       │                  │
│ 1. Login      │       │ • PostgreSQL     │       │ • Create users   │
│ 2. "Hi, Name" │       │ • Realtime       │       │ • Create contests│
│ 3. Monitor    │       │ • RLS policies   │       │ • Live violations│
│ 4. Report     │       │                  │       │ • Verdict system │
└───────────────┘       └──────────────────┘       └──────────────────┘
```

1. **Admin** creates a contest and contestant accounts in the dashboard
2. **Contestant** opens the agent, logs in with their credentials
3. **Agent** shows "Hi, {name}" and starts silent monitoring
4. **Violations** stream to the dashboard in realtime
5. **Admin** reviews evidence and confirms/dismisses each flag

## Detection Modules

| Module | What It Detects | Severity |
|--------|----------------|----------|
| **VM Detect** | VirtualBox, VMware, QEMU, Hyper-V, KVM | 2+ signals → FLAG |
| **Process Monitor** | AI tools (Copilot, Cursor, Codeium), memory editors | Known AI tool → FLAG |
| **Browser Monitor** | AI tabs (ChatGPT, Claude, Gemini, DeepSeek, etc.) | Title match → FLAG |
| **Network Monitor** | DNS/connections to AI API domains | AI domain → FLAG |
| **Clipboard Monitor** | Rapid large paste patterns (hashed, never stored) | Supplementary only |
| **Focus Monitor** | Alt-tab frequency, window focus timeline | Informational only |
| **Phone Detect** | Phone/tablet via webcam ML (on-device ONNX) | 3+ frames → FLAG |

## Fairness System

```
CLEAN → WATCH → WARN → FLAG → BAN (admin-confirmed only)
```

- **NEVER auto-bans** — all flags require human review with written reason
- Every event: timestamp + module + confidence score + evidence hash
- Privacy-first: clipboard hashed, webcam frames never leave device

---

## 🚀 Deployment Guide

### Step 1: Supabase Setup

#### 1.1 Create Project
1. Go to **[supabase.com](https://supabase.com)** → Sign up / Log in
2. Click **"New Project"**
3. Fill in:
   - **Name**: `bdoi-vanguard`
   - **Database Password**: pick a strong one (save it somewhere)
   - **Region**: choose closest to Bangladesh (Singapore or Mumbai)
4. Click **"Create new project"** → wait ~2 min for it to provision

#### 1.2 Run Database Migrations
1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open [`supabase/migrations/001_initial.sql`](supabase/migrations/001_initial.sql) from this repo — copy the **entire file content** and paste it into the SQL editor
4. Click **"Run"** (green play button) → you should see `Success. No rows returned`
5. Click **"New query"** again
6. Open [`supabase/migrations/002_auth_and_admin.sql`](supabase/migrations/002_auth_and_admin.sql) — copy and paste, then **"Run"**
7. Verify: click **"Table Editor"** in sidebar → you should see tables: `contests`, `contestants`, `violation_logs`, `flagged_events`, `sessions`, `heartbeats`, `admin_users`

#### 1.3 Disable Email Confirmation
1. Go to **Authentication** → **Providers** → **Email**
2. **Turn OFF** "Confirm email" toggle
3. Click **Save**

> ⚠️ Important! Otherwise contestants can't log in immediately after admin creates their account.

#### 1.4 Copy Your API Keys
1. Go to **Settings** (gear icon) → **API**
2. Copy these values — you'll need them for both dashboard and agent:

| Key | Where to find | Used by |
|-----|--------------|---------|
| **Project URL** | `https://xxxxxxxx.supabase.co` | Dashboard + Agent |
| **anon public key** | `eyJhbGciOiJIUzI1NiIs...` | Dashboard + Agent |
| **service_role key** | `eyJhbGciOiJIUzI1NiIs...` | Dashboard only (keep secret!) |

#### 1.5 Create Your Admin Account
1. Go to **Authentication** → **Users** → click **"Add user"** → **"Create new user"**
2. Enter:
   - **Email**: your admin email (e.g. `admin@bdoi.org`)
   - **Password**: your admin password
   - ✅ Check **"Auto Confirm User"**
3. Click **"Create user"**
4. Go to **SQL Editor** → **New query** → run:

```sql
INSERT INTO admin_users (user_id, email, name)
SELECT id, email, 'Admin'
FROM auth.users
WHERE email = 'admin@bdoi.org';
```
*(Replace `admin@bdoi.org` with the email you used)*

5. Click **Run** → `Success. 1 row affected`

✅ **Supabase is ready!**

---

### Step 2: Deploy Dashboard (Vercel)

#### 2.1 Import Project
1. Go to **[vercel.com](https://vercel.com)** → Sign up / Log in with GitHub
2. Click **"Add New..."** → **"Project"**
3. Find **`bdoi-vanguard`** in the repo list → click **"Import"**

#### 2.2 Configure Build Settings

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js (auto-detected) |
| **Root Directory** | Click **"Edit"** → type **`dashboard`** → click **"Continue"** |
| **Build Command** | `npm run build` (default, leave as-is) |
| **Output Directory** | `.next` (default, leave as-is) |

#### 2.3 Set Environment Variables
Scroll to **"Environment Variables"** and add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` *(your Project URL)* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIs...` *(your anon key)* |

Click **"Add"** after each one.

#### 2.4 Deploy
1. Click **"Deploy"**
2. Wait ~1-2 minutes for the build
3. You'll get a URL like: **`https://bdoi-vanguard.vercel.app`**
4. Click it → you should see the **BDOI Vanguard login page**
5. Log in with the admin email/password you created in Supabase

#### 2.5 (Optional) Custom Domain
1. In Vercel → your project → **Settings** → **Domains**
2. Add your domain (e.g. `vanguard.bdoi.org`)
3. Follow the DNS instructions Vercel provides

#### Alternative: Self-hosted Dashboard
```bash
cd dashboard
cp .env.local.example .env.local   # edit with your Supabase URL and anon key
npm install
npm run build
npm start                           # runs on port 3000
```

---

### Step 3: Build the Agent

#### 3.1 Prerequisites

**Linux:**
```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Tauri system dependencies
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev pkg-config

# Monitor dependencies (for window title + clipboard detection)
sudo apt install wmctrl xdotool xclip
```

**Windows:**
- Install [Rust](https://rustup.rs)
- Install [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select "Desktop development with C++")
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10/11)

#### 3.2 Build

**Linux:**
```bash
cd agent/src-tauri
export BDOI_SUPABASE_URL="https://xxxxxxxx.supabase.co"
export BDOI_SUPABASE_ANON_KEY="your-anon-key"
export BDOI_CONTEST_ID="your-contest-id"

cargo tauri build
```

Output files:
```
target/release/bundle/deb/bdoi-vanguard_0.1.0_amd64.deb
target/release/bundle/appimage/bdoi-vanguard_0.1.0_amd64.AppImage
```

**Windows:**
```cmd
cd agent\src-tauri
set BDOI_SUPABASE_URL=https://xxxxxxxx.supabase.co
set BDOI_SUPABASE_ANON_KEY=your-anon-key
set BDOI_CONTEST_ID=your-contest-id

cargo tauri build
```

Output files:
```
target\release\bundle\msi\bdoi-vanguard_0.1.0_x64.msi
target\release\bundle\nsis\bdoi-vanguard_0.1.0_x64-setup.exe
```

---

### Step 4: Run a Contest

1. **Upload** agent installers (`.deb`, `.AppImage`, `.msi`, `.exe`) to GitHub Releases or a download page
2. **Dashboard** → Admin → Manage Contests → **Create** a new contest
3. **Dashboard** → Admin → Manage Users → **Create** contestant accounts
   - Password is auto-generated and shown **once** — save/share it immediately
4. **Share** with each contestant:
   - Download link for the agent
   - Their login email + password
5. Contestant installs agent → opens it → logs in → sees **"Hi, {name}"** → monitoring starts
6. Click **"Start"** on the contest in the dashboard
7. Monitor the **Violations** page in realtime
8. For each flag: click → view evidence → **Confirm** or **Dismiss** (reason required)

---

### Phone Detection (Optional)

To enable webcam-based phone detection, place a YOLOv8-nano ONNX model in the agent:

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx
cp yolov8n.onnx agent/src-tauri/models/
```

The agent auto-detects the model file and enables phone detection. No video or frames ever leave the contestant's device — only detection metadata (timestamp, confidence, bounding box) is reported.

---

## ✅ Verify Everything Works

1. Open your **dashboard URL** → log in as admin
2. Go to **Admin → Manage Contests** → create a test contest
3. Go to **Admin → Manage Users** → create a test contestant (save the password!)
4. Open the **agent** on your machine:
   ```bash
   cd agent/src-tauri
   BDOI_SUPABASE_URL="https://xxxxxxxx.supabase.co" \
   BDOI_SUPABASE_ANON_KEY="your-anon-key" \
   BDOI_CONTEST_ID="your-contest-id" \
   RUST_LOG=info \
   cargo tauri dev
   ```
5. Log in with the contestant credentials → see **"Hi, {name}"**
6. Go back to the **dashboard → Violations** → events should appear in realtime

---

## Project Structure

```
bdoi-vanguard/
├── agent/                        # Rust + Tauri desktop agent
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs           # Entry point
│   │   │   ├── lib.rs            # Engine + Tauri commands (login, status)
│   │   │   ├── auth.rs           # Supabase Auth (login/session)
│   │   │   ├── config.rs         # Agent configuration
│   │   │   ├── evidence.rs       # Event types + evidence hashing
│   │   │   ├── reporter.rs       # Supabase event reporter
│   │   │   └── monitors/         # 7 detection modules
│   │   │       ├── vm_detect.rs
│   │   │       ├── process_monitor.rs
│   │   │       ├── browser_monitor.rs
│   │   │       ├── network_monitor.rs
│   │   │       ├── clipboard_monitor.rs
│   │   │       ├── focus_monitor.rs
│   │   │       └── phone_detect.rs
│   │   ├── models/               # ML models (YOLOv8n.onnx)
│   │   └── tauri.conf.json       # Build config (Linux + Windows)
│   └── src/index.html            # Login → "Hi, Name" → Monitor UI
├── dashboard/                    # Next.js admin dashboard
│   └── src/
│       ├── app/
│       │   ├── page.tsx          # Live dashboard home
│       │   ├── login/            # Admin login
│       │   ├── violations/       # Violation review + verdict system
│       │   ├── contestants/      # Contestant status overview
│       │   ├── sessions/         # Agent session tracking
│       │   └── admin/
│       │       ├── users/        # Create/manage contestant accounts
│       │       └── contests/     # Create/manage contests
│       ├── components/
│       │   ├── Sidebar.tsx       # Navigation sidebar
│       │   └── AuthGuard.tsx     # Auth redirect guard
│       └── lib/supabase.ts       # Supabase client + types
└── supabase/migrations/          # Database schema
    ├── 001_initial.sql           # Tables, indexes, RLS, realtime
    └── 002_auth_and_admin.sql    # Auth integration, admin users
```

## Development

```bash
# Agent (dev mode with hot reload)
cd agent/src-tauri
BDOI_SUPABASE_URL=... BDOI_SUPABASE_ANON_KEY=... RUST_LOG=info cargo tauri dev

# Dashboard (dev mode)
cd dashboard
cp .env.local.example .env.local  # edit with Supabase creds
npm run dev                        # http://localhost:3000
```

## License

MIT
