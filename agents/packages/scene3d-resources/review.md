---
package: '@flighthq/scene3d-resources'
status: solid
score: 84
updated: 2026-08-25
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene-resources — Review

## Verdict

> **2026-08-25 fast assessment:** score updated from API export surface (`npm run api`) and commit/line volume since prior review. Verdict prose unchanged — a full re-review should verify the detail sections.


**Solid — 76/100.** The package has clear CPU-document, instantiated-graph, decoded-resource, and
renderer/GPU boundaries. It provides format-neutral URL document acquisition, a caller-composable
resolver with bounded concurrency and cancellation, shared-reference deduplication, explicit eager or
streaming policy, retry/explanation/guard atoms, opt-in availability and progress signals, and no backend
dependency. Remaining depth is residency/eviction, Extended PBR texture discovery, and behavioral raster
proof rather than another larger loader.

## What is solid

- `parse*` and `create*` remain synchronous in `scene-formats`. `loadScene3DDocumentFrom*Url` names both
  asynchronous source and CPU result, returns `Scene3DDocument | null`, forwards abort/per-source byte
  progress, and never resolves images or touches rendering.
- glTF URL acquisition fetches the main JSON plus every external `.bin` needed for inline geometry;
  external image refs retain the model base path. Other URL format loaders likewise carry their base path.
- `resolveScene3DResources` is the synchronous working-set reconciliation atom;
  `updateScene3DResourceStreaming` is the explicit progressive streaming pass.
  `loadScene3DResources` is its deterministic Promise composition, reports unique-reference progress, and
  resolves when selected refs are terminal. Resolver failure signals retain per-resource errors.
- `createSceneResourceResolver` is empty; `createBuiltInSceneResourceResolver` is the explicit Standard
  PBR + Unlit assembly. Root bundle proof keeps built-ins out of the primitive.
- Resolution keys by `ImageResourceReference`, fans one decoded image to independently sampled textures,
  cancels only after the final subscriber leaves, retains failure causes, and supports reset/retry/explain.
- Public resolver/registry/signal shapes are Entity-backed with private runtime state. No GL/WGPU package,
  shader registration, RenderState, GPU upload, or scene draw is reachable from loading.

## Remaining depth

- Extended PBR texture discovery needs the directed nested extension-kind registry and separately imported
  extension listers; specular-glossiness remains an explicit policy choice.
- Resource residency needs URI/content identity, reference-counted release, budgets/eviction, progressive
  mip replacement, and visibility-driven desired residency composed with assets/texture-formats.
- Add browser captures for every imported format, shared/multi-map resolution, cancellation/re-entry,
  reveal-after-all-required-resources, and failed-resource fallback.
- The low-level document loaders expose transport progress but no separately imported diagnostic guard for
  distinguishing transport, malformed source, and missing dependency beyond the null sentinel.

## Boundary conclusion

Scene loading populates CPU graph/material/resource descriptors only. Image decoding is a separate explicit
resource load. Renderer registration and GPU realization belong exclusively to backend setup and draw-time
state. No `loadSceneFrom*` convenience may silently cross those boundaries.
