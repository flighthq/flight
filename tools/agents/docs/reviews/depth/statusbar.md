# Depth Review: @flighthq/statusbar

**Domain**: Mobile status-bar control — foreground style, visibility, background color, and content-overlay behavior, over a swappable web/native backend seam.

**Verdict**: solid — 72/100

The package is small by nature; the mobile status-bar domain is genuinely narrow. Measured against the canonical reference for this domain (Capacitor's `StatusBar` plugin and React Native's `StatusBar`), Flight covers the core _command_ surface cleanly but is missing the _query_ half of the API and the height/safe-area dimension that consumers most often need.

## Present capabilities

Free functions over a `StatusBarBackend` seam (`@flighthq/types`), with a lazily-created web default and `set*`/`get*Backend` registration:

- `setStatusBarStyle(style)` — foreground style, `'light' | 'dark' | 'default'`.
- `setStatusBarVisible(visible)` — show/hide.
- `setStatusBarColor(color)` — background color from a packed `0xRRGGBBAA` integer; on web upserts a single `<meta name="theme-color">` and drops alpha (correctly idempotent — verified by test).
- `setStatusBarOverlaysContent(overlay)` — whether content draws under the bar (the Capacitor `setOverlaysWebView` / RN `translucent` concept).
- `createWebStatusBarBackend()` — the default backend; only `setBackgroundColor` is observable on web, the rest no-op by design.
- `getStatusBarBackend()` / `setStatusBarBackend(backend | null)` — backend registration and reset to web fallback.

The seam shape matches the platform-suite "command capability" pattern exactly (flat functions + `get*/set*/createWeb*Backend`, web guards returning no-ops). Test coverage is complete per export, including the aliased meta-upsert and the null-reset path.

## Gaps vs an authoritative status-bar library

The command side is essentially complete; the gaps are on the _read_ side and in layout integration, which is where the domain actually has more depth than first appears:

- **No state query (`getStatusBarInfo` / getters).** Capacitor exposes `getInfo()` returning `{ visible, style, color, overlays }`; RN tracks current style. Flight is write-only — a consumer cannot read back current visibility/style/color. This is the single biggest omission; it is missing-by-omission, not by-design, since the backend trait could carry getters.
- **No height / safe-area dimension.** Consumers overwhelmingly need the status-bar height (or safe-area top inset) to lay content out around the bar, especially with `overlaysContent`. There is no `getStatusBarHeight()`. (Note: `@flighthq/device` is documented as owning safe-area insets, so this may be deliberately delegated — but if so it is a cross-package coupling worth stating in the type doc; as a standalone library this is a real gap.)
- **No animated hide/show.** Capacitor `hide({ animation })` and RN `setHidden(hidden, animation)` support `'fade' | 'slide' | 'none'`. `setStatusBarVisible` takes only a boolean — no animation parameter.
- **No change notification.** No `onStatusBarChange` / signal for OS-driven changes (rotation, system-initiated hide). The platform suite has an event-capability shape for exactly this; status bar exposes none. Arguably borderline-canonical, but RN re-renders on style stack changes and Capacitor surfaces visibility.
- **Style stacking / push-pop.** RN's `StatusBar` supports a stack of style entries (`pushStackEntry`/`popStackEntry`) so nested components can layer style and restore on unmount. Flight is last-write-wins with no save/restore. This is advanced but is part of a mature status-bar library.
- **Animated background color is not addressed** (minor; RN `animated` flag on `setBackgroundColor`).

Genuinely out-of-scope / correctly absent: iOS network-activity indicator (deprecated by Apple), per-platform divergence shims.

## Naming / API-shape notes

- Naming is on the golden path: every export carries the full unabbreviated `StatusBar` type word and is globally self-identifying (`setStatusBarOverlaysContent`, not `setOverlay`). Exports are alphabetized; `createWebStatusBarBackend` precedes the `get/set` pair as the project's command-capability convention prescribes.
- Color as a packed `0xRRGGBBAA` int with alpha-drop on web matches the SDK-wide color convention; the `packedRgbaToHexColor` helper is at file bottom per source-style rules. Good.
- `StatusBarStyle` is an open `'light' | 'dark' | 'default'` union — adequate, though iOS distinguishes `'lightContent'`/`'darkContent'` semantics that the three values cover by intent.
- If getters are added, follow the `get*` prefix and consider a single `getStatusBarInfo(out)`-style read rather than four separate getters, to keep the backend trait tight.

## Recommendation

Promote toward authoritative by closing the read side: add `getStatusBarInfo()` (or discrete `is*/get*` accessors) backed by new `StatusBarBackend` getters, and add an animation parameter to `setStatusBarVisible` (`'fade' | 'slide' | 'none'`). Decide and document whether status-bar height/top-inset lives here or is delegated to `@flighthq/device`; if delegated, note it in `StatusBar.ts`. A change notification (`onStatusBarChange`) and RN-style push/pop style stacking would round it out to fully authoritative but are lower priority. The command surface itself needs no rework — it is clean and canonical.
