---
package: '@flighthq/scene-resources'
updated: 2026-07-22
basedOn: ./review.md
---

# scene-resources — Assessment

See [charter](./charter.md) for blessed direction.

## Directed

1. **Make every `create*` result an Entity.** Move the public resolver/registry/signal shapes to the
   header layer where appropriate and construct them through `createEntity`; keep in-flight request
   records private implementation data.
2. **Compose Extended PBR texture discovery through a nested extension-kind registry.** Keep one generic
   Extended PBR material lister, then dispatch each descriptor to a separately imported
   PbrExtension.kind texture lister. Do not register multiple listers under the one material kind, add
   registerAll, or make the base resolver depend on every extension texture slot.

## Recommended

1. **Reveal an owner only after its required resource set settles.** Track a pending count per node so
   the first resolved texture cannot expose a partially realized material; cover shared textures,
   multi-material nodes, failure policy, and cancellation in tests.
2. **Separate the empty resolver primitive from the built-in assembly.** Stop the base constructor from
   silently registering Standard PBR and Unlit. Give the preconfigured convenience an explicit name so
   its bundle cost and behavior are discernible.
3. **Hide `SceneResourceInFlight`.** It is documented as internal and should not be re-exported as public
   API shape.

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
