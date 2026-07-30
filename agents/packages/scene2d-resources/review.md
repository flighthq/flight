---
package: '@flighthq/scene2d-resources'
status: solid
score: 88
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
---

# scene2d-resources — Review

## Verdict

**Solid — 88/100.** The package establishes the right renderer-neutral document and content-reference
boundary: an enumerable asset/slot manifest, synchronous reconciliation, an operation-scoped asynchronous
load, caller-owned URL acquisition, and an empty-by-default importer registry. The public and contract
lanes are symmetrical, all exported types live in `@flighthq/types`, every exported function has a
colocated test, and no renderer or GPU dependency crosses the boundary. The charter's defining
named-graph path now has both broad synthetic coverage and a revision-pinned external proof: the
standalone SWF importer produces first-frame named slots with authored bounds, transforms, and linkage.
Later MovieClip frames and deferred asset references remain unproven.

## What is solid

- `Scene2DDocument` is static plain data: an unattached `Node2D` root, enumerable references, and source
  identity. Asset and slot references retain their direct target and installed content, so resolution
  neither walks names nor stores resource state on `Node2DRuntime`.
- `resolveScene2DResources` is strictly synchronous and operates only on the selected working set.
  `loadScene2DResources` is the distinct Promise/progress boundary; completion results retain manifest
  order even when loads settle out of order.
- Managed replacement removes only the child owned by the reference, preserves authored siblings, and is
  now idempotent when a later pass returns the same content.
- URL acquisition is a caller-supplied fetch seam and stops at `Scene2DDocument`. Format dispatch is an
  Entity-backed, empty-by-default registry with last-write-wins registration and explicit unregistration;
  no codec registers at module load.
- SVG and Lottie are explicit opt-ins. Their adapters now preserve the package's `null` sentinel when the
  underlying format importer rejects a malformed whole document instead of reporting a successful empty
  document.
- SWF is an explicit peer-package opt-in and supplies the first non-empty manifest: legacy through
  current placement/removal records preserve recursively nested first-frame display-list state,
  including fresh/move/replacement semantics and isolation from later-frame mutations. Named affine
  transforms and `SymbolClass`/`ExportAssets` or direct-class linkage survive, while stage and available
  RECT, embedded JPEG/PNG/GIF, lossless-bitmap, video, and recursive sprite bounds preserve slot
  extents through placement transforms.
- A real uncompressed Ruffle file verifies that the open importer boundary carries an external named
  placement into the same `Scene2DDocument` manifest shape. Provenance, MIT license, hash, and derived
  output live in the SWF package's evidence record; this package retains no binary or network
  dependency.
- Package shape is clean: `sideEffects: false`; source imports only declared dependencies; the SDK root,
  SDK formats, package root, and `/contract` lanes agree; `npm run api`, `exports:check`,
  `type-home:check`, package checks, and package tests pass.

## Remaining depth

- **The first named-graph source is first-frame-only.** SWF now proves recursive names, transforms, and
  linkage plus authored extents, but not later MovieClip frames. SVG/Lottie adapters still create empty
  manifests, and Rive is deliberately sequenced second.
- **Deferred image acquisition is not connected to the document manifest.** SVG and Lottie flat importers
  accept synchronous image resolvers, but the document adapters supply none and do not turn unresolved
  image URIs into `Scene2DAssetReference`s. Relative URL/base-path handling is consequently unproven too.
- **`required` and slot `linkage` are metadata only.** The pipeline reports unresolved references but has
  no required-reference validator, linkage compatibility check, or structured explanation of a missing
  fill. This is the charter's open slot-typing/validation direction, not an implementation detail to
  invent during review.
- **Cancellation is cooperative and operations have no ownership token.** Abort signals reach fetch/load
  callbacks, but a callback that ignores abort can still settle and install content; two overlapping loads
  of the same reference can commit in settlement order rather than invocation order. Fixing that without
  introducing a live document runtime needs an explicit concurrency policy.
- External proof currently stops at one uncompressed named-shape fixture. There is still no
  URL-to-resolve integration case with relative assets, broader real-file corpus, or browser capture
  showing application slot replacement in a rendered scene.

## Boundary conclusion

The ownership line is correct: formats construct renderer-neutral 2D nodes/documents, this package
acquires documents and reconciles named content, and render backends realize the resulting graph later.
The first real named-graph importer and an externally produced asset/slot proof are now present. The
next meaningful increase in confidence is an end-to-end acquisition-and-resolution case or broader
format evidence, not more registry machinery.
