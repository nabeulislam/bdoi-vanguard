# BDOI Vanguard — Anti-Cheat System

A Valorant Vanguard-inspired anti-cheat monitor for BDOI (Bangladesh Olympiad in Informatics) contests. Silently monitors contestants during contest time and reports violations to admins via a real-time web dashboard.

**Top Priority: Zero false positives.** Every flag is backed by hard evidence with multi-signal confidence scoring. No auto-bans — all violations require human review.

## Architecture

```
Desktop Agent (Rust+Tauri) ──→ Supabase (DB+Realtime) ←── Admin Dashboard (Next.js)
```

## Detection Modules

| Module | What It Detects | Severity |
|--------|----------------|----------|
| **VM Detect** | VirtualBox, VMware, QEMU, Hyper-V, KVM | 2+ signals → FLAG |
| **Process Monitor** | AI tools (Copilot, Cursor, Codeium), memory editors, screen sharing | Known AI tool → FLAG |
| **Browser Monitor** | AI tabs (ChatGPT, Claude, Gemini, DeepSeek, Perplexity, etc.) | Title match → FLAG |
| **Network Monitor** | DNS/connections to AI API domains | AI domain → FLAG |
| **Clipboard Monitor** | Rapid large paste patterns (content hashed, never stored) | Supplementary only |
| **Focus Monitor** | Alt-tab frequency, window focus timeline | Informational only |
| **Phone Detect** | Phone/tablet via webcam ML (on-device, no video transmitted) | 3+ frames → FLAG |

## Fairness System

```
CLEAN → WATCH → WARN → FLAG → BAN (admin-confirmed only)
```

- **NEVER auto-bans** — all flags require human review with written reason
- Every event: timestamp + module + confidence score + evidence hash
- Multiple independent signals needed for escalation
- Privacy-first: clipboard hashed, webcam frames never leave device

## Setup

### Prerequisites

- **Rust** (1.70+): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Node.js** (18+)
- **Supabase account** (free tier works)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
- **macOS**: Xcode CLI tools
- **Windows**: Visual Studio C++ Build Tools + WebView2

### 1. Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run `supabase/migrations/001_initial.sql`
3. Copy your project URL and anon key

### 2. Dashboard Setup

```bash
cd dashboard
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL and anon key
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Agent Setup

```bash
cd agent/src-tauri

# Set environment variables
export BDOI_SUPABASE_URL="https://your-project.supabase.co"
export BDOI_SUPABASE_ANON_KEY="your-anon-key"
export BDOI_CONTEST_ID="contest-2025"
export BDOI_CONTESTANT_ID="contestant-123"
export BDOI_CONTESTANT_NAME="John Doe"

cargo tauri dev
```

### 4. Phone Detection (Optional)

Place a YOLOv8-nano ONNX model at `agent/src-tauri/models/yolov8n.onnx`. You can export one from [Ultralytics](https://docs.ultralytics.com/modes/export/):

```bash
pip install ultralytics
yolo export model=yolov8n.pt format=onnx
cp yolov8n.onnx agent/src-tauri/models/
```

## Project Structure

```
bdoi-vanguard/
├── agent/                    # Rust + Tauri desktop agent
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs          # Entry point
│   │   │   ├── lib.rs           # Anti-cheat engine + Tauri commands
│   │   │   ├── config.rs        # Agent configuration
│   │   │   ├── evidence.rs      # Event types + evidence hashing
│   │   │   ├── reporter.rs      # Supabase event reporter
│   │   │   └── monitors/        # Detection modules
│   │   │       ├── vm_detect.rs
│   │   │       ├── process_monitor.rs
│   │   │       ├── browser_monitor.rs
│   │   │       ├── network_monitor.rs
│   │   │       ├── clipboard_monitor.rs
│   │   │       ├── focus_monitor.rs
│   │   │       └── phone_detect.rs
│   │   └── models/              # ML models (YOLOv8n ONNX)
│   └── src/                     # Minimal status UI
├── dashboard/                # Next.js admin dashboard
│   └── src/
│       ├── app/                  # Pages (dashboard, violations, contestants, sessions)
│       ├── components/           # Sidebar
│       └── lib/supabase.ts       # Supabase client + types
└── supabase/migrations/      # Database schema
```

## Building for Production

### Agent
```bash
cd agent/src-tauri
cargo tauri build
# Outputs: .deb (Linux), .dmg (macOS), .msi (Windows)
```

### Dashboard
```bash
cd dashboard
npm run build
npm start
```

## License

MIT
