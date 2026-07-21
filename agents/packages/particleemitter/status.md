---
package: '@flighthq/particleemitter'
updated: 2026-07-21
---

# particleemitter — Status

## 2026-07-21 — live-tree reconciliation

Extraction and the unified 2D/3D package are complete. The live package has explicit 2D and 3D emit/update/step/prewarm operations; `ParticleEmitter3D` carries z-aware state/spawn/bounds and is rendered as instanced billboards by both scene backends. Remaining depth is recorded in `review.md`/`assessment.md`: true 3D force/collision passes (the current step reuses 2D through a cast), sort-index consumption, additional render modes, and behavior-level raster functionals.

New package, blessed during particles direction session (2026-07-02). Source currently in `packages/particles/src/`. Awaiting direction session for extraction.
