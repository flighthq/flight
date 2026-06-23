---
id: text-markup
title: '@flighthq/text-markup'
type: new-package
target: text-markup
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/breadth/text-markup.md
  - tools/agents/docs/reviews/breadth/text-typography.md
  - tools/agents/docs/reviews/breadth/openfl-lime-parity.md
depends_on: []
updated: 2026-06-23
---

## Summary

HTML/markup parsing for rich text (the OpenFL `htmlText` equivalent): parse a defined tag subset into plain text plus `TextFormatRange[]` (and link/image/break metadata) ready to feed `setRichTextString` + `setRichTextFormatRange`, plus the inverse serializer back to markup.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum that turns "no markup path" into "set styled text from `htmlText`-style markup." Parse the core OpenFL `htmlText` tag subset into text + format ranges, with a stylesheet, and serialize back.

**Types (`@flighthq/types` first):**

- `TextMarkupParseResult` (the value the whole package revolves around): `text: string`, `formatRanges: ReadonlyArray<TextFormatRange>`, `links: ReadonlyArray<TextMarkupLink>`, `issues: ReadonlyArray<TextMarkupIssue>`. Flat, ready to hand to `setRichTextString` + `setRichTextFormatRange`.
- `TextMarkupLink`: `start: number`, `end: number`, `url: string`, `target: string | null` (the `<a href target>` span as character offsets, mirroring `TextFormat.url`/`target` but also surfaced as a list for `TextEvent.LINK`-style hit dispatch).
- `TextMarkupTag` (`*Kind`-style open string contract, not a closed enum): `'p' | 'br' | 'b' | 'i' | 'u' | 'font' | 'a' | 'span'` for Bronze; open so dialects/vendors add tags.
- `TextMarkupParseOptions`: `baseFormat?: TextFormat` (the format inherited at the root, e.g. the field's default), `styleSheet?: RichTextStyleSheet` (resolve `class`/tag styles), `collapseWhitespace?: boolean` (HTML whitespace collapsing on/off; default OpenFL-compatible).
- `TextMarkupIssue` (open contract for non-throwing diagnostics): `kind: 'unknown-tag' | 'unclosed-tag' | 'malformed-attribute' | 'mismatched-tag'`, `tag?: string`, `offset?: number`. Parsing is best-effort and returns issues; it does not throw on bad markup.

**`@flighthq/text-markup`:**

- `parseTextMarkup(markup: string, options?: Readonly<TextMarkupParseOptions>): TextMarkupParseResult` — the core function. Tokenizes the supported tags, applies `<b>/<i>/<u>` as boolean format flags, `<font face size color>` → `TextFormat.font/size/color`, `<a href target>` → `url`/`target` + a `TextMarkupLink`, `<p align>` and `<br>` as line breaks, resolving against `baseFormat` and `styleSheet`. Returns coalesced, non-overlapping ranges in document order.
- `serializeTextMarkup(text: string, formatRanges: ReadonlyArray<TextFormatRange>, options?): string` — the inverse: emit the supported tag subset from text + ranges (OpenFL's `htmlText` getter). Round-trips the Bronze tag set.
- `applyTextMarkupToRichText(source: RichText, markup: string, options?): TextMarkupParseResult` — **convenience only, lives in `@flighthq/text` not here** (it needs `RichText`); listed for the full flow. The pure path is `parseTextMarkup` → caller calls `setRichTextString`/`setRichTextFormatRange`. (See Boundaries.)
- `decodeTextMarkupEntities(text: string): string` / `encodeTextMarkupEntities(text: string): string` — HTML entity decode/encode (`&amp; &lt; &gt; &quot; &#NN; &#xNN;`), needed by both parse and serialize and individually useful.
- `getTextMarkupLinkAtIndex(result: Readonly<TextMarkupParseResult>, charIndex: number): TextMarkupLink | null` — sentinel `null` when the index is not inside a link span; the bridge to link hit-testing.

**Effort:** medium. A correct, whitespace-aware tag tokenizer + entity handling + the range-coalescing logic is the bulk; the tag set is small and well-specified by OpenFL.

### Silver

Competitive with a good `htmlText`/BBCode library: the full OpenFL tag/attribute surface, CSS-style class selectors, image/inline placement, the swappable backend seam, and cross-dialect support.

**Types (`@flighthq/types`):**

- `TextMarkupDialect` (`*Kind` string identifier): `'openfl-html' | 'bbcode'` — selects the tag grammar. Open contract so a vendor adds `'acme.markup'`.
- `TextMarkupImagePlacement`: `start: number`, `source: string`, `width: number | -1`, `height: number | -1`, `align: TextFormatAlign | null` — an inline `<img>` anchor (character position + source + sizing), surfaced for the layout layer to reserve space. `-1` sentinels for "intrinsic size."
- `TextMarkupBackend` seam: `parse(markup, options): TextMarkupParseResult`. Lives in types as the header for the web backend.
- `TextMarkupParseResult` gains `images: ReadonlyArray<TextMarkupImagePlacement>` and `lineBreaks: ReadonlyArray<number>` (explicit `<br>`/`<p>` break offsets for the layout layer).
- `TextFormat` extensions markup needs that have no home yet (added in types, shared with the shaper/layout work): optional `display?: 'inline' | 'block'`, and a `class?: string` carrier is **not** added (class resolves to format at parse time, not stored on the format).
- `TextMarkupParseOptions` gains `dialect?: TextMarkupDialect`, `allowedTags?: ReadonlyArray<string>` (whitelist/sanitization), `inheritWhitespace?: boolean`.

**`@flighthq/text-markup`:**

- Full OpenFL `htmlText` tag/attribute coverage in `parseTextMarkup`: `<font face size color letterspacing kerning>`, `<p align>`, `<li>` / `<bullet>`, `<textformat leftmargin rightmargin indent blockindent leading tabstops>` (the OpenFL `<textformat>` tag → the corresponding `TextFormat` margin/indent/tab fields), `<sub>`/`<sup>` where representable, `<span class>`.
- `registerTextMarkupBackend(backend: TextMarkupBackend): void` / `getTextMarkupBackend(): TextMarkupBackend` / `setTextMarkupBackend(backend: TextMarkupBackend | null): void` / `createWebTextMarkupBackend(): TextMarkupBackend` — the swappable seam; the dependency-free tokenizer is the always-present default, the web backend (`DOMParser`-based, with sanitization) is opt-in.
- `parseBBCode(markup, options?): TextMarkupParseResult` (or `dialect: 'bbcode'` on `parseTextMarkup`) — `[b][i][u][color][size][url][img]` BBCode, the second most-requested markup family for game UIs.
- `resolveTextMarkupStyleSheet(styleSheet: Readonly<RichTextStyleSheet>, tag: string, className: string | null): TextFormat | null` — the CSS-style cascade resolver (tag selector, `.class`, `tag.class`), factored out so it is testable and reusable.
- `validateTextMarkup(markup: string, options?): ReadonlyArray<TextMarkupIssue>` — lint markup without building the full result (sanitization preview, editor diagnostics).
- `sanitizeTextMarkup(markup: string, allowedTags: ReadonlyArray<string>): string` — strip disallowed tags/attributes (XSS/untrusted-content posture), independent of parsing.
- `getTextMarkupImageAtIndex(result, charIndex): TextMarkupImagePlacement | null`.
- `serializeTextMarkup` upgraded to emit the full tag set, with a `dialect` option and stable, minimal tag nesting (no redundant spans).

**Cross-backend / Rust:**

- A committed conformance scene (`text_markup_html`) parsing the same markup in TS and Rust and asserting identical `TextMarkupParseResult` (text + range boundaries + links) — a value-typed, GPU-free, fingerprint-comparable check.
- `flighthq-text-markup` reaches feature parity with the default tokenizer + BBCode; the web backend is wasm-only.

**Effort:** large. The full `htmlText` attribute surface, CSS cascade, BBCode dialect, and sanitization are each bounded but additive; the web-backend seam and round-trip fidelity are the careful parts.

### Gold

The authoritative `htmlText`/markup reference: spec-grade parsing, streaming, full link/image/interactivity metadata, exhaustive error handling and tests, and 1:1 Rust parity.

**Types (`@flighthq/types`):**

- `TextMarkupDocument` (Entity) + `TextMarkupNode` tree: a retained, walkable parse tree (`tag`, `attributes: Readonly<Record<string,string>>`, `children`, `textRange`) for tooling that needs structure beyond the flat result (a markup editor, a diff, a transform pass). The flat `TextMarkupParseResult` stays the fast path; the document is the structured one.
- `TextMarkupTag` exhaustive open contract covering every OpenFL `htmlText` tag plus common HTML rich-text tags (`<h1>`–`<h6>`, `<blockquote>`, `<code>`, `<pre>`, `<ol>`/`<ul>`/`<li>`, `<s>`/`<del>`, `<mark>`).
- `TextMarkupIssue` exhaustive (`unsupported-entity`, `unsafe-attribute`, `depth-limit-exceeded`, `cyclic-stylesheet`) for structured non-throwing diagnostics.
- `enableTextMarkupSignals` group payloads (`onTextMarkupParseProgress`, `onTextMarkupParseError`) for streaming/very-large documents — signals owned by this package.
- `TextMarkupSerializeOptions`: `indent`, `selfCloseVoidTags`, `dialect`, `entityEncoding: 'minimal' | 'named' | 'numeric'`.

**`@flighthq/text-markup`:**

- `parseTextMarkupDocument(markup, options?): TextMarkupDocument` — full tree parse; `flattenTextMarkupDocument(document, baseFormat?): TextMarkupParseResult` collapses it to the range model. `destroyTextMarkupDocument`/`disposeTextMarkupDocument` as appropriate to the tree's ownership.
- **Streaming parse:** `createTextMarkupParser(options?): TextMarkupParser`, `pushTextMarkupChunk(parser, chunk)`, `finishTextMarkupParse(parser): TextMarkupParseResult` — incremental parsing of streamed/large markup without holding the whole string, feeding a progress signal.
- **Full link & interactivity model:** `TextMarkupLink` extended with `id`, `title`, and `attributes` carry-through so a host can build `TextEvent.LINK`-style dispatch with the full anchor context; `getTextMarkupLinkRanges(result)` returns merged spans for hover/underline.
- **Exhaustive entity table:** the full HTML named-character-reference set in `decodeTextMarkupEntities`, numeric (dec/hex) references, and malformed-reference recovery matching the HTML spec's behavior.
- `mapTextMarkupFormats(result, mapper): TextMarkupParseResult` — transform every resolved `TextFormat` (e.g. clamp sizes, remap fonts to the fallback chain) in one pass; the bridge to a future `@flighthq/font` fallback layer.
- `diffTextMarkup(a, b)` / structural compare for editor/undo use (Gold-only nicety).
- Exhaustive colocated tests: one `*.test.ts` per source file, golden-vector tests against the OpenFL `htmlText` corpus, BBCode corpus, the HTML5 named-entity table, round-trip parse↔serialize fidelity, sanitization/XSS cases, malformed-markup recovery (every `TextMarkupIssue` kind), and alias-safe behavior where any out-params exist.

**Rust (`flighthq-text-markup`):**

- 1:1 conformance: the default tokenizer, BBCode, the streaming parser, the document tree, and the entity table all ported; same `TextMarkupParseResult` boundaries asserted by paired conformance scenes (`text_markup_html`, `text_markup_bbcode`, `text_markup_entities`) named to match the TS functional scenes.
- The web backend (`createWebTextMarkupBackend`) is the one intentional TS↔Rust divergence (browser-only), recorded in the conformance divergence map.
- On the _mixable_ leaf path — a `text-markup-rs` wasm drop-in over the `@flighthq/text-markup` signatures is feasible because the seam is pure data.

**Effort:** very large; the streaming parser, full HTML entity table, document tree, and spec-grade malformed recovery are the long tail. Order Gold after Silver's tag surface and backend seam are proven and the link/image metadata is consumed by the layout layer.

## Boundaries

- **Layout, line breaking, and rendering stay in `@flighthq/textlayout` / the renderers.** This package produces `text` + `TextFormatRange[]` + break/image _anchors_; it never measures glyphs, breaks lines, or reserves image space. `lineBreaks`/`TextMarkupImagePlacement` are _inputs_ the layout layer consumes — markup decides "a break/image goes at offset N," layout decides where that lands on screen.
- **The `RichText` entity and its setters stay in `@flighthq/text`.** The convenience `applyTextMarkupToRichText(source, markup)` lives in `@flighthq/text` (it imports `RichText`), not here — this package must not depend on `text`. The pure flow is `parseTextMarkup` → `setRichTextString` + `setRichTextFormatRange`.
- **`TextFormat`, `TextFormatRange`, and `RichTextStyleSheet` are owned by `@flighthq/types`.** This package consumes and produces them; it does not redefine the styling model. Any new format field markup needs is added to `@flighthq/types`, not invented locally.
- **Link _hit-testing and event dispatch_ stay in `@flighthq/textlayout` / `@flighthq/interaction`.** `textlayout` already has `getRichTextLinkAtPoint`; this package only emits the link spans (`TextMarkupLink`) that feed it. `getTextMarkupLinkAtIndex` is a pure index lookup, not pointer hit-testing.
- **Image _loading and drawing_ stay in `@flighthq/resources` / the renderers.** `TextMarkupImagePlacement` is a descriptor (source string + size); resolving `source` to an `ImageResource` and drawing it is the consumer's job.
- **CSS parsing beyond the simple selector cascade is out.** `resolveTextMarkupStyleSheet` handles tag / `.class` / `tag.class` against the existing `RichTextStyleSheet` (`Record<string, TextFormat>`); a full CSS engine (specificity, inheritance cascade, units, media queries) is not in scope and would be a separate concern if ever wanted.
- **Font matching / fallback stays in a future `@flighthq/font`.** Markup resolves `<font face>` to a `TextFormat.font` _name_; choosing an actual font for that name / falling back for missing glyphs is the font subsystem's job. `mapTextMarkupFormats` is the seam that hands off to it.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes (valid manifest, tree-shakable, `sideEffects:false`)
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] Added to the Package Map in `tools/agents/docs/index.md`
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- **Package name: `text-markup` vs `text-formats`.** The `-formats` precedent (`spritesheet-formats`, `particles-formats`) is for binary/asset importers; markup is a text-domain feature with a specific OpenFL name (`htmlText`). `text-markup` reads more precisely and leaves room for a future binary `text-formats` (e.g. RTF) if ever needed. Confirm `text-markup`.
- **Where does `applyTextMarkupToRichText` live?** It is the convenience users will reach for, but it couples markup to the `RichText` entity. Proposed: the _pure_ `parseTextMarkup` lives here; the convenience wrapper lives in `@flighthq/text` (which already depends on the range model) or only in `@flighthq/sdk`. Confirm the wrapper does not land in this package (keeps it renderer/entity-free and mixable).
- **Flat result vs. document tree as the primary output.** Bronze/Silver lead with the flat `TextMarkupParseResult` (matches how `setRichTextFormatRange` consumes data). Gold adds the tree. Is the tree ever the _default_, or always the opt-in structured path? Recommend flat-primary, tree opt-in.
- **Default backend strictness.** The dependency-free tokenizer is intentionally lenient (best-effort, issue-reporting) for OpenFL `htmlText` compatibility. The web backend (`DOMParser`) is spec-strict. Do they need to produce _identical_ results for the supported subset, or is the web backend explicitly a different, stricter mode? This affects whether `text_markup_html` conformance includes the web backend.
- **`TextFormat` additions for block-level tags.** `<h1>`/`<blockquote>`/`<pre>` imply block semantics (`display`, paragraph spacing) that `TextFormat` does not currently model. Add minimal block fields to `TextFormat` in types, or collapse block tags to existing margin/leading/size fields at parse time? Bronze can collapse; decide before Gold's full HTML tag set.
- **Sanitization defaults.** Should `parseTextMarkup` sanitize by default (drop unknown/unsafe tags) or pass everything through and leave sanitization to `sanitizeTextMarkup`/`allowedTags`? OpenFL passes through; modern safety favors default-deny. Recommend pass-through-with-issues by default, explicit `allowedTags` for untrusted content.
- **BBCode as a dialect of `parseTextMarkup` vs. a separate `parseBBCode`.** A `dialect` option keeps one entry point; a separate function keeps grammars from leaking into each other and tree-shakes the unused dialect. Lean toward separate `parseBBCode` for tree-shaking, sharing the range-coalescing core.

## Agent brief

> Create `@flighthq/text-markup` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions (free functions, `Readonly` by default, sentinels over throws, tree-shakable, `-formats`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
