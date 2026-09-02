---
package: '@flighthq/app'
status: solid
score: 88
updated: 2026-09-02
ingested:
  - status.md
  - charter.md
  - source (packages/app/src)
  - packages/types/src/App.ts
  - packages/types/src/Host.ts (HasApp* witnesses, HostAppCapabilities)
  - packages/types/src/ElectronAppCapabilitiesFor.ts
  - packages/types/src/CapacitorAppCapabilitiesFor.ts
  - packages/types/src/TauriAppCapabilities.ts
  - packages/host-web/src/webApp.ts
  - packages/host-web/src/webAppHost.ts
  - assessment.md (prior, 2026-07-13)
---

# app -- Review

Survey of the live tree (2026-09-02). This **supersedes** the 2026-07-13 review (solid -- 84/100), which predates the 2026-08-30 explicit Host migration. That migration replaced the ambient `AppBackend` resolver, diagnostics, sentinels, and Web enabler with method-tight `Host.app` slots and exact `HasApp*` witness types. The architecture is now significantly cleaner: each function takes the narrowest witness it needs, the old resolver family (`getAppBackend`/`setAppBackend`/`explainAppBackend`/`installAppHostBackend`/`observeAppHostResult`/`resetAppBackendForTest`) is fully deleted (guarded by a negative-property test in `appHost.test.ts`), and `App` is a proper Entity. Two of the prior assessment's `Recommended` items (web `subscribeReady` unsubscribe and `getLoginItem` alpha order) are now moot because the monolithic in-package web backend was removed entirely; the web fill moved to `host-web/src/webApp.ts` where both issues are resolved.

## Verdict

`solid -- 88/100`. A mature, Electron-grade process-identity surface with an exemplary explicit-dependency architecture. 41 exported functions (within the charter's 42-export scope ceiling), all alphabetized, each taking the exact `HasApp*` Host witness it needs -- no ambient singletons, no module-scoped state except a `WeakMap` for subscriptions at file bottom. Identity, lifecycle control, events, single-instance locking, dock/badge/attention, recent documents, login items, and user-model-id are all present and delegating cleanly. 44 colocated tests cover the quit-veto, idempotent re-attach, dispose semantics, and explicit-Host ownership proofs. The type-level contract in `@flighthq/types` carries per-platform capability shapes (`ElectronAppCapabilitiesFor<Profile>`, `CapacitorAppCapabilitiesFor<Profile>`, `TauriAppCapabilities`) that structurally encode which slots each platform provides. What keeps it below 90 is three in-package nits (eager signal allocation, quit-veto coupling to signal internals, `getAppLoginItem` allocation) and the still-open design forks (paths breadth, jump-list unification, lifecycle boundary).

## Present capabilities (verified against source)

- **Entity + signals:** `createApp()` returns an `Entity` carrying six signals (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`). `attachApp`/`detachApp`/`disposeApp` manage the full lifecycle: attach wires host event subscriptions into signal emissions; detach unsubscribes; dispose detaches and clears all signal listeners. Subscription tracking uses a `WeakMap<App, AppSubscriptions>` at file bottom -- no module-scoped mutable state.

- **Per-event attach:** Each event has its own `attachApp*` function (`attachAppActivate`, `attachAppAllWindowsClosed`, `attachAppOpenFile`, `attachAppQuitRequest`, `attachAppReady`, `attachAppSecondInstance`) for granular wiring. `replaceAppSubscription` ensures idempotent re-attach: calling `attachAppReady` twice on the same `App` unsubscribes the first before wiring the second.

- **Quit-veto:** `attachAppQuitRequest` emits the signal and reads `app.onQuitRequest.data?.cancelled` to invoke the host's `cancelHost()` callback, translating Flight's `cancelSignal` into the native veto mechanism (e.g., Electron's `event.preventDefault()`). Tested in `app.test.ts` via `cancelSignal(app.onQuitRequest)`.

- **Identity:** `getAppName`/`setAppName` (separate read/write witnesses: `HasAppName` vs `HasAppNameWrite`), `getAppVersion`, the locale triad (`getAppLocale`, `getAppSystemLocale`, `getAppPreferredSystemLanguages`), `setAppUserModelId`.

- **Paths:** `getAppPath`, `getAppExecutablePath`, `getAppDirectoryPath(kind: AppPathKind)` -- three kinds: `userData`, `logs`, `crashDumps`.

- **Lifecycle commands:** `quitApp`, `relaunchApp`, `focusApp`, `hideApp`/`showApp`/`isAppHidden`, `setAppActivationPolicy`.

- **Single instance:** `requestAppSingleInstanceLock`/`releaseAppSingleInstanceLock`/`hasAppSingleInstanceLock`.

- **Dock/badge/attention:** `setAppBadgeCount` (async, returns `Promise<boolean>`), `setAppDockBadge`, `setAppDockMenu(items: readonly MenuItemTemplate[])`, `bounceAppDock`/`cancelAppDockBounce`, `requestAppAttention`/`cancelAppAttention`.

- **Registration:** `addAppRecentDocument`/`clearAppRecentDocuments`, `getAppLoginItem`/`setAppLoginItem` (read returns `AppLoginItem`; write takes `Readonly<AppLoginItemLike>` -- the partial shape for update-in-place semantics).

- **Host witness architecture:** Every function takes the narrowest `HasApp*` witness: `focusApp(host: HasAppFocus)`, `getAppName(host: HasAppName)`, etc. Each witness carries a single required slot from `HostAppCapabilities`, so a host that provides only `badge` and `focus` (web) is type-safe for exactly those calls and no others. Per-platform capability types (`ElectronAppCapabilitiesFor<'macos'>`, `CapacitorAppCapabilitiesFor<'android'>`, `TauriAppCapabilities`) are `Required<Pick<HostAppCapabilities, ...>>` selections that encode OS support structurally.

- **Contract hygiene:** `sideEffects: false`; deps are `entity`, `signals`, `types` only; two export lanes (`.` and `./contract`); no classes, no singletons, no ambient mutable state. Internal `AppSubscriptions` and `HasAllAppEvents` types are file-local, not exported. `disposeApp` is correctly `dispose*` (detach-to-GC, no resource to free).

## Gaps

1. **`createApp` allocates all six signals eagerly.** The shared platform-integration decision (2026-07-02) says: "Use `enable*Signals` gates -- do not eagerly allocate signals in `create*` functions." `createApp()` calls `createSignal()` six times unconditionally. Status.md acknowledges this. Making them nullable with an `enableAppSignals` gate would align with the convention and eliminate allocation for callers who only use command/query functions.

2. **Quit-veto couples to signal data shape.** `attachAppQuitRequest` reads `app.onQuitRequest.data?.cancelled` directly (`app.ts:97`). Status.md notes that a public `isSignalCancelled` query would keep the package from depending on the Signal's internal data shape. This is a cross-package concern (would live in `@flighthq/signals`), but the coupling is real and app is the primary consumer.

3. **`getAppLoginItem` allocates a fresh record.** Returns `AppLoginItem` rather than writing to an `out` parameter, inconsistent with the suite's reusable-output convention. The write side (`setAppLoginItem`) already takes the partial `AppLoginItemLike` shape. Status.md acknowledges this.

4. **`AppPathKind` remains narrow.** Three kinds (`userData`/`logs`/`crashDumps`) against the dozen-plus path families a native host exposes (temp, desktop, documents, downloads, home, appData). The type's own comment explicitly says "Bare OS directories live in @flighthq/filesystem, not here" -- so this is by design, but the boundary ruling is parked and `@flighthq/filesystem` does not expose these yet, leaving a gap in the overall native path story.

5. **Jump-list / dock-menu unification absent.** `setAppDockMenu` is macOS-shaped; Windows custom jump-list tasks/categories have no expression. Charter open direction; cross-platform design decision.

6. **No about-panel surface.** `setAboutPanelOptions`-equivalent for "who you are to the OS." Minor; arguably in scope.

7. **Unbuilt process surfaces.** GPU/process metrics, child/render-process termination events, and accessibility support hooks are absent. Status.md notes these need ownership rulings before building.

## Charter contradictions

- **Stale open direction -- `AppMemoryPressure`/`AppLaunchKind`.** The charter's Open directions still lists: "Wire them here or move to @flighthq/lifecycle." This is resolved in-tree: both types live in `packages/types/src/Lifecycle.ts` and are implemented by `@flighthq/lifecycle` (`getAppLaunchKind`, `subscribeMemoryWarning`). The charter should retire this line. The underlying `app`-vs-`lifecycle` boundary ruling over `onActivate` is genuinely open and separately listed.

- **Scope ceiling says 42; actual count is 41.** The 2026-07-02 Decision states "42 exports is the scope ceiling for process identity." The 2026-08-30 migration removed the old backend/resolver family and command-line functions, leaving 41 exports. The Decision text reads as an exact count rather than a maximum, so it is factually stale. The intent (watch for scope creep) is still valid; the number should be updated or the wording changed to "around 40."

- **Signal opt-in convention violation.** The shared platform-integration decision says "Use `enable*Signals` gates -- do not eagerly allocate signals in `create*` functions." `createApp()` eagerly allocates all six. This contradicts the shared decision. Status.md acknowledges it.

## Contract & docs fit

**(a) Package against the contract:**

- **Types-first:** Satisfied. The full type surface (`App`, `AppActivationPolicy`, `AppLoginItem`, `AppLoginItemLike`, `AppPathKind`, `MobileOsProfile`, all 22 `App*Backend` interfaces) lives in `@flighthq/types/src/App.ts`. The 23 `HasApp*` witness interfaces live in `@flighthq/types/src/Host.ts`. Per-platform capability shapes (`ElectronAppCapabilitiesFor`, `CapacitorAppCapabilitiesFor`, `TauriAppCapabilities`) are in their own files. No exported types in the implementation package.
- **Two blessed lanes:** `.` (index.ts) and `./contract` (contract.ts) -- satisfied.
- **`sideEffects: false`:** Declared and true. No top-level registration, no import side effects.
- **Full unabbreviated names:** Satisfied throughout. Every function name includes the full `App` subject.
- **Free functions over classes:** Satisfied. Zero classes.
- **Sentinels not throws:** No sentinel paths remain in app.ts itself -- the package delegates directly to host methods, so sentinel behavior lives in the host implementations (correct separation).
- **`Readonly<T>` on parameters:** `setAppLoginItem` takes `Readonly<AppLoginItemLike>` -- satisfied. Other parameters are primitives that do not require it.
- **`dispose*` vs `destroy*`:** `disposeApp` detaches listeners and clears signals (GC-eligible) -- correct use of `dispose*`.
- **Crate identity:** `flighthq-app` declared in charter front matter.

**(b) Contract/admin docs that are stale:**

- **Package Map line.** AGENTS.md lists app under "Platform" with no description. The prior review noted the old "identity, badge, dock" description understated the surface; the current listing has no description at all. Worth widening at the next map pass.
- **Platform-integration shared pattern reference.** The shared principles (`agents/packages/platform-integration.md`) describe a "Command capabilities: `get*Backend` / `set*Backend`" pattern and sentinels-then-web-then-custom precedence. The 2026-08-30 migration moved app away from this pattern entirely (no `AppBackend`, no sentinels, no `setAppBackend`) to the method-tight Host slot architecture. The platform-integration.md shared pattern is stale with respect to what app actually does now. This is significant: app is a charter reference to that document, and any new package reading the shared pattern and modeling after it will build the old architecture.
- **Assessment recommended items are resolved.** Both assessment `Recommended` items (web `subscribeReady` unsubscribe, `getLoginItem` alpha order) were resolved by the 2026-08-30 refactor that moved the web backend to `host-web`. The assessment should be refreshed.

## Candidate open directions

- **Signal opt-in gate for App.** Whether `createApp` should follow the `enable*Signals` convention or is an exception because every `App` always carries signals. The shared decision says follow it; the current code does not. Needs an explicit ruling.
- **`isSignalCancelled` query.** Whether `@flighthq/signals` should expose a public query for cancellation state, so consumers like `attachAppQuitRequest` do not read internal signal data fields directly.
- **Platform-integration shared pattern update.** The shared pattern document describes a `get*Backend`/`set*Backend` + sentinel architecture. App has moved past it. Should the shared pattern be updated to describe the Host-slot architecture as the new standard, or is app an exception?
- **Paths breadth / filesystem boundary.** Already chartered, still open.
- **Jump-list / dock-menu unification.** Already chartered, still open.
- **`app` vs `lifecycle` boundary for activation semantics.** Already chartered, still open.
