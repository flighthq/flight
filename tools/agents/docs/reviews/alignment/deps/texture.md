# Dependency Alignment: @flighthq/texture

**Verdict:** Clean except for one phantom dependency — `@flighthq/resources` is declared but never imported; drop it to match the sibling 3D value crates (`camera`, `lighting`) at `entity`/`geometry`/`types`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/resources` | Declared in `dependencies` but never imported anywhere in `src/`. The only resources-adjacent symbol used is the **type** `ImageResource`, which is owned by `@flighthq/types` (`packages/types/src/ImageResource.ts`) and already imported `import type` from there. `@flighthq/resources` is a runtime package (image loading, atlases) the texture crate never touches. | Remove `@flighthq/resources` from `package.json` dependencies. |
| Info | `@flighthq/types` | Type-only consumer (`Texture`, `TextureLike`, `Sampler`, `SamplerLike`, `CubeTexture`, `CubeTextureLike`, `ImageResource`), all via `import type`. Correct: header layer, no runtime weight. No fix. | — |
| Info | `@flighthq/entity`, `@flighthq/geometry` | Genuine runtime use: `createEntity` (entity) and `createVector2`/`cloneVector2`/`copyVector2` (geometry). Both pinned `"*"`. No fix. | — |

Checklist items with no issues: no `@flighthq/sdk` import; no inline cross-package types (all type contracts come from `@flighthq/types`); workspace deps pinned `"*"`; `"sideEffects": false`; type deps use `import type` and pull no runtime weight; layering is respected (a leaf value crate depending only down on the header + entity/geometry primitives — no boundary or "reaching up" edges).

## Declared vs used

- **Unused (phantom):** `@flighthq/resources` — declared, zero imports in `src/`.
- **Phantom (used-but-undeclared):** none. `entity`, `geometry`, `types` are all both used and declared.
- **Mapping read:** With `resources` removed, the dep set (`entity`, `geometry`, `types`) is exactly predictable from the package's purpose (value-typed texture/sampler/cube entities over the type header) and identical to peer 3D value crates `camera` and `lighting`. The current `resources` edge is the one surprising entry — it suggests image loading/atlas coupling that does not exist.
