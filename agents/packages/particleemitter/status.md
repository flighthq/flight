---
package: '@flighthq/particleemitter'
updated: 2026-08-08
by: principal
---

# particleemitter — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/particleemitter/src/` on 2026-08-08. This cell is
the display node; the headless simulation is `@flighthq/particles` and its gaps belong to that cell.

- **3D forces and collisions run through a 2D cast and ignore z.** `stepParticleEmitter3D` casts the
  emitter to `ParticleEmitter2D` before calling `applyParticleForces` / `applyParticleCollisions`
  (`stepParticleEmitter3D.ts:25`), because those are typed against the 2D emitter and touch only the
  shared `emitter.data`. `updateParticleEmitter3D` itself is genuinely z-aware — it integrates
  `config.gravityZ` and `positionsZ` (`updateParticleEmitter3D.ts:74`, `:73`) — so the asymmetry is
  confined to the force/collider passes, which have no z axis to act on.
- **`sortParticleEmitter3DIndicesByViewDepth` has no consumer.** It is exported
  (`particleEmitter3D.ts:306`) and re-exported through `index.ts`, but a repo-wide search finds zero
  callers outside this package's own tests. Both 3D backends draw in buffer order.
- **There is no DOM renderer for `ParticleEmitter2D`.** Canvas, WebGL, and WebGPU each carry one
  (`scene2d-canvas/src/canvasParticleEmitter2D.ts`, `scene2d-gl/src/glParticleEmitter2D.ts`,
  `scene2d-wgpu/src/wgpuParticleEmitter2D.ts`); `packages/scene2d-dom/src/` mentions the kind nowhere.
- **There is no render-mode concept anywhere in the SDK.** No `renderMode` field exists on the emitter
  config in `@flighthq/types`, so the 3D path is camera-facing billboards only
  (`scene3d-gl/src/glParticleEmitter3D.ts:304`, `scene3d-wgpu/src/wgpuParticleEmitter3D.ts:38`) with
  no stretched, horizontal, or mesh alternative to select.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified every Open item against source and converted to the Open + Log
  contract. All four still hold and each gained a file:line; the 2026-07-21 claims about explicit
  2D/3D emit/update/step/prewarm operations and instanced-billboard rendering on both 3D backends also
  checked out and were dropped as settled rather than open. No code changed.
- **2026-07-21** — Live-tree reconciliation: extraction and the unified 2D/3D package are complete,
  with `ParticleEmitter3D` carrying z-aware state, spawn, and bounds.
- **2026-07-02** — New package blessed during the particles direction session, source still in
  `packages/particles/src/` at the time and awaiting extraction.
