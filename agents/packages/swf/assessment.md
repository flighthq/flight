---
package: '@flighthq/swf'
updated: 2026-08-07
basedOn: ./review.md
---

# swf — Assessment

## Audit basis

This assessment reasons over [`review.md`](review.md) as surveyed at Flight commit `6aff889db`, against
`packages/swf/src`, its colocated tests, and the functional SWF scenes. Corpus statements use the fixed
Ruffle sample and revision recorded in [`fixture-evidence.md`](fixture-evidence.md); every absolute names
the Flight commit that recorded the measurement, so a later corpus or importer change cannot silently
rewrite the claim. A checkout does not carry the corpus — reproducing any corpus figure starts by
obtaining it through the repository's pinned fetcher.

## Recommended

Sweep-safe: inside `@flighthq/swf` or its own cell docs, no cross-package coupling, no breaking change, no
open design decision.

- **Reconcile the charter's two stale shape claims** against the code, in a direction session. The charter
  states the entry point as `createScene2DFromSwf(bytes, options)` while the implementation takes bytes
  alone, and names `@flighthq/importdiagnostics` as a direct dependency the package neither declares nor
  imports. Both are charter-side edits, so the survey flagged rather than made them; neither implies a code
  change.
- **Keep the corpus record self-falsifying as it grows.** The nested cross-check earned its result by being
  frozen at frame 1 to confirm every agreement flips to a divergence. Any further arm added to these sweeps
  should ship with the equivalent negative control, and the record should keep stating it.

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction.

- **Where a placement ratio lives when the placed character is not a morph.** This is the one measured
  animation loss the corpus still shows, and it is a representation question rather than a defect: SWF
  overloads the ratio field across morph progress and video-frame selection, and Flight applies a ratio to
  `MorphShapeKind` alone. Parked on the video Stage B/C ruling; `constructFrame` already applies every
  field that has a home. Structural Stage A fixed the graph shape and did not close this.
- **The shared bitmap-loading contract.** Encoded images resolve through the browser `Image` path — which
  never consults the MIME-keyed `@flighthq/image-codec` registry, so headless and native hosts get no
  pixels from it — while SWF-lossless data becomes a `Bitmap` eagerly. The two honest designs remain a
  bridge from `image-codec`'s `DecodedImage` result into the loader, or an additive third
  `ImageResourceReference` kind with both 2D and 3D loader dispatch; straight versus premultiplied alpha is
  part of the first. Parked because either route changes shared contracts. The working eager lossless path
  must remain unchanged until the ruling.
- **`DefineBitsJPEG3`/`4` alpha rejoining.** Waits on the same resolved-image hand-back point as the item
  above. One file in the fixed 301-readable-file sample at `8dd53f4a2`, and common in authored artwork.
- **Structured parse diagnostics.** A caller currently learns a document was lossy only through the opt-in
  filter guard's log line. Parked on the charter question of which seam owes this — the chartered
  `importdiagnostics` layer or the `@flighthq/log` guard layer actually in use.
- **Intersecting nested masks.** A node carries one clip, so nested masks collapse to the innermost. Parked
  until the clip vocabulary gains a multi-region subject; that is a `@flighthq/clip` decision, not an SWF
  repair.
- **Scene ranges from `DefineSceneAndFrameLabelData`.** Parked until the timeline vocabulary gains a
  subject for a named frame range. Labels already import; only the scene names are read past.
- **Filter fields beyond the target effect vocabulary.** Angle, distance, inner/on-top placement, pass
  count, composite-source and knockout flags, and an authored convolution alpha have no member to land in.
  Parked until those effect types can state them; preserving them earlier would mean guessing.
- **`DefineButtonSound`.** Needs a button interaction-state subject rather than a frame cue — the sound
  fires on a pointer-state transition, while a button imports as a one-frame timeline of its up state.
  Parked on that shared subject.
- **`ZWS`/LZMA.** Not local implementation work. At `f0c56ba7d`, registering the settled deflate decoder
  moves most of the remaining corpus into the fixed set, leaving only the LZMA cases; see
  [fixture-evidence.md](fixture-evidence.md) for the measured figures and the route to recompute them. The shared
  `Compression.Lzma` registry key already exists and the natural registrant is out-of-repository. It must
  not be re-scoped as a hand-written TypeScript decoder here.
- **Broader AVM2.** The bounded frame-command recognition already composes through `@flighthq/abc`. Wider
  ABC format work belongs to that cell behind the seam under the charter's 2026-07-25 ruling, and a VM
  remains outside Flight entirely.
- **A reference-player pixel comparison.** All corpus evidence measures the constructed tree and decoded
  commands, never pixels against a player. Parked on the charter question of whether that is in scope for a
  codec cell or belongs to the functional-scene layer.
- **Whether a cell may carry supplementary evidence docs.** `fixture-evidence.md`, `tag-coverage.md`, and
  `sha-pin-incidental-audit.md` draw a non-gating `docs:check` warning for not being contract files, yet
  the fixture record is what keeps every corpus claim reproducible without committing a binary. Parked as a
  cell-contract question, not an SWF one.

## Not a defect

Recorded so it is not re-raised: **backend capability is not parser loss.** WebGL and WebGPU opt into
colour-adjustment accumulation and render the imported transform; Canvas and DOM have no such registrar,
so their honest result is a null render-proxy adjustment and untinted pixels. The importer preserves the
authored adjustment in both cases. Adding a Canvas registrar or unconditional accumulation would be a
renderer decision, not an SWF repair.

## Approved

_Empty. Approval is the user's verbal gate._
