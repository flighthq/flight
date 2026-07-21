---
package: '@flighthq/application'
updated: 2026-07-21
basedOn: ./review.md
---

# application — Assessment

Refreshed against the 2026-07-13 review (solid — 88). All three previously-Recommended items are verified done in the live tree: the `@flighthq/types` half exists (`LoopBackend.ts`, `ApplicationLoopOptions.ts`, expanded `Application`, the three `WindowBackend` methods), dead `LoopState.accumulated` is removed (only `fixedAccumulator` remains), and the Package Map line in `agents/index.md` now describes the full loop + windowing surface.

## Directed

1. **Build `ApplicationRenderView` as the explicit 95% assembly.** It links an `ApplicationWindow`, `RenderState`, `RenderTarget`, and device-pixel `Viewport` while keeping all four independently accessible. Window resize updates the common target/state/viewport case; callers attach additional resize work through the existing signal rather than a kitchen-sink callback surface.
2. **Keep package arrows pointing downward.** The shared view contract belongs in `@flighthq/types`; generic attach/resize observation belongs here. A render backend must not import `@flighthq/application` merely to offer a backend assembly helper. Prefer a caller composition or a high-level application helper that depends only on lower layers.
3. **Lead with GL and defer WGPU assembly parity.** Settle the window/target/state/viewport contract and its GL behavior first. Do not use a premature WGPU factory to harden an unvalidated cross-backend contract.

## Recommended

Sweep-safe, within-package, no design fork:

1. **Fold the triplicated `onError` emit guard into one internal helper.** The `if (app.onError !== null) try/catch else emit` shape is repeated in the tick, `stepApplicationLoop`, and the fixed-update inner loop. Pure within-package refactor, no exported-surface change. — review.md gap 3.

## Backlog

- **Fixed-update support in `stepApplicationLoop`.** _Design decision._ `step` forces `interpolationAlpha = 1` and never emits `onFixedUpdate`; whether it should honor an active fixed-mode loop state (or accept options) changes the headless-stepping contract. — review.md gap 1.
- **Frame-time jitter / dropped-frame metrics.** _Cross-boundary._ New read-only fields on the `Application` interface in `@flighthq/types`; the loop-side math is in-package. Carried from status. — review.md gap 2.
- **Evaluate decomposition (windowing → `@flighthq/window`, loop → `@flighthq/loop`).** _Charter Open directions 1–2; bedrock-test ruling needed, package now compiles so the precondition is met._
- **Retire stale charter stats and completed Open direction 4 (Package Map update).** _Charter edit — direction-session territory._
- **Rust `flighthq-application` crate.** _Parked — global posture (TS is the spec; Rust conforms in parity passes)._

## Approved

- [2026-07-02 · picked] Sweep items 1–3: rebuild missing types, remove dead accumulated, Package Map description
