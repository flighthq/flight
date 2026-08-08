---
package: '@flighthq/scene2d-cairo'
role: package
crate: null
draft: true
lastDirection: null
downstream: flight-hx
---

# scene2d-cairo — Charter (DRAFT)

> **Built in `flight-hx`, not this monorepo.** No `packages/scene2d-cairo/` here, and none should be
> scaffolded. This cell records the name, the boundary, and what Flight owes it. The `downstream`
> marker keeps it out of the chartered-unbuilt queue and liveness checks. Unblessed.

## What it is

The Cairo 2D leaf renderers — the non-web sibling of `scene2d-canvas`, `scene2d-dom`, `scene2d-gl`,
and `scene2d-wgpu`. Registers concrete `Renderer` implementations against the 2D display-object
kinds (bitmap, shape, sprite, text, tilemap, particles) and draws them through `render-cairo`'s
state.

## Boundary

Exactly the split the four web leaf renderers already follow: `render-cairo` owns state, surfaces,
and shared draw plumbing; this package owns per-kind drawing and the `registerCairo*` doors. If a
capability belongs to every Cairo target rather than to one node kind, it belongs downstairs in
`render-cairo`.

## What Flight owes it

Nothing beyond what `render-cairo` needs. The registration contract it consumes —
`registerRenderer(state, Kind, renderer)`, the `Renderer` interface (`createData` / `submit`, with
`format` / `destroyData` / `isDirty` optional), and `prepareScene2DRender` — is already host-neutral
and unchanged. Masking resolves through `clip`/`path`, not a renderer member. The per-kind
`*Kind` identifiers are plain strings owned by the packages that define them, so they carry across
without a seam.

## Open

1. **Kind coverage is a scope decision for `flight-hx`.** The web backends do not all cover the same
   kinds (the DOM backend excludes batch kinds by design — see
   [registration model](../../registration-model.md)); Cairo will have its own honest subset. What
   it covers should be declared, not implied by what happens to be implemented.
2. **Support-matrix representation.** `agents/support-matrix.md` is generated from
   `functional/baselines/` by a browser-driven harness (`FUNCTIONAL_BACKENDS`,
   `SANDBOX_VERIFIABLE`). Cairo cannot run there, so it is deliberately absent — those lists are
   correctly scoped to backends this repo's harness can drive, and must not gain a token that would
   claim coverage no baseline supports. How a non-web backend reports support is unresolved.
