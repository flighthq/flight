---
package: '@flighthq/bitmapfont-formats'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# bitmapfont-formats — Review

## Verdict

solid — 74/100. All three blessed AngelCode/BMFont text encodings parse through one shared neutral record into `createBitmapFont`, with multi-page resolution, the reference-then-resolve page seam, null sentinels throughout, and a lossless text-form round-trip. The blessed scope is essentially done; the gaps are the charter's own Open directions (binary `.fnt`, packer quirks) plus serializer asymmetry and a dropped SDF parameter.

## Present capabilities

- **Shared record layer** (`packages/bitmapfont-formats/src/bitmapFontRecord.ts`) — `BitmapFontRecord` (+ char/kerning/page records) as the neutral intermediate; `buildBitmapFontFromRecord` resolves *every declared page* via `options.resolvePage` (once per id), enforces the decided resolution rule (a page any glyph samples must resolve or the parse collapses to null; declared-but-unreferenced pages tolerated absent), maps `xoffset/yoffset/xadvance` → bearings/advance with the `bearingY = base − yoffset` baseline conversion documented both directions, and derives metrics (`ascent = base`, `descent = lineHeight − base`).
- **Text `.fnt`** (`bitmapFontFnt.ts`) — `parseBitmapFontFnt` (line/`key=value` tokenizer handling quoted values and CRLF; null on missing `common`/`chars`) and `formatBitmapFontFnt` (lossless for modeled fields; one `page` line per page with the documented empty `file=""`; parse→format→parse round-trip tested).
- **XML variant** (`bitmapFontXml.ts`) — over `@flighthq/xml` element helpers; same record + semantics; null on malformed XML.
- **JSON variant** (`bitmapFontJson.ts`) — the object-shaped export; `pages` filename array (index = id); reads `distanceField.fieldType` to select `'sdf' | 'msdf'` encoding; null on malformed JSON/missing blocks.
- Multi-page is realized end to end (per-char `page` read in all three front-ends; `formatBitmapFontFnt` emits `page=` per char) — the [2026-07-10] "was collapse-to-first" decision is delivered and tested, including cross-variant equivalence tests (JSON ≡ text ≡ XML).
- Deps exactly `bitmapfont` + `types` + `xml`; each format pair its own module per the tree-shakability boundary.

## Gaps

- **Serializer asymmetry** — only the text form has a `format*`; there is no `formatBitmapFontXml`/`formatBitmapFontJson`. The charter's decision blesses text re-emission specifically ("`format*` re-emit the text form losslessly"), so this is charter-consistent but leaves the `-formats` codec asymmetric versus siblings like `path-formats` (parse/format pairs).
- **`distanceField.range` is read past and dropped** — the JSON reader takes `fieldType` for the encoding but discards the field range an SDF renderer needs; blocked on the `BitmapFont` model carrying it (see the bitmapfont cell), after which this parser should preserve it.
- **BMFont binary `.fnt`** — charter Open direction 2, absent.
- **Ecosystem quirks** — Hiero/Shoebox/`fontbm`/packer-specific JSON shapes (charter Open direction 3) untested/unhandled; e.g. `chars` as an object map rather than array in some exporters.
- **`info`/`common` extras are synthesized, not preserved** — face, size, padding, spacing are emitted as neutral defaults on format and ignored on parse. Fine for the model's fidelity rule, but `info.size` in particular is the natural scale reference for SDF rendering and currently vanishes.
- **No diagnostics** — a parse returning null gives no reason (which block was missing, which page failed to resolve); the diagnostics rule wants an `explainBitmapFontParse`-style query for this multi-cause sentinel.

## Charter contradictions

None. The resolution rule, reference-then-resolve seam, per-module tree-shakability, and null-never-throw all match the decisions verbatim.

## Contract & docs fit

- Sentinel `null` on all malformed paths (tested per variant); full names (`parseBitmapFontFnt` etc.); types (`BitmapFontParseOptions`) in `@flighthq/types`; local `BitmapFontRecord` interfaces are package-internal intermediates exported from the barrel — reasonable, though they widen the public surface slightly for what is an internal record.
- `agents/index.md` Package Map line ("AngelCode/BMFont `.fnt` (text/XML/JSON) ↔ `BitmapFont`") matches, modulo the `↔` implying serializers for all three variants when only text formats back out — cosmetic.

## Candidate open directions

- Should XML/JSON `format*` variants exist for parity with the sibling `-formats` packages, or is text-only serialization blessed as *the* interchange output?
- When the `BitmapFont` model grows distance-field parameters, should this codec also preserve `info.size` (the em size the field range is relative to) as part of the SDF story?
- Are `BitmapFontRecord` and `buildBitmapFontFromRecord` intended public API (a seam for user-supplied front-ends) or internal plumbing that should leave the barrel?
