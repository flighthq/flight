---
package: '@flighthq/app'
updated: 2026-06-24
basedOn: ./review.md
---

# app — Assessment

Recommendation layer over [`review.md`](./review.md) (solid — 84/100), absorbing the prior `reviews/maturation/depth/app.md` roadmap. Most of that roadmap's Bronze and Silver tiers **already landed** in this pass (lifecycle signals incl. quit-veto, login-item, recent-documents, app paths, command-line/argv, metadata writes, visibility, attention, activation-policy, the locale triad). What is sorted below is the residue: a small set of sweep-safe within-package cleanups, and a larger parked set that is cross-package, async-seam-shaped, or waiting on a charter Open direction.

The single highest-value follow-up is **not** code — it is blessing the five architectural decisions the worker made (quit-veto mechanism, locale-vs-preferred-languages split, the `@flighthq/filesystem` paths boundary, badge ownership vs `@flighthq/tray`, `setAppUserModelId` ownership), which currently live only in `status.md`. That belongs in the charter's `Decisions`/`Boundaries`, not here; it is noted for the direction pass below.

## Recommended

Sweep-safe: within `@flighthq/app` (+ its already-owned `@flighthq/types` `App*` files), no cross-package coupling, no breaking change, no open design decision.

- **Resolve the two orphaned types — wire or retract.** `AppLaunchKind` (`'cold' | 'warm'`) and `AppMemoryPressure` (`'normal' | 'moderate' | 'critical'`) are exported from `@flighthq/types` with no implementer in `@flighthq/app` — dead public surface that `exports:check` cannot catch (types carry no colocated function test). The _sweep-safe_ half of this is the **retract** direction: if no `onMemoryWarning` / launch-kind getter is wired in this sweep, remove the two orphaned exports from `types/index.ts` so the header stops drawing surface ahead of the code. (The _wire_ direction — actually adding the events — is an Open direction, parked below, because it forks on app-vs-`lifecycle` ownership.) — review.md#gaps, review.md#contract--docs-fit
- **Document the web sentinels + native semantics on the new backend methods.** The Gold roadmap item "every backend method documents its web sentinel and native semantics" is pure in-package doc-comment work over the surface that already exists. Each `AppBackend` method and its web fill gained in this pass should state its sentinel (`-1` / `''` / `false` / `[]` / no-op) and native intent in source. No signature change. — maturation Gold
- **Add alias-safe `out`-param variants for the value-returning getters.** `getAppLoginItem(out?)` already follows the read-shape/`*Like`-write split; extend the same alias-safe `out` convention to the other value-returning getters per the SDK out-param rule (read inputs into locals before writing). Within-package, additive, test both the distinct-output and aliased cases. — maturation Gold
- **Note the Map under-description.** `index.md`'s `@flighthq/app` line omits single-instance and command-line, which the package does carry. A one-line Package Map fix (docs-only, no API change). — review.md#contract--docs-fit

## Backlog

Parked — each says why it is not sweep-safe.

- **Memory-pressure & launch-kind events (`onMemoryWarning` + launch-kind getter).** _Parked: open design fork._ Whether these belong to `@flighthq/app` or to `@flighthq/lifecycle` (which already owns active/inactive/background/resume/pause) is undecided. The types being homed in `App*` files leans app-ownership, but that is an assumption. Routed to charter Open direction (1). — review.md candidate open directions #1
- **GPU / process metrics — `getAppGpuInfo`/`getAppMetrics`/`getAppMemoryInfo`.** _Parked: open design fork (async seam shape)._ These are Promise-returning, and the async-seam shape interacts with the Rust `Send`-future note (`flighthq-types` backend traits) — a decision, not a sweep. Routed to charter Open direction (3). — review.md#gaps, maturation Gold
- **Crash / render-process lifecycle — `onAppChildProcessGone`/`onAppRenderProcessGone`.** _Parked: larger scope, no web analogue._ Real AAA gap for a process layer, but Electron-specific with an inert web fill, and best landed alongside a native/Electron backend pass rather than as an isolated sweep. — review.md#gaps, maturation Gold
- **Jump-list / dock-menu unification.** _Parked: cross-platform design decision._ Keep `setAppDockMenu` + a separate `setAppJumpList`, unify under one `AppJumpListCategory[]`, or document the gap — explicitly flagged as needing the user. Routed to charter Open direction (2). — review.md candidate open directions #2
- **Accessibility / theme hooks — `setAppAccessibilitySupportEnabled` / `onAppAccessibilitySupportChanged`.** _Parked: ownership unsettled_ between `@flighthq/app` and `@flighthq/platform`. Routed to charter Open direction (4). — review.md#gaps
- **Native default backend for `@flighthq/app`.** _Parked: cross-package architectural decision._ Whether TS `@flighthq/app` should follow the Rust pattern of an in-crate native default (real named-mutex single-instance lock, login-item via platform autostart, exe path) rather than requiring a `host-*` backend per non-web capability is an SDK-wide seam call (structural fork D / the host-layer pattern). Routed to charter Open direction (6). — review.md candidate open directions #6
- **`flighthq-app` Rust conformance.** _Parked: cross-worktree, larger engineering._ The crate exists but no `crates/` change appears in this app-scoped delta; the native single-instance lock and login-item are genuinely new engineering with no web equivalent to port. Belongs to a Rust-port pass, not a within-package TS sweep. — review.md#gaps, maturation Gold

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on that approval._

## For the charter (Open directions — not edited here)

Surfaced for the direction pass; the assessment does not edit the charter:

- **Bless the five parked Decisions.** The quit-veto mechanism, locale-vs-preferred-languages split, the `@flighthq/filesystem` paths boundary, badge ownership vs `@flighthq/tray`, and `setAppUserModelId` ownership are real, defensible rulings sitting in `status.md`. They are `charter.md › Decisions` / `Boundaries` candidates — the highest-value follow-up.
- **State the Boundary.** The implemented-but-unstated hard line against `@flighthq/application` (single window), `@flighthq/filesystem` (bare OS dirs), `@flighthq/tray` (badge), and `@flighthq/lifecycle` (app active/background) deserves an explicit Boundary ruling — the `onActivate`/`onAllWindowsClosed` overlap with `lifecycle`'s active events especially.
- Open directions (1) memory-pressure/launch-kind ownership, (2) jump-list/dock-menu unification, (3) GPU/metrics async-seam shape, (4) accessibility/theme ownership, (6) native default backend — each carried from the review, gating the corresponding Backlog items above.
