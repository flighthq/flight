---
package: '@flighthq/texture'
updated: 2026-06-24
basedOn: ./review.md
---

# texture — Assessment

Sorted from `review.md` (score `solid — 74`), absorbing the prior `reviews/maturation/depth/texture.md` roadmap (its Bronze items already landed in the builder pass; the residue is the Silver/Gold work, most of which is a cross-package design gate). The charter is a stub — North star, Boundaries, and Decisions are all `TODO` — so the kind taxonomy (2D-array / 3D / usage), the format/mip/version policy, and the `*Kind` consumers are all open design questions, which keeps `Recommended` deliberately small: only the genuinely within-package, decision-free items qualify. Every structural fork the review raises (the descriptor-ahead-of-consumer question, the renderer cache contract, the `*Kind` consumer story, the `texture-formats` neighbor) is routed to the charter's Open directions, not into `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/texture`, no cross-package coupling, no breaking change, no open design decision.

- **Drop the unused `@flighthq/resources` dependency from `package.json`.** No source file imports `@flighthq/resources` — `ImageResource` is a type from `@flighthq/types`, and a full `grep` over `packages/texture/src/` finds zero references. The dependency inflates the graph and would be flagged by `npm run packages:check`'s workspace-dependency conventions. A pure manifest edit; re-run `packages:check` after. — review.md (Contract & docs fit, defect 1).

- **Complete the uv-transform helper set: `getTextureInverseUvMatrix`, `transformTextureUv(out, texture, u, v)`, `resetTextureUvTransform(texture)`.** The compose path (`getTextureUvMatrix`) and the setters exist; these three finish the operating set over the stored KHR_texture_transform model. Pure in-package math over `@flighthq/geometry` `Matrix3`, no design gate (the status explicitly notes they "can be added in a follow-up without any design decisions"). Out-param / alias-safe like `getTextureUvMatrix`; add a colocated test per export (`exports:check`) and re-run `order:fix` so the new exports stay alphabetized and the `texture.test.ts` `describe` blocks mirror them. — review.md (Gaps: "uv-transform set is incomplete"); maturation Gold ("uv-transform completeness").

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **`Texture2DArray` descriptor kind** (`createTexture2DArray`/`clone`/`copy`/`equals`/`setLayer`/ `isComplete`, `Texture2DArrayKind`). A contained leaf the same shape as `CubeTexture`. **Parked:** its value is only realized once `render-gl`/`render-wgpu` upload array layers — whether to land the descriptor ahead of the consumer or jointly is a design decision (review Gaps; maturation Silver). Routed to Open directions.

- **`Texture3D` / volume descriptor kind + `TextureUsage` intent + `TextureSwizzle`.** **Parked:** these cross most deeply into the renderer/material layer — `TextureUsage` ('sampled'/'render-target'/ 'storage') touches the render-into-a-texture pipeline and must be designed _with_ the render-target work in `render-wgpu`/`scene-*`. Cross-package joint design (review Gaps; maturation Gold). Routed to Open directions.

- **Descriptor-level `format: PixelFormat | null` + `TextureMipPolicy` ('none'/'auto'/'manual').** **Parked:** a cross-package design gate — the GPU-upload caches in `render-gl`/`render-wgpu` must agree on what `mipPolicy` and `format` mean before the field shape on the `Texture` interface is committed. Types-first change in `@flighthq/types` once the contract is settled (review Gaps; maturation Silver; status "deferred items"). Routed to Open directions.

- **Per-binding `version: number` + `invalidateTexture`/`invalidateCubeTexture` bump helpers.** Mechanically simple, mirrors the established `ImageResource.version` convention. **Parked:** the field only earns its place once the renderers are written to _consume_ `texture.version` for upload-cache invalidation — a cross-package design dependency (review Gaps; maturation Silver; status "deferred items"). Routed to Open directions.

- **Make texture entities kind-bearing / find consumers for `TextureKind`/`SamplerKind`/`CubeTextureKind`.** The constants are defined in `@flighthq/types` but referenced nowhere. **Parked:** whether texture descriptors register renderers or round-trip in a serialized scene (the reason a kind exists) is an architecture decision spanning `render` and the scene-serialization path, not a within-`texture` sweep (review Gaps; Contract & docs fit, defect 2). Routed to Open directions.

- **`@flighthq/texture-formats` neighbor (KTX2 / Basis container parsers).** **Parked:** blocked on the `ImageResource.compressed` slot, explicitly deferred at the `@flighthq/types` level today. New triad cell under the plurality guard; do not start until the upstream types decision lands (review Gaps; maturation Gold; status "deferred items"). Routed to Open directions.

- **Rust-port parity for the ~15 new TS additions** (`equals_texture`, `get_texture_uv_matrix`, the uv setters, `copy_cube_texture`, `set_cube_texture_face` + `CUBE_FACE_*`, the presets, the `*Kind` mirrors). **Parked:** the conformance map / `crates/flighthq-texture` live in the Rust worktree, not this package — out of a within-package TS sweep. Track via the conformance-map entry (status "Gold — Rust parity"). Routed to Open directions (parity scope).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these as candidate Open directions; the assessment confirms they are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar (likely: the portable GPU-agnostic plain-data _description_ of a texture binding — descriptor intent only, zero GPU handles, zero pixel ops).
2. **Kind taxonomy** — bless the canonical 2D / 2D-array / 3D / cube quartet as in-scope, and decide descriptor-ahead-of-consumer vs jointly-with-the-renderer for the array/volume kinds.
3. **Format / usage / mip policy** — whether `texture` owns `format`/`TextureMipPolicy`/`TextureUsage`, and the cross-package contract with `render-gl`/`render-wgpu`/`scene-*` on their semantics.
4. **Per-binding dirty/version signal** — `version` + `invalidate*` mirroring `ImageResource.version`, gated on the renderers consuming it.
5. **`*Kind` consumers** — do texture entities become kind-bearing descriptors (renderer registration / serialized-scene round-trip), or do the `*Kind` constants stay forward declarations?
6. **`texture-formats` neighbor** — approve/deny, gated on the deferred `ImageResource.compressed` decision.
7. **Rust parity scope** — confirm the conformance-map entry tracks every new TS addition so the port does not drift.
