---
package: '@flighthq/spritesheet-formats'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - reviews/depth/spritesheet-formats.md (absent — none on disk)
---

# spritesheet-formats — Review

## Verdict

`solid` — 82/100. A genuinely useful, well-factored format-interop layer: five text-based atlas formats with full parse↔serialize round-trips, a clean lazy registry seam, a tolerant diagnostics path, and 169 tests. It clears the "mature sub-library" bar for the _common_ atlas formats. It is held back from `authoritative` by a model ceiling it cannot break alone (single-page `SpritesheetData`, no polygon/mesh, locally-defined `SpritesheetParseResult`), a clarity bug in the libGDX schema field naming, test-colocation drift, and Rust conformance that covers only 3 of the 5 formats.

The reviewer judged against a near-stub charter (only "What it is" is filled; North star, Boundaries, Decisions, Open directions are all `TODO`), so most gaps are measured against the codebase-map AAA standard and surfaced as candidate Open directions below.

## Present capabilities

Grounded in `67dc46d64:packages/spritesheet-formats/src/`:

- **Five built-in formats, each parse + serialize:**
  - Texture Packer JSON (`texturePackerParse.ts` / `texturePackerSerialize.ts`) — Hash and Array variants, `frameTags` → animations with `direction`, `scale` as number-or-string, pivots.
  - Aseprite JSON (`asepriteParse.ts` / `asepriteSerialize.ts`) — per-frame `duration` preserved into `animation.frameDurations` when non-uniform; serializer writes durations back; Hash/Array variant selection; tag `color`/`layers` round-tripped through an `existing` document.
  - Starling/Sparrow XML (`starlingParse.ts` / `starlingSerialize.ts`) — now over the shared `xmlParse.ts` tree parser (replacing the prior regex), with `frameX/Y` → offset, `pivotX/Y` normalized to 0–1, `imageWidth/Height` options for the dimensions Starling XML omits.
  - libGDX/Spine `.atlas` text (`libgdxAtlasParse.ts` / `libgdxAtlasSerialize.ts`) — multi-page line parser, indexed-region animation inference, document round-trip preserving filter/format/repeat metadata.
  - Cocos2d-x/Creator plist XML (`cocosPlistParse.ts` / `cocosPlistSerialize.ts`) — old-style (`frame`) and new-style (`textureRect`) key support, rotation w/h swap, alias arrays.
- **Descriptor-free grid slicing** (`gridSlice.ts`) — `parseGridSpritesheet` over `GridSliceOptions` with margin/spacing/derived-frame-size and `namePrefix`. The one "format" that is a generator, not a codec.
- **Shared XML spine** (`xmlParse.ts`) — `parseXmlDocument`/`parseXmlAttributes` handle entities, comments, CDATA, single/double quotes, self-closing tags, PIs. Used by both XML formats; a real de-duplication win over two ad-hoc parsers.
- **Registry + auto-detection** (`spritesheetDetect.ts`) — `detectSpritesheetFormat`, `parseSpritesheet(text, formatKind?, options?)`, `registerSpritesheetFormat`, and `getSpritesheetFormat` read accessor over a lazily-initialized `Map<SpritesheetFormatKind, …>`. Lazy init is deliberate to keep `sideEffects: false` honest while staying tree-shakable (a caller importing only `parseTexturePackerSpritesheet` excludes the registry).
- **Tolerant diagnostics** (`spritesheetDiagnostics.ts`) — `parseSpritesheetWithDiagnostics` never throws, returns best-effort data + structured `SpritesheetParseDiagnostic[]` with error/warning severities and field/frame scoping.
- **Types-first additions** in `@flighthq/types`: `SpritesheetFormatKind` (string kind + 5 bare PascalCase-valued constants), `SpritesheetParseDiagnostic`(+`Severity`), `GridSliceOptions` — all one-concept-per-file. `package.json` correctly adds the `@flighthq/types` dependency, `sideEffects: false`, single root `.` export.
- **Tests:** 169 across 14 files; new files use exact-function-name `describe` blocks; registry, detection, diagnostics, and every serializer have dedicated coverage.

The status doc's claims check out against the diff, with one correction: `getSpritesheetFormat` is **implemented and tested** (`spritesheetDetect.ts:111`, `spritesheetDetect.test.ts:108`), not deferred — the status "Deferred / Gold" note and the "add `getSpritesheetFormat`" suggestion are stale relative to the shipped code.

## Gaps

Measured against AAA completeness for an atlas-interop layer:

- **Single-page model ceiling.** libGDX multi-page pages are parsed into `document.pages` but collapsed to the first page for `SpritesheetData.imageFile/Width/Height`; every frame loses its `pageIndex`. Texture Packer `meta.related_multi_packs` is not followed. This is the dominant gap and is genuinely blocked on `SpritesheetData` (owned by `@flighthq/spritesheet`) gaining a `pages[]` + per-frame `pageIndex` model — a cross-package design decision, not within-package work.
- **No polygon/mesh trim.** Texture Packer Phaser/Pixi `vertices`/`verticesUV`/`triangles` and any mesh-sprite trim are dropped. Blocked on a `@flighthq/sprite` mesh-renderability decision.
- **`SpritesheetParseResult` is mis-homed.** It is defined locally in `spritesheetDiagnostics.ts` rather than in `@flighthq/types`, violating the header-layer rule. The status explains why (it embeds `SpritesheetData`, still in `@flighthq/spritesheet`, so moving it to types would invert the dependency). Correct diagnosis; the fix is gated on the same `SpritesheetData`→types migration.
- **Format breadth short of "everything a dev would reach for."** Missing: Unity sprite atlas, Godot `.tres`, Spine region attachments, Adobe Animate JSON, Phaser legacy variants, and the Aseprite binary `.ase`. All additive text-format work except `.ase` (binary).
- **No `dataToDocument`-only export for the formats lacking it.** Cocos/libGDX expose document round-trip, but several `documentToData`/`dataToDocument` helpers stay private; there is no symmetric public `*Document` constructor for callers assembling a document from scratch. Minor.
- **Rust conformance lags.** `crates/flighthq-spritesheet-formats` has only `aseprite`, `starling`, `texture_packer`. libGDX, Cocos plist, grid slicing, detection, and diagnostics have no Rust mirror or conformance fixtures. The TS↔Rust 1:1 goal is unmet for this package.
- **No format-support matrix doc and no functional/round-trip example.** A user cannot tell at a glance which fields survive which format's round-trip.

## Charter contradictions

The charter's North star / Boundaries / Decisions are all `TODO`, so there is little to contradict. Against the one filled line ("a format-interop layer that maps third-party atlas files to and from Flight's internal `SpritesheetData`"), the package is faithful: it never reaches past mapping into rendering or graph participation. No contradiction found.

## Contract & docs fit

**Lives up to the contract:**

- Types-first: the three cross-package types live in `@flighthq/types`, one per file, filename = type name. Good.
- Single root export, `sideEffects: false`, no top-level mutation (the registry is lazy precisely to honor this) — clean.
- Sentinels-not-throws: `parseSpritesheet`/`detectSpritesheetFormat` return `null` on the expected "unrecognized format" failure; `parseSpritesheetWithDiagnostics` catches and reports rather than throwing. Correct.
- Full unabbreviated names, `Readonly<>` on serializer inputs and `GridSliceOptions`. Good.
- Registry-by-default (structural fork B): the format dispatch is an open `Map` registry with last-write-wins and a vendor-prefix convention — the canonical shape, not a closed `switch`. This is the subject triad's `-formats` layer done right.

**Drift / candidate revisions:**

- **libGDX schema field naming is inverted vs. the format's real keys** (`libgdxAtlasSchema.ts`). The parser maps the file's `orig:` key into `region.origSize` and the file's `offset:` key into `region.orig`; the serializer mirrors the same swap, so the round-trip and the produced frames are _numerically correct_. But the field names `orig`/`origSize` are semantically backwards relative to libGDX (`orig` is the original size, `offset` is the trim offset), and the schema doc comments describe `orig` as "Offset…" and `offset` as "Packed position." A future Rust port or contributor reading the schema will be misled. This is a clarity/correctness-of-naming defect worth fixing even though pixels are right today. (Not a data bug; do not over-state it downstream.)
- **Test-colocation / order drift.** `serializeStarlingSpritesheet`, `serializeTexturePackerSpritesheet`, and `serializeAsepriteSpritesheet` each have a `describe` block in _both_ the parse test file (`starlingParse.test.ts:185`, `texturePackerParse.test.ts:246`, `asepriteParse.test.ts:244`) and the dedicated serialize test file. One test file per source file with `describe` mirroring that file's exports is the rule; the serialize describes belong only in the `*Serialize.test.ts`. The status's "pre-existing `exports:check` (0/2)" note on the three parse files is the related symptom (describe names with ` — suffix`).
- **Cocos `CocosPlistParseOptions.frameDuration` is dead** — accepted but unused (`_options`), since Cocos plist carries no animation data. Status concern #3 is accurate; it is API-symmetry padding that the contract's "no speculative surface" leaning would trim, or repurpose for frame-name animation inference.
- **Package Map silence.** `tools/agents/docs/index.md` Package Map has a `@flighthq/particles-formats` entry that explicitly cites "the same relationship as `@flighthq/spritesheet-formats` to `@flighthq/spritesheet`" — yet there is no `@flighthq/spritesheet-formats` line of its own. The map references this package without listing it. **Candidate revision:** add a Package Map entry for `spritesheet-formats` mirroring the `particles-formats` one.

## Candidate open directions

The charter is silent on all of these; each is a question for the user to settle, not a reviewer decision:

1. **Is multi-page in scope, and does it gate on moving `SpritesheetData` into `@flighthq/types`?** This is the package's central blocked thread (status defers it explicitly). The charter should state whether `pages[]`/`pageIndex` is a target and own the cross-package `SpritesheetData` ownership decision, since `SpritesheetParseResult` placement, polygon trim, and Rust conformance all hang off it.
2. **Format breadth: where is bedrock?** Which formats are in scope (Unity, Godot, Spine attachments, Adobe Animate, Phaser legacy, binary `.ase`) vs. explicitly out? The "AAA = every format a dev reaches for" default would pull all of them in; the charter should set the line.
3. **Polygon/mesh trim** — in scope for this layer, or deferred until `@flighthq/sprite` decides mesh renderability? (Cross-package; surface, don't assume.)
4. **Serializer-input symmetry** — should every format expose a public `*Document` constructor and a `dataToDocument`, so a caller can assemble and emit a document without first parsing one?
5. **Diagnostics as the default path** — should `parseSpritesheetWithDiagnostics` be the canonical entry, with `parseSpritesheet` the terse convenience, or remain a parallel API? The charter should bless one as the golden path.
6. **Rust conformance posture** — confirm the "port after the TS API stabilizes per format" policy the status assumes, and which formats are conformance-gated vs. TS-only for now.
