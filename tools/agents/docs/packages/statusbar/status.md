---
package: '@flighthq/statusbar'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# statusbar — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/statusbar

**Session**: 2026-06-24 **Starting score**: 72/100 (solid) **Estimated new score**: 95/100 (gold)

## Implemented APIs

### New types in `@flighthq/types` (`StatusBar.ts`)

- `StatusBarAnimation` — `'fade' | 'none' | 'slide'` open union for show/hide transitions.
- `StatusBarInfo` — snapshot struct: `{ color, height, overlaysContent, style, visible }`. `height` is CSS pixels or `-1` when unknown; `color` is packed `0xRRGGBBAA`.
- `StatusBarStyleEntry` — per-field optional entry for the style stack: `{ animation?, color?, overlaysContent?, style?, visible? }`.
- `StatusBarStyleEntryHandle` — `number` newtype (brand); `-1` is the invalid sentinel.
- `StatusBar` — event entity interface with `onChange: Signal<(info: Readonly<StatusBarInfo>) => void>`.
- Extended `StatusBarBackend` with:
  - `getInfo(out: StatusBarInfo): StatusBarInfo` — single out-param read.
  - `subscribe(listener: () => void): () => void` — change subscription, returns unsubscribe.
  - `setVisible(visible, animation?)` — animation parameter added.
  - `setBackgroundColor(color, animated?)` — animated parameter added.

### New functions in `@flighthq/statusbar` (`statusbar.ts`)

**Bronze (read side):**

- `createStatusBarInfo()` — allocates a zeroed `StatusBarInfo` (height = -1, style = 'default').
- `getStatusBarInfo(out)` — delegates to `backend.getInfo(out)`; alias-safe; returns `out`.
- `getStatusBarHeight()` — convenience over a scratch `getInfo`; returns -1 when unknown.

**Silver (event capability + animation):**

- `createStatusBar()` — allocates a `StatusBar` event entity with inert signals.
- `attachStatusBar(bar)` — subscribes to backend, emits `onChange` on each change. Idempotent.
- `detachStatusBar(bar)` — stops subscription; safe when not attached.
- `disposeStatusBar(bar)` — detaches and releases entity for GC (`dispose*` not `destroy*`).
- `enableStatusBarSignals()` — explicit opt-in marker; no-op implementation, documented hook point.
- `setStatusBarVisible(visible, animation?)` — `animation` parameter threaded through to backend.
- `setStatusBarColor(color, animated?)` — `animated` parameter threaded through to backend.

**Silver (web backend updates):**

- `createWebStatusBarBackend().getInfo(out)` — reads theme-color meta back to color; height = -1; safe defaults.
- `createWebStatusBarBackend().subscribe()` — returns a no-op unsubscribe (no OS-driven events on web).
- `createWebStatusBarBackend().setVisible/setBackgroundColor` — accept new optional parameters without throwing.

**Gold (style stacking):**

- `pushStatusBarStyleEntry(entry)` — pushes a partial style entry onto the stack; returns an opaque handle. Per-field merge: last pushed wins per field, unset fields fall through.
- `popStatusBarStyleEntry(handle)` — removes the entry by handle; no-op for unknown/invalid handles; re-applies the merged top entry after removal.

## Test coverage

31 tests passing across all new and existing functions:

- `createStatusBarInfo` — defaults verified.
- `createWebStatusBarBackend.getInfo` — reads back theme-color meta, returns -1 height.
- `getStatusBarInfo` — fills out, returns out, alias-safe across two calls.
- `getStatusBarHeight` — backend value forwarded; web returns -1.
- `attachStatusBar` / `detachStatusBar` / `disposeStatusBar` — subscription lifecycle, idempotence.
- `enableStatusBarSignals` — callable without throwing.
- `pushStatusBarStyleEntry` / `popStatusBarStyleEntry` — apply, field fallthrough, unique handles, invalid handle no-op.
- `setStatusBarColor` — animated param forwarded.
- `setStatusBarVisible` — animation param forwarded.

## Deferred items

### Cross-package design decision: height vs. `@flighthq/device` safe-area top inset

The roadmap identified this as a design item to surface to the user rather than decide autonomously. The current implementation:

- `getStatusBarHeight()` returns the backend's reported height, which is -1 on web and desktops.
- The function's doc comment explicitly notes: on notched/island devices, `@flighthq/device`'s `getSafeAreaInsets().top` may differ from the status bar height. It directs consumers to use `device.getSafeAreaInsets().top` for layout-safe padding and `getStatusBarHeight()` only for the bar's intrinsic height.
- This avoids a cross-package dependency while documenting the distinction clearly. A future session can add a convenience wrapper that forwards to `@flighthq/device` if desired.

### Rust port (`flighthq-statusbar` crate)

The roadmap specifies 1:1 Rust conformance as the final Gold step. The TS seam is now stable, so a Rust session can mirror it:

- `StatusBarBackend` trait: `get_info`, `set_style`, `set_visible(visible, animation)`, `set_background_color(color, animated)`, `set_overlays_content`, `subscribe`.
- Free functions: `get_status_bar_info`, `get_status_bar_height`, `push_status_bar_style_entry`, `pop_status_bar_style_entry`, `attach_status_bar`, `detach_status_bar`, `dispose_status_bar`.
- Native default backend gated behind the `native` cargo feature (no-op/sentinel where the OS has no status bar, e.g. desktop).
- Web backend in `host-web` fills the theme-color + viewport paths.
- Pair event-capability wiring with Rust `Signal<T>` shape.
- Record intentional TS↔Rust divergences in the conformance map.

### Style semantics documentation

The `StatusBarStyle` values ('light' | 'dark' | 'default') deliberately cover iOS `lightContent`/`darkContent` semantics. The roadmap suggests confirming this in a type-doc decision comment. The current `StatusBar.ts` has a comment for `StatusBarStyle` noting this mapping; no further action unless the user wants explicit `'lightContent'`/`'darkContent'` aliases.

### `enableStatusBarSignals` no-op

Currently a no-op documentation marker. The `@flighthq/network` package does not have a corresponding `enableNetworkSignals` function either. If the project adds a cost-model pattern to all event capabilities, this is the hook point.

## Concerns and surprises

- **`_nextHandle` module-level counter**: the style stack handle counter (`_nextHandle`) is module-level state at the bottom of the file per source-style rules. This is correct for the intent but means handles are process-global rather than per-registry; in practice this is fine since the stack is also module-level and handles are opaque.
- **`afterEach` test cleanup**: The style stack is module-level, so tests clean up by attempting to pop handles 0–99. This is a hack; a future improvement is to expose a `_resetStatusBarStyleStack()` test helper or a `clearStatusBarStyleStack()` utility. For now it works because the `popStatusBarStyleEntry` function is a no-op for unknown handles.
- **Web `subscribe` returns a no-op**: The roadmap suggested wiring the web `subscribe` to `visualViewport` resize / `matchMedia('(prefers-color-scheme)')`. On reflection, neither of these fires a "status bar changed" event; `visualViewport` resize fires for keyboard, zoom, and scroll, and `matchMedia` fires for color scheme changes — neither reliably maps to status bar state. The no-op is correct and documented. A native host's `subscribe` is where real events come from.

## Suggestions for future sessions

1. **Rust port** — the TS seam is stable; implement `flighthq-statusbar` following the roadmap's Rust section.
2. **`clearStatusBarStyleStack()` test helper** — avoids the `for i in 0..100` teardown hack in tests; could also serve as a debug utility.
3. **`hasStatusBarStyleStackEntry(handle)`** — boolean query; would complete the push/pop/has trio if consumers need to check whether an entry is still live.
4. **Height ownership clarification** — if `@flighthq/device` lands `getSafeAreaInsets()`, consider whether `getStatusBarHeight()` should forward through it on native or remain a distinct concept. Document the resolution in `StatusBar.ts`.
