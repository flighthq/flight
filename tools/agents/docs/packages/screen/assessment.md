---
package: '@flighthq/screen'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/screen

The review puts `@flighthq/screen` at `solid` — 90/100, near-authoritative after the `builder-67dc46d64` pass landed Bronze + Silver + most of Gold. What remains splits cleanly: a small set of strictly within-package, non-design additions (Recommended), and a larger set that is either a behavior/seam decision, a host-coupled payload, or a cross-environment/cross-package follow-up (Backlog). Several items the review raised are genuine design forks or boundary questions — those are **routed to the charter's Open directions** (the charter is still a stub) and are _not_ placed in Recommended.

`Approved` is empty — approval is the user's verbal gate.

## Recommended

Sweep-safe: within `@flighthq/screen`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **`getScreenDetailPermission` change-watch variant.** Add a `PermissionStatus.onchange`-backed watcher (e.g. `onScreenDetailPermissionChange(listener): () => void`) so a consumer can react to a later grant/revoke of the `window-management` permission instead of one-shot polling. Purely additive web-backend surface over the existing Permissions read; returns a no-op unsubscribe when the Permissions API is absent (existing sentinel discipline). The review names this as the gap to 95+. — review.md#gaps-vs-an-authoritative-display-library (no `getScreenDetailPermission` watch)

## Backlog

Parked — each carries a reason: a host-coupled payload, a cross-environment follow-up, or waiting on an Open direction the charter must settle first.

- **Real display-mode enumeration / `getScreenNativeMode`.** The `ScreenMode` type seam and `getScreenModes`/`getScreenCurrentMode` are landed; web is correctly synthetic-single-mode. A real mode list and a `getScreenNativeMode` payload only become real once a native host enumerates. **Parked:** host-coupled — no payload to write until a native backend exists; not sweep-safe in a TS-only pass. — review.md (real display-mode enumeration is web-synthetic only)

- **Stable-id contract test.** A test asserting `ScreenInfo.id` is reconfiguration-stable. **Parked:** the contract itself is undecided (numeric vs string, what a host must honor across hot-plug) — the test cannot be written before the seam decision lands. Depends on Open direction #5 below. — review.md (stable-id contract is convention-only)

- **Rust compile verification.** Run `cargo build -p flighthq-screen -p flighthq-host-winit` and fix any breakage; the builder sandbox had no cargo, so the Rust mirror is structurally consistent but uncompiled — the single largest confidence gap in the parity claim. **Parked:** requires a Rust-capable environment, outside a TS package source sweep; a standing follow-up, not a design question. — review.md (Rust compile unverified)

- **`Signal<Fn>` vs `Signal<T>` divergence note.** Record in the conformance/divergence map that `ScreenSignals` types its signals by _function type_ (TS convention) while the Rust port's locked decision is `Signal<T>` by _payload_. **Parked:** cross-package doc edit (the divergence map, not `@flighthq/screen` source); a one-line note, not a code fix. — review.md#contract--docs-fit

- **Package Map line expansion.** The codebase-map Package Map entry for `@flighthq/screen` still reads "display enumeration, work area, scale factor" — it now also owns coordinate conversion, cursor queries, change events, display modes, and a signals group. **Parked:** edits a shared doc (`tools/agents/docs/index.md`) outside the package cell. — review.md#contract--docs-fit

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Routed to the charter's Open directions

Surfaced for an explicit conversation, **not** placed in Recommended — each is a design fork, a boundary question, or a cross-package ruling. The charter is a stub; these should seed its _Open directions_ (noted here for the user; this skill does not edit the charter).

1. **North star / bar.** Is the target the union of Electron `screen` + Tauri + SDL3 + browser Window Management (the bar this pass built toward), or a deliberately thinner web-first surface? Decides whether the native-only fields are obligations or aspirations. — review.md#candidate-open-directions (1)

2. **Cheap web-populatable fields (boundary question).** Should `monochrome` (`matchMedia('(monochrome)')`), `dpi` (`96 * devicePixelRatio`), and `depthPerComponent` (inferable from `colorDepth`) be populated on web where derivable, or left sentinel until a native host? This is "what does the web backend promise to fill" — a Boundary decision, **not** a sweep-safe cleanup, despite the cheap implementation. — review.md#candidate-open-directions (2)

3. **`getScreenNearestRect` vs `getScreenContainingRect` redundancy.** They share one body under two names today. Keep both as intent-revealing aliases, give them distinct semantics (nearest-rect = center-distance, containing = overlap), or collapse to one? A deliberate API-shape ruling. — review.md#candidate-open-directions (3)

4. **Late-subscribe + upgrade ordering bug.** `subscribe` captures `_screenDetails` at subscription time, so subscribing before `requestScreenDetails()` misses post-upgrade `screenschange` events. Bless "call `requestScreenDetails` before subscribing" as a usage rule, or fix `subscribe` to re-bind on `_upgrade`? A behavior decision, not a cleanup. — review.md#candidate-open-directions (4)

5. **Stable-id contract.** Numeric vs string, and the guarantee a native host must honor across hot-plug — a seam decision that must precede the first conforming native backend (and the Backlog stable-id test). — review.md#candidate-open-directions (5)

6. **Cross-package boundary rulings.** Cursor-position ownership vs `@flighthq/input` / `@flighthq/interaction`; display-metrics overlap with `@flighthq/device` (`getDeviceDisplayMetrics`); whether the Window Management granted state persists via `@flighthq/storage`. Each wants a one-line Package Map ruling. — review.md#candidate-open-directions (6)
