---
package: '@flighthq/app'
status: solid
score: 84
updated: 2026-07-13
ingested:
  - status.md
  - source (packages/app/src)
  - packages/types/src/App.ts
  - packages/types/src/Lifecycle.ts
  - charter.md
---

# app — Review

Survey of the live tree (2026-07-13). This **supersedes** the 2026-06-25 merge-gate review (`reject — 38/100`), whose single blocking finding — the `@flighthq/types` header missing from the integration tree — is no longer true: `packages/types/src/App.ts` now carries the full surface (`AppActivationPolicy`, `AppLoginItem`/`AppLoginItemLike`, `AppPathKind`, the 6-signal `App` interface, and the ~42-method `AppBackend`), and `packages/app/src/app.ts` compiles against it. The implementation quality that review conditionally praised is what stands today, so the score returns to the neighborhood the builder review earned (84, solid).

## Verdict

`solid — 84/100`. A complete, Electron-grade process-identity surface: exactly 42 exported functions (matching the charter's blessed scope ceiling), all alphabetized, over a lazy web `AppBackend` with disciplined sentinels and durable doc-comments on every web fill. Identity (name/version/locale triad/paths), lifecycle control (quit + working quit-veto via `cancelSignal`, relaunch, focus, hide/show, activation policy), single-instance locking, dock/taskbar badge + attention + bounce + dock menu, recent documents, login items, command line, and `setAppUserModelId` are all present, each a flat free function delegating to one backend method. 57 colocated tests cover the quit-veto branches, idempotent re-attach, web sentinels, and the command-line switch parser. What keeps it below 90 is a handful of web-fill contract nits (below) and the parked design forks (paths breadth, jump-list unification, the lifecycle boundary) that an authoritative process-identity package would have ruled on.

## Present capabilities (verified against source)

- **Identity:** `getAppName`/`setAppName`, `getAppVersion`, the locale triad (`getAppLocale`, `getAppSystemLocale`, `getAppPreferredSystemLanguages`), `setAppUserModelId`.
- **Paths + process:** `getAppPath`, `getAppExecutablePath`, `getAppDirectoryPath(kind: AppPathKind)` (`userData`/`logs`/`crashDumps`), `getAppCommandLine` + `getAppCommandLineSwitch`/`hasAppCommandLineSwitch` (composed over the array, no duplicated parser).
- **Lifecycle:** `quitApp`, `relaunchApp`, `focusApp`, `hideApp`/`showApp`/`isAppHidden`, `setAppActivationPolicy`; `attachApp` wires the quit-veto — `onQuitRequest` listeners cancel via `cancelSignal`, and the wiring calls the host's `cancelHost()` so Electron can `preventDefault()` (`app.ts:29-38`).
- **Events:** 6 signals (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`) via `createApp`/`attachApp`/`detachApp`/`disposeApp`, idempotent re-attach.
- **Single instance:** `requestAppSingleInstanceLock`/`releaseAppSingleInstanceLock`/`hasAppSingleInstanceLock` (web: trivially the holder).
- **Dock/badge/attention:** `setAppBadgeCount` (web: `navigator.setAppBadge`), `setAppDockBadge`, `setAppDockMenu(items: readonly MenuItemTemplate[])`, `bounceAppDock`/`cancelAppDockBounce`, `requestAppAttention`/`cancelAppAttention` (`-1` id sentinel).
- **Registration:** recent documents (`addAppRecentDocument`/`clearAppRecentDocuments`), login items (`getAppLoginItem`/`setAppLoginItem` with the `AppLoginItem` read-shape / `AppLoginItemLike` write-shape split, plus `createAppLoginItem`).
- **Contract hygiene:** sentinels not throws throughout (`''`/`[]`/`false`/`-1`/default login item); `Readonly<AppLoginItemLike>` on the write path; `disposeApp` detaches to GC (correct `dispose*`, nothing to free); no top-level side effects — `_backend`/`_subscriptions` at file bottom, set only via `setAppBackend`/`attachApp`; deps only `signals` + `types`; single root barrel.

## Gaps

1. **`subscribeReady` web fill does not honor unsubscribe.** `app.ts:245-250`: the listener is scheduled on a microtask and the returned unsubscribe is `() => {}`, so a listener registered and immediately unsubscribed still fires. The `const id = …; void id;` dead binding flagged in the prior review is also still present. Small, web-only, sweep-safe: guard the microtask with a flag the unsubscribe flips.
2. **Web-backend key order.** `getLoginItem` (`app.ts:149`) still sits after `getSystemLocale`/before `getName`, out of the alpha order the rest of the object maintains. Cosmetic (`npm run order` does not police object keys) but breaks scan-ability; the prior review flagged it and it was not picked up.
3. **`AppPathKind` is narrow.** Three kinds (`userData`/`logs`/`crashDumps`) against the dozen-plus path families a native host exposes (temp, desktop, documents, downloads, home…). Whether the rest belongs here or in `@flighthq/filesystem` is the parked "filesystem-paths boundary" ruling — a design fork, not a sweep item, but it is the largest fidelity gap between this seam and a full native host.
4. **Jump-list / dock-menu unification** (charter open direction): `setAppDockMenu` is macOS-shaped and `addAppRecentDocument` covers the recents category, but Windows custom jump-list tasks/categories have no expression.
5. **No about-panel surface** (`setAboutPanelOptions`-equivalent) — arguably in scope for "who you are to the OS"; minor.

Resolved since the prior review: `requestAttention`'s unused-param nit is moot (the web fill now declares no parameter).

## Charter contradictions

- **Stale open direction:** the charter still lists "`AppMemoryPressure` and `AppLaunchKind` exist as types with no implementer — wire them here or move to `@flighthq/lifecycle`." This is resolved in-tree: both live in `packages/types/src/Lifecycle.ts` and are implemented by `@flighthq/lifecycle` (`getAppLaunchKind`, `subscribeMemoryWarning`, `onMemoryWarning`). The open direction should be retired at the next direction session; the underlying `app`↔`lifecycle` boundary ruling (over `onActivate`) is still genuinely open.
- **Scope ceiling holds:** exactly 42 exports, matching the 2026-07-02 decision. No creep.

## Contract & docs fit

- Types-first is now satisfied: the header (`packages/types/src/App.ts`) carries the full design surface the implementation compiles against. Note the types landed **co-located in `App.ts`** rather than the one-concept-per-file split (`AppActivationPolicy.ts`, `AppLoginItem.ts`, `AppPathKind.ts`) the builder originally authored and the types-layout convention prefers — flag for the types-layout checker, not a blocker.
- The Package Map line (`@flighthq/app` — "identity, badge, dock") understates the shipped surface (lifecycle control, single-instance, recent docs, login items, command line, quit-veto). Cross-boundary; worth widening at the next map pass.
- `assessment.md` for this package was missing its required front matter (`package`/`updated`/`basedOn`); fixed in this pass's refresh.

## Candidate open directions

- The `app`↔`lifecycle` boundary ruling (which package owns activate/background semantics) — already chartered, still open.
- Paths breadth (`AppPathKind` vs `@flighthq/filesystem`) — the parked ruling worth promoting soonest, since it caps native fidelity.
- Windows jump-list tasks as a cross-platform dock/jump abstraction or an explicit non-goal.
