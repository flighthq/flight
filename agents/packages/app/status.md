---
package: '@flighthq/app'
updated: 2026-08-30
by: builder5
---

# app — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/app/src/` after the explicit Host migration on
2026-08-30.

- **Quit cancellation still reads Signal state directly.** `attachAppQuitRequest` emits
  `onQuitRequest`, then reads `app.onQuitRequest.data?.cancelled` to decide whether to invoke the
  provider's native cancel callback. A public `isSignalCancelled` query would keep APP from depending
  on the Signal data shape.
- **`getAppLoginItem` returns an allocated record rather than filling an `out`.** The read shape remains
  inconsistent with the suite's reusable-output convention; the write side already accepts the
  partial `AppLoginItemLike` shape.
- **`createApp` allocates all six signals eagerly.** That is now a real Entity and its provider
  subscriptions are disabled until an attach call, but the signals themselves do not follow the
  nullable/`enable*Signals` convention used by some neighboring domains.
- **Unbuilt process surfaces still need ownership rulings.** GPU/process metrics, child/render-process
  termination events, and accessibility support hooks are absent. They must not be added as optional
  APP slots until a real provider vector and domain owner are derived.
- **Dock menu versus Windows Jump List remains unresolved.** `setAppDockMenu` is the macOS dock-menu
  shape. Windows categories/tasks are neither forced into it nor exposed under a guessed common slot.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Replaced the ambient `AppBackend` resolver, diagnostics, sentinels, and Web enabler
  with method-tight `Host.app` slots and exact `HasApp*` witnesses. `App` is an Entity; all event
  attachments retain their originating unsubscribe. Electron and Capacitor capability shapes now
  require injected OS profiles; Web/Tauri/native providers claim only genuine slots.
- **2026-08-30** — Quit-request delivery no longer recursively calls `quit`: provider-initiated quit
  emits the signal and invokes the native cancellation callback only when Flight vetoes. Programmatic
  `quitApp(host)` remains a direct command. Web ready delivery now returns a real cancellation thunk.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract; retracted false one-concept-per-file and
  downstream Rust claims.
- **2026-06-24** — Locale, app-relative paths, badge ownership, user-model identity, and native
  quit-veto behavior were established.
