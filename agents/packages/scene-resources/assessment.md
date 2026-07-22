---
package: '@flighthq/scene-resources'
updated: 2026-07-22
basedOn: ./review.md
---

# scene-resources — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Compose Extended PBR texture discovery through a nested extension-kind registry.** Keep one generic
   Extended PBR material lister, then dispatch each descriptor to a separately imported
   PbrExtension.kind texture lister. Do not register multiple listers under the one material kind, add
   registerAll, or make the base resolver depend on every extension texture slot.

## Recommended

1. **Return a distinguishable sentinel on document fetch failure.** On any transport/HTTP failure every
   `load*` (`loadGltf`, …) returns `allocateEmptySceneDocument()` (all tables present, empty) and pushes
   an English string into the optional `warnings?: string[]`, so a fetch failure is indistinguishable
   from a genuinely empty scene unless the caller opts to inspect `warnings`. Per the sentinel rule, an
   expected failure should be a first-class sentinel: return `SceneDocument | null` (null on fetch
   failure), or at minimum document that empty-doc-plus-warning is the failure signal.
2. **Fix the stale reveal comment.** `revealSceneResourcesOnResolve.ts` has a trailing doc line stating
   "an object with several pending textures fades in when the first of them resolves," which contradicts
   the head of the same comment and the implementation (reveal fires only once `owner.pending.size === 0`).
   Leftover from the pre-`88d31985` fade-on-first behavior; correct it to say the owner reveals only after
   all its required textures settle.
3. **Converge the two diagnostics idioms in this layer.** The resolver's own failure path is exemplary
   (structured `ImageResourceFailure` + `explainImageResourceReferenceResolution` +
   `enableSceneResourceFailureGuards` through `@flighthq/log`), but the `load*`/document side reports
   through a raw-string `warnings` out-array — two idioms for the same package. The modern
   inversion-rule pattern already exists here; the document loaders are the place to converge on it (see
   the sibling note added to `scene-formats`).

## Depth gaps

1. **Add residency rather than a larger resolver.** URI/content dedup, reference-counted release,
   memory budgets, eviction, progressive mip/quality replacement, and cancellation on visibility loss
   should compose assets/texture-formats with the current resolution state machine.
2. **Prove resource realization behaviorally.** Add GL captures for every supported scene format,
   multi-map reveal, shared URI dedup, cancellation/re-entry, and failure fallback.
3. **Discover specular-glossiness textures through an opt-in lister.** A separately imported
   `SpecularGlossinessPbrMaterial` lister must enumerate diffuse, packed specular-glossiness, normal,
   occlusion, and emissive slots so declared resources resolve before reveal. Keep the empty resolver
   empty and preserve the named built-in assembly's tree-shaking contract; including this legacy workflow
   in that assembly must be an explicit policy choice rather than an accidental dependency of Standard
   PBR.

## Backlog

- General 2D bitmap-resource reuse remains a package-direction decision.
- WGPU behavior follows only after the GL resource/material contracts settle.

## Approved

- [2026-07-22 · completed] Every image reference retains a serialization-safe terminal failure cause;
  abort remains cancellation rather than failure. `explainImageResourceReferenceResolution` returns a
  detached plain-data account, `resetFailedImageResourceReference` is the single-reference atom, and
  `retryFailedSceneResources` composes reset with the normal selection/priority resolver pass while
  deduplicating shared identities. The separately imported, resolver-scoped failure guard is
  idempotent/queryable/removable, warns once per failed attempt through `@flighthq/log`, names the exact
  retry call, and remains absent from the base resolver bundle by direct bundle proof.
- [2026-07-22 · completed] Resolution is keyed by ImageResourceReference identity, not Texture.
  Independently sampled Texture subscribers share one fetch/decode, receive the same ImageResource,
  retain their own sampler/color/UV state, and may leave a working set without aborting a load another
  subscriber still needs. A later subscriber binds from the resolver's settled cache without new I/O.
- [2026-07-22 · completed] Reveal waits for every pending Texture required by an owner rather than the
  first terminal event. Repeated/shared texture slots are deduplicated per owner, every owner of a
  shared Texture is released together, failure explicitly counts as settled so fallback rendering is
  not hidden forever, cancellation remains pending until re-entry settles, and resources already bound
  or failed before subscription do not create an eventless hidden owner.
- [2026-07-22 · completed] The public resolver, material-texture registry, and signal group shapes live
  in `@flighthq/types` and every package `create*` result is an Entity. In-flight requests, the loader,
  settled-image retention, and optional signal storage are private resolver runtime data. The remaining
  structural allocations use truthful non-`create` vocabulary (`allocateEmptySceneDocument`), while the
  web fetch seam is a direct `fetchWebImageResource` function.
- [2026-07-22 · completed] `createSceneResourceResolver` is the empty primitive and
  `createBuiltInSceneResourceResolver` is the explicit Standard PBR + Unlit assembly. A root-bundle
  proof shows the primitive omits both built-in material listers and the named assembly includes them;
  no `registerAll` path was introduced.
