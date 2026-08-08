---
package: '@flighthq/render-cairo'
role: package
crate: null
draft: true
lastDirection: null
downstream: flight-hx
---

# render-cairo — Charter (DRAFT)

> **Built in `flight-hx`, not this monorepo.** There is no `packages/render-cairo/` here and one
> must not be scaffolded — an empty TS package for a backend that can hold no TypeScript is name
> reservation, not architecture. This cell exists so the **name, the boundary, and the seam Flight
> owes it** are recorded in the authoritative repo. The `downstream` marker keeps it out of the
> chartered-unbuilt build queue and the liveness checks. Unblessed: nothing here is authoritative
> until the user rules on it.

## What it is

The Cairo backend core — the non-web sibling of `render-gl` and `render-wgpu`. Owns the Cairo
`RenderState` subtype and the surface/context plumbing a Cairo target needs; the 2D leaf renderers
that draw through it are `scene2d-cairo`.

Cairo is reached through native bindings, so no part of this package can be written in TypeScript.
That is precisely why the implementation lives in `flight-hx` while the contract lives here.

## What Flight owes it

One seam, and it is the whole interface:

- **`CairoRenderState extends RenderState`** in `@flighthq/types`, carrying the Cairo surface and
  context handles — exactly as `CanvasRenderState`, `DomRenderState`, `GlRenderState`, and
  `WgpuRenderState` already do. Authored per the foreign-host rule in
  [export lanes](../../conventions/export-lanes.md#foreign-host-apis-flight-authors-the-seam-not-the-implementation):
  minimal by usage, dependency-free, written from the Cairo API rather than transcribed from
  anyone's bindings.

Nothing else. `@flighthq/render` was checked for host-neutrality (2026-08-07) and imports no web
types at all: `RenderState`, `Renderer`, `registerRenderer`, and `prepareScene2DRender` are all
abstract, and each backend supplies its own state subtype. A Cairo backend registers and renders
through the existing door unmodified.

## Open

1. **The seam is not written yet, deliberately.** Under the admission rule a seam lands when a
   chartered cell names its implementer — this cell now does — but the *shape* of
   `CairoRenderState` should come from what `flight-hx` actually needs, not from a guess made here.
   First real task: `flight-hx` proposes the minimal field set, Flight ratifies it into
   `@flighthq/types`.
2. **Backend token.** `Cairo` is the intended registrar prefix (`registerCairo*`), pairing with the
   `Canvas` / `Dom` / `Gl` / `Wgpu` family. `scripts/backendPrefix.ts` governs registrar naming for
   backends whose code is in this repo, so it gains `Cairo` when the seam types land here, not
   before — an inert token in a lint list governs nothing.
3. **Verification is downstream.** A Flight-owned seam is not checked against real Cairo (the same
   accepted trade as `ElectronApi`). Conformance testing belongs in `flight-hx`, where the real
   API exists.
