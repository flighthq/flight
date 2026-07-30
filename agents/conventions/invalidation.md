# Invalidation and Mutation Visibility

_Settled with the user 2026-07-30. How a mutation becomes visible to rendering, bounds, and caches —
and when a `set*` function may exist. Read before adding a setter, an `invalidate*` call, a
`version` field, or when debugging "I changed it and nothing happened."_

## The doctrine: identities are compared, payloads are versioned, intermediate renders are invalidated

Three tiers, chosen by mechanism — not by package or by field name:

1. **Identity is compared.** A reference-shaped field is re-read or identity-compared by its
   consumers, at seams that are already kind-dispatched or pull-based. `sprite.data.texture` is the
   model: all four backend sprite renderers read the field per draw and resolve through the texture
   resolver, so bare assignment is the whole API — no invalidation call exists for it. Detection
   NEVER branches the generic walk: it lives in the kind's renderer (read per draw), the kind's
   runtime compute methods (compare-on-read, e.g. a bounds compute stamping the ref it derived
   from), or a per-node stamp scoped to nodes under an active render cache. The bundle invariant
   holds because only the kind's own code knows what to compare.
2. **Payloads are versioned.** A resource whose bytes can mutate in place carries `version`;
   mutating bumps it. Resolver and cache layers compare versions. Resource-side versioning has a
   property node-side invalidation cannot have: **fan-out** — twenty sprites sharing one texture all
   see one bump; no caller has to enumerate referencing nodes.

   **The `invalidate<Type>` verb family, and its membership test:** a public verb exists exactly
   where the payload can mutate through a channel Flight does not mediate — raw typed arrays
   (`Bitmap.data`, `VoxelGrid.data`, `MeshGeometry.vertices`) or borrowed host handles (a canvas
   drawn into, a video advancing). Where mutation flows only through Flight's own ops, the ops bump
   internally (clip ops, mesh transforms) and the public verb is the escape hatch for the direct
   channel, not a required call after every op. Members: `invalidateBitmap`,
   `invalidateImageResource`, `invalidateClipRegion` (all pre-existing), `invalidateTexture`,
   `invalidateMeshGeometry`, `invalidateVoxelGrid`. A versioned resource without its verb is a gap:
   direct writes are a designed channel (hot deform loops), and without the verb a direct write has
   no way to become visible. Kinds with per-node non-shared payloads (shape command lists) do not
   version — they are tier 3.

3. **Intermediate renders are invalidated.** Kinds that rasterize their own payload (text labels,
   scale-9 shapes) hold an expensive per-node derived artifact. `invalidateNodeLocalContent` is the
   **input-dirty signal**: "the rasterizable payload changed — re-produce the intermediate render."
   The name is held deliberately — it invalidates an intermediate render, and it sits in the
   `localContent` / `localBounds` / `localTransform` axis family. Whether the artifact is a
   Surface-backed `Texture` or a direct hardware texture is internal implementation, viable to
   change without touching this contract. (Follow-on, sequenced after texture M3–M5: migrate
   rasterizing renderer data onto the modeled texture path so tier-3 outputs ride tier-2 semantics —
   the producer draws, then bumps.)

## Transforms recompute by default

The default render policy recomputes transforms every frame in the walk. Consequences, all
deliberate: bare `.x`/`.y` assignment is the complete API; no invalidation is required for motion; a
naive first sample works with zero invalidation knowledge; and the cost is a flat, predictable
per-frame walk rather than data-dependent dirty spikes. Dirty-tracked transforms are the **opt-in**
policy for mostly-static scenes — transform invalidation calls bind only under that policy.

## Setters

A `set*` export earns existence only when the caller could not trivially have written its body:
real computation (`setTextureUvFromPixelRect`), packing (`setQuadBatchInstanceColorTransform`), or
an equality short-circuit protecting an expensive tier-3 re-raster (the text setters). Assignment
plus invalidation alone does not qualify — fields are bare and the caller invalidates (tier 3), or
nothing is needed at all (tiers 1–2). `setSpriteTexture` is removed under this rule: no sprite
backend reads the content revision it bumped, and assignment is auto-detected. Setters are never
gates — data fields stay public and assignable; a setter is a named carrier of non-trivial work.

## Guards are the footgun answer

Every mandatory pairing — mutate→invalidate (tier 3), kind→register-resolver, scene→prepare,
acquire→release — gets a shakeable `enable*Guards` warning that names the forgotten half, plus an
`explain*` query, per the [diagnostics](diagnostics.md) inversion rule. The pit-of-success
mechanism is a guard that teaches at the moment of failure, never hidden machinery that removes the
explicit call.
