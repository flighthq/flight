---
package: '@flighthq/statusbar'
status: solid
score: 83
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - types surface
  - host-web backend
  - host-capacitor backend
  - package.json
  - platform-integration.md
---

# statusbar — Review

## Verdict

**Solid -- 83/100.** A clean, narrow mobile status-bar control cell with 14 public-lane functions and
2 contract-lane utilities. Both charter decisions are complete: the `enableStatusBarSignals` no-op is
gone, and the aggregate ambient backend has been replaced by narrow explicit Host trait slots
(`HasUiStatusBarColor`, `HasUiStatusBarStyle`, etc.) so each function demands only the capability it
uses. All 16 exported functions have colocated tests. Types live in `@flighthq/types/StatusBar.ts`.
The package declares `"sideEffects": false` and performs no top-level registration. Two host backends
exist: web (theme-color only, in `host-web`) and Capacitor (style/visibility/color/overlay setters
plus a cached synchronous snapshot, in `host-capacitor`). The open depth is concentrated in three
areas the charter already names: native snapshot/change truth, style-stack vs. direct-setter
arbitration, and the height/safe-area boundary with `@flighthq/device`.

## Present capabilities

- **Read side.** `getStatusBarInfo` writes into a caller-owned `StatusBarInfo` out parameter.
  `getStatusBarHeight` returns the height from a module-level scratch (`_scratchInfo`), avoiding
  allocation on repeated calls. Sentinel values (`height = -1`, `color = 0`) indicate unknown state
  rather than throwing.
- **Write side.** Four single-slot setters -- `setStatusBarColor`, `setStatusBarStyle`,
  `setStatusBarVisible`, `setStatusBarOverlaysContent` -- each take the narrow `Has*` Host trait they
  need. `setStatusBarColor` accepts an optional `animated` flag; `setStatusBarVisible` accepts a
  `StatusBarAnimation`.
- **Change events.** `createStatusBar` allocates an inert signal entity carrying `onChange`.
  `attachStatusBar` pins both the change-subscription and info-snapshot providers from the Host at
  attachment time, allocating an owned `StatusBarInfo` per emission so retained listener data is
  immune to later mutations. `detachStatusBar` and `disposeStatusBar` tear down idempotently.
- **Style stack.** `pushStatusBarStyleEntry` captures a baseline snapshot on first push and pins the
  five backend providers for the stack's lifetime. Stack entries merge per-field from top (last-pushed
  wins); unset fields fall through to the baseline. `popStatusBarStyleEntry` supports out-of-order
  removal. `clearStatusBarStyleStack` restores the baseline and releases the `WeakMap` entry.
  `hasStatusBarStyleEntry` queries membership. Handles are monotonically increasing integers;
  `-1` is the invalid sentinel (`INVALID_HANDLE`).
- **Contract-only utilities.** `createStatusBarInfo` allocates a default-valued snapshot.
  `packedRgbaToHexColor` converts a packed `0xRRGGBBAA` integer to a `#RRGGBB` CSS hex string,
  consumed by `host-web`'s `webStatusBarColorBackend`.
- **Type surface.** `StatusBarInfo`, `StatusBarStyleEntry`, `StatusBarStyle`, `StatusBarAnimation`,
  `StatusBarStyleEntryHandle`, six backend interfaces (`StatusBarChangeBackend`,
  `StatusBarInfoBackend`, `StatusBarColorBackend`, `StatusBarOverlaysBackend`,
  `StatusBarStyleBackend`, `StatusBarVisibilityBackend`), the `StatusBar` signal entity interface,
  and seven `HasUi*` host-trait types all reside in `@flighthq/types`.
- **Host backends.** Web provides `webStatusBarColorBackend` (upserts a single `<meta name="theme-color">`
  element; claims no other status-bar capability). Capacitor provides
  `createCapacitorStatusBarBackend` returning an Entity that maps all five command/query slots onto
  `@capacitor/status-bar`, with a one-shot async `getInfo` prefetch cached synchronously and
  fire-and-forget async setters.

## Gaps

- **Direct setters bypass the style stack.** `setStatusBarStyle`, `setStatusBarVisible`,
  `setStatusBarColor`, and `setStatusBarOverlaysContent` write straight to the backend without
  updating `StyleStackState.applied` (`statusbar.ts:117-135`). A direct call while stack entries are
  active is invisible to `applyTopStyleEntry` and is silently reverted by the next push or pop. No
  ownership rule governs the interaction.
- **No native change event.** The Capacitor backend's `subscribe` is absent -- the backend type does
  not implement `StatusBarChangeBackend`. The web backend is color-only and likewise does not supply
  change events. `attachStatusBar` requires `HasUiStatusBarChange`, so no shipping host can trigger
  `StatusBar.onChange` today.
- **Cached native snapshot never refreshes.** `createCapacitorStatusBarBackend` prefetches
  `statusBar.getInfo()` once at construction (`capacitorStatusBar.ts:32-39`). OS-driven changes and
  the backend's own setter calls do not update the cache, so `getStatusBarInfo` returns stale data
  after any mutation on native.
- **Animation reach is partial.** The `animation` field in `StatusBarStyleEntry` merges through the
  stack (`statusbar.ts:161`) but is only passed to `setVisible` (`statusbar.ts:178`);
  `setBackgroundColor` is always called with `animated: false` (`statusbar.ts:175`). Neither the
  Capacitor backend's `setBackgroundColor` nor its `setVisible` accepts the animation parameter, so
  animation hints are silently dropped on the only native host.
- **Height vs. safe-area boundary undecided.** `getStatusBarHeight` returns the backend's height
  (always `-1` on both current backends). `@flighthq/device` owns `env(safe-area-inset-top)`, but no
  cross-package contract settles which provides layout padding for notched/island devices.
- **`createStatusBar` returns a plain object, not an Entity.** The `StatusBar` interface does not
  extend `Entity`, and `createStatusBar` (`statusbar.ts:39-41`) returns `{ onChange: createSignal() }`
  without `createEntity`. The codebase rule states `create*` returns Entity, though some peer signal
  entities (`AppLifecycle`) take the same plain-object approach. `Connectivity` does extend `Entity`.
  Minor inconsistency within the suite.
- **`packedRgbaToHexColor` is a general-purpose color utility in a domain package.** The same
  RGBA-to-hex conversion exists as a private `rgbaToHex` in `host-capacitor/src/capacitorStatusBar.ts:81-84`.
  If `@flighthq/color` grows a CSS hex surface, this could migrate.
- **Process-global handle counter.** `_nextHandle` (`statusbar.ts:148`) is a module-scoped integer.
  Handles are unique across all hosts in the process. Consistent with the stack being module state
  today; forecloses a future per-window stack without a handle rework.

## Charter contradictions

None. Both charter decisions are complete:
- The `enableStatusBarSignals` no-op marker is gone; signal allocation lives in `createStatusBar` and
  subscription cost begins at `attachStatusBar`.
- The aggregate ambient backend is replaced by narrow explicit Host slots. Each function takes only
  the `Has*` trait it needs, and `HasUiStatusBarStyleStack` is the intersection of the five
  command-capable traits.

The platform-integration suite's shared decision ("Use `enable*Signals` gates -- do not eagerly
allocate signals in `create*` functions") is overridden by the charter. The override is justified:
`StatusBar` is entirely a signal carrier -- there is no data-bearing entity separate from the signal,
so gating the signal behind an `enable*` function would gate the entire type's purpose.

## Contract & docs fit

- **Two-lane exports.** `index.ts` re-exports 14 named functions from `contract.ts`. `contract.ts`
  re-exports all of `statusbar.ts` (16 functions). The two contract-only symbols (`createStatusBarInfo`,
  `packedRgbaToHexColor`) are appropriately restricted from the public lane.
- **Types home.** All exported types reside in `@flighthq/types/src/StatusBar.ts`. The `HasUi*`
  host-trait types reside in `@flighthq/types/src/Host.ts`. Implementation code imports from
  `@flighthq/types/contract`.
- **Dependencies.** `package.json` declares `@flighthq/signals` and `@flighthq/types` as
  dependencies, matching the two `import` sources in `statusbar.ts`. `tsconfig.json` references match.
  No dependency on `@flighthq/entity` (which is consistent with `StatusBar` not extending `Entity`).
  No dependency on `@flighthq/sdk`.
- **Side effects.** `"sideEffects": false` declared. No top-level registration, no module-scoped
  listeners or timers. The four module-level variables (`INVALID_HANDLE`, `_nextHandle`,
  `_scratchInfo`, `_styleStacks`, `_subscriptions`) are constants or lazy state, not side effects.
- **Test coverage.** 16 `describe` blocks in `statusbar.test.ts`, one per exported function,
  alphabetized. The `fakeHost` test helper constructs a full `HasUiStatusBarChange &
  HasUiStatusBarStyleStack` host with mock providers.

## Candidate open directions

- **Async native snapshot and change truth.** Replace Capacitor's single-prefetch cache with a
  readiness model or refresh-on-set pattern. Add a native change-event path so `attachStatusBar` can
  deliver `onChange` on at least one host.
- **Style-stack / direct-setter arbitration.** Decide whether a direct `setStatusBar*` call while
  stack entries are active should update the stack's `applied` state, clear the stack, or be rejected.
  Cover with behavioral tests.
- **Animation capability and fidelity.** Either honor animation hints in native backends or expose
  capability truth so callers can distinguish supported transitions from silently dropped requests.
  Consider threading animation into the stack's `setBackgroundColor` path.
- **Height / safe-area boundary.** Settle the cross-package contract with `@flighthq/device` for
  notched/island devices, especially now that `@flighthq/device` provides `env(safe-area-inset-top)`.
- **Entity identity for `StatusBar`.** Align with the `create*` returns Entity rule if the suite
  settles on Entity for signal carriers (or explicitly exempt signal-only types).
