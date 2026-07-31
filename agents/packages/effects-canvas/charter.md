---
package: '@flighthq/effects-canvas'
crate: null
draft: false
lastDirection: 2026-07-31
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# effects-canvas — Charter

## What it is

The Canvas 2D member of the `effects-<backend>` family. It owns the opt-in offscreen pipeline, pooled
scratch canvases, per-state runner registry, and the eight effects that currently have genuine Canvas
realizations: Bloom, Blur, DropShadow, FilmGrain, OuterGlow, Pixelate, Scanlines, and Vignette.

`@flighthq/effects` owns effect intent and descriptors. This package owns only implementations Canvas
2D can honestly execute. The remaining descriptor kinds are absent here: an unregistered operation is
skipped by the pipeline, and the support matrix records that unsupported result.

## North star

- **Realized or absent, never fake.** A default runner and its matching per-kind registrar exist only
  when the backend performs the named effect. An identity copy is not an implementation.
- **Exact inverse capability.** Each real runner has one matching registrar, each registrar fronts its
  named runner, and the source-derived reachability check hard-gates both directions.
- **Opt-in and tree-shakable.** Registration is per kind and per state. There is no register-all/category
  aggregate, monolithic kind switch, or import-time registration.
- **Curated export lanes.** Current dot/contract placement is tracked as a non-blocking baseline so moves
  are visible and deliberate without turning present judgment into a permanent lane invariant.
- **Explicit ownership.** Render targets use paired acquire/release brackets; the per-node bridge operates
  on caller-owned `RenderTexture` leases and never mutates a live render proxy.

## Boundaries

**In scope:**

- Canvas implementations for effect descriptors the substrate can genuinely realize.
- The offscreen post-process pipeline, pool, registry, compositing primitives, and target-to-target bridge.
- Matching per-kind registrars for every realized built-in runner.

**Non-goals:**

- Fake passthrough runners for unsupported kinds.
- Defining effect descriptors or renderer-agnostic math.
- Emulating depth, velocity, temporal history, or shader facilities Canvas 2D does not provide.
- A Rust Canvas emulator; the CPU-effect role belongs to the Rust rendering stack.

## Decisions

- **2026-07-02 — TS-leads. `crate: null` (browser-API-bound).**
- **2026-07-31 — Capability is binary and source-derived.** Real runner↔registrar pairs ship; absent
  implementations have no runner, registrar, apply surface, or stub module.
- **2026-07-31 — Lane placement is tracked, not hard-coded.** `reachability:check` reports baseline drift
  without failing; `reachability:baseline` deliberately accepts reviewed moves.

## Open directions

1. `CanvasRenderEffectSupport` remains a type without a runtime support-map API. Retire the stranded type,
   or define a real consumer-driven query only if the support matrix and registry explanation are
   insufficient.
2. Add new Canvas kinds only when a tested implementation exists; landing a stub to preserve taxonomy
   symmetry is explicitly out of doctrine.
3. Decide whether approximate but parameter-responsive Canvas recipes belong in the binary realized set,
   and define the fidelity evidence required before registering one.
