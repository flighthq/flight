---
package: '@flighthq/scene-resources'
status: solid
score: 70
updated: 2026-07-21
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene-resources — Review

## Verdict

**Solid — 70/100.** The parse-now/resolve-later split is a sound primitive. The live package has an
explicit resolver, bounded concurrency, cancellation with stale-settle protection, caller-supplied
selection and priority, opt-in availability signals, an open material-texture registry, deterministic
wait helpers, and eager loaders for AWD, glTF/GLB, OBJ, 3DS, MD2, and MD5. Seventy-two unit tests cover
the core state machine and format wrappers. This is real infrastructure rather than a loader hidden in
each parser.

The remaining depth is concentrated at the seams: texture discovery does not yet compose with open
PBR extensions, the default resolver silently installs a closed built-in material set, reveal begins
when the first texture for a node resolves rather than when the node is ready, and there is no
residency/retry/explanation tier. Several public `create*` results are also structural literals rather
than Entities, contrary to the repository-wide constructor invariant.

## What is solid

- `resolveSceneResources` is an explicit, repeatable policy pass. `select` defines the working set,
  `priority` feeds the bounded loader, dropped work aborts and returns to `Unresolved`, and an identity
  check ignores late settlements from replaced requests.
- `resolveSceneResourcesAndWait` and the format loaders are compositions over the same primitive; the
  deterministic convenience does not fork a second resolution engine.
- `SceneMaterialTextureRegistry` is the right extensibility seam: texture enumeration is keyed by
  material kind, so custom material families can participate without reflection or a closed switch.
- Signals are opt-in and the reveal recipe is kept outside the resolver. That respects the distinction
  between reporting availability and animating a scene node.
- Resolution is renderer-independent and resource references remain plain parser output. No GL state
  or scene drawing is smuggled into the package.

## Correctness and contract gaps

- `revealSceneResourcesOnResolve` documents and implements fade-on-**first**-texture. A node with base
  color, normal, and metallic-roughness resources becomes visible as soon as any one resolves, exposing
  partial material state and later texture popping. The recipe needs a per-owner pending count and
  should reveal only when the owner's required set has settled under an explicit success/failure policy.
- `createSceneResourceResolver()` automatically calls `registerBuiltInSceneMaterialTextures`, while the
  registry comments call those listers opt-in. This makes the common constructor carry Standard PBR and
  Unlit knowledge and prevents a resolver import from being only the primitive. Provide an explicitly
  named default assembly and keep the bedrock resolver/registry empty unless the caller registers parts.
- Built-in discovery knows only Standard PBR and Unlit maps. ExtendedPbrMaterial cannot register each
  extension into the existing material-kind map: every contribution would use the same
  ExtendedPbrMaterialKind key and last-write-wins would discard the others. Add a nested
  PbrExtension.kind texture-lister registry; one generic Extended PBR material lister enumerates the
  standard maps, walks extensions, and delegates each descriptor to that nested registry. Each built-in
  extension lister stays a separate import; a registerAll helper would repeat the tree-shaking problem.
- A failed reference stays `Failed` with no retry/reset operation, failure reason, or shakeable
  `explain*` query. The signal exposes only `{ref, texture}`. Transient network/decode failure therefore
  has no first-class recovery or diagnostic path.
- Deduplication is by `Texture` identity only. Equivalent external URIs on separate Texture entities
  fetch/decode independently, and the resolver has no acquire/release, budget, eviction, or progressive
  mip policy. These belong to the planned residency/assets rung, not inside the current load state
  machine.
- `SceneResourceResolver`, `SceneMaterialTextureRegistry`, and `SceneResourceSignals` are public
  structures created as object literals. Their `create*` functions do not call `createEntity`, so they
  bypass internal shape/binding enforcement. Public API types are also declared in the implementation
  package rather than the `@flighthq/types` header.
- `SceneResourceInFlight` is exported from a root-exported module despite being described as internal.
  Its controller/key/promise shape is backend implementation state and should stay package-private.

## Evidence still missing

- No browser raster proves placeholder/reveal behavior across multiple textures, cancellation and
  re-entry, shared resources, or a failed resource.
- No end-to-end capture establishes that every supported format resolves its material maps into the
  same rendered result. Unit tests establish state transitions, not visible resource realization.
- The phase-two contract for low-resolution/mip progression, resource budgets, and eviction remains
  deliberately unimplemented.
