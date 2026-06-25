---
package: '@flighthq/spritesheet-formats'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta (head vs base)
  - changes.patch (packages/spritesheet-formats/ hunks)
  - status.md (as-claimed, builder-67dc46d64)
  - charter.md (DRAFT, unblessed)
---

# spritesheet-formats — Review (merge gate: integration-b2824e3d8 → approved origin/main)

## Verdict

`partial` — 58/100, **revise before merge.** This is a merge-gate review of the **delta only** (head `b2824e3d8` vs the approved base `origin/main` eb73c3d74), not a survey of the package. The base (aseprite / starling / texture-packer parse + serialize + schema, with colocated tests) is the blessed floor and is not under review.

The delta adds two new parsers (Cocos plist, libGDX `.atlas`), their schema(s), a registry-backed auto-detect/dispatch module (`spritesheetDetect.ts`), and a re-export shim (`xmlParse.ts`). The **registry design is genuinely good** — it is the canonical fork-B open `Map` registry, not a closed `switch`, and the kinds are types-first in `@flighthq/types`. But the delta does **not** clear the merge bar, for three concrete reasons grounded below: (1) it ships **eight new exported functions with zero colocated tests**, which the package's own `exports:check` gate forbids; (2) it ships a **dead, mis-scoped `xmlParse.ts`** that re-exports another package's API through this barrel and carries a false comment; and (3) the integration's **committed docs claim a body of work that did not land in the integration's source** — `status.md`/`review.md` (stamped `builder-67dc46d64`) describe serializers, a grid slicer, a diagnostics path, and "169 tests across 14 files" that are **absent** from `b2824e3d8`. Merging would land `solid`/82 docs over a partial codebase.

## What the delta actually adds (grounded in `b2824e3d8:`)

- `src/cocosPlistParse.ts` — `parseCocosPlistSpritesheet`, `parseCocosPlistSpritesheetDocument`, plus `CocosPlistParsed` / `CocosPlistParseOptions` interfaces. Parse-only.
- `src/cocosPlistSchema.ts` — `CocosPlistFrame`, `CocosPlistMetadata`, `CocosPlistDocument`.
- `src/libgdxAtlasParse.ts` — `parseLibgdxAtlasSpritesheet` + `LibgdxAtlasParseOptions`. Parse-only, single-pass line parser, `baseName_NNN` animation inference. No schema file, no serializer.
- `src/spritesheetDetect.ts` — `detectSpritesheetFormat`, `getSpritesheetFormat`, `parseSpritesheet`, `registerSpritesheetFormat` over a lazily-initialized `Map<SpritesheetFormatKind, FormatEntry>`.
- `src/xmlParse.ts` — re-exports `parseXmlAttributes`, `parseXmlDocument`, `XmlElement` from `@flighthq/resource-formats`.
- `src/index.ts` — adds the four new modules to the barrel.
- `package.json` — adds `@flighthq/resource-formats` and `@flighthq/types` deps; `tsconfig.json` adds the matching project references. Both correct.
- `packages/types/src/SpritesheetFormat.ts` — five PascalCase kind constants + the open `SpritesheetFormatKind = string` alias. Types-first, one concept per file. **This is correct.**

## Merge-blocking findings

### 1. Eight new exported functions, zero colocated tests (standard 7 — FAIL)

The delta adds these exported functions and **adds no `*.test.ts` for any of them**. The head `src/` still has only `asepriteParse.test.ts`, `starlingParse.test.ts`, `texturePackerParse.test.ts` — all inherited from base.

- `b2824e3d8:src/cocosPlistParse.ts:186` `export function parseCocosPlistSpritesheet`
- `b2824e3d8:src/cocosPlistParse.ts:192` `export function parseCocosPlistSpritesheetDocument`
- `b2824e3d8:src/libgdxAtlasParse.ts:230` `export function parseLibgdxAtlasSpritesheet`
- `b2824e3d8:src/spritesheetDetect.ts:99` `export function detectSpritesheetFormat`
- `b2824e3d8:src/spritesheetDetect.ts:111` `export function getSpritesheetFormat`
- `b2824e3d8:src/spritesheetDetect.ts:124` `export function parseSpritesheet`
- `b2824e3d8:src/spritesheetDetect.ts:142` `export function registerSpritesheetFormat`
- `b2824e3d8:src/xmlParse.ts:6` re-exported `parseXmlAttributes`, `parseXmlDocument`

The contract requires one colocated `*.test.ts` per source file with exports, and `npm run exports:check` "checks for missing test files and missing tests for exported functions." This delta fails that gate by construction. The two XML parsers in particular have **non-trivial, error-prone regex/structural logic** — `parsePlistRect`'s nested-brace regex (`cocosPlistParse.ts:28`), the `dictToMap` even/odd key-pairing walk (`:38`), the rotation w/h swap (`:147`), and the libGDX whitespace-significant line state machine (`libgdxAtlasParse.ts:47`) — exactly the code that needs fixtures, shipped untested.

### 2. `xmlParse.ts` is a dead, mis-scoped re-export with a false comment (standards 1, 2, 3 — FAIL)

```ts
// b2824e3d8:src/xmlParse.ts
// XML parsing for the Starling and Cocos plist parsers is owned by @flighthq/resource-formats.
// Re-export the canonical parser so spritesheet-formats users (and the SDK barrel) resolve a
// single shared declaration rather than a duplicate.
export type { XmlElement } from '@flighthq/resource-formats';
export { parseXmlAttributes, parseXmlDocument } from '@flighthq/resource-formats';
```

Three problems, all in the delta:

- **It is dead.** Nothing in the package imports `./xmlParse`. `cocosPlistParse.ts:1-2` imports `parseXmlDocument`/`XmlElement` **directly** from `@flighthq/resource-formats`, not through this shim; `starlingParse.ts` is unchanged from base and still uses its own hand-rolled regex attribute parser (`b2824e3d8:src/starlingParse.ts:21 parseAttrs`). So the file's only effect is on the public barrel.
- **The comment is false.** It claims "the Starling and Cocos plist parsers" resolve through it; the Starling parser does not use `parseXmlDocument` at all, and the Cocos parser bypasses this shim. A comment that misstates what the code does is worse than no comment (Source Style: comments are durable semantic statements of what the code _is_).
- **It pollutes this package's public root with another package's names.** `index.ts:14` re-exports `parseXmlDocument`, `parseXmlAttributes`, `XmlElement` from `@flighthq/spritesheet-formats` — generic names that do not contain the `spritesheet`/format vocabulary and that already have a canonical home in `@flighthq/resource-formats`. This works against "globally unique exported function names from package roots" and adds public surface for zero in-package consumer. Remove the file; let callers import XML helpers from their owning package.

### 3. Integration docs claim work that is absent from the integration source (standard 7 — FAIL)

The integration's own committed `status.md` (stamped `ingest:builder-67dc46d64`) and prior `review.md` (grounded in `67dc46d64:`) describe, as present:

- `libgdxAtlasSerialize.ts` (`serializeLibgdxAtlasSpritesheet`), `cocosPlistSerialize.ts` (`serializeCocosPlistSpritesheet`)
- `gridSlice.ts` (`parseGridSpritesheet`) and a `GridSliceOptions` type
- `spritesheetDiagnostics.ts` (`parseSpritesheetWithDiagnostics`, `SpritesheetParseResult`, `SpritesheetParseDiagnostic`)
- `libgdxAtlasSchema.ts`
- "169 tests across 14 files" including `cocosPlistParse.test.ts`, `libgdxAtlasParse.test.ts`, `spritesheetDetect.test.ts`, `xmlParse.test.ts`, and every `*Serialize.test.ts`.

**None of these files exist in `b2824e3d8/packages/spritesheet-formats/src/`,** and none are added by the `packages/spritesheet-formats/` hunks of `changes.patch` (which add exactly six source files: `cocosPlistParse`, `cocosPlistSchema`, `index`, `libgdxAtlasParse`, `spritesheetDetect`, `xmlParse`). The status doc explicitly flags its entries as "as-claimed until a review pass verifies them against the diff." This review is that pass, and the verification **fails**: the integration is a strict subset of the `67dc46d64` branch the docs describe. Merging would publish a `solid`/82 review and a `builder-67dc46d64` status over a codebase that has no serializers, no diagnostics, no grid slicer, and no tests for the new exports. The committed `review.md`/`status.md`/`assessment.md` must be brought into line with what actually landed before this is a faithful merge.

## Secondary findings (real, non-blocking)

- **Parse-only Cocos/libGDX break the package's round-trip pattern (standard 1 / charter North star).** Aseprite, Starling, and Texture Packer all ship `*Serialize.ts` in base; the delta adds two formats with **no serializer and (for libGDX) no schema**, so the new formats cannot round-trip. The charter's proposed North star is "a format that parses must serialize back." This is delta-introduced asymmetry, not a base trait. Either land the serializers or have the charter bless parse-only as acceptable.
- **Dangling reference to a function that does not exist.** `b2824e3d8:src/cocosPlistParse.ts:184-185`: `Use parseCocosPlistSpritesheetDocument instead when you need round-trip serialisation` and `:191` `preserve the full document for round-trip serialisation via serializeCocosPlistSpritesheet` — but `serializeCocosPlistSpritesheet` is not implemented anywhere in the delta. The doc comment promises a round trip the package cannot perform.
- **The registry-entry shape is an inline type, duplicated three times, not in `@flighthq/types` (standard 6).** The `{ detect; parse }` shape that users must construct to call `registerSpritesheetFormat` is the public seam of the registry, yet it is written inline as the local `FormatEntry` (`spritesheetDetect.ts:28`), again as the `Readonly<{…}>` return of `getSpritesheetFormat` (`:111`), and a third time as the `registerSpritesheetFormat` parameter (`:144`). It crosses the package boundary (callers author it), so per the header-layer rule it belongs as a named type in `@flighthq/types` (e.g. `SpritesheetFormatEntry`) and should be referenced, not re-spelled.
- **Structural divider comments (Source Style — FAIL).** Every new file uses banner dividers the style rule forbids: `b2824e3d8:src/cocosPlistParse.ts:18` `// ─── plist structural helpers ───`, `:63` `// ─── Internal parser ───`, `:180` `// ─── Public API ───`; same pattern in `libgdxAtlasParse.ts:13` / `:36` / `:222` and `spritesheetDetect.ts:26` / `:93`. "Avoid structural divider comments … Use names, file boundaries, and package boundaries instead." These also misorder the file against the alphabetized-exports rule (public functions sit at the bottom under a banner rather than ordered).
- **Dead option carried for symmetry.** `b2824e3d8:src/cocosPlistParse.ts:186` accepts `_options?: CocosPlistParseOptions` (underscore-prefixed, never read); `CocosPlistParseOptions.frameDuration` (`:13`) is documented for "inferred animations" the Cocos parser never builds. Speculative surface the contract's "no speculative surface" leaning would trim.

## What the delta gets right (do not regress)

- **Fork B done right.** `spritesheetDetect.ts` is an open `Map<SpritesheetFormatKind, FormatEntry>` with lazy init (no top-level `Map.set`, so `sideEffects: false` stays honest), last-write-wins, a documented vendor-prefix convention, and a `getSpritesheetFormat` read accessor. This is the canonical `-formats` dispatch shape and should be preserved.
- **Types-first kinds.** `packages/types/src/SpritesheetFormat.ts` adds the five kind constants and the open `SpritesheetFormatKind = string` alias in `@flighthq/types`, one concept per file — exactly the string-kind model. `package.json`/`tsconfig.json` deps and references are correct.
- **Sentinels, not throws.** `detectSpritesheetFormat`/`parseSpritesheet` return `null` on the expected "unrecognized format" failure (`spritesheetDetect.ts:103`, `:131`) rather than throwing. Correct.
- **`getSpritesheetFormat` return is `Readonly<>`** (`:111`). Const-by-default honored at the read seam.

## Charter fit

The charter is a `draft: true`, unblessed first pass whose "What it is" already describes the richer `67dc46d64` shape ("five formats with full parse↔serialize round-trips … a shared XML parser spine … a tolerant diagnostics path — 169 tests"). That description is **ahead of the code under review**; it is not a rubric the `b2824e3d8` delta meets, and the mismatch is itself evidence for finding 3. Judged against the charter's _proposed_ North stars: registry-by-default ✅, types-first kinds ✅, round-trip fidelity ❌ (new formats are parse-only), honest unabbreviated names ✅ for the format functions but the `xmlParse` re-export leaks generic names. Nothing here should edit the charter — its Open directions already park the cross-package threads (multi-page, `SpritesheetData`→types, Rust conformance) that are correctly out of this merge's scope.
