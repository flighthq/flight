---
package: '@flighthq/scene-resources'
status: solid
score: 76
updated: 2026-07-22
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene-resources — Review

## Verdict

**Solid — 76/100.** The package has clear CPU-document, instantiated-graph, decoded-resource, and
renderer/GPU boundaries. It provides format-neutral URL document acquisition, a caller-composable
resolver with bounded concurrency and cancellation, shared-reference deduplication, explicit eager or
streaming policy, retry/explanation/guard atoms, opt-in availability and progress signals, and no backend
dependency. Remaining depth is residency/eviction, Extended PBR texture discovery, and behavioral raster
proof rather than another larger loader.

## What is solid

- `parse*` and `create*` remain synchronous in `scene-formats`. `loadSceneDocumentFrom*Url` names both
  asynchronous source and CPU result, returns `SceneDocument | null`, forwards abort/per-source byte
  progress, and never resolves images or touches rendering.
- glTF URL acquisition fetches the main JSON plus every external `.bin` needed for inline geometry;
  external image refs retain the model base path. Other URL format loaders likewise carry their base path.
- `resolveSceneResources` remains the synchronous working-set reconciliation/streaming atom.
  `loadSceneResources` is its deterministic Promise composition, reports unique-reference progress, and
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
