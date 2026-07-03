---
package: '@flighthq/spritesheet-formats'
crate: flighthq-spritesheet-formats
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# spritesheet-formats — Charter

## What it is

The format-interop layer for sprite atlases: it maps third-party atlas / spritesheet descriptor files from industry-standard authoring and packing tools to and from Flight's internal `SpritesheetData`. It is the `-formats` cell of the spritesheet subject triad — the codec layer (`file ↔ value`, registry-dispatched) — sitting between the data primitive (`@flighthq/spritesheet`, which owns `SpritesheetData`) and the consumers that play or render those frames. It ends where mapping ends: it parses and serializes descriptors, slices grids, detects formats, and reports diagnostics, but never reaches into rendering, animation playback, or scene-graph participation.

Today it ships five text-based formats with full parse↔serialize round-trips (Texture Packer JSON, Aseprite JSON, Starling/Sparrow XML, libGDX/Spine `.atlas`, Cocos2d-x plist), a descriptor-free grid slicer, a shared XML parser spine, a lazy registry with auto-detection, and a tolerant diagnostics path — 169 tests across 14 files.

## North star (proposed)

_(Proposed — inferred from the design and the SDK-wide forks; edit before blessing.)_

- **Codec, not consumer.** The package's job is faithful translation between an external descriptor and `SpritesheetData`. It never decodes pixels, plays animations, or participates in the graph — that line is the package's identity, and the test for any new surface is "is this still mapping?"
- **Round-trip fidelity is the bar.** A format that parses must serialize back without silently dropping data the format can carry; what a round-trip preserves (and what it cannot) should be knowable at a glance. Where data is genuinely lost because `SpritesheetData` cannot hold it, that loss is a recorded, cross-package gap — not a quiet drop.
- **Registry by default (fork B).** Format dispatch is an open `Map` registry with last-write-wins and a vendor-prefix convention, so a caller importing one parser excludes the rest and a user can register a custom format. This is the canonical `-formats` shape; never collapse it to a closed `switch(kind)`.
- **Tolerant by default.** Real-world atlas files are messy. Parsing returns best-effort data plus structured diagnostics rather than throwing on the first malformed field; `null` is reserved for the expected "unrecognized format" failure.
- **Honest, unabbreviated names that match the source format.** Field and type names mirror the external format's real vocabulary so a Rust porter or contributor reading the schema is not misled (the libGDX `orig`/`origSize` inversion is the standing counter-example to fix).

## Boundaries (proposed)

_(Proposed — edit before blessing.)_

**In scope:**

- Parse and serialize for text-based atlas descriptor formats produced by mature authoring/packing tools.
- Descriptor-free generation that produces `SpritesheetData` from grid parameters (grid slicing).
- Format auto-detection, a registry seam for custom formats, and a tolerant diagnostics path.
- The cross-package types this layer needs, defined in `@flighthq/types` (one concept per file).

**Non-goals:**

- Owning the `SpritesheetData` model itself — that is `@flighthq/spritesheet`. This package maps to it; it does not extend it. (Model-ceiling gaps like multi-page belong to that package's design.)
- Animation playback, timeline sequencing, or rendering of the frames it decodes.
- Scene-graph participation or any runtime node behavior.
- Image/pixel decoding (atlas page bitmaps are a `@flighthq/resources` / image-format concern).

## Decisions

None blessed yet.

## Open directions

Every candidate below is a question for the user to settle, not a reviewer or drafter decision.

1. **Multi-page scope and the `SpritesheetData` ownership question.** libGDX / Texture Packer multi-page atlases are parsed but collapsed to the first page; per-frame `pageIndex` is lost. Is multi-page in scope, and does it gate on giving `SpritesheetData` a `pages[]` + per-frame `pageIndex` model — which is owned by `@flighthq/spritesheet`? This is the package's central blocked thread: `SpritesheetParseResult` placement, polygon trim, and Rust conformance all hang off it. **Touches fork A** (source-data vs. graph participation) and the cross-package `SpritesheetData`→`@flighthq/types` migration.
2. **Format breadth — where is bedrock?** Which formats are in scope vs. explicitly out: Unity sprite atlas, Godot `.tres`, Spine region attachments, Adobe Animate JSON, Phaser legacy variants, the Aseprite binary `.ase`? The "AAA = every format a dev reaches for" default pulls all of them in; the charter should set the line. **Touches fork E** (the bedrock test) — the upstream-library oracle applies per candidate format.
3. **Polygon / mesh trim.** Texture Packer Phaser/Pixi `vertices` / `verticesUV` / `triangles` and mesh-sprite trim are currently dropped. In scope for this layer, or deferred until `@flighthq/sprite` decides mesh renderability? **Cross-package — touches fork A.**
4. **`SpritesheetParseResult` home.** It is defined locally in `spritesheetDiagnostics.ts` rather than in `@flighthq/types`, because it embeds `SpritesheetData` (still in `@flighthq/spritesheet`). Confirm the fix is gated on the `SpritesheetData`→types migration and the interim placement is accepted.
5. **Serializer-input symmetry.** Should every format expose a public `*Document` constructor and a `dataToDocument`, so a caller can assemble and emit a document from scratch without first parsing one? Several such helpers are currently private.
6. **Diagnostics as the default path.** Should `parseSpritesheetWithDiagnostics` be the canonical entry, with `parseSpritesheet` the terse convenience — or remain a parallel API? One should be blessed as the golden path.
7. **Rust conformance posture.** `flighthq-spritesheet-formats` mirrors only 3 of 5 formats (aseprite, starling, texture_packer); libGDX, Cocos plist, grid slicing, detection, and diagnostics have no Rust mirror. Confirm the "port after the TS API stabilizes per format" policy and which formats are conformance-gated vs. TS-only for now.
8. **Cocos `frameDuration` dead option.** `CocosPlistParseOptions.frameDuration` is accepted but unused (Cocos plist carries no animation data). Trim it as speculative surface, or repurpose it for frame-name animation inference?
9. **libGDX schema field-naming inversion.** `orig` / `origSize` are semantically backwards relative to libGDX's real keys (the round-trip is numerically correct, but the names mislead). Bless the rename to match the format's vocabulary.
10. **Package Map listing.** `tools/agents/docs/index.md` references this package via the `particles-formats` entry but has no line of its own. Add a Package Map entry mirroring the `particles-formats` one.
