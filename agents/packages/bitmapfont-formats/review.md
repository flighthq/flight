---
package: '@flighthq/bitmapfont-formats'
status: solid
score: 78
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# bitmapfont-formats — Review

## Verdict

solid — 78/100. All three chartered AngelCode/BMFont text encodings (text `.fnt`, XML, JSON) parse through a shared neutral record layer into `createBitmapFont`, with multi-page resolution, the reference-then-resolve page seam, import diagnostics for dropped records, null sentinels throughout, and a lossless text-form round-trip. Since the prior review: the kerning-key inverse bug is fixed, import diagnostics for dropped pages/chars/kernings are implemented, and `BitmapFontRecord` types have moved to `@flighthq/types` where they belong. The chartered scope is delivered; remaining gaps are the charter's own Open directions (binary `.fnt`, ecosystem quirks, bake pipeline) plus serializer asymmetry and the distance-field range parameter.

## Present capabilities

### Shared record layer (`bitmapFontRecord.ts`)

- `buildBitmapFontFromRecord(record, options)` — internal (not exported from either lane); resolves every declared page via `options.resolvePage` (called once per page id), enforces the charter-decided resolution rule: a page any glyph samples must resolve or the entire parse collapses to `null`; declared-but-unreferenced pages are tolerated absent. Maps `xoffset`/`yoffset`/`xadvance` to `bearingX`/`bearingY`/`advance` with the `bearingY = base - yoffset` baseline conversion documented in both directions.
- `reportDroppedBitmapFontRecords(diagnostics, origin, pages, chars, kernings)` — internal; reports one `ImportDiagnostic` per dropped-record kind (`bmfont.page-unreadable`, `bmfont.char-unreadable`, `bmfont.kerning-unreadable`), carrying the count in `detail.records`. The origin parameter is the caller's own name so the shared reporter distinguishes text/XML/JSON. Added since the prior review (commit `f23af083e`).
- Line metrics derive from BMFont `common` fields: `ascent = base`, `descent = lineHeight - base`, `lineGap = 0` — `formatBitmapFontFnt` inverts this losslessly.

### Text `.fnt` (`bitmapFontFnt.ts`)

- `parseBitmapFontFnt(text, options?, diagnostics?)` — line/`key=value` tokenizer handling quoted values and CRLF; null on missing `common`/`chars`; `page` field read per char (default 0). The regex tokenizer (`parseFntFields`) handles double-quoted values with embedded spaces.
- `formatBitmapFontFnt(font)` — lossless for modeled fields; one `page` line per font page with empty `file=""` (atlas pages are live resources, not paths); emits `page=` per char. Kerning pairs emitted via `unpackBitmapFontKerningKey` into a scratch `_kerningPair` — the 16-bit unpack bug (commit `14ca01c12`) is fixed; supplementary-plane codepoints round-trip correctly.

### XML variant (`bitmapFontXml.ts`)

- `parseBitmapFontXml(text, options?, diagnostics?)` — over `@flighthq/xml` element helpers (`getXmlElementAttributeNumber`, `getXmlElementChildByName`, `getXmlElementChildrenByName`); same record + semantics as text; null on malformed XML or missing `common`/`chars`.

### JSON variant (`bitmapFontJson.ts`)

- `parseBitmapFontJson(text, options?, diagnostics?)` — the object-shaped BMFont export; `pages` filename array (index = id); reads `distanceField.fieldType` to select `'sdf' | 'msdf'` encoding (classic raster otherwise); null on malformed JSON/missing blocks.

### Cross-cutting

- Multi-page is realized end to end (per-char `page` read in all three front-ends; `formatBitmapFontFnt` emits `page=` per char and one `page` line per font page) — the [2026-07-10] charter decision is delivered and tested.
- All four exported functions have colocated test files; 34 tests pass. Tests include cross-variant equivalence (JSON = text = XML), multi-page routing, supplementary-plane kerning round-trip, null-sentinel edge cases, and import-diagnostic coverage (no-false-alarm + dropped-record reporting).
- Dependencies: `bitmapfont`, `types`, `xml`, `importdiagnostics` (runtime); `textureatlas` (dev, for test helpers). Each format pair in its own module for independent tree-shaking.
- `sideEffects: false` declared. Two-lane exports (`.` and `./contract`) with identical surface (four functions). `BitmapFontRecord` types properly in `@flighthq/types`, not inline.
- Re-exported through `@flighthq/sdk` barrel.

## Gaps

1. **Serializer asymmetry** — only the text form has `formatBitmapFontFnt`; there is no `formatBitmapFontXml` or `formatBitmapFontJson`. The charter decision blesses text re-emission specifically, so this is charter-consistent, but leaves the package asymmetric versus sibling `-formats` packages.

2. **`distanceField.range` read past and dropped** — the JSON reader extracts `fieldType` for the encoding but discards the distance-field range an SDF renderer needs (e.g. the spread in pixels). Blocked on the `BitmapFont` model adding a field for it (cross-package: `types` + `bitmapfont`).

3. **BMFont binary `.fnt`** — charter Open direction 2, absent. The packed binary variant (4-byte magic `BMF\x03`, block-structured) is the fourth AngelCode format and widely used by native toolchains.

4. **Ecosystem quirks** — Hiero/Shoebox/`fontbm`/packer-specific JSON shapes (charter Open direction 3) are unhandled. Notably, some exporters emit `chars` as an object map `{ "65": {...} }` rather than an array; the current JSON parser returns null for these.

5. **`info`/`common` extras synthesized, not preserved** — face, size, padding, spacing are emitted as neutral defaults on format and ignored on parse. `info.size` in particular is the natural em-size reference for SDF rendering and currently vanishes.

6. **No `explain*` query for the null sentinel** — a parse returning null gives no reason (which block was missing, which page failed to resolve). The diagnostics for dropped records (newly added) cover partial-success cases, but the total-failure sentinel remains opaque. The diagnostics inversion rule calls for an `explainBitmapFontParse`-style shakeable query.

7. **`.ttf` to bitmap bake pipeline** — charter Open direction 1, absent. Cross-package (`glyphatlas`) and build-time tooling shaped.

## Charter contradictions

None. The resolution rule (referenced pages must resolve, unreferenced tolerated absent), reference-then-resolve page seam, per-module tree-shakability, null-never-throw semantics, and multi-page handling all match the charter decisions verbatim. The import-diagnostics addition (dropped-record reporting) aligns with the codebase-map diagnostics inversion rule.

## Contract & docs fit

### Package against the contract

- Sentinel `null` on all malformed paths (tested per variant). No exceptions thrown for expected failures.
- Full unabbreviated type names in exported functions (`parseBitmapFontFnt`, `formatBitmapFontFnt`, `parseBitmapFontJson`, `parseBitmapFontXml`).
- All exported types (`BitmapFontParseOptions`, `BitmapFontRecord`, `BitmapFontCharRecord`, etc.) live in `@flighthq/types` — resolved since the prior review (commit `1868b2707`).
- `Readonly<T>` on input parameters (`Readonly<BitmapFont>`, `Readonly<BitmapFontParseOptions>`, `Readonly<Record<string, string>>`, `Readonly<XmlElement>`).
- `sideEffects: false`; no top-level side effects; no renderer registration.
- Two-lane exports; intra-SDK imports via `@flighthq/xxx/contract`.
- `buildBitmapFontFromRecord` and `reportDroppedBitmapFontRecords` are internal-only (not on either lane) — the prior review's concern about barrel-surface widening is resolved.

### Contract/docs against the package

- Package Map line in `AGENTS.md` lists `bitmapfont-formats` under "Input and text" — accurate. The `map.md` entry says "and serializes back" which only applies to the text form, not XML/JSON — a minor imprecision but matches the charter's decision scope.
- `catalog.md` description matches.
- Feature lookup has no entry for `bitmapfont-formats` as a keyword — minor gap; `bmfont`, `fnt`, `bitmap font` could route here.

## Candidate open directions

1. Should XML/JSON `format*` variants exist for parity with sibling `-formats` packages, or is text-only serialization the blessed interchange output? (Carried from the prior review, still open.)
2. When the `BitmapFont` model grows distance-field parameters, should this codec also preserve `info.size` (the em size the field range is relative to) as part of the SDF story?
3. Should the feature-lookup index carry entries for `bmfont`, `fnt`, or `bitmap font format` pointing to this package?
