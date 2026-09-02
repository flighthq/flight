---
package: '@flighthq/scene3d-resources'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene3d-resources -- Review

## Verdict

**Solid -- 80/100.** The package delivers a well-bounded resource-resolution seam for 3D scene
documents. It cleanly separates CPU document acquisition (`loadScene3DDocumentFrom*Url`),
synchronous working-set reconciliation (`resolveScene3DResources`), explicit progressive streaming
(`updateScene3DResourceStreaming`), and eager deterministic loading (`loadScene3DResources`). All six
scene formats have URL document loaders. The resolver, registry, and signal shapes are Entity-backed
with private runtime state, and no rendering/GPU dependency is reachable from any loading path. PBR
extension texture discovery uses a nested kind-dispatched registry with seven separately imported
extension listers. Tree-shaking is proven by esbuild bundle tests. 114 test cases across 27 colocated
test files cover the full exported surface. The remaining score gap is the absence of
`@flighthq/assets` composition (residency/eviction), progressive mip streaming, and behavioral raster
proof (GL/browser captures).

## Present capabilities

**Document acquisition.** Six format-specific URL loaders -- `loadScene3DDocumentFromGlbUrl`,
`loadScene3DDocumentFromGltfUrl`, `loadScene3DDocumentFromAwd2Url`, `loadScene3DDocumentFromObjUrl`,
`loadScene3DDocumentFromMd2Url`, `loadScene3DDocumentFromMd5MeshUrl` -- plus the legacy-format
`loadScene3DDocumentFrom3dsUrl`. Each returns `Scene3DDocument | null`, accepts an `AbortSignal` and
per-source byte progress, and never resolves images or touches renderer/GPU state. The glTF loader
fetches external `.bin` geometry buffers and carries the model base path onto unresolved image refs.
`setScene3DDocumentResourceBasePathFromUrl` retrofits base paths for formats that lack built-in
support. All loaders use `@flighthq/net` for transport -- the dependency is explicit in `package.json`
(`sceneDocumentSource.ts`).

**Synchronous reconciliation.** `resolveScene3DResources` groups selected textures by
`ImageResourceReference` identity, binds resolver-cached sources to subscribers, and returns a
`Scene3DResources` snapshot partitioned into `resolved` and `unresolved` groups. It performs no
acquisition -- purely synchronous. The `select` predicate narrows the working set
(`resolveScene3DResources.ts:56`).

**Streaming resolution.** `updateScene3DResourceStreaming` reconciles the working set, starts
acquisitions for unresolved refs via `@flighthq/loader` (bounded concurrency, streaming queue), and
cancels in-flight loads whose subscribers have left the working set
(`cancelDroppedResolutions`, `resolveScene3DResources.ts:109-128`). Cancellation aborts the per-ref
`AbortController` and reverts state to `Unresolved`. Re-entry re-requests from scratch.
`requestWorkingResolutions` queues each unresolved ref once, wires loader cancellation into the
per-texture controller, and uses an optional `priority` callback (`resolveScene3DResources.ts:218-225`).

**Eager loading.** `loadScene3DResources` composes `updateScene3DResourceStreaming` with
`Promise.allSettled`, reporting unique-reference progress via an opt-in `Signal` and resolving when
every selected ref has reached a terminal state. `waitForScene3DResourceResolver` awaits the
currently in-flight set without exposing resolver internals (`loadScene3DResources.ts:51-56`).

**Single-ref resolution.** `resolveOneScene3DResourceTexture` delegates to
`resolveImageResourceReference` from `@flighthq/image`, passing the resolver's `fetch` seam for
external refs and the per-ref `AbortSignal`.

**Shared-reference deduplication.** Resolution keys by `ImageResourceReference` identity, not by
`Texture`. Multiple `Texture` entities sharing one ref receive the same decoded `TextureSource`,
retain independent sampler/color/UV state, and cancellation waits until the final subscriber leaves
(`resolveScene3DResources.ts:116-119`). A later subscriber binds from the resolver's settled cache
without new I/O.

**Failure and recovery.** Failed refs retain a serialization-safe `ImageResourceFailure` (kind +
name + message). `retryFailedScene3DResources` resets failed identities once via
`resetFailedImageResourceReference`, then performs a streaming update under the caller's
selection/priority policy (`sceneResourceRecovery.ts:16-33`).
`explainImageResourceReferenceResolution` (from `@flighthq/image`) produces a plain-data diagnostic
account. `enableScene3DResourceFailureGuards` installs an opt-in, separately imported warning guard
that logs once per failed attempt through `@flighthq/log`, names the retry call, and is absent from
the base resolver bundle (verified by tree-shaking test).

**Opt-in signals.** `enableScene3DResourceSignals` lazily creates `onResourceResolved` and
`onResourceFailed` signals on the resolver's private runtime. `getScene3DResourceSignals` returns
them or `null` when never enabled. The signal group is Entity-backed and lives in this package, not
in `@flighthq/signals` -- matching the convention.

**Material texture registry.** `Scene3DMaterialTextureRegistry` is an open, Entity-backed,
kind-dispatched registry. `registerScene3DMaterialTextures` binds a lister for any `Kind`
(last-write-wins). `getScene3DMaterialTextures` appends non-null textures to an accumulating `out`
array. `hasScene3DMaterialTextureLister` distinguishes an unregistered kind from a material with no
maps -- the query `explainScene3DResourceCoverage` reports through.

**Built-in material families.** Three surface-material registrars --
`registerStandardPbrScene3DMaterialTextures`, `registerUnlitScene3DMaterialTextures`,
`registerExtendedPbrScene3DMaterialTextures` -- plus `registerShadedScene3DMaterialTextures` for the
legacy shading model. `createBuiltInScene3DResourceResolver` spells out the first three explicitly;
the shaded lister is a separate opt-in.

**PBR extension texture discovery.** `registerExtendedPbrScene3DMaterialTextures` dispatches to a
nested `extensionListers` registry by extension kind. Seven separately imported extension listers
are provided: anisotropy, clearcoat, iridescence, sheen, specular, transmission-volume, and
wrapped-diffuse. Each is a single function registering via `registerScene3DPbrExtensionTextures`.

**Reveal-on-resolve.** `revealScene3DResourcesOnResolve` composes `@flighthq/tween` and the
resolver's availability signals: it hides every mesh carrying pending textures to a configurable
`from` opacity, waits for all pending textures on each mesh to settle (failure counts as settled),
then fades the mesh's `node.alpha` to 1. Returns a disposer. An unlisted material kind contributes
no pending textures -- an all-unlisted mesh keeps its starting alpha. A mixed mesh can reveal when
only its listed textures settle, risking a later pop-in for the unlisted family (documented
behavior, tested at `revealScene3DResourcesOnResolve.test.ts:166-190`).

**Coverage explanation.** `explainScene3DResourceCoverage` reports every material kind in a
`Scene3DKindUsage` with its coverage status (`Satisfied`, `Unregistered`, `Unavailable`), naming the
registrar and module from a caller-supplied catalog when a remedy exists.
`hasScene3DResourceCoverage` is the fast boolean predicate.

**Resolver lifecycle.** `createScene3DResourceResolver` is the empty primitive;
`createBuiltInScene3DResourceResolver` is the named assembly. `disposeScene3DResourceResolver`
cancels/disposes the loader, aborts every in-flight controller, and clears both maps. The resolver
is an Entity with the fetch seam, registry, and private runtime keyed by
`Scene3DResourceResolverRuntimeKey`.

**Two-lane exports.** `index.ts` curates 30 named public exports; `contract.ts` re-exports the
full surface from all 26 source modules. `package.json` declares both `.` and `./contract` subpaths,
`"sideEffects": false`, and the correct dependency set.

**Type surface.** All types (`Scene3DResourceResolver`, `Scene3DMaterialTextureRegistry`,
`ImageResourceReference`, `ResourceResolutionState`, `Scene3DResourceSignals`, and supporting
interfaces) live in `@flighthq/types` -- no exported types are defined inline in this package.

**Tree-shaking proof.** `sceneResourceResolverTreeShaking.test.ts` bundles each export through
esbuild and asserts the primitive resolver excludes material listers and failure logging, while the
built-in assembly includes them.

## Gaps

1. **`@flighthq/assets` composition is absent.** The charter defers assets' refcount/unload to the
   progressive/streaming phase because embedded byte-refs have no ids. The streaming update has
   landed (`updateScene3DResourceStreaming`) but `assets` is not a dependency and no file imports it.
   Dedup is still by `ImageResourceReference` identity at the walk -- there is no URI-keyed
   lifecycle, reference-counted release, or eviction (status.md Open item 1).

2. **Phase 2 progressive mip streaming is absent.** No source mentions mip levels, low-res
   placeholders, or cross-fade between resolutions. The reveal recipe handles only a single
   transition from hidden to final (status.md Open item 2).

3. **No behavioral raster proof.** No GL/WGPU browser captures or functional test scenes exist in
   this package. Cross-format import, shared/multi-map resolution, cancellation/re-entry, and
   failed-resource fallback are exercised only through unit-level mocked tests, not through rendered
   output.

4. **Document loader failure diagnostics.** The `loadScene3DDocumentFrom*Url` family returns `null`
   on failure with no separately imported guard that distinguishes transport failure, malformed source,
   and missing dependency. The caller cannot tell _why_ a document load returned `null` without
   inspecting the net response externally.

5. **`getScene3DTextureResourceReference` is O(n) per texture.** The reverse lookup from texture to
   its owning `ImageResourceReference` iterates `scene.resources` linearly for each texture
   (`getScene3DResourceTextures.ts:28-36`). For scenes with many resources and textures, this
   quadratic cost could become visible, though it is unlikely to matter at current scale.

6. **`resolveGltfBufferUrl` duplicates `resolveImageResourceUri`.** The glTF buffer URL resolution
   in `gltfLoad.ts:87-90` reimplements the same absolute-URI check and basePath join as
   `resolveImageResourceUri` in `imageResourceFetch.ts:23-27`. Not a correctness issue but a
   maintenance concern.

## Charter contradictions

None found. The implementation aligns with every chartered decision:

- The sync-parse / async-resolve split is implemented as specified.
- `@flighthq/assets` is correctly deferred per Decision 2026-07-17.
- The reveal hook is composed from `tween`/`easing` driving `node.alpha`, not built into the
  resolver (Decision 2026-07-17, Open direction 2 resolved).
- `loadScene3DDocumentFrom*Url` naming with `Url` suffix matches Decision 2026-07-23.
- `resolveScene3DResources` is synchronous; `updateScene3DResourceStreaming` owns the progressive
  pass; `loadScene3DResources` is the eager boundary -- matching Decision 2026-07-29.
- The built-in assembly spells out its material families; the empty primitive stays independent
  (Decision 2026-07-17 DELIVERED).

## Contract and docs fit

- **Types home:** all exported types reside in `@flighthq/types/contract` -- `Scene3DResources.ts`
  and `ImageResourceReference.ts` carry the full surface. No inline type exports in this package.
- **Entity convention:** resolver, registry, and signal group are Entity-backed via `createEntity`.
- **sideEffects:** `false` in `package.json`; no top-level registration, timer, or mutation in any
  source module.
- **Naming:** exported functions use full unabbreviated type names (`Scene3DResource`, not `Res`).
  Function names are globally self-identifying.
- **Diagnostics:** failure guards are separately imported (`enableScene3DResourceFailureGuards`),
  emit through `@flighthq/log`, and are absent from the base resolver bundle. Coverage explanation
  returns plain data (`explainScene3DResourceCoverage`). Both match the inversion rule.
- **Signals convention:** `enableScene3DResourceSignals` lives in this package (the entity's owning
  package), not in `@flighthq/signals`. Idempotent, opt-in cost.
- **Readonly:** parameters consistently use `Readonly<T>` for scene, resolver, options, material,
  and ref inputs. Mutable outputs use accumulating `out` arrays.
- **Test coverage:** 27 colocated test files (one per source file, barring `index.ts`/`contract.ts`),
  114 test cases. `describe` blocks are alphabetized and mirror exported names. Tests use
  constructors (`createTexture`, `createScene3D`, `createMesh`) over literals.

## Candidate open directions

1. **Wire `@flighthq/assets` for URI-keyed lifecycle.** External refs carry natural ids; assets'
   refcount/unload and dedup infrastructure would give the streaming path release-on-unsubscribe and
   memory budgets.

2. **Progressive mip streaming (phase 2).** Placeholder to low-res to full with cross-fade, composed
   with `texture-formats` mip parsing and the assets residency layer.

3. **Consolidate URI resolution.** Deduplicate `resolveGltfBufferUrl` and `resolveImageResourceUri`
   into a single shared utility.

4. **Document load failure diagnostics.** Add a separately imported guard or explanation function
   that distinguishes transport, parse, and dependency failures for the `loadScene3DDocumentFrom*Url`
   family, rather than only the `null` sentinel.

5. **Behavioral raster proof.** Add functional test scenes that exercise format import, multi-map
   reveal, cancellation/re-entry, and failure fallback through rendered output across GL/WGPU
   backends.

6. **Specular-glossiness as an opt-in lister.** The assessment directs a separately imported
   `SpecularGlossinessPbrMaterial` lister (assessment Depth gap 3). No implementation exists yet.

7. **General 2D bitmap-resource reuse.** The descriptor and resolver are scene-domain today; a more
   neutral package name and 2D display-bitmap streaming remain an open direction (charter Open
   direction 1).
