---
package: '@flighthq/text-markup'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# text-markup — Review

## Verdict

solid — 82/100. The blessed `htmlText` codec is genuinely built: a lenient two-layer parser (tokenizer + open tag registry) producing `RichTextContent`, a lossless-for-modeled-tags serializer with a proven parse→format→parse fixed point, and the tree-shakable named-color and class-style opt-ins. What remains are the charter's own deferred edges (`<img>`, guards) and a few dialect corners.

## Present capabilities

- **`parseTextMarkup(html, registry?)`** (`packages/text-markup/src/textMarkup.ts`) — regex tokenizer + format stack; nested tags compose into merged `TextFormat`s; contiguous equal-format runs coalesce (`pushMarkupRange`); plain text emits zero ranges. Malformed input recovers per the charter: unclosed tags extend to end, stray `<` stays literal, extra close tags are ignored, comments/doctypes/PIs dropped. Entities decode (`&amp; &lt; &gt; &quot; &apos; &#nn; &#xhh;`, unknown names left verbatim, out-of-range code points kept literal).
- **`formatTextMarkup(content)`** — per-character format resolution (`resolveMarkupFormats`, later-range-wins), run coalescing, text/attribute escaping, `#rrggbb` color normalization, block-break collapse rule documented and tested; `textMarkupRoundTrip` test asserts the fixed point.
- **Registry layer** (`markupTagRegistry.ts`) — `createMarkupTagRegistry`/`registerMarkupTag` (case-insensitive, last-write-wins) + `registerStandardMarkupTags` covering `b/strong`, `i/em`, `u`, `s/strike`, `font[color,size,face]`, `a[href,target]`, `p[align]` (collapsing break), `li[type]` (break + bullet + marker), `br`, `span[class]`, `textformat[leftmargin,blockindent,indent,rightmargin,leading,tabstops]`. Handlers are pure attribute→contribution functions; `MarkupTagEffect` supports `format`/`text`/`breakBefore`.
- **Tree-shakable opt-ins** — `registerMarkupNamedColors` (`markupNamedColors.ts`, ~148-entry CSS table reachable only through that one export) and `registerMarkupClassStyles` (`markupClassStyles.ts`, caller-supplied class→format map behind the `classResolver` seam). Both are seam swaps, not flags — the bundle-invariant shape done right.
- Tests are thorough for the parse/format/registry surfaces (~500 lines across four files), including leniency, opt-in boundaries, and the round-trip fixed point.

## Gaps

- **`<img>` is dropped, not modeled.** The charter's North star lists `<img>` "(as a placeholder ref)"; today the standard registry has no `img` handler and a test pins "drops img tags entirely". Blocked on the rich-text model growing an inline-image concept (charter Open direction 2 — a `textlayout` model gap, not this package's invention).
- **No diagnostics layer.** Dropped/unknown tags, unresolved colors, and unsafe `href` schemes all vanish silently — no `enableTextMarkupGuards`, no `explain*` query. Charter Open direction 3 names the sanitization guard; the diagnostics inversion rule says every silent sentinel earns an `explain*`.
- **Relative font sizes** — real `htmlText` treats `size="+2"`/`size="-1"` as relative to the enclosing size; `parseMarkupNumber` reads `"+2"` as absolute 2. A dialect-fidelity corner.
- **`<span class>` does not serialize** — the resolved fields round-trip but the class name is lost (by design: ranges store resolved formats). Worth a documented statement rather than silence.
- `resolveMarkupFormats` allocates one object per character with per-range spreads — fine for a codec, but serialization of very long rich text is O(n·ranges) with heavy GC; a run-boundary sweep would be linear.

## Charter contradictions

None of substance. The one soft mismatch is the North-star tag list naming `<img>` while the implementation deliberately drops it — the charter itself defers this to Open direction 2, so it reads as acknowledged-unfinished rather than contradiction.

## Contract & docs fit

- Types (`MarkupTagHandler`, `MarkupTagRegistry`, `MarkupTagEffect`, resolvers) live in `@flighthq/types`; deps are exactly the charter's `textlayout` + `types`; `sideEffects: false` with the default registry built lazily (no import side effect); sentinel `null` from resolvers; single root barrel. Names are full and self-identifying (`parseTextMarkup`, `registerMarkupNamedColors`).
- Package Map: `@flighthq/text-markup` has **no entry** in `agents/index.md` / `packages/map.md`'s Input/text section — a candidate revision now that the package exists.
- `crate: flighthq-text-markup` declared; no Rust crate exists yet (consistent with the repo-wide TS-first posture, but worth tracking).

## Candidate open directions

- Should `formatTextMarkup` accept a registry (or serializer hooks) so custom tags round-trip, or is the fixed standard dialect on the way out deliberate? Today custom-tag formats serialize as their nearest standard representation or not at all.
- Is the relative `size="+2"` semantics wanted, and if so does `TextFormat.size` stay absolute with the parser resolving against the stack (feasible today) — or is relative size out of dialect scope?
- Whitespace normalization: `htmlText` sources often contain author newlines/indentation; the parser preserves them verbatim. Should a `condenseWhite`-style option exist (it is part of the classic feature area), and is it parse-layer or a caller concern?
