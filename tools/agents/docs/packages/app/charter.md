---
package: '@flighthq/app'
crate: flighthq-app
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# app — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Application/process-layer host integration — the layer that answers "what the running application _is_ to the OS." It owns application identity (name, version, locale triad, install paths), process-level lifecycle control (quit, relaunch, focus, hide/show, activation policy), single-instance locking, dock/taskbar badging and attention, recent-document and login-item registration, and OS-level app events (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`).

It sits **above a single window**: windowing — `ApplicationWindow`, position/size/state, web event wiring — lives in `@flighthq/application`, and `@flighthq/app` never reaches down to manipulate an individual window. Its comparators are Electron's `app` module, Tauri's `app`/`process` APIs, and NW.js — the desktop-app shell, not the window manager.

Structurally it is a **command + event** capability in the platform-integration suite: flat free functions over a swappable `AppBackend` seam (`getAppBackend`/`setAppBackend`/`createWebAppBackend`), a lazy web default backend that guards every DOM call and returns sentinels when unavailable, plus an event entity (`createApp`/`attachApp`/`detachApp`/`disposeApp`) carrying signals. The Electron reference backend lives in `@flighthq/host-electron`; the `flighthq-app` Rust crate is the native-first port.

## North star (proposed)

_Proposed from the review + the platform-suite pattern; edit or promote into Decisions once blessed._

- **The OS-facing application identity layer, strictly above the window.** Everything here is about the process and its relationship to the OS — identity, lifecycle, badging, instance — never about a single window's geometry or content. The line to `@flighthq/application` is hard.
- **Backend seam, web default, sentinel-on-unavailable.** Every capability is a flat free function over `AppBackend`; the web backend is always lazily available and degrades to `-1`/`''`/`false`/ `[]`/no-op rather than throwing. A native host (Electron, and the Rust native default) fills the seam; "Electron support" is one backend, not a coupling.
- **Types-first, fully spelled names, sentinels not throws.** Cross-package shapes live in `@flighthq/types` (one concept per file, read/`*Like`-write split); every function carries the unabbreviated `App` type word; expected failures return sentinels and only programmer error throws.
- **The header may lead the code, but dead surface is a debt, not a feature.** A type may be drawn ahead of its implementer, but an exported type with no function and no test is a measurable gap to close, not a stable end-state.

## Boundaries (proposed)

_Proposed; the explicit seam rulings in Open direction 6 must be settled before these are blessed._

In scope:

- Application identity (name/version, the UI-locale / system-locale / preferred-languages triad, install and directory paths via `AppPathKind`).
- Process lifecycle control (quit + quit-veto, relaunch, focus, hide/show, activation policy).
- Single-instance lock + `onSecondInstance`.
- Dock/taskbar badging and attention (the canonical `setAppBadgeCount`), dock menu, bounce.
- Recent documents, login item, Windows user-model id, command-line access.
- The OS-level app event set listed under "What it is."

Non-goals (as currently drawn — pending the seam rulings):

- **Single-window management** — owned by `@flighthq/application`.
- **Bare OS directory paths as a filesystem concern** — `@flighthq/filesystem` owns file IO; `app` only surfaces app-relative install/data paths.
- **The tray/menu-bar icon** — `@flighthq/tray` (app owns the badge; tray owns the icon).
- _(Unsettled — see Open directions)_ app active/inactive/background/resume/pause events (`@flighthq/lifecycle`), memory-pressure and launch-kind events, GPU/process metrics, and accessibility/theme hooks. These are listed as non-goals only provisionally until the ownership questions below are answered.

## Decisions

None blessed yet.

_(Five substantive rulings the implementation already encodes are parked in `status.md` and flagged by the review as `Decisions` candidates: the quit-veto mechanism; the UI-locale vs system-locale vs preferred-languages split; the paths boundary with `@flighthq/filesystem`; badge ownership vs `@flighthq/tray`; and `setAppUserModelId` ownership. They are listed here as candidates, not as blessed Decisions — promote on direction. See Open direction 9.)_

## Open directions

Every candidate question from the review, plus the structural forks that touch this package. Each is something to settle, not assume.

1. **Memory-pressure & launch-kind events.** `AppMemoryPressure` and `AppLaunchKind` exist as types in `@flighthq/types` with no implementer in `@flighthq/app` — no `onMemoryWarning`, no launch-kind getter. Are these in scope here (the `App*` filenames suggest app-ownership), or do they belong to `@flighthq/lifecycle`, the event sibling that already owns active/inactive/background/resume/pause? Either wire them or remove the dead surface.
2. **Jump-list / dock-menu unification.** Keep `setAppDockMenu(MenuItemTemplate[])` plus a separate `setAppJumpList`, unify under one `AppJumpListCategory[]` descriptor with platform-specific fields, or document the gap? Worker-surfaced as a cross-platform design decision needing the user.
3. **GPU / process metrics async surface.** Are `getAppGpuInfo`/`getAppMetrics`/`getAppMemoryInfo` (and the `AppGpuInfo`/`AppProcessMetric` types) in scope here, and what is the async-seam shape given the Rust `Send`-future note (keep the authoritative seam native-clean, bridge `!Send` in `host-web`)?
4. **Crash / render-process lifecycle.** `onAppChildProcessGone` / `onAppRenderProcessGone` are Electron-specific with no web analogue but part of the AAA process-layer target — in scope or out?
5. **Accessibility / theme hooks ownership** — `@flighthq/app` vs `@flighthq/platform` for `setAppAccessibilitySupportEnabled` / `onAppAccessibilitySupportChanged`.
6. **The Boundary statement itself — the seam to `@flighthq/lifecycle`.** The hard lines against `application` (single window), `filesystem` (bare OS dirs), `tray` (badge), and `lifecycle` (app active/background events) are implemented but never stated. In particular `onActivate` / `onAllWindowsClosed` here overlap conceptually with `lifecycle`'s active events — the seam needs an explicit ruling. (This is the source of the "(provisional)" non-goals above.)
7. **Native default backend (fork D — runtime backend seam).** Should `@flighthq/app` follow the Rust native-first pattern of an in-crate native default backend (real OS named-mutex single- instance lock, login-item via platform autostart, `get_app_path` via `std::env::current_exe`) rather than requiring a `host-*` backend for every non-web capability? This is the highest-value native-first work and is currently unbuilt/unverified in the Rust crate.
8. **Wasm-mixing seam (fork D — `-rs` mixing).** `@flighthq/app` carries runtime/event-entity identity and a host backend — it is an all-or-nothing graph/runtime package, not a value-typed mixable leaf. Confirm it is explicitly _out_ of the Wasm-mixable set.
9. **Promote the five parked rulings.** The quit-veto mechanism, the locale triad split, the filesystem-paths boundary, the tray-vs-badge ownership, and `setAppUserModelId` ownership are real, defensible architectural decisions living only in the transient `status.md`. Settle whether each should be promoted into `Decisions` — the review names this the single highest-value follow-up.
