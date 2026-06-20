# Flight Electron Harness

A runnable Electron app that drives **`@flighthq/host-electron`** against a real Electron runtime. It is the validation harness for the platform/window seams: where the unit tests prove the backends are _shaped_ right against a fake, this proves they actually _work_ against Electron.

## Run

```bash
# from the repo root, once (pulls Electron — large):
npm install

# then (root scripts, mirroring the other tools):
npm run electron-harness          # electron-vite dev (HMR)
# or
npm run build:electron-harness    # bundle to out/
npm run start:electron-harness    # preview the built app
```

`@flighthq/*` packages resolve to their TypeScript **source** via the Vite alias in `electron.vite.config.ts` (the same trick the examples use), so no prior package build is required.

## What it demonstrates

**Main process** (`src/main/index.ts`):

- `registerElectronBackends(electron)` — swaps every web default for the Electron implementation in one call.
- Opens the window through Flight's seam (`createApplicationWindow` + `openWindow`), then reaches the real `BrowserWindow` back out with `getElectronBrowserWindow(win)` purely to `loadFile`/`loadURL` the page. Everything else (title/size/state) would go through the Flight window API.
- OS-integration smoke demo, logged to the terminal: app identity, screen enumeration, app badge, an application menu with `onMenuSelect`, a global shortcut, a clipboard round-trip, and a tray icon.

**Renderer** (`src/renderer/`):

- A Flight scene drawn with the **web canvas renderer** (the renderer is a normal browser context).
- Buttons that exercise main-process capabilities (file dialog, clipboard, notification) through the preload bridge.

**Preload** (`src/preload/index.ts`): a `contextBridge` exposing a tiny typed `flightHarness` API that `ipcRenderer.invoke`s the main handlers. This is the **renderer→main IPC bridge** pattern: capability calls that must run in main are invoked over IPC; in main they are plain Flight capability calls (`showOpenFileDialog`, `readClipboardText`, …) now serviced by Electron.

## Architecture notes / known gaps

- **Two processes.** `host-electron` runs in **main** (where `BrowserWindow`/`Menu`/`Tray`/`dialog` live). The scene renders in the **renderer**. They meet over IPC. A future renderer-side helper could auto-bridge the capability packages so renderer code calls `readClipboardText()` directly; today that wiring is explicit (preload + `ipcMain.handle`).
- **Tray needs an icon asset.** `createTrayIcon` is wrapped in `try/catch` — Electron's `Tray` requires a valid image; bundle one to make the tray appear.
- **`@flighthq/ipc`** main-side `send`/`invoke` are intentionally no-ops; this harness uses Electron's `ipcMain.handle` directly for the bridge.
- **Unverified end-to-end here.** This was authored without a local Electron run (sandbox limitation). Treat the first `npm run dev` as the real validation — and expect it to surface any `ElectronApi` vs. real-Electron mismatches, which should be fixed back in `@flighthq/host-electron`.
