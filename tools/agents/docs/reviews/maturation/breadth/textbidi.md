# New Package Spec: @flighthq/textbidi

**Represents:** Unicode bidirectional algorithm (UAX #9) — embedding-level resolution, visual reordering, paired-bracket mirroring — plus script and direction itemization (segmenting a string into runs of a single script/direction so the shaper and layout can process each run correctly). This is the "itemize / bidi" layer named in the text stack design but currently absent.

**Requested by:** text-typography

## Fits

The text-typography breadth review (Coverage 58/100) names this directly: _"No bidi / itemization package. Nothing covers UAX #9 (bidirectional reordering), bracket mirroring, or script/direction segmentation. `TextFormat` has alignment but no `direction`/RTL concept. RTL and mixed-direction text is unsupported end to end."_ The Rust text doc's layer table lists **itemize / bidi** as the first layer ("split text into runs by script, direction, font") and marks it `absent` — Flight owns layout, shaping is a seam, but the itemize layer that feeds both has no home yet.

- **Package name & shape:** `@flighthq/textbidi`. The review offers "or fold UAX #9 into `textlayout`"; this spec keeps it a **separate cell**. Bidi/itemization is a self-contained, pure-data algorithm with no scene-graph or runtime identity, it is consumed by `textlayout`, `textshaper`, and `textinput` alike, and it is a textbook candidate for the _mixable_ value-typed leaf class (deterministic, no GPU, headlessly fingerprint-able). Folding it into `textlayout` would couple three consumers to one package and bloat the layout spine. `"sideEffects": false`, single root `.` export, tree-shakable.
- **Types-first:** every cross-package contract (`TextDirection`, `BidiLevel`, `BidiParagraph`, `TextScript`, `TextItemRun`, `BidiBracketPair`) lands in `@flighthq/types` before implementation, and the `direction` axis is added to the existing `TextFormat` there.
- **Dependencies:** `@flighthq/types` only (plus `@flighthq/geometry` if a future API needs visual-rect math, which it should not). It is a pure-function package over Unicode character data — no entity/runtime, no renderer, no resources. It must **not** import `textlayout`, `textshaper`, or any consumer (the dependency points the other way: `textlayout`/`textshaper` may depend on `textbidi`).
- **Neighbor packages:** sits beside `@flighthq/textshaper` and below `@flighthq/textlayout` in the text stack (itemize → shape → layout → rasterize). It pairs naturally with a future `@flighthq/textsegment` (UAX #29 grapheme/word segmentation) — bidi reordering and grapheme clustering are different Unicode algorithms over the same string and should stay distinct cells, but they are siblings. The Unicode character-property **data tables** (bidi class, script, mirroring, bracket pairs) follow the `-formats` neighbor precedent: ship them in `@flighthq/textbidi-data` (a generated, versioned data package) so the algorithm core stays small and the large property tables tree-shake / version independently — mirroring how `spritesheet-formats` neighbors `spritesheet`.
- **Backend seam:** **none in Bronze.** The UAX #9 algorithm and the embedded Unicode tables are pure TS/Rust with no platform capability — there is nothing to delegate to a host. A swappable `TextItemizerBackend` seam is a _Gold_ option only, to let a host substitute platform ICU (e.g. `Intl.Segmenter`-class APIs or native ICU) for the bundled tables; the default is always the in-package algorithm.
- **Rust crate mirror:** `flighthq-textbidi`. The canonical native stack (per the Rust text doc) is **`unicode-bidi`** for the UAX #9 core plus a script-itemization step over `unicode-script` (and `unicode-properties` for mirroring/bracket data). This is a value-typed leaf on the _mixable_ conformance path — a future `textbidi-rs` wasm drop-in is feasible, and it is an ideal early conformance target (deterministic, no GPU).

## Bronze

The minimum that turns "RTL is unsupported end to end" into "a mixed-direction paragraph resolves to correct visual order." Implement the UAX #9 resolution + reordering core for a single paragraph, with an explicit base direction, and the script-itemization split that the shaper needs. Latin/Arabic/Hebrew mixed runs in visual order is the 80%-value slice.

**Types (`@flighthq/types` first):**

- `TextDirection` — string kind, open contract: `'ltr' | 'rtl'` (the resolved/base direction). Bronze does not include `'ttb'` vertical.
- Add `direction?: TextDirection` to the existing `TextFormat` (the missing axis the review calls out), and a paragraph-level base-direction concept distinct from per-format direction.
- `BidiLevel` — a `number` newtype alias (UAX #9 embedding level 0–125; even = LTR, odd = RTL), documented as such.
- `BidiParagraph` (plain data, not an entity): `text` (the source string reference), `baseDirection: TextDirection`, `baseLevel: BidiLevel`, `levels: Readonly<Uint8Array>` (resolved level per code unit).
- `TextScript` — string kind, open contract of ISO 15924 script tags (`'Latn' | 'Arab' | 'Hebr' | 'Hani' | 'Hira' | 'Kana' | 'Thai' | 'Deva' | 'Cyrl' | 'Grek' | 'Common' | 'Inherited' | 'Unknown'` …). Open contract — full set is data-driven, not a closed enum.
- `TextItemRun` (plain data): `start: number`, `length: number`, `direction: TextDirection`, `level: BidiLevel`, `script: TextScript`. The unit a shaper consumes (one script + one direction).
- `TextRunOrder` — the visual ordering result: `visualToLogical: Readonly<Int32Array>` / `logicalToVisual: Readonly<Int32Array>` (index maps), so callers reorder glyphs without re-running resolution.

**`@flighthq/textbidi`:**

- `resolveBidiParagraph(text: string, baseDirection: TextDirection): BidiParagraph` — runs UAX #9 rules P, X, W, N, I (explicit codes, weak/neutral resolution, implicit levels) and allocates the level array. `create*`-class (allocates).
- `detectBaseTextDirection(text: string): TextDirection` — UAX #9 rule P2/P3 first-strong heuristic; returns `'ltr'` for neutral-only text (documented default, not a sentinel).
- `reorderBidiLine(levels: Readonly<Uint8Array>, start: number, length: number, out: TextRunOrder): TextRunOrder` — rule L1/L2 reverse-by-level reordering for one display line, written into `out` (no-allocation, hot-path, alias-safe).
- `getBidiVisualRuns(paragraph: Readonly<BidiParagraph>, start: number, length: number): ReadonlyArray<TextItemRun>` — the contiguous same-level runs of one line in visual order (direction set, script `'Common'` until itemization runs).
- `itemizeTextScript(text: string, start: number, length: number): ReadonlyArray<TextItemRun>` — splits a range into maximal single-script runs (resolving `Common`/`Inherited` to the surrounding script per UAX #24).
- `itemizeText(paragraph: Readonly<BidiParagraph>): ReadonlyArray<TextItemRun>` — the combined bidi×script split: the run list a shaper iterates (each run is one direction + one script). The package's headline function.
- `getTextDirectionForLevel(level: BidiLevel): TextDirection` — even/odd → ltr/rtl.

**`@flighthq/textbidi-data` (neighbor, generated):**

- Bidi-class table (`getBidiCharacterClass(codePoint: number): BidiClass`), script table (`getTextScriptForCodePoint(codePoint: number): TextScript`), keyed by code point, versioned by Unicode release. Compact (range-packed) so the core stays light.

**Effort:** medium-to-large. The UAX #9 weak/neutral/implicit rule machinery is intricate but fully specified and well-trodden (reference implementations exist); the generated Unicode tables are mechanical. Order this **first** in the text-i18n push — every other complex-script feature (the HarfBuzz shaper, GPU text, RTL editing) consumes its run output.

## Silver

Competitive with `unicode-bidi` / ICU `ubidi`: full explicit-formatting and isolate support, paired-bracket mirroring, multi-paragraph text, and the consistency the editing and layout layers need for correct caret/selection across reordering.

**Types (`@flighthq/types`):**

- `BidiBracketPair`: `openIndex: number`, `closeIndex: number` — resolved canonical bracket pairs (UAX #9 rule BD16 / N0).
- `BidiOverride` — explicit base-direction override modes: `'ltr' | 'rtl' | 'auto'` (the CSS `direction`/`unicode-bidi` and the `dir=auto` equivalent) for paragraph and run-level control.
- `TextItemRun` extended with `mirrored?: boolean` (run contains mirrored glyphs) and an explicit `paragraphIndex`.
- `MirroredCharacter` lookup result type and `TextScriptRunOptions` (e.g. treat emoji/`Common` runs by neighbor vs as their own run).

**`@flighthq/textbidi`:**

- `resolveBidiText(text: string, baseDirection: BidiOverride): ReadonlyArray<BidiParagraph>` — splits on paragraph separators (rule P1) and resolves each, honoring `'auto'`.
- Full **explicit formatting** support inside `resolveBidiParagraph`: LRE/RLE/LRO/RLO/PDF and the **isolates** LRI/RLI/FSI/PDI (rules X1–X10, the isolate-aware stack the original X rules lack) — the difference between toy bidi and correct bidi.
- `getBidiBracketPairs(paragraph: Readonly<BidiParagraph>): ReadonlyArray<BidiBracketPair>` — rule BD16 stack-based pairing; feeds rule N0 neutral resolution (already used internally by Silver `resolveBidiParagraph`, exposed for tooling).
- `getMirroredCharacter(codePoint: number): number` — UAX #9 bidi-mirroring (`(` ↔ `)` in RTL context); returns the same code point when none (sentinel-by-identity, documented).
- `mirrorBidiText(text: string, levels: Readonly<Uint8Array>, out: { value: string }): void` — apply mirroring to a display string for backends that draw mirrored glyphs by substitution rather than font lookup.
- `getBidiCaretIndexAtVisualPosition(...)` / `getVisualCaretIndexForLogical(paragraph, logicalIndex): number` — the logical↔visual caret mapping `textinput` needs so caret movement and selection are correct across reordered runs (the review flags selection currently sums per-character advances and breaks on reordering).
- `getBidiSelectionRanges(paragraph, logicalStart, logicalEnd): ReadonlyArray<TextItemRun>` — a logical selection split into the (possibly discontiguous) visual ranges a highlight must draw.
- `itemizeText` upgraded with **font itemization** input hooks: accept a per-codepoint coverage predicate so the run split also breaks where the active font changes (the "split into runs by script, direction, **font**" the Rust doc names), keeping the font-matching itself in the future `@flighthq/font` package.

**Cross-package / consistency:**

- `textlayout` consumes `itemizeText` runs instead of assuming a single LTR run; `textshaper.shapeText` shapes per `TextItemRun`; alignment `'start'`/`'end'` resolve against base direction. (These edits live in the consumer packages; listed here as the integration contract Silver must satisfy.)
- A committed conformance/parity scene: a mixed Latin+Arabic+Hebrew paragraph with brackets and isolates, fingerprint-comparable against the Rust crate (structural, not pixel — text never pixel-matches; positions/order do).

**Effort:** large. Isolates and rule N0 bracket pairing are the intricate parts; the caret/selection visual-mapping is the integration-heavy part that unblocks correct RTL editing.

## Gold

The authoritative reference: exhaustive UAX #9 conformance (the Unicode BidiTest/BidiCharacterTest corpus passes), vertical text, host-ICU substitution, full Unicode-version tracking, and 1:1 Rust parity. Nothing a Unicode/i18n expert would find missing.

**Types (`@flighthq/types`):**

- `TextDirection` extended with `'ttb'` (vertical) and `TextOrientation` (`'mixed' | 'upright' | 'sideways'`) for CJK vertical layout; `TextItemRun.orientation`.
- `TextItemizerBackend` seam: `itemize(text, baseDirection): ReadonlyArray<TextItemRun>`, `getBidiCharacterClass`, `getScript` — the swappable header so a host can substitute native/ICU itemization for the bundled tables.
- `BidiConformanceResult` / `BidiTestCase` for the test-corpus harness; `UnicodeVersion` identity carried on `BidiParagraph` and the data tables.
- `enableTextBidiSignals` group payload types (`onBidiResolveError` for malformed-input diagnostics during streaming/incremental resolve) — owned here per the signals-in-owning-package rule.

**`@flighthq/textbidi`:**

- `registerTextItemizerBackend(backend)` / `getTextItemizerBackend()` / `setTextItemizerBackend(backend | null)` / `createWebTextItemizerBackend()` — the swappable seam (web backend can lean on `Intl.Segmenter` where available, falling back to the bundled algorithm). Default is always the in-package algorithm; the seam never throws on missing backend (sentinel to the bundled path).
- **Full UAX #9 conformance:** every rule (P, X1–X10 with isolates, W1–W7, N0–N2, I1–I2, L1–L4), validated against the official `BidiTest.txt` and `BidiCharacterTest.txt` corpora via `runBidiConformance(cases): BidiConformanceResult`.
- **Vertical text:** `resolveVerticalTextOrientation(text, orientation): ReadonlyArray<TextItemRun>` (UAX #50 vertical orientation) and run reordering for `'ttb'`.
- **Incremental / streaming:** `resolveBidiParagraphInto(text, baseDirection, out: BidiParagraph): BidiParagraph` (out-param, reuse the level buffer for re-layout on edit), and `invalidateBidiParagraphRange(paragraph, start, length)` so an editor re-resolves only the touched paragraph.
- `getTextScriptRunCount` / sizing helpers and `validateBidiParagraph(paragraph): BidiIssue | null` (structured, non-throwing diagnostics — level out of range, mismatched isolate count).
- `enableTextBidiSignals(...)` / `disableTextBidiSignals`.
- Exhaustive colocated tests: one `*.test.ts` per source file, the full Unicode conformance corpus as golden vectors, alias-safe out-param coverage, sentinel-on-neutral/empty coverage, and round-trip logical↔visual mapping tests.

**`@flighthq/textbidi-data`:**

- Versioned Unicode property tables (bidi class, script, mirroring, bracket pairs, vertical orientation) with `getUnicodeVersion()` and a generation script committed so the tables track Unicode releases reproducibly.

**Rust (`flighthq-textbidi`):**

- 1:1 conformance over **`unicode-bidi`** (UAX #9 core, isolates) + **`unicode-script`** / **`unicode-properties`** (script itemization, mirroring), exposed through the same free-function surface (`resolve_bidi_paragraph`, `itemize_text`, `reorder_bidi_line`, `get_mirrored_character`, …) with snake_case names and `&mut out` params.
- Committed conformance scenes (`text_bidi_arabic_brackets`, `text_bidi_isolates`, `text_bidi_mixed_paragraph`) paired by name with TS functional scenes; the value-typed leaf is fingerprint-comparable headlessly (the _mixable_ class — a `textbidi-rs` wasm drop-in is feasible and is a strong early conformance target).
- Intentional TS↔Rust divergences (e.g. Unicode-version skew between bundled tables and the crate's data) recorded in the conformance divergence map.

**Effort:** very large; the conformance-corpus pass, vertical text, and the host-ICU seam are the long tail. Order Gold after Silver's isolates + caret mapping are proven against the editing layer.

## Boundaries

- **Shaping stays in `@flighthq/textshaper`.** `textbidi` produces `TextItemRun`s (one script + one direction); turning a run into positioned glyphs (ids/advances/offsets/clusters) is the shaper's job. `textbidi` never touches a font or a glyph.
- **Layout stays in `@flighthq/textlayout`.** Line breaking (UAX #14), wrapping, alignment, line metrics, and selection-rectangle geometry remain owned by the layout spine. `textbidi` supplies the resolved levels and the visual-reorder maps; `textlayout` applies them per display line. Flight owns layout — this package does not duplicate it.
- **Grapheme/word segmentation (UAX #29) is a separate cell.** Emoji ZWJ sequences, skin-tone clusters, and word-boundary segmentation belong in a future `@flighthq/textsegment`, not here. Bidi and grapheme clustering are different algorithms; keep them distinct. (Caret movement that must not split graphemes composes both packages.)
- **Font matching / fallback / coverage stays in a future `@flighthq/font`.** `itemizeText` _accepts_ a coverage predicate to break runs on font change, but it does not choose fonts, build fallback chains, or query codepoint coverage — that is the font subsystem's job.
- **`TextFormat` and rich-text content stay in `@flighthq/textlayout` / `@flighthq/text`.** This package only adds the `direction` axis to the shared `TextFormat` type in `@flighthq/types`; it does not own format ranges, stylesheets, or display objects.
- **Editing actions stay in `@flighthq/textinput`.** `textbidi` supplies the logical↔visual caret/selection _mapping_; `textinput` decides what a key press does. RTL-aware cursor movement is `textinput` calling `textbidi` mapping functions, not `textbidi` handling input.
- **Locale-aware breaking / number-date formatting is out of scope.** Bidi is locale-independent (it operates on Unicode bidi classes); the locale layer the review wants is a separate `@flighthq/i18n`/locale seam.

## Open design questions

- **Separate cell vs fold into `textlayout`.** The review explicitly offers both. This spec argues **separate** (three consumers, pure-data leaf, mixable conformance target). Confirm — folding in would simplify the dependency graph but couples shaper and editing to the layout package.
- **Data-table packaging.** Is the Unicode property data a neighbor `@flighthq/textbidi-data` package (the `-formats` precedent, version-independent, tree-shakable), or inlined generated tables inside `textbidi`? The neighbor-package precedent and bundle discipline favor a separate data package; confirm the split and the data-generation pipeline.
- **`TextItemizerBackend` seam necessity.** Do we ever want host/ICU itemization, or is the bundled algorithm always authoritative? `Intl.Segmenter` covers grapheme/word/sentence but **not** bidi — so the web seam buys little for bidi specifically. Recommend deferring the seam to Gold and keeping Bronze/Silver seam-free (the algorithm is deterministic and conformance depends on owning it).
- **Where the bidi×script×font run split is assembled.** `itemizeText` combines bidi runs and script runs; font itemization needs a coverage predicate from `@flighthq/font` (which does not exist yet). Define the predicate-hook shape now (Silver) and let `font` fill it later, or defer the font axis entirely until `font` lands?
- **Unicode-version authority.** Bundled tables vs the Rust crates' Unicode version will skew over time. Pin a single Unicode version per Flight release and record skew in the conformance divergence map, or track latest per-package? Pinning is safer for conformance.
- **`baseDirection` default.** When text is all-neutral, `detectBaseTextDirection` returns `'ltr'`. Should the SDK default be `'ltr'`, a locale-driven default (couples to the absent locale layer), or require the caller to pass it explicitly? Bronze defaults to `'ltr'`; revisit when the locale layer exists.
- **Vertical text scope.** `'ttb'` (UAX #50) is Gold here, but vertical layout also touches `textlayout` line direction and the renderers. Is vertical CJK in scope for Flight at all, or explicitly deferred? Decide before committing the `TextOrientation` type to the header.
