---
package: '@flighthq/host-electron'
updated: 2026-08-30
by: builder3
---

# host-electron — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/host-electron/src/` on 2026-08-08. Per-method
coverage lives in [`seam-audit.md`](seam-audit.md); this section carries only what is unfinished.

- **IPC is receive-only.** The main-process backend can `subscribe` to renderer messages but cannot
  `send`/`invoke` without a `webContents` target (`electronIpc.ts:4`, `:10`); `send` no-ops, which
  its own test pins (`electronIpc.test.ts:25`). Fixing it means either extending `IpcBackend` in
  `@flighthq/types` to carry a target window or exporting a window-scoped factory — a cross-package
  seam decision.
- **Window depth methods do not exist at the seam.** `setVisibleOnAllWorkspaces`, `setKiosk`,
  `setRepresentedFilename` (macOS), `setOverlayIcon` (Windows), `setVibrancy` /
  `setBackgroundMaterial` appear nowhere in `packages/host-electron/src/` **or**
  `packages/types/src/`. Each needs a `WindowBackend` field plus a web no-op first.
- **`setTemplate` is a permanent no-op** (`electronTray.ts:118-121`) — Electron marks template-ness
  on the `NativeImage`, not the tray, and this seam takes string icons. Not a gap to close here;
  hosts pass a pre-flagged image at create time.
- **`subscribeReply` is a permanent inert unsubscribe** (`electronNotification.ts:123-126`) —
  Electron's desktop `Notification` has no inline text-reply action.
- **Not tree-shakable, and outside the `@flighthq/sdk` barrel — by design**, enforced by
  `scripts/sdk-policy.ts` for every `host-*` cell. Never file this as a defect.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Electron now returns an Entity-backed `Host.updater.command`: one awaited built-in
  Squirrel check owns its exact listener transaction, yields a frozen origin-pinned downloaded handle,
  installs through that origin, and treats feed URL as immutable provider-construction policy.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Biggest false claim dropped: the parked
  "stale premise — no `electronStorage.ts`, no `StorageBackend` import in `electronRegister.ts`, no
  `@flighthq/storage` dependency, so the `package.json` description must not claim a storage seam."
  All four are present today: `src/electronStorage.ts` with its colocated test,
  `setStorageBackend(createElectronStorageBackend(...))` at `electronRegister.ts:60`,
  `"@flighthq/storage": "*"` in the manifest, and `storage` already named in the description — 16
  seams registered, not 15. Also dropped: the "pre-existing type errors in `filters` … `scene-gl`"
  note, since neither package exists.
- **2026-06-25** — Added `seam-audit.md`: every implemented seam mapped to its Electron call or
  sentinel, with **real** / **tracked** / **limit** / **deferred** status per method.
- **2026-06-24** — Second pass: full `TrayBackend` and `NotificationBackend` method sets with rich
  `TrayEventData` / id-keyed notification payloads, `getCursorPosition` plus structured
  `ScreenChangeEvent` synthesis, and the three new `WindowBackend` methods
  (`setContentProtection`, `setHasShadow`, `flashWindowFrame`).
- **2026-06-24** — First pass: `withWindow` guard extraction and `closed`-event WeakMap cleanup,
  file-backed `createElectronStorageBackend`, dialog modal-parent threading, notification close,
  `powerMonitor` lock/unlock-screen subscriptions, and the Electron-window-id lookup pair.
