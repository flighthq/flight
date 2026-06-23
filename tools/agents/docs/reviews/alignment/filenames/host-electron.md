# Filename Alignment: @flighthq/host-electron

**Verdict:** This is a host-adapter package (`host-<runtime>`), not a render backend-variant (`*-canvas`/`*-gl`/`*-wgpu`); its `electron` file-token plays the same prefix-first role as a backend token, and nearly every file follows `electron<Capability>.ts` cleanly — only `electronModule.ts` (generic "Module") and `electronRegister.ts` (named after one function) warrant renames.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `electronModule.ts` | `Module` is a generic, domain-free token. The file's whole content is the `ElectronApi` interface (the typed slice of the Electron main-process surface). The filename = type-name convention points at the exported type. | `electronApi.ts` |
| `electronRegister.ts` | Named after its single function `registerElectronBackends` (verb-as-filename), not the domain/object it covers. The file is the aggregate-registration entry that installs every Electron backend. | `electronBackends.ts` |

## Clean

Prefix-first `electron<Capability>.ts`, each naming a capability domain (not a single function); tests colocated and mirroring source (`electronModule.ts` is types-only, so no test is expected):

- `electronApp.ts` (+ `.test.ts`)
- `electronClipboard.ts` (+ `.test.ts`)
- `electronDialog.ts` (+ `.test.ts`)
- `electronIpc.ts` (+ `.test.ts`)
- `electronMenu.ts` (+ `.test.ts`)
- `electronNotification.ts` (+ `.test.ts`)
- `electronPlatform.ts` (+ `.test.ts`)
- `electronPower.ts` (+ `.test.ts`)
- `electronProtocol.ts` (+ `.test.ts`)
- `electronScreen.ts` (+ `.test.ts`)
- `electronShell.ts` (+ `.test.ts`)
- `electronShortcut.ts` (+ `.test.ts`)
- `electronTray.ts` (+ `.test.ts`)
- `electronUpdater.ts` (+ `.test.ts`)
- `electronWindow.ts` (+ `.test.ts`, also covers `getElectronBrowserWindow`)
- `index.ts` (barrel)
