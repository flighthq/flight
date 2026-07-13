---
package: '@flighthq/host-tauri'
updated: 2026-07-13
basedOn: ./review.md
---

# host-tauri — Assessment

## Recommended

Sweep-safe, within-package, no design fork:

1. **Checkbox/radio menu items** — model Tauri's `CheckMenuItem` in `TauriApi` and handle `type: 'checkbox' | 'radio'` + `checked` in `buildItem`/`buildTrayItems` (`tauriMenu.ts`, `tauriTray.ts`). The Flight seam already carries the fields; this closes a silent-degradation hole with no seam change.
2. **Window taskbar progress** — widen `TauriWindow` with `setProgressBar` and implement `WindowBackend.setProgress` (the current no-op comment names the call as available).
3. **`subscribeQuitRequest` via `onCloseRequested`** — the app backend can wire quit-request to the current window's close-requested event already modeled in `TauriApi`, replacing one inert subscription with a real one.
4. **Deepen the fake-API tests** — cover the behaviors the current 44 cases miss: shortcut register rollback on async rejection, tray method calls before the handle adopts (no-op contract), menu popup rejection resolving null, window event wiring (moved/resized/focus/close) end-to-end. Pure test work against existing fakes.
5. **Record the storage omission's reason at the seam** — the register comment says storage is "intentionally left" but not why; add the durable comment (sync `StorageBackend` vs async `plugin-store`, functioning webview localStorage default), mirroring host-capacitor's precedent.
6. **Seam-coverage audit table** — produce the seam→Tauri-call (or documented-omission) table (charter Open direction 3), mirroring host-electron's `seam-audit.md`. Documentation only, mechanical.

## Backlog

- **Updater adapter (`plugin-updater`)** — parked: chartered in the target list but needs the user to settle review open direction 1 (the updater seam's web default is non-functional in Tauri, so building it is high-value — but scope/UX of update flow is a design conversation).
- **Deep-link/protocol adapter (`plugin-deep-link`)** — parked: same fork as updater; also interacts with `subscribeOpenFile`/second-instance event routing.
- **Storage adapter over `plugin-store`** — parked: blocked on the sync-seam/async-plugin mismatch (the same "unbridgeable" call host-capacitor made for preferences); would need a seam-level ruling, not an adapter hack.
- **Multi-window (`WebviewWindow`) support** — parked: an explicit scope decision (review open direction 2); the current single-current-window stance is documented in `tauriWindow.ts`.
- **`ipc` seam over Tauri `event`/`invoke`** — parked: suite-level design fork shared with host-electron (charter Open direction 2).
- **Tauri v2 mobile plugin coverage** — parked: charter Open direction 1; overlaps host-capacitor's subset and needs a target-platform ruling.

## Approved

_Empty — awaiting the user's verbal gate._
