---
package: '@flighthq/statusbar'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/statusbar.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/statusbar

## Verdict

`solid — 88/100`. The 2026-06-24 builder pass (`builder-67dc46d64`) closed the read side, animation, change-notification, and style-stacking gaps the prior depth review flagged, lifting the package from a clean-but-write-only command surface to a near-complete mobile status-bar library. Every status-doc claim verified against the diff. What keeps it short of authoritative is not TS feature surface but the absence of the Rust crate (`crate: flighthq-statusbar` is declared, not built), a module-level style-stack design wart, and a couple of small contract frictions.

## What the pass actually changed (verified)

Base (`builder-67dc46d64/base`) matched the depth review exactly: a write-only `StatusBarBackend` with `setStyle`/`setVisible`/`setBackgroundColor`/`setOverlaysContent`, and no read side. The head bundle adds, all confirmed in `changes.patch` and source:

- **Types** (`67dc46d64:packages/types/src/StatusBar.ts`): `StatusBarAnimation` (`'fade' | 'none' | 'slide'`), `StatusBarInfo` snapshot struct, `StatusBarStyleEntry` (per-field-optional, `readonly` fields), `StatusBarStyleEntryHandle` (`number`, `-1` sentinel), `StatusBar` event entity (`onChange: Signal<…>`), and the backend extended with `getInfo(out)`, `subscribe(listener)`, plus `animation`/`animated` params on `setVisible`/`setBackgroundColor`.
- **Package**: `@flighthq/signals` added to `dependencies` and the `tsconfig` `references` — correct, since the entity now carries a `Signal`.
- **Source** (`67dc46d64:packages/statusbar/src/statusbar.ts`): 14 exported functions, all alphabetized, each with a colocated test (31 tests across 17 `describe` blocks, mirroring source order).

## Present capabilities

Command surface (unchanged, still canonical): `setStatusBarStyle`, `setStatusBarVisible(visible, animation?)`, `setStatusBarColor(color, animated?)`, `setStatusBarOverlaysContent`, `getStatusBarBackend`/`setStatusBarBackend`, `createWebStatusBarBackend`.

Read side (new): `createStatusBarInfo()` allocates a zeroed snapshot (`height = -1`, `style = 'default'`); `getStatusBarInfo(out)` delegates to `backend.getInfo(out)` and is alias-safe (the web backend reads all fields into `out` with no cross-field dependency; verified by the alias test); `getStatusBarHeight()` reads height via a module scratch and returns `-1` when unknown.

Event capability (new, matching the `@flighthq/network` shape exactly — verified against `network.ts`): `createStatusBar()`, `attachStatusBar(bar)` (idempotent — tears down a prior subscription first), `detachStatusBar(bar)`, `disposeStatusBar(bar)` (correct verb — detach-and-release-to-GC, nothing native to free). `enableStatusBarSignals()` is a documented no-op opt-in marker.

Style stacking (new): `pushStatusBarStyleEntry(entry)` returns an opaque handle and applies a top-down per-field merge (last-pushed wins per field, unset fields fall through); `popStatusBarStyleEntry(handle)` removes by handle, no-ops on unknown/invalid, and re-applies the merged top. This is the RN `pushStackEntry`/`popStackEntry` pattern.

Web backend `getInfo` reads the `theme-color` meta back to a packed `0xRRGGBBFF` (alpha forced opaque, since web write drops alpha) and returns safe defaults elsewhere; `subscribe` returns a no-op unsubscribe (no OS status-bar events on web). The `_webReadThemeColor`/`packedRgbaToHexColor` helpers sit at file bottom per source-style rules.

## Gaps

- **No Rust crate.** `flighthq-statusbar` is declared in the charter front matter but not built. The status doc spells out the intended seam (the `StatusBarBackend` trait, the free functions, the `native`-gated no-op default, the `host-web` theme-color fill). This is the single largest remaining distance to authoritative, and the one the conformance goal cares about most.
- **No `hasStatusBarStyleEntry(handle)`.** The push/pop pair lacks the boolean `has*` query that would complete the trio and let a consumer check whether an entry is still live. Minor, but it is the `has*`-prefix convention's natural slot.
- **No `clearStatusBarStyleStack()`.** There is no way to drop the whole stack. The tests feel this directly: `afterEach` pops handles `0..99` as a teardown hack because the stack is module-global with no reset. A `clear*` utility (or a test-only reset) would remove the hack and serve as a debug affordance.
- **`createStatusBarInfo` default `visible: true` is an assumption.** A zeroed snapshot claims the bar is visible before any backend read; on a host that starts hidden this is a stale default until `getInfo` runs. Defensible (most platforms start visible) but undocumented as a choice.

## Charter contradictions

None — the charter's `What it is` ("mobile status-bar control … over a swappable web/native backend seam") is exactly what the code is, and `North star`/`Boundaries`/`Decisions` are all still `TODO`, so there is nothing concrete to contradict. The thinness of the charter is itself the finding (see Candidate open directions).

## Contract & docs fit

Lives up to the contract well:

- **`@flighthq/types`-first**: every cross-package type (`StatusBarInfo`, `StatusBarAnimation`, `StatusBarStyleEntry`, `StatusBarStyleEntryHandle`, `StatusBar`, extended `StatusBarBackend`) is defined in `types/src/StatusBar.ts`, not inline. Good.
- **Full unabbreviated names**: every export carries the `StatusBar` type word and is globally self-identifying.
- **`out`-params + alias-safety**: `getStatusBarInfo(out)` returns `out` and is alias-safe; a single-struct read rather than four getters, exactly as the depth review recommended.
- **Sentinels not throws**: `-1` for unknown height and the invalid handle; `popStatusBarStyleEntry` no-ops on bad input rather than throwing. Correct.
- **Single root export** (`index.ts` is `export * from './statusbar'`), `sideEffects: false`, `Readonly<>` on the `StatusBarStyleEntry` parameter. All present.

Frictions worth flagging:

- **Module-level mutable style stack.** `_styleStack`, `_nextHandle`, and `_scratchInfo` are module globals. The codebase-map ground rule says do not "mutate shared state at module top level"; the counter-argument is that the whole capability is process-singleton (one OS status bar), so a module-global stack is the honest model — the same way the backend itself is a module global (`_backend`). This is consistent with the rest of the platform suite, but it is the reason the tests need the `0..99` pop hack, and it means style-stack handles are process-global rather than per-registry. Worth a deliberate ruling rather than leaving implicit.
- **`enableStatusBarSignals` is a no-op singleton among event capabilities that lack one.** `@flighthq/network` (the sibling event capability) has no `enableNetworkSignals`. Either statusbar's marker is the start of a pattern the other event capabilities should adopt, or it is an outlier to drop. The codebase-map `enable*` convention is framed around an assumed _cost_ (e.g. `enableDisplayObjectSignals`); statusbar's signals carry no such cost, so the marker is currently decorative.
- **Package Map line is now stale.** `tools/agents/docs/index.md` still describes statusbar as "mobile status-bar style, visibility, color" — it predates the read side, animation, change notification, and style stacking. Candidate revision: widen the line to mention the query/info snapshot and the event entity.

## Candidate open directions

The charter's `North star`, `Boundaries`, and `Decisions` are all stubs; each thing this review had to assume becomes a question for the charter:

1. **Rust crate priority.** The status doc treats the Rust port as the final Gold step. Is `flighthq-statusbar` in this milestone, and does the no-op `native` default backend (desktop has no status bar) count as conformant, or does it need a Capacitor-style mobile-native backend to be "done"?
2. **Height vs. `@flighthq/device` safe-area top inset.** The depth review and the source doc-comment both flag that on notched/island devices `device.getSafeAreaInsets().top` differs from the bar's intrinsic height. The current resolution is documentation-only (no cross-package dep). Is that the blessed boundary, or should `getStatusBarHeight()` forward through `device` on native once that lands? This is a real cross-package fork to settle, not an autonomous fix.
3. **`enable*Signals` policy for event capabilities.** Should every event capability (network, power, lifecycle, keyboard, sensors, statusbar) carry an `enable*Signals` marker for symmetry, or should statusbar drop its no-op to match `network`? A platform-suite-wide ruling, not a statusbar-local one.
4. **Style-stack ownership model.** Is the process-global module-level stack the intended design (one OS bar → one stack), and if so should a `clearStatusBarStyleStack()` / `hasStatusBarStyleEntry()` round out the API and retire the test teardown hack?
5. **Style vocabulary.** `StatusBarStyle` keeps `'light' | 'dark' | 'default'` and maps to iOS `lightContent`/`darkContent` by intent (documented in the type). Is that mapping blessed, or are explicit `'lightContent'`/`'darkContent'` aliases wanted?
