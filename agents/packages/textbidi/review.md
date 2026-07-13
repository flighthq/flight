---
package: '@flighthq/textbidi'
status: solid
score: 72
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# textbidi — Review

## Verdict

solid — 72/100. A real, from-scratch UAX #9 implementation — explicit embeddings, directional isolates, isolating run sequences with sos/eos, the full weak/neutral/implicit chains, L1 reset, and L2 reordering — behind the decided compact-table `BidiClassBackend` seam. The two honest holes are the deferred N0 bracket-pair rule and test coverage that samples behavior rather than proving conformance for a 445-line algorithm.

## Present capabilities

- **`resolveBidiLevels(text, baseDirection)`** (`packages/textbidi/src/resolveBidiLevels.ts`) — per-UTF-16-code-unit `Uint8Array` levels implementing P2/P3 (`'auto'` = first strong, isolate-skipping), X1–X8 with the 125-depth stack and overflow counters, X5a–X6a isolates (BD9 initiator/PDI pairing in `pairIsolates`, FSI scoring via `computeParagraphLevel`), X9 (formatting chars retained as BN with levels), X10/BD13 isolating run sequences with sos/eos, W1–W7, N1–N2, I1–I2, and L1. Astral pairs share their code point's class; explicit `'ltr'|'rtl'|'auto'` base direction.
- **`reorderBidiLine(levels, start, end, out)`** (`reorderBidiLine.ts`) — rule L2 as an `out`-parameter visual→logical index map, allocation-free across lines and sub-range capable; nested-level reversals compose correctly (tested for level-2 numbers inside RTL).
- **`getBidiRuns(text, baseDirection)`** (`getBidiRuns.ts`) — equal-level run grouping into `{ start, end, level, direction }` records for per-run shaping, per the North star.
- **`BidiClassBackend` seam** (`bidiClassBackend.ts`) — `get`/`set`/`createCompactBidiClassBackend` matching the decided shape; the compact default is a flat `[start, end, classOrdinal]` binary-searched range table (~150 ranges: Basic Latin, Latin-1, combining marks, Hebrew, Arabic + Supplement + Extended-A + presentation forms, directional formats/isolates, whitespace/format runs), uncovered code points defaulting to `'L'` with the coverage boundary documented at the definition.
- Tests cover run splitting, the seam (install/restore/routing), L2 cases including out-reuse and sub-ranges, and level resolution for LTR/RTL/mixed/numeric/auto-base cases.

## Gaps

- **N0/BD16 bracket pairing is deferred** (documented in the header comment; charter Open direction 2): mirrored brackets in mixed text resolve as plain neutrals, giving wrong-direction parentheses in the classic `hello (שלום) world` cases. The charter also names paragraph-level rules (P1) — `resolveBidiLevels` treats its input as one paragraph; a text containing paragraph separators (class B) is L1-reset but not split into independently-based paragraphs.
- **No conformance harness.** UAX #9 ships `BidiTest.txt`/`BidiCharacterTest.txt`; the current 8 resolve cases + 6 reorder cases cannot demonstrate correctness of the isolate/weak/neutral interactions the code implements. This is the highest-leverage verification gap in the package.
- **No mirroring query (L4).** A renderer needs `Bidi_Mirroring_Glyph` data (`(` → `)`) for RTL runs; nothing exposes it, and it is the same class-data family the backend seam already models.
- **No `explain*`/guards** for the compact table's coverage boundary — a CJK-or-Thaana string silently resolves all-'L'; the diagnostics rule wants that queryable and warnable with the fixing call (`setBidiClassBackend`).
- Levels are per UTF-16 code unit (documented, and consistent with the layout stack) — fine, but worth keeping stated wherever runs meet shaping.

## Charter contradictions

None. The implementation matches both decisions (compact default + rust-designated full table; separate cell from `textsegment`), and the known deferrals (N0, full table) are exactly the charter's Open directions 1–2.

## Contract & docs fit

- Seam and types (`BidiClass`, `BidiClassBackend`, `BidiRun`, `BidiDirection`) in `@flighthq/types` (`Bidi.ts`); deps exactly `types`; `sideEffects: false` with lazy default; `out`-param L2; full unabbreviated names; single barrel. `crate: null` matches the charter (the full-table backend, not this algorithm, is the rust candidate — though hosting UAX #9 itself in rust later is a fair question).
- `agents/index.md` Package Map: **no `textbidi` entry exists** in the Input/text paragraph — a candidate revision.

## Candidate open directions

- Paragraph splitting: should `resolveBidiLevels` handle multi-paragraph text (split on class B, each with its own P2/P3 base), or is the caller (textlayout) contractually feeding one paragraph at a time? The charter gestures at "paragraph rules" in Open direction 2 without fixing the seam.
- Should mirroring (L4 / `Bidi_Mirroring_Glyph`) live behind the same `BidiClassBackend` (one data seam) or a sibling query? It is required for correct RTL rendering and is absent everywhere today.
- Is a vendored BidiTest-derived conformance fixture acceptable in-repo (size vs. assurance), or should conformance live only beside the future rust backend?
