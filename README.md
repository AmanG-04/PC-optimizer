# PC Optimizer

Windows desktop utility built with Electron, React, TypeScript, and Tailwind CSS.

It combines real-time system monitoring with practical optimization tools in a clean dashboard UI.

## Overview

PC Optimizer is a modular Electron app with secure IPC and context isolation.

Current modules:

- Dashboard: CPU, RAM, Disk monitoring with live refresh and trend chart
- Cleaner: Safe junk cleanup for a scoped folder
- Startup Apps: Registry-based startup manager (HKCU + HKLM Run)
- Terminal: Sandboxed PowerShell execution with basic command validation

## Tech Stack

- Electron 41
- React 19 + TypeScript 6
- Vite 8
- Tailwind CSS 4
- systeminformation
- winreg (typed with @types/winreg)

## Feature List

### Core

- Secure contextBridge API from preload to renderer
- IPC request/response handlers for all core tools
- Tailwind-powered modern dashboard with sidebar navigation

### Monitoring

- Real-time CPU/RAM/Disk stats
- 1-second refresh loop with non-blocking async collection
- CPU trend mini chart for recent samples

### Cleaner

- Cleanup scoped to a fixed directory
- Safe file filtering and deletion guards
- Confirmation flow + success/error summaries

### Startup Apps Manager

- Reads startup entries from:
  - HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run
  - HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run
- Applies enabled/disabled status from StartupApproved metadata
- Filter chips: All / Enabled / Disabled
- Disable/remove action per actionable Run entry

### Terminal Runner

- PowerShell command execution via main process IPC
- Basic dangerous command validation
- Live output panel with success/error state

## Run Locally

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
```

### Launch Built App

```bash
npm start
```

## Scripts

| Command | Description |
|---|---|
| npm run dev | Full dev mode (main + preload watch + renderer dev server) |
| npm run build | Build preload, main, and renderer |
| npm start | Launch built Electron app |
| npm run type-check | Run TypeScript checks |

## Suggested Screenshots and GIFs

Use these visuals in your GitHub repo for stronger presentation:

### Recommended screenshots

1. Dashboard overview
   - Sidebar + 3 stat cards + trend chart visible
2. Startup apps manager
   - Include status badges and filter controls
3. Cleaner module
   - Before/after result message showing deleted file count
4. Terminal module
   - Safe command execution and output panel

### Recommended GIF demos

1. Navigation flow
   - Dashboard -> Cleaner -> Startup -> Terminal
2. Real-time monitoring
   - CPU chart moving over 10-15 seconds
3. Startup entry disable flow
   - Filter enabled -> disable one entry -> refresh state
4. Cleaner run
   - Confirm dialog -> completion message

### Capture tools

- Screenshots: ShareX or Snipping Tool
- GIFs: ScreenToGif or ShareX recorder

## Resume Bullet Points

Use any of these directly in your resume:

- Built a Windows desktop optimization tool using Electron, React, TypeScript, and Tailwind CSS with a modular multi-pane architecture.
- Implemented secure inter-process communication with context isolation and preload-bridged APIs for monitoring, cleanup, startup management, and terminal execution.
- Engineered real-time system telemetry for CPU, RAM, and disk usage with efficient async polling and trend visualization.
- Developed a registry-backed startup apps manager by integrating HKCU/HKLM Run keys with StartupApproved status mapping and actionable filtering.
- Added controlled PowerShell execution workflow with command validation, timeout limits, and robust error handling.
- Designed a polished dashboard UI with responsive cards, status indicators, and user-focused operational flows.

## Future Improvements

- Startup parity with Task Manager:
  - Add Startup folder scanning (user + common)
  - Show publisher and startup impact metrics
- Cleaner enhancements:
  - Preview mode (dry run) before deletion
  - User-configurable cleanup targets
- Terminal hardening:
  - Command allowlist profiles
  - Audit log for executed commands
- Productization:
  - Installer packaging and code signing
  - Auto-update pipeline
  - In-app settings and telemetry controls

## Security Notes

- Renderer is isolated from Node APIs
- Main-process handlers gate privileged operations
- Startup and cleaner actions include validation and confirmation

## License

MIT
