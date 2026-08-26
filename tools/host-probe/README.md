# Flight host probe

`tools/host-probe` is the private executable contract test for Flight's host adapters. It installs a real host, compares every capability backend before and after registration, performs a small set of safe runtime operations, draws and reads back a deterministic canvas, and publishes one versioned report on `window.__flightHostProbeReport`.

It is deliberately separate from `tools/harness`, which owns incidental renderer wiring for functional scenes. The probe tests platform integration; it is not a rendering gallery and is never published.

## Report contract

Every run produces:

```ts
interface HostProbeReport {
  protocolVersion: 1;
  host: 'web' | 'electron' | 'tauri' | 'capacitor';
  status: 'pass' | 'fail';
  results: Array<{
    id: string;
    kind: 'provider' | 'render' | 'runtime';
    status: 'pass' | 'fail' | 'manual' | 'unsupported';
    detail: string;
  }>;
}
```

Provider results are exhaustive over the probe's capability census. A provider promised by the host must change identity during registration. A capability outside that host's claimed subset must stay unchanged and is reported as `unsupported`; an unexpected replacement fails the run. Permission prompts and physical effects are `manual`, never silently passed.

## Commands

From the repository root:

```bash
npm run host-probe
npm run test:host-probe
npm run test:host-probe:web
npm run test:host-probe:electron
npm run test:host-probe:tauri
npm run test:host-probe:capacitor:android
npm run test:host-probe:capacitor:ios
npm run test:host-probe:all

npm run dev:host-probe:tauri
npm run dev:host-probe:capacitor:android
npm run dev:host-probe:capacitor:ios
```

The web and Electron test commands are self-driving and fail from the structured report. Electron owns its own main/preload/renderer shell here because registration lives in main while the report UI lives in the renderer; the preload bridge carries only the serializable probe result.

Tauri owns a minimal Rust shell under `src-tauri`. `dev:host-probe:tauri` starts its Vite frontend through Tauri's `beforeDevCommand`, registers the required plugins, and loads the same report UI. Its automated lane builds the real release executable and drives it through WebdriverIO's embedded Tauri driver.

Capacitor native projects are generated on demand and ignored. The first Android or iOS run executes `cap add`, later runs execute `cap sync`; the committed inputs are `capacitor.config.ts`, the frontend, and the host adapter. The automated lane builds an APK or simulator `.app`, starts a local Appium server, switches into the native webview, and reads the same report. This keeps generated platform templates and native build output out of source.

Install each Appium driver once before using that device lane:

```bash
npm exec --workspace=@flighthq/tool-host-probe -- appium driver install uiautomator2
npm exec --workspace=@flighthq/tool-host-probe -- appium driver install xcuitest
```

Android also needs an SDK and a running emulator (or connected device). iOS needs macOS, Xcode, and a booted simulator. Override Appium selection with `HOST_PROBE_CAPACITOR_DEVICE` and `HOST_PROBE_CAPACITOR_PLATFORM_VERSION`; use `HOST_PROBE_CAPACITOR_APP` to test a prebuilt app.

## Applying the pattern to a project

A host runner owns the native shell, installs the corresponding `@flighthq/host-*` backend before app startup, and then loads the project's normal web entry. The renderer stays the project; native wiring does not belong in each example or scene.

- Electron keeps registration in the main process and exposes renderer calls through a narrow preload bridge. The existing examples runner follows this pattern: `npm run examples:electron`.
- Tauri imports its JS modules/plugins in the renderer bootstrap, calls `registerTauriBackends`, and has matching Rust plugins and ACL permissions. This tool's `src/hosts/tauri.ts` and `src-tauri/` are the minimal reusable shell.
- Capacitor imports official plugin objects in the renderer bootstrap, calls `registerCapacitorBackends`, and uses one generated Android/iOS project around the shared frontend. This tool's `src/hosts/capacitor.ts`, `capacitor.config.ts`, and preparation script are the template.

For a project such as `examples/`, keep its web runner as the frontend and copy or parameterize these shells around it. Do not copy host registration into every example; one bootstrap per host is the seam.

The host probe stays separate even when a project gains those runners. It is the small executable contract test that catches adapter registration or packaging failures without conflating them with a large project's rendering behavior.

## Automation boundary

The automatic lane is intentionally non-invasive: provider transitions, app/platform identity, window/screen availability, scheduling, glyph rasterization, and canvas readback. Clipboard mutation, notifications, dialogs, shortcuts, tray interaction, haptics, geolocation permission, lifecycle, and updater behavior belong to explicit interactive/device lanes. Their fake-API behavior remains covered by the colocated `packages/host-*/src/*.test.ts` suites.
