# BdOI Vanguard — Installation Guide

## Downloads

Grab the latest installers from the [**Releases**](https://github.com/nabeulislam/bdoi-vanguard/releases) page.

| Platform | File | Notes |
|---|---|---|
| **Linux** (recommended) | `BdOI-Vanguard_x.x.x_amd64.AppImage` | Works on most distros (Ubuntu 20.04+, Fedora 36+, etc.) |
| **Linux** (Debian/Ubuntu 24.04+) | `BdOI-Vanguard_x.x.x_amd64.deb` | Native `.deb` package |
| **Windows** | `BdOI-Vanguard_x.x.x_x64-setup.exe` | NSIS installer (recommended) |
| **Windows** | `BdOI-Vanguard_x.x.x_x64_en-US.msi` | MSI installer |
| **macOS** (Apple Silicon) | `BdOI-Vanguard_x.x.x_aarch64.dmg` | For M1/M2/M3/M4 Macs |

---

## Linux

### AppImage (recommended — works on most distros)

```bash
# Download
chmod +x BdOI-Vanguard_*.AppImage

# Run
./BdOI-Vanguard_*.AppImage
```

> **Note:** If you get a GLIBC error with the `.deb` package, use the AppImage instead.
> The `.deb` requires Ubuntu 24.04+ or equivalent (GLIBC ≥ 2.39).

### Debian/Ubuntu 24.04+ (.deb)

```bash
sudo dpkg -i BdOI-Vanguard_*_amd64.deb

# If missing dependencies:
sudo apt-get install -f
```

### Required system libraries (for .deb only)

```bash
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0
```

---

## Windows

### NSIS Installer (recommended)

1. Download `BdOI-Vanguard_x.x.x_x64-setup.exe`
2. Double-click to run
3. Follow the installer prompts
4. Launch from Start Menu → **BdOI Vanguard**

### MSI Installer

1. Download `BdOI-Vanguard_x.x.x_x64_en-US.msi`
2. Double-click to install
3. Launch from Start Menu

> **Windows Defender:** You may see a SmartScreen warning since the binary is unsigned. Click **More info → Run anyway**.

---

## macOS (Apple Silicon)

1. Download `BdOI-Vanguard_x.x.x_aarch64.dmg`
2. Open the `.dmg` file
3. Drag **BdOI Vanguard** to Applications
4. On first launch: Right-click → Open (to bypass Gatekeeper)

> **Note:** The app is currently unsigned. macOS may show a security warning on first run.

---

## Usage

1. Launch the app
2. Enter your **Contest ID** (provided by contest admin)
3. Sign in with your **email** and **password**
4. The agent will begin monitoring automatically
5. **Keep the app open** during the contest — you can minimize it

### Offline Mode

If your internet disconnects during a contest:
- All logs are **stored locally** and will auto-upload when you're back online
- An amber **"Server Disconnected"** banner will appear — don't worry, nothing is lost

### Data Storage

Local evidence logs are stored at:
- **Linux:** `~/.local/share/bdoi-vanguard/evidence/`
- **Windows:** `%LOCALAPPDATA%\bdoi-vanguard\evidence\`
- **macOS:** `~/Library/Application Support/bdoi-vanguard/evidence/`

---

## Troubleshooting

| Issue | Solution |
|---|---|
| GLIBC error on Linux | Use the `.AppImage` instead of `.deb` |
| SmartScreen warning on Windows | Click **More info → Run anyway** |
| macOS "unidentified developer" | Right-click → Open → Open |
| "App not ready" on login | Wait a few seconds and retry |
| Server shows "Offline" | Check your internet — logs are safe locally |

---

## Building from Source

```bash
# Prerequisites: Rust, Node.js, system deps (see below)

# Linux deps:
sudo apt-get install libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev patchelf libv4l-dev

# Install Tauri CLI
cargo install tauri-cli --version "^2"

# Build
cd agent
cargo tauri build
```

Output will be in `agent/src-tauri/target/release/bundle/`.
