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

No open Recommended items.

## Depth gaps

1. **Add recovery and diagnostics.** Define retry/reset for `Failed`, preserve a failure cause as plain
   data, and expose a shakeable `explain*` query plus optional guard without throwing in the async path.
2. **Add residency rather than a larger resolver.** URI/content dedup, reference-counted release,
   memory budgets, eviction, progressive mip/quality replacement, and cancellation on visibility loss
   should compose assets/texture-formats with the current resolution state machine.
3. **Prove resource realization behaviorally.** Add GL captures for every supported scene format,
   multi-map reveal, shared URI dedup, cancellation/re-entry, and failure fallback.

## Backlog

- General 2D bitmap-resource reuse remains a package-direction decision.
- WGPU behavior follows only after the GL resource/material contracts settle.

## Approved

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
