---
package: '@flighthq/resources'
crate: flighthq-resources
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# resources — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Resource primitives and loading — backend-agnostic descriptors and loaders for the asset types a graphics SDK consumes: images, fonts, audio, video, texture atlases, and tilesets. Each asset type is a plain data descriptor (an `*Resource` value plus its `*Like` input) defined in `@flighthq/types` and constructed/loaded here; the package owns the descriptor + the URL/Blob/Base64/ArrayBuffer loaders, not the GPU upload or the playback.

Where it ends vs. neighbors: `resources` produces and holds the descriptor; it does **not** own the GPU texture (render-state-owned, per the `getImageResourceByteSize` doc), the playback channel (`@flighthq/media`), the batch loading queue (`@flighthq/loader`), or the atlas-file _parsing_ codec — which the `resource-formats` neighbor began carving out and the register has redirected toward `textureatlas-formats`. The package is, today, the fused data-primitive layer of six subjects (image / audio / video / font / textureatlas / tileset); whether that fusion is its durable shape is the dominant open question below.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks — proposed, not blessed._

1. **Descriptors are plain data; the package never hides work.** A resource is a value with explicit fields, constructed by a named `create*`/`load*` and torn down by the correct teardown verb. No wrapper objects with implicit runtime behavior, no eager GPU upload, no hidden caching. The caller sees where allocation and I/O happen.
2. **Allocation and teardown verbs are exact.** `create*`/`clone*`/`load*From*` allocate; the out-into-existing `load*Resource*` variants write into a caller-owned target. `dispose*` releases refs to GC (and says, in its doc, precisely what it does and does not free — e.g. it does _not_ free the GPU texture or close an owned `ImageBitmap`); `destroy*` would be reserved for a non-GC resource this package owned outright. (See open direction 7 on the out-first `load*Resource*` asymmetry.)
3. **Types-first, one concept per file.** Every cross-package shape (`*Resource`, `TextureAtlasRegion`, `Tileset`, `TextureAtlasFormatKind`) lives in `@flighthq/types` with the entity/`*Like` split and per-field docs; the implementation imports them. The header is the design surface.
4. **Sentinels for expected failure, no error-wrapping.** Lookups return `null`; degenerate math (UV over non-positive dims) zero-fills rather than throwing. Throwing is reserved for API misuse. (Open direction 6 questions whether fire-and-forget `create*From*` failure should become _observable_ rather than silently swallowed.)
5. **AAA breadth per subject, bounded by tree-shaking.** Each asset subject should reach what a mature asset library offers — multi-page atlases, frame-tag animation metadata, per-tile metadata, compressed-texture transcode — but every such addition is weighed against the bundle invariant (`npm run size`), so importing one small loader never pulls in a transcoder.

## Boundaries (proposed)

**In scope (proposed):**

- Backend-agnostic `*Resource` descriptors and their `*Like` inputs for image, font, audio, video, texture atlas, and tileset.
- Loaders from URL / Blob / Base64 / ArrayBuffer, `AbortSignal`-threaded, plus MIME/`canPlayType` source selection and same-origin detection.
- Texture-atlas region API (add/set/lookup-by-id/-by-name, name-prefix sequence collection, normalized UV into `out`) and tileset grid region building.

**Non-goals (proposed):**

- GPU texture allocation/upload (render-state-owned).
- Playback (`@flighthq/media`) and batch-queue orchestration (`@flighthq/loader`).
- Atlas/tileset _file-format parsing_ as a codec — that is the `-formats` layer (the subject triad's registry-dispatched codec), pending the extraction in open direction 1.
- _(Provisional — depends on open direction 2.)_ A resource cache / content-addressed dedup registry, if that ownership lands in `@flighthq/loader` rather than here.

## Decisions

None blessed yet.

## Open directions

Every candidate question from the review, plus the SDK-wide structural forks that touch this package. These are the real questions for the direction session — an agent **asks** here rather than assumes.

1. **The package's own shape — dissolve into per-subject triads? (dominant question; structural fork E / the subject triad / grab-bag rule.)** The register records a standing decomposition direction: `resources` fuses the data-primitive layer of six subjects (image / audio / video / font / textureatlas / tileset) and should dissolve into per-subject triads, with the `resource-formats` redirect verdict noting the duplication is a _symptom_ of `TextureAtlas` being mis-homed here. Maturing `resources` _as a grab-bag_ and dissolving it are opposite directions. The charter must take a position: durable grab-bag, or staging area to be decomposed? Every gap below lands in a different subject home depending on the answer, so settling this first is cheapest.
2. **Cache ownership: `resources` vs. `loader`.** Does URL-keyed dedup / content-addressing live here (available to standalone loaders) or in `@flighthq/loader` (lifecycle-tied to the batch queue)? Blocks both the resource-cache gap and the loader-signal work.
3. **Atlas page model.** Is single-page `image: ImageResource | null` the permanent shape, or is multi-page (`pages: ImageResource[]` + per-region `page`) in scope? Ripples into `sprite`, `spritesheet`, and the renderers (cross-package).
4. **Animation-metadata home.** Should parsed frame-tags become a first-class `animations: TextureAtlasAnimation[]` on `TextureAtlas`, or stay the `getTextureAtlasRegionSequence` name-prefix convention? Couples to whether atlas data stays in `resources` (direction 1).
5. **Per-tile metadata + tilemap-layer ingestion.** Should `Tileset` carry `tiles: TilesetTile[]` (id / properties / animation / collision) to make `.tmx`/`.tmj` ingestion reachable, and where does the tilemap-layer parsing live (here vs. a `-formats` neighbor)?
6. **Fire-and-forget failure semantics.** Is `createAudioResourceFromUrl`'s silent `.catch(() => {})` (returns a silently-empty resource) the intended contract for the non-`load` constructors, or should failure be observable via a signal/sentinel? (The `load*` async variants already surface rejection; the split may be defensible — needs a ruling.)
7. **Out-first, async `load*FontResource*` asymmetry.** `loadFontResourceFromUrl(out, url)` places the mutable target _first_ (against the out-last convention) and is the only `load*` family that mutates in place rather than allocating. Align the ordering, or reconsider whether the out-into-existing variant should exist alongside the allocating `loadFontFrom*` at all.
8. **Compressed-texture scope and the bundle gate (structural fork: bundle invariant + wasm-mixing seam D).** Are KTX2 / Basis / DDS + a transcoder backend in scope? If so, the `npm run size` discipline that keeps the transcoder wasm off the default bundle is part of the design, and the transcode seam is a `-backend` candidate.
9. **Loader-signal opt-in.** `enableResourceLoaderSignals` is gestured at on the `ResourceLoader` type but unwired. Should progress/error notification live in this package (opt-in `enable*`), and does it belong here or with the cache/loader ownership decision (direction 2)?
10. **Rust mirror existence (structural fork: the crate-existence rule / conformance map).** The front matter declares `crate: flighthq-resources`. Given the dissolution direction (1), whether a single `flighthq-resources` crate should exist at all — vs. per-subject crates — is itself an open question the conformance map must record.
