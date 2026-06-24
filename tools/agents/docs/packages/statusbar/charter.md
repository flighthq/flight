---
package: '@flighthq/statusbar'
crate: flighthq-statusbar
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# statusbar — Charter

## What it is

`@flighthq/statusbar` is the mobile **status-bar control** capability of the platform-integration suite: foreground style (`light`/`dark`/`default`), visibility (with `fade`/`slide`/`none` animation), background color (packed `0xRRGGBBAA`), and content-overlay behavior — plus a read side (`getStatusBarInfo`/`getStatusBarHeight`), a `StatusBar` event entity (`onChange`), and an RN-style style stack (`pushStatusBarStyleEntry`/`popStatusBarStyleEntry`). All of it sits over a swappable `StatusBarBackend` seam: a lazily-created web default (where only `setBackgroundColor` is observable, via a `<meta name="theme-color">` hint) that a native host (Capacitor / native shell) replaces with `setStatusBarBackend`.

Where it ends: statusbar controls the **OS status bar element only**. It is not the safe-area / layout authority — the top inset on notched/island devices is owned by `@flighthq/device` (`getSafeAreaInsets().top`), which can differ from the bar's intrinsic `getStatusBarHeight()`. It is a sibling of the other platform capabilities (`@flighthq/network`, `@flighthq/power`, …) and shares their command/event shape; it owns nothing about windows, dock/app badges (`@flighthq/app`), or the on-screen keyboard (`@flighthq/keyboard`).

## North star (proposed)

- **One OS status bar, one process-singleton seam.** There is exactly one status bar; the capability is flat free functions over a single module-global backend (`get`/`set`/`createWeb`), matching every other platform cell. No instance handles for the bar itself.
- **Web is the always-available floor; native is where it comes alive.** Every function works on the web by no-op-or-default; a native host fills the seam. The web backend guards each API and returns sentinels (`-1` for unknown height, `0` for no color, `default` style) rather than throwing — never assume a status bar exists.
- **Plain data across the seam.** Colors are packed RGBA integers, the read side is a single `StatusBarInfo` snapshot filled into an alias-safe `out` param (not four getters), handles are plain `number`s with a `-1` invalid sentinel. The full shape lives in `@flighthq/types` first.
- **Mirror the platform-suite event shape exactly.** The `StatusBar` entity and its `create`/`attach`/`detach`/`dispose` lifecycle track `@flighthq/network`'s shape 1:1, so the suite reads as one consistent family.
- **Conformance to the TS surface is the bar.** `flighthq-statusbar` is a declared crate; the TS package is the authoritative spec the Rust port conforms to, native-default-backed.

## Boundaries (proposed)

In scope:

- Status-bar style, visibility (+ animation), background color, content-overlay.
- The read snapshot (`getStatusBarInfo`/`getStatusBarHeight`) and the OS-change event entity (`onChange`).
- The style stack for nested-component push/pop with per-field fall-through.
- The web default backend and the `set*Backend` seam for native hosts.

Out of scope (non-goals):

- Safe-area / layout insets — owned by `@flighthq/device`.
- Window chrome, title bars, dock/taskbar/app badges — `@flighthq/application` / `@flighthq/app`.
- The on-screen (soft) keyboard — `@flighthq/keyboard`.
- Shipping any concrete native backend in this package — native fills come from a `host-*` adapter (e.g. a future `host-capacitor`), not from here.

## Decisions

None blessed yet.

## Open directions

Every candidate below comes from `review.md` and the structural forks; each is a question for you, not a settled principle.

1. **Rust crate priority & "done" bar.** The status doc treats `flighthq-statusbar` as the final Gold step. Is the crate in this milestone? And does a no-op `native`-gated default backend (desktop has no status bar) count as conformant, or does "done" require a Capacitor-style mobile-native backend? (Structural fork D — the runtime backend seam.)

2. **Height vs. `@flighthq/device` safe-area top inset.** On notched/island devices `device.getSafeAreaInsets().top` differs from the bar's intrinsic height. Today the boundary is documentation-only (no cross-package dep). Is that the blessed line, or should `getStatusBarHeight()` forward through `device` on native once that lands? A real cross-package fork (fork A — source-data vs. participation), not an autonomous fix.

3. **`enable*Signals` policy across event capabilities.** `enableStatusBarSignals()` is a no-op marker, but the sibling `@flighthq/network` has no `enableNetworkSignals`, and the codebase-map `enable*` convention assumes an associated _cost_ these signals don't carry. Should every event capability (network, power, lifecycle, keyboard, sensors, statusbar) carry the marker for symmetry, or should statusbar drop its decorative one to match `network`? A platform-suite-wide ruling.

4. **Style-stack ownership model.** Is the process-global, module-level style stack (`_styleStack`/`_nextHandle`) the intended design — one OS bar → one stack — given the ground rule against module-level mutable state (the counter-argument: the bar _is_ a process singleton, like `_backend`)? If blessed, should a `clearStatusBarStyleStack()` + `hasStatusBarStyleEntry(handle)` round out the push/pop trio (the natural `has*` slot) and retire the tests' `0..99` pop-teardown hack?

5. **Style vocabulary.** `StatusBarStyle` keeps `'light' | 'dark' | 'default'`, mapped to iOS `lightContent`/`darkContent` by intent (documented in the type). Is that mapping blessed, or are explicit `'lightContent'`/`'darkContent'` aliases wanted?

6. **`createStatusBarInfo` default `visible: true`.** A zeroed snapshot claims the bar is visible before any backend read; on a host that starts hidden this is stale until `getInfo` runs. Bless `true` as the documented default, or pick a different starting assumption?

7. **Package Map line is stale.** `tools/agents/docs/index.md` still describes statusbar as only "mobile status-bar style, visibility, color" — predating the read side, animation, change notification, and style stacking. Candidate revision: widen the line to mention the info-snapshot query and the event entity. (Admin-doc fix to confirm.)
