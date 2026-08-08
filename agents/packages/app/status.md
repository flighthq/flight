---
package: '@flighthq/app'
updated: 2026-08-08
by: principal
---

# app — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/app/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **`quitApp()` bypasses the quit veto entirely.** The veto lives only in the `subscribeQuitRequest`
  wiring: `attachApp` emits `onQuitRequest`, checks `onQuitRequest.data?.cancelled`, and either
  cancels at the host or calls `backend.quit()` (`app.ts:29-38`). `quitApp()` calls
  `getAppBackend().quit()` straight through (`app.ts:375-377`), so an in-app quit never gives a
  listener the chance to veto. Either `quitApp` routes through the request path or the asymmetry
  needs a stated reason.
- **`attachApp` reads a signal's internal `data` field to detect cancellation** (`app.ts:31`).
  `@flighthq/signals` owns that shape; a `isSignalCancelled`-style query would keep the seam.
- **`getAppLoginItem` allocates on every call and takes no `out`** (`app.ts:323`; the web backend
  returns a fresh literal at `:152`), against the out-param convention the rest of the suite follows.
  The write side already has the `*Like` half (`AppLoginItemLike`), so only the read shape is unsettled.
- **`createApp` allocates all six signals eagerly with no `enable*` gate** (`app.ts:72-81`), where
  `createPower` leaves them null behind `enablePowerSignals`. Two shapes for one suite convention.
- **Web `subscribeReady` fires on the next microtask and hands back a no-op unsubscriber**
  (`app.ts:250-255`), so a listener connected after that turn never sees `onReady` and `detachApp`
  cannot cancel a pending fire.
- **The public `.` lane omits the backend seam** — `createWebAppBackend`, `getAppBackend`, and
  `setAppBackend` are contract-only (`app/src/index.ts`), so an app-boundary consumer cannot install
  a native host backend. Same shape in `power`, `device`, and `keyboard`; it is a lane policy question.
- **Unbuilt, and each needs a ruling before it is:** GPU/process metrics (`getAppGpuInfo`,
  `getAppMetrics`, `getAppMemoryInfo` — absent from `packages/`), child/render-process-gone signals,
  and the accessibility hooks (`setAppAccessibilitySupportEnabled`), whose owner may be
  `@flighthq/platform` rather than here.
- **`setAppDockMenu` takes `MenuItemTemplate[]`** (`app.ts:424`), which is the macOS dock shape;
  Windows Jump List categories and tasks have no home. Unify or name them separately — a cross-platform
  API-shape decision.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The most consequential false claim was
  the three "new type files in `@flighthq/types`" — `AppActivationPolicy.ts`, `AppLoginItem.ts`, and
  `AppPathKind.ts` do not exist; all three types are declared inline in
  `packages/types/src/App.ts:7`, `:10`, `:31`, so the one-concept-per-file layout the entry claimed
  was never landed. Rust/`flighthq-app` items were dropped as unverifiable here (no `crates/`
  directory in this repo), and the per-method web-sentinel inventory was dropped as design, not gap.
- **2026-06-25** — Web-sentinel and native-intent doc comments added across `createWebAppBackend`;
  the `AppLaunchKind`/`AppMemoryPressure` "orphaned types" item retracted — both live in
  `packages/types/src/Lifecycle.ts` and are implemented by `@flighthq/lifecycle`.
- **2026-06-24** — Quit veto closed at the host level: `subscribeQuitRequest` passes a cancel
  callback so Electron can `preventDefault()` an OS-initiated quit.
- **2026-06-24** — Locale surface split three ways: `getAppLocale` (UI), `getAppSystemLocale` (OS),
  `getAppPreferredSystemLanguages` (ranked list).
- **2026-06-24** — Paths boundary set: bare OS directories stay in `@flighthq/filesystem`;
  app-identity-relative `userData`/`logs`/`crashDumps` and `getAppPath` live here.
- **2026-06-24** — Badge and `setAppUserModelId` claimed as app identity rather than tray or
  notification identity.
