---
package: '@flighthq/scene2d-resources'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene2d-resources — Review

## Verdict

**Solid — 89/100.** The package implements the chartered renderer-neutral document and
content-reference boundary: an enumerable three-contract manifest (slots, image resources, audio
resources), synchronous reconciliation, operation-scoped asynchronous load for both pixels and
samples, caller-owned URL acquisition, and an empty-by-default importer registry. Since the prior
review, the audio resource lane and Rive importer adapter materialized as clean additions that
mirror the image lane's shape without introducing new patterns. All exported types live in
`@flighthq/types`, every exported function has a colocated test, the two-lane export structure
aligns with the SDK barrel and `/contract`, and no renderer or GPU dependency crosses the boundary.
The main shortfall is the absence of diagnostic seams — the 3D twin ships
`enableScene3DResourceFailureGuards` and `explainScene3DResourceCoverage`, while this package
exposes neither guard nor explain query for its sentinels.

## Present capabilities

- `Scene2DDocument` is static plain data: an unattached `Node2D` root, three enumerable sidecar
  arrays (`slots`, `imageResources`, `audioResources`), optional `backgroundColor` (packed RGBA),
  and `sourceKind`. References retain their direct target and installed content, so resolution
  neither walks names nor stores resource state on `Node2DRuntime`.
- `resolveScene2DResources` is strictly synchronous and operates only on the selected working set
  via an optional `select` predicate. Slot content comes from a caller-supplied
  `resolveSlotContent` callback. Stale managed content is cleared when a selected reference is
  unresolved; references outside the selected set are untouched.
- `loadScene2DImageResources` is the operation-scoped Promise/progress boundary for pixels. Each
  selected reference decodes once and fans the result into every `Texture` waiting on it via
  `setTextureSource`, so a bitmap placed a hundred times costs one decode. The default fetch seam
  returns null rather than demanding a callback a document with no external images cannot use.
  Progress is emitted per-reference through a signal.
- `loadScene2DAudioResources` mirrors the image lane exactly: operation-scoped, signal-based
  progress, caller-supplied `AudioContext` and `fetch` seam, embedded references decode in-place
  into the pre-existing `AudioResource` object, and external references route through the fetch
  seam. The default fetch rejects rather than requiring a callback.
- Managed slot replacement (`setScene2DSlotReferenceContent`) removes only the child owned by the
  reference, preserves authored siblings, and is idempotent when a later pass returns the same
  content.
- URL acquisition is a caller-supplied `Scene2DDocumentFetcher` and stops at `Scene2DDocument`.
  Format dispatch uses an Entity-backed, empty-by-default open registry with last-write-wins
  registration and explicit `unregisterScene2DDocumentImporter`. No codec registers at module load.
- Three built-in adapters are explicit opt-ins: SVG (`registerSvgScene2DDocumentImporter`), Lottie
  (`registerLottieScene2DDocumentImporter`), and Rive (`registerRiveScene2DDocumentImporter`). SVG
  and Lottie preserve the `null` sentinel when the underlying format importer rejects a malformed
  document. The Rive adapter carries embedded image bytes through as `ImageResourceReference`s with
  waiting textures already listed.
- External codecs (SWF via `@flighthq/swf`) import `registerScene2DDocumentImporter` from
  `./contract` and register through the same seam, confirming the open-registry boundary.
- Package declares `"sideEffects": false`. Source imports only declared dependencies through
  `*/contract` lanes. The SDK barrel, SDK formats, package root, and `/contract` lanes agree.

## Gaps

- **No diagnostic seams.** The 3D twin exports `enableScene3DResourceFailureGuards` (guard module
  emitting through `@flighthq/log`) and `explainScene3DResourceCoverage` (plain-data explain query).
  This package has neither. Multiple functions return null or report unresolved references as
  sentinels — `createScene2DDocumentFromBytes` returns null when no importer matches,
  `loadScene2DDocumentFromUrl` returns null on acquisition failure, and the load functions partition
  resolved/unresolved — but none has a shakeable `explain*` query or a guard-layer warning. The
  project convention ("every silent sentinel gets a shakeable `explain*` query returning plain data")
  applies here.
- **SVG and Lottie adapters produce empty image-resource manifests.** The underlying format
  importers accept synchronous image resolvers, but the document adapters supply none and do not
  turn unresolved image URIs into `ImageResourceReference`s. The Rive adapter does bridge embedded
  images; SVG and Lottie do not. Relative URL / base-path handling is consequently unproven for
  those formats.
- **`required` and slot `linkage` are metadata only.** The pipeline partitions resolved/unresolved
  references but has no required-reference validator, linkage compatibility check, or structured
  explanation of a missing fill. This is the charter's open slot-typing/validation direction.
- **Cancellation is cooperative with no ownership token.** Abort signals reach load callbacks, but a
  callback that ignores abort can still settle and install content. Two overlapping loads of the
  same reference can commit in settlement order rather than invocation order.
- **`@flighthq/scene2d` is listed as a production dependency but imported only in test files.**
  `createDisplayObject` is used in every test but no source file. `@flighthq/image-codec` is
  correctly in `devDependencies` for the same test-only pattern; `scene2d` should match.

## Charter contradictions

None found. The implementation matches the chartered three-layer pipeline (URL acquisition,
synchronous reconcile, async load), the manifest-over-embedded-slots decision, the code-driven slot
/ loader-driven asset split, the static-document-no-live-runtime constraint, and the open-registry
format dispatch. The audio lane is a natural extension of the charter's image-resource contract and
uses the same reference shape.

## Contract & docs fit

- **Export lanes** — `index.ts` re-exports a curated subset of `contract.ts`. `contract.ts`
  re-exports all source modules. The SDK barrel imports both `.` and `./contract`. All align.
- **Type home** — every exported type (`Scene2DDocument`, `Scene2DSlotReference`,
  `Scene2DDocumentImporterRegistry`, all options/result interfaces, all progress types, all fetch
  seam types) lives in `@flighthq/types`. The package source exports only functions. No inline
  exported types.
- **Side effects** — `"sideEffects": false` declared. No module-level registration, no global
  mutation. The module-scope `TextDecoder` in `builtInScene2DDocumentImporters.ts` and the sentinel
  fetch functions in the load modules are constants at bottom-of-file, consistent with the source
  style rule.
- **Naming** — exported function names include full type names (`Scene2DDocument`,
  `Scene2DSlotReference`, `Scene2DDocumentImporter`). Registry verbs (`register*`, `unregister*`,
  `create*`) match project conventions.
- **Intra-SDK imports** — all resolve to `@flighthq/*/contract`, never to `.`.
- **Dependencies declared** — `audio`, `entity`, `image`, `node`, `scene2d-formats`, `signals`,
  `texture`, `types` are all imported in source and declared. `image-codec` is correctly a
  devDependency (test-only). The `scene2d` production-dependency note above is the one exception.
- **Testing** — one test file per source file, colocated in `src/`, `describe` blocks mirror
  exported names alphabetically. Tests use `createDisplayObject()` constructors, not literals.
  Coverage spans: document creation, slot reference identity, registry isolation / last-write-wins /
  unregister, URL acquisition with null propagation, synchronous reconciliation with select/clear,
  managed replacement with idempotency and sibling preservation, image load with texture fan-out /
  version bump / progress / embedded decode / select filtering, audio load with embedded decode /
  external fetch / select / progress / empty document, and built-in importer rejection.

## Candidate open directions

1. **Diagnostic seams** — `enableScene2DResourceFailureGuards` and `explainScene2DResourceCoverage`
   (or per-sentinel explain queries) to match the 3D twin and satisfy the project diagnostic
   convention. The image and audio load functions, the importer registry dispatch, and the slot
   reconciliation all return sentinels that would benefit from shakeable explain queries.
2. **SVG/Lottie image bridging** — wire image URIs from SVG `<image>` and Lottie asset references
   through to the document's `imageResources` manifest so they participate in the async load
   pipeline instead of being silently dropped.
3. **Slot typing/validation** — the charter's open direction. Structural or nominal checking of
   linkage types against the `Node2D` code supplies, and a diagnostic when a required slot is never
   filled.
4. **Concurrency token** — an operation identity on each load invocation so overlapping loads of the
   same reference commit in invocation order (latest wins) rather than settlement order (last to
   resolve wins).
5. **Dependency hygiene** — move `@flighthq/scene2d` from `dependencies` to `devDependencies`.
