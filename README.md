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

1. Create a project at [supabase.com](https://supabase.com) (free tier works)
2. Go to **SQL Editor** → run both migration files in order:
   ```
   supabase/migrations/001_initial.sql
   supabase/migrations/002_auth_and_admin.sql
   ```
3. Go to **Settings → API** → copy:
   - Project URL (e.g. `https://abcdef.supabase.co`)
   - `anon` public key
   - `service_role` secret key (needed for admin user creation API)
4. Go to **Authentication → Settings**:
   - Disable "Enable email confirmations" (so contestant accounts work immediately)
5. Create your first **admin user**:
   - Go to **Authentication → Users → Add User**
   - Create a user with your admin email/password
   - Then in **SQL Editor**, run:
     ```sql
     INSERT INTO admin_users (user_id, email, name)
     SELECT id, email, 'Admin'
     FROM auth.users WHERE email = 'your-admin@email.com';
     ```

### Step 2: Deploy Dashboard

**Option A: Vercel (Recommended)**
```bash
cd dashboard && npm install
```
1. Push to GitHub
2. Import in [vercel.com](https://vercel.com)
3. Set environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Deploy → you get `https://bdoi-vanguard.vercel.app`

**Option B: Self-hosted**
```bash
cd dashboard
cp .env.local.example .env.local   # edit with your Supabase creds
npm install && npm run build && npm start
```

### Step 3: Build the Agent

**Linux:**
```bash
# Install deps
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

# Build
cd agent/src-tauri
export BDOI_SUPABASE_URL="https://your-project.supabase.co"
export BDOI_SUPABASE_ANON_KEY="your-anon-key"
export BDOI_CONTEST_ID="your-contest-id"
cargo tauri build

# Outputs:
#   target/release/bundle/deb/bdoi-vanguard_0.1.0_amd64.deb
#   target/release/bundle/appimage/bdoi-vanguard_0.1.0_amd64.AppImage
```

**Windows:**
```bash
# Install: Visual Studio C++ Build Tools + WebView2
cd agent\src-tauri
set BDOI_SUPABASE_URL=https://your-project.supabase.co
set BDOI_SUPABASE_ANON_KEY=your-anon-key
set BDOI_CONTEST_ID=your-contest-id
cargo tauri build

# Outputs:
#   target\release\bundle\msi\bdoi-vanguard_0.1.0_x64.msi
#   target\release\bundle\nsis\bdoi-vanguard_0.1.0_x64-setup.exe
```

### Step 4: Distribute & Run Contest

1. Upload `.deb` / `.AppImage` / `.msi` / `.exe` to GitHub Releases
2. In Dashboard → **Admin → Manage Contests** → create a contest
3. In Dashboard → **Admin → Manage Users** → create contestant accounts
4. Share credentials (email + auto-generated password) with contestants
5. Contestants download the agent → log in → "Hi, Name" → monitoring starts
6. Click **Start** on the contest
7. Monitor **Dashboard → Violations** in realtime
8. Review flags → view evidence → Confirm/Dismiss with reason

### Phone Detection (Optional)

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx
cp yolov8n.onnx agent/src-tauri/models/
```

## Development

```bash
# Agent (dev mode)
cd agent/src-tauri
BDOI_SUPABASE_URL=... BDOI_SUPABASE_ANON_KEY=... RUST_LOG=info cargo tauri dev

# Dashboard (dev mode)
cd dashboard
cp .env.local.example .env.local
npm run dev
```

## License

MIT
