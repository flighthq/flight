---
package: '@flighthq/app'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
---

# app — Review

Evidence: `incoming/builder-67dc46d64/head/packages/app/` (source + tests), `incoming/builder-67dc46d64/changes.patch` (delta), `head/packages/types/src/App*.ts` (type seam), `head/packages/host-electron/src/electronApp.ts` (the reference native backend). No prior `reviews/depth/app.md` exists (the path the prompt named is absent); this review supersedes nothing and establishes the baseline.

## Verdict

`solid — 84/100`. `@flighthq/app` is a clean, near-complete command+event capability for the application/process layer: 42 exported functions over a 40-method `AppBackend` seam, a complete web default backend, a fully-wired Electron reference backend, and 57 colocated tests. It executes the platform-suite pattern faithfully — flat free functions, lazy web fallback, sentinel-on-unavailable, a single root export, `sideEffects: false`, types-first. The score sits below "authoritative" because of three concrete things, all verifiable in source: two orphaned types (`AppLaunchKind`, `AppMemoryPressure`) define a surface the package does not implement; the status doc's claimed "92/100 gold" overstates relative to the Gold items it itself defers (GPU/ metrics, crash lifecycle, jump-list richness); and the `flighthq-app` Rust crate exists but its conformance was not advanced or verified in this pass. The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so most judgement falls back to the codebase-map AAA standard.

## Status-doc verification (AS-CLAIMED → verified)

The worker report is **accurate** where it speaks. Spot-checked against the diff:

- **42 exported functions in `app.ts`** — confirmed (`grep -c '^export function'` = 42). Every function listed in the status doc is present with the documented signature and sentinel behavior.
- **Six App signals** (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`) — confirmed in `types/src/App.ts` and `createApp`.
- **40-method `AppBackend`** — confirmed; the web backend (`createWebAppBackend`) and Electron backend (`electronApp.ts`, 232 lines) both implement the full surface.
- **Quit-veto mechanism** — confirmed and correct. `attachApp` emits `onQuitRequest`, reads `app.onQuitRequest.data?.cancelled === true`, and on veto calls the host `cancelHost()` rather than `backend.quit()`. The Electron handler (`electronApp.ts:178`) passes a `cancel` callback that flips a local flag and calls `event.preventDefault()` only when cancelled — so an OS-initiated `before-quit` is blocked at the Electron level when Flight vetoes. The signals layer resets `data.cancelled = false` at the start of every emit (`slot.ts:279`), so the veto read is per-emission and does not stick; with zero listeners `signal.data` is `null` and the optional-chain yields `undefined`, so quit proceeds by default. The mechanism is sound.
- **57 tests** (status said 56) — actual count is 57 `it(` blocks, covering every exported function, the three veto branches, idempotent re-attach, and web sentinels. Minor undercount in the report.
- **Electron backend** — confirmed: all methods wired against `electron.app`, including the optional-method guards (`app.dock?.`, `getSystemLocale?.()`, `getPreferredSystemLanguages?.()`).

**Two claims the status doc omits** (found in the diff, not in the report): `types/src/AppLaunchKind.ts` and `types/src/AppMemoryPressure.ts` were added and exported from `types/src/index.ts`, but are referenced by **nothing** in `@flighthq/app` (no `onMemoryWarning`, no launch-kind getter). See Gaps.

## Present capabilities

Grounded in `head/packages/app/src/app.ts` unless noted.

- **Identity reads** — `getAppName`/`setAppName`, `getAppVersion`, `getAppLocale`, `getAppSystemLocale`, `getAppPreferredSystemLanguages`, `getAppPath`, `getAppExecutablePath`, `getAppDirectoryPath(AppPathKind)`. The locale triad (UI locale vs OS system locale vs ranked preferred-languages) is a genuinely good distinction, each backed by a distinct web source (`navigator.language` / `Intl.DateTimeFormat().resolvedOptions().locale` / `navigator.languages`).
- **Lifecycle control** — `quitApp`, `relaunchApp`, `focusApp`, `hideApp`/`showApp`/`isAppHidden`, `setAppActivationPolicy(AppActivationPolicy)`.
- **Single-instance** — `requestAppSingleInstanceLock`/`releaseAppSingleInstanceLock`/ `hasAppSingleInstanceLock`, plus `onSecondInstance(argv)`. (Web is inherently single-instance, so the lock is always held — a defensible web fill.)
- **Badging & dock** — `setAppBadgeCount` (numeric, cross-platform, `navigator.setAppBadge` on web), `setAppDockBadge` (text, macOS), `bounceAppDock`/`cancelAppDockBounce`, `requestAppAttention`/`cancelAppAttention`, `setAppDockMenu(MenuItemTemplate[])`. Badge ownership vs `@flighthq/tray` is clean: `tray.ts:31` only references the boundary in a comment, no duplicate setter.
- **Command line** — `getAppCommandLine`, plus `getAppCommandLineSwitch(name)` and `hasAppCommandLineSwitch(name)`, parsed in-package from argv (`--name` and `--name=value` forms).
- **Recent documents** — `addAppRecentDocument`/`clearAppRecentDocuments`.
- **Login item** — `getAppLoginItem`/`setAppLoginItem(AppLoginItemLike)`, `createAppLoginItem`, with the proper read-shape/`*Like`-write-shape split in `types/src/AppLoginItem.ts`.
- **Windows identity** — `setAppUserModelId`.
- **Event entity wiring** — `createApp` (six inert signals), `attachApp`/`detachApp`/`disposeApp` over a `WeakMap<App, () => void>`, idempotent re-attach (`attachApp` calls `detachApp` first).
- **Backend seam** — `getAppBackend` (lazy web fallback, always returns a backend), `setAppBackend(backend | null)`, `createWebAppBackend`. Matches the command-capability shape in the codebase map exactly.

## Gaps

Measured against the AAA standard for a desktop-app shell layer (Electron `app`, Tauri `app`/ `process`, NW.js) — the comparators the charter's "What it is" names.

- **Orphaned types — surface without implementation.** `AppLaunchKind` (`'cold' | 'warm'`) and `AppMemoryPressure` (`'normal' | 'moderate' | 'critical'`) are added to `@flighthq/types` and exported, but no function or signal in `@flighthq/app` consumes them. They imply `onMemoryWarning` / a launch-kind getter that does not exist. Per the "types-first, then implement against them" rule this is the header drawn ahead of the code — acceptable as a deliberate design stub, but right now it is dead public surface in `types` with no colocated test binding and no implementer. Either wire them or this is a measurable completeness gap.
- **GPU / process metrics** — `getAppGpuInfo`, `getAppMetrics`, `getAppMemoryInfo` (async, Promise-returning) are absent. The status doc defers these as Gold; they are standard Electron `app` surface and a real gap for a mature shell layer.
- **Crash / render-process lifecycle** — `onAppChildProcessGone` / `onAppRenderProcessGone` absent. Electron-specific, no web analogue, but part of the AAA target for a process layer.
- **Jump-list richness** — `setAppDockMenu` takes a flat `MenuItemTemplate[]`; Windows Jump List categories/tasks (`AppJumpListCategory[]`) are unmodeled. The status doc correctly flags this as a cross-platform design decision needing user input — a candidate Open direction, not an autonomous fix.
- **Theme / accessibility hooks** — `setAppAccessibilitySupportEnabled` / `onAppAccessibilitySupportChanged` absent; ownership (app vs `@flighthq/platform`) is unsettled.
- **Rust conformance not advanced.** `crates/flighthq-app` exists in the bundle, but no `crates/` change appears in this app-scoped delta and the status doc explicitly defers it. The TS API is now the authoritative spec; the native default backend (real OS named-mutex single-instance lock, real login-item via platform autostart, `get_app_path` via `std::env::current_exe`) is the highest-value native-first work and is unbuilt/unverified here.

## Charter contradictions

None — but only because the charter is a stub. North star, Boundaries, Decisions, and Open directions are all `TODO`, so there is no stated principle for the code to contradict. The five substantive design rulings the worker made (quit-veto mechanism, locale-vs-preferred-languages split, the paths boundary with `@flighthq/filesystem`, badge ownership vs `tray`, `setAppUserModelId` ownership) live **only** in `status.md` as "design choices made." Per CONTRACT these are blessed `Decisions` candidates, not status-log entries — the charter's `Decisions` ledger is empty. This is the single highest-value follow-up: the package has made real, defensible architectural decisions that are currently unblessed and parked in a transient log.

## Contract & docs fit

**Lives up to the contract — yes, strongly:**

- Types-first: all cross-package shapes (`App`, `AppBackend`, `AppActivationPolicy`, `AppLoginItem`/`AppLoginItemLike`, `AppPathKind`, `AppLaunchKind`, `AppMemoryPressure`) live in `@flighthq/types`, one concept per file. The package imports them via `import type`.
- Full unabbreviated names: every function carries the `App` type word (`getAppName`, `setAppBadgeCount`, `requestAppSingleInstanceLock`). No abbreviations.
- Sentinels-not-throws: `-1` for unsupported bounce/attention, `''` for unknown strings, `false` for failed writes, `[]` for unavailable lists, no-op otherwise. Web backend wraps every DOM call in try/catch and degrades. No thrown errors on the expected-failure paths.
- Single root export (`index.ts` → `export * from './app'`), `sideEffects: false`, module-level mutable state (`_backend`, `_subscriptions`) confined to lazy fallback + a `WeakMap`, set only via explicit `setAppBackend`/`attachApp` — no import-time side effect.
- `dispose*` used correctly: `disposeApp` detaches and releases to GC (no non-GC resource to `destroy`). Verb choice is right.
- Functions alphabetized; tests colocated, alphabetized, mirroring exports; constructors used in fixtures.
- Deps minimal and correct: only `@flighthq/signals` + `@flighthq/types`.

**Where the contract / admin docs need revising (candidate revisions — user's gate):**

- **`packages/app/charter.md` front matter is incomplete** vs `CONTRACT.md`: it is missing `lastDirection` is present but the charter body is all `TODO`. Not a violation of the envelope, but the charter is doing no rubric work — flagged so the direction pass fills it.
- **Package Map line is accurate** — the `index.md` entry for `@flighthq/app` ("application identity … `setAppBadgeCount` + dock badge/menu/bounce, and app events (`onActivate`, `onOpenFile`)") matches the built surface. No revision needed there. Note the Map omits single-instance and command-line, which the package does carry — a minor under-description, not an error.
- **`AppLaunchKind` / `AppMemoryPressure` in `types/index.ts`** with no implementer is the kind of drift `exports:check` cannot catch (types have no colocated function test). Worth a note that the header was drawn ahead of `@flighthq/app`.

## Candidate open directions

The charter is silent on all of these; each is a question to settle rather than a thing to assume.

1. **Memory-pressure & launch-kind events.** `AppMemoryPressure` and `AppLaunchKind` exist as types with no API. Is `onMemoryWarning(AppMemoryPressure)` + a launch-kind getter in scope for `@flighthq/app`, or do they belong to `@flighthq/lifecycle` (the event-capability sibling that already owns active/inactive/background/resume/pause)? The types being homed in `App*` files suggests app-ownership, but that is an assumption.
2. **Jump-list / dock-menu unification.** Keep `setAppDockMenu` + a separate `setAppJumpList`, unify under one `AppJumpListCategory[]` descriptor with platform-specific fields, or document the gap? (Worker-surfaced; needs the user.)
3. **GPU/metrics async surface.** Are `getAppGpuInfo`/`getAppMetrics`/`getAppMemoryInfo` (and their `AppGpuInfo`/`AppProcessMetric` types) in scope here, and what is the async-seam shape given the Rust `Send`-future note?
4. **Accessibility/theme hooks ownership** — `@flighthq/app` vs `@flighthq/platform`.
5. **Boundary statement.** The package's hard line against `@flighthq/application` (single window), `@flighthq/filesystem` (bare OS dirs), `@flighthq/tray` (badge), and `@flighthq/lifecycle` (app active/background events) is implemented but never stated as a Boundary. The `onActivate`/`onAllWindowsClosed` events here overlap conceptually with `lifecycle`'s active events — the seam deserves an explicit ruling.
6. **Native default backend.** Should `@flighthq/app` follow the Rust pattern of an in-crate native default (real single-instance lock, login-item, exe path) rather than requiring a `host-*` backend for every non-web capability?
