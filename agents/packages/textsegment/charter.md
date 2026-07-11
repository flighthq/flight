---
package: '@flighthq/textsegment'
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# textsegment — Charter

## What it is

`@flighthq/textsegment` is the **Unicode text-segmentation seam** — it finds grapheme-cluster, word, and sentence boundaries in a string (Unicode UAX #29). It is the *itemize* layer beneath the rest of the text stack: a caret moves by **grapheme** (not code unit, so an emoji or a combining sequence is one step), word-select and double-click extend by **word**, and sentence navigation by **sentence**. `textshaper`, `textlayout`, `textinput`, and `bitmaptext` all want correct boundaries and should get them from one place, not re-derive them.

## North star

`segmentGraphemes(text)` / `segmentWords(text)` / `segmentSentences(text)` enumerate boundaries (offsets) or segments over a swappable `TextSegmenterBackend`, whose **default web backend wraps the browser-native `Intl.Segmenter`** — correct, locale-aware, and **zero bundle cost** (no shipped Unicode tables). Plus the caret-navigation helpers the editors need: `getNextGraphemeBoundary`/`getPreviousGraphemeBoundary`, `getNextWordBoundary`/`getPreviousWordBoundary`, and `getWordRangeAt(text, index)` (the word under a hit point, for double-click select). Boundaries return as plain offset arrays / `out`-fillable index results in the hot path; segment iteration returns `{ start, end, text, isWordLike? }` records. Locale is an optional argument threaded to `Intl.Segmenter`.

## Boundaries

- **A seam package over a `*Backend`** (the Platform Integration Suite shape): `getTextSegmenterBackend`/`setTextSegmenterBackend`/`createWebTextSegmenterBackend`. The web backend is always available (`Intl.Segmenter` is baseline in modern engines); a native host or a from-scratch UAX #29 table backend (→ possibly `flight-rs`) can replace it. Deps: `@flighthq/types` (the backend interface + segment/boundary types) only — no bundled Unicode data in the default path.
- **UAX #29 only — grapheme, word, sentence.** **Line breaking (UAX #14) is out of scope** here: it's a different algorithm `Intl.Segmenter` does not provide, and `@flighthq/textlayout` already owns line breaking (`getTextLineBreaks`). Reconciling line-break into a segmenter backend is an Open direction, not P1.
- **Boundaries, not shaping or layout.** It reports where segments begin/end; it does not measure, shape, or lay out glyphs — those are `textshaper`/`textlayout`. It holds no font and no glyph data.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Backend seam, `Intl.Segmenter` default — zero bundled tables.** The default web backend delegates to `Intl.Segmenter` (grapheme/word/sentence), so the common path ships no Unicode data. A from-scratch UAX #29 backend (for headless/native hosts without `Intl.Segmenter`, or deterministic control) is a swappable replacement, and its heavy table form is a `flight-rs` candidate — not built into the default TS path.
- **[2026-07-11] Line breaking stays in `textlayout`.** `textsegment` is UAX #29 (grapheme/word/sentence); UAX #14 line breaking is not folded in here to avoid a second line-break implementation. If a unified segmentation home is later wanted, that's a deliberate consolidation, not this package's P1.

## Open directions

1. **From-scratch UAX #29 backend.** A table-driven grapheme/word/sentence segmenter for hosts without `Intl.Segmenter` or where deterministic, engine-independent boundaries matter — the heavy Unicode-table impl is a `flight-rs` (Rust/wasm) candidate behind this same seam, mirroring `surface-rs`.
2. **Editor integration.** Wire `getWordRangeAt`/grapheme navigation into `@flighthq/textinput`'s caret/selection model so word-select and grapheme-stepping route through one segmenter.
3. **Line-break reconciliation.** If the stack wants one segmentation entry point, evaluate hosting UAX #14 line breaking (today in `textlayout`) behind a segmenter backend method — a consolidation call, deferred.
