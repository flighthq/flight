---
package: '@flighthq/text-markup'
status: solid
score: 83
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - assessment.md
---

# text-markup — Review

## Verdict

solid -- 83/100. The `htmlText` codec is complete for its modeled dialect: a lenient two-layer parser (regex tokenizer + open tag registry) producing `RichTextContent`, a serializer with a proven parse-format-parse fixed point, and tree-shakable named-color and class-style opt-ins. Since the last review (2026-07-13), the main change is the `@flighthq/color` integration (commit `4bbc81b44`), which moved color handling from raw 24-bit hex to the SDK's packed RGBA convention via `packOpaqueColor`/`getColorRgb`. The small score bump reflects that consolidation: one fewer internal color convention, no regressions, and the same round-trip guarantee holding. What remains are the charter's own deferred edges (`<img>`, guards) and a few dialect corners.

## Present capabilities

- **`parseTextMarkup(html, registry?)`** (`textMarkup.ts`, 388 lines) -- regex tokenizer (`/<[^>]*>/g`) walks the input, dispatching each token to the registry's handler map. A format stack tracks nesting; each tag handler returns a pure `MarkupTagResult` (either `Partial<TextFormat>` or the richer `MarkupTagEffect` with `breakBefore`/`text`). Nested tags compose via stack merging. Contiguous runs of equal format coalesce in `pushMarkupRange`. Malformed input recovers as specified: unclosed tags extend to end, stray `<` stays literal text, extra closing tags ignored, comments/doctypes/PIs dropped. Entities decode (`&amp; &lt; &gt; &quot; &apos; &#nn; &#xhh;`; unknown names kept verbatim; out-of-range code points kept literal).
- **`formatTextMarkup(content)`** (`textMarkup.ts`) -- per-character format resolution (`resolveMarkupFormats` builds a `TextFormat[]` indexed by character position, later-range-wins), run coalescing via `equalsMarkupFormat`, text/attribute escaping, `#rrggbb` color normalization via `getColorRgb` from `@flighthq/color`. The block-break collapse rule is documented and tested. The `textMarkupRoundTrip` test suite asserts the fixed point over 12 cases including nested tags, block breaks, entities, and list markers.
- **Registry layer** (`markupTagRegistry.ts`, 253 lines) -- `createMarkupTagRegistry` returns `{ handlers: new Map() }`; `registerMarkupTag` stores handlers lowercased (case-insensitive, last-write-wins). `registerStandardMarkupTags` populates: `b`/`strong`, `i`/`em`, `u`, `s`/`strike`, `font[color,size,face]` (also accepts `font` as alias for `face`), `a[href,target]`, `p[align]` (collapsing break), `li[type]` (break + bullet + marker), `br`, `span[class]`, `textformat[leftmargin,blockindent,indent,rightmargin,leading,tabstops]`. Handlers are pure attribute-to-contribution functions.
- **`resolveMarkupHexColor`** (`markupTagRegistry.ts`) -- exported hex-only resolver handling `#rgb`, `#rrggbb`, and `0xRRGGBB`. Installed as the default `colorResolver` seam by `registerStandardMarkupTags`. Returns packed RGBA via `packOpaqueColor`.
- **`registerMarkupNamedColors`** (`markupNamedColors.ts`, 185 lines) -- swaps the `colorResolver` seam to a resolver that first tries hex then the ~148-entry CSS Color Module Level 4 named-color table (stored as 24-bit RGB, widened to packed RGBA by the resolver). The table is reachable only through this single export, so it tree-shakes out of bundles that never call it.
- **`registerMarkupClassStyles`** (`markupClassStyles.ts`, 23 lines) -- installs a `classResolver` seam from a caller-provided `Record<string, Partial<TextFormat>>` map. Space-separated class names in a single `class` attribute merge left to right. Case-sensitive matching (matches CSS semantics). No built-in style table -- weight is only what the caller provides.
- **Export lanes** -- `index.ts` selectively re-exports 8 named functions from `contract.ts`; `contract.ts` re-exports all four source modules via `export *`. The curated public lane omits no contract export -- the two surfaces are identical. `sideEffects: false` declared.
- **Tests** -- 504 lines across 4 test files. Coverage includes: empty/plain text, entity decoding (named, decimal, hex, unknown, out-of-range), every standard tag and its aliases, hex and named color resolution, custom registries, composition/nesting, format splitting at boundaries, unclosed/extra/unknown tags, stray `<`, block break collapsing, the round-trip fixed point (12 cases), class-style merging and case sensitivity, and last-write-wins behavior for both tag and class-resolver registrations.

## Gaps

- **`<img>` is dropped, not modeled.** Charter North star lists `<img>` "(as a placeholder ref)"; the standard registry has no `img` handler and a test pins "drops img tags entirely." Blocked on the rich-text model growing an inline-image concept (charter Open direction 2 -- a `textlayout` model gap, not this package's invention).
- **No diagnostics layer.** Dropped/unknown tags, unresolved colors, and unsafe `href` schemes all vanish silently. No `enableTextMarkupGuards`, no `explainTextMarkup` query. Charter Open direction 3 names the sanitization guard; the diagnostics inversion rule mandates a shakeable `explain*` for every silent sentinel.
- **Relative font sizes** -- real `htmlText` treats `size="+2"`/`size="-1"` as relative to the enclosing size; `parseMarkupNumber` uses `Number.parseFloat`, so `"+2"` becomes absolute 2 and `"-1"` becomes -1 (a nonsensical absolute font size). A dialect-fidelity corner.
- **`<span class>` does not round-trip the class name** -- ranges store resolved `TextFormat` fields, so the class name is lost. The serializer emits the nearest standard-tag equivalent. This is by design (the model stores resolved formats, not source markup), but it remains undocumented in code or docs -- worth a stated rule rather than silence.
- **`resolveMarkupFormats` allocates one object per character** with per-range spread-copies -- O(n * ranges) with heavy GC churn. Acceptable for a parse/serialize codec; a run-boundary sweep would be O(n + ranges) and GC-friendlier. Not urgent, but the complexity ceiling is visible for long documents with many format ranges.
- **`variations` field on `TextFormat`** (`FontVariation[]`, added in `212970bfd` after the last review) has no `htmlText` representation and no parser/serializer support. Same posture as `kerning`/`letterSpacing`: `formatTextMarkup` silently omits it, and `parseTextMarkup` never produces it, so the fixed point is unaffected. The `formatTextMarkup` JSDoc explicitly names `kerning` and `letterSpacing` as omitted but does not mention `variations`.

## Charter contradictions

- **`@flighthq/color` dependency is undeclared in the charter.** The charter's Boundaries section says "Deps: `@flighthq/textlayout` + `@flighthq/types`", but `package.json` and `tsconfig.json` both list `@flighthq/color` (added in the packed-RGBA standardization commit). The dependency is correct -- `formatTextMarkup` uses `getColorRgb` and the color resolvers use `packOpaqueColor` -- but the charter boundary statement is stale.
- The `<img>` soft mismatch noted in the last review persists: the North star names it, the implementation drops it, and the charter defers it to Open direction 2. This reads as acknowledged-unfinished rather than contradiction.

## Contract & docs fit

- **Type home**: all exported types (`MarkupTagHandler`, `MarkupTagResult`, `MarkupTagEffect`, `MarkupTagRegistry`, `MarkupColorResolver`, `MarkupClassResolver`) live in `@flighthq/types`. The package exports functions only, consistent with the convention.
- **Naming**: exported names are full and self-identifying (`parseTextMarkup`, `formatTextMarkup`, `registerMarkupNamedColors`, `resolveMarkupHexColor`). The `get*` prefix rule is respected by not using it for functions that do not get.
- **Sentinel values**: `resolveMarkupHexColor` returns `null` for unrecognized values; parse is never-throw; both match the sentinel-over-exceptions convention.
- **`sideEffects: false`**: the default registry is built lazily and memoized only on first use (no import-time side effect). Custom registries created via `createMarkupTagRegistry` carry no shared state.
- **Export lanes**: `.` (index.ts) and `./contract` (contract.ts) -- both present and correctly configured in `package.json` exports map. Intra-SDK consumer `@flighthq/swf` imports from `@flighthq/text-markup/contract`.
- **SDK barrel**: `@flighthq/sdk` re-exports from `@flighthq/text-markup` in `index.ts`, `contract.ts`, and `text.ts`.
- **Package Map / index.md**: `@flighthq/text-markup` has no entry in `agents/packages/map.md` or `agents/index.md`. The AGENTS.md Package Map names it in the "Input and text" group, so discovery is not broken, but the detailed map and index docs are missing an entry.
- **`import type` style**: all type imports use `import type { ... }` on dedicated lines, separate from value imports. Consistent with the style rule.
- **`Readonly<T>` usage**: handler parameters, format parameters, and the `MarkupTagRegistry` argument in `registerMarkupTag`/`createMarkupFontTagHandler`/`createMarkupSpanTagHandler` use `Readonly<>`. `RichTextContent` parameter in `formatTextMarkup` uses `Readonly<>`. Consistent with the const-by-default convention.
- **Alphabetization**: exported functions in `index.ts` are alphabetized. Internal functions in source files are mostly alphabetized. Test `describe` blocks are alphabetized.

## Candidate open directions

1. **Charter boundary update for `@flighthq/color`.** The boundary statement should name the three actual dependencies: `types`, `textlayout`, and `color`.
2. **Diagnostics (`enableTextMarkupGuards` / `explainTextMarkup`).** The charter and assessment both name this. The package has three silent-sentinel seams (unknown tags, unresolved colors, unsafe hrefs) that the diagnostics convention says each earn a shakeable diagnostic.
3. **Relative font size** (`size="+2"` / `size="-1"`). The assessment recommends resolving against the enclosing stack size in the `<font>` handler while keeping `TextFormat.size` absolute. Contained to `markupTagRegistry.ts`.
4. **Linear-time `resolveMarkupFormats`** -- replace per-character object allocation with a range-boundary sweep for O(n + ranges) serialization. Behavior-preserving; the round-trip test pins correctness.
5. **Document the `<span class>` one-way rule** and add `variations` to the `formatTextMarkup` JSDoc list of omitted fields.
6. **Package Map / index.md entry** for `@flighthq/text-markup` -- an admin-doc revision.
7. **`condenseWhite`-style whitespace option** -- dialect-scope question the charter has not settled. Classic `htmlText` has a `condenseWhite` property; whether this is a parse-layer concern or a caller concern is open.
8. **Registry-aware serialization** -- whether `formatTextMarkup` should accept a registry or serializer hooks so custom-tag formats round-trip with their source syntax, or whether the fixed standard dialect is the deliberate design.
