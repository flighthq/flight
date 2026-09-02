---
package: '@flighthq/textbidi'
status: solid
score: 74
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# textbidi — Review

## Verdict

solid — 74/100. A real, from-scratch UAX #9 implementation covering explicit embeddings, directional isolates, isolating run sequences with sos/eos, the full weak/neutral/implicit resolution chains, L1 reset, and L2 visual reordering, behind the charter-decided compact-table `BidiClassBackend` seam. Test coverage improved substantially since the prior review (41 tests, up from ~14), with rule-by-rule coverage of embeddings, isolates, weak types, and neutrals. The two honest algorithmic holes remain N0/BD16 bracket pairing and the absence of a conformance harness. A new structural gap has emerged: the ratified explicit dependency model (2026-08-29) targets replacing the package's `setBidiClassBackend`/`getBidiClassBackend` module-scoped singleton with the already-typed `HasTextBidiClass` host facet.

## Present capabilities

- **`resolveBidiLevels(text, baseDirection)`** (`resolveBidiLevels.ts`, 445 lines) — per-UTF-16-code-unit `Uint8Array` levels implementing: P2/P3 (`'auto'` = first strong, isolate-skipping), X1-X8 with the 125-depth stack and overflow isolate/embedding counters, X5a-X6a isolates (BD9 initiator/PDI pairing in `pairIsolates`, FSI scoring via `computeParagraphLevel`), X9 (formatting chars retained as BN with levels), X10/BD13 isolating run sequences with sos/eos boundary types, W1-W7 (weak type resolution), N1-N2 (neutral runs), I1-I2 (implicit levels), and L1 (trailing whitespace/separator reset to paragraph level). Astral pairs share their code point's class. Explicit `'ltr' | 'rtl' | 'auto'` base direction.
- **`reorderBidiLine(levels, start, end, out)`** (`reorderBidiLine.ts`, 40 lines) — rule L2 as an `out`-parameter visual-to-logical index map, allocation-free across lines and sub-range capable; nested-level reversals compose correctly (tested for level-2 numbers inside RTL).
- **`getBidiRuns(text, baseDirection)`** (`getBidiRuns.ts`, 23 lines) — equal-level run grouping into `readonly BidiRun[]` (`{ start, end, level, direction }`) for per-run shaping, matching the charter's North star signature.
- **`BidiClassBackend` seam** (`bidiClassBackend.ts`, 242 lines) — `createCompactBidiClassBackend`, `getBidiClassBackend`, `setBidiClassBackend`. The compact default is a flat `[start, end, classOrdinal]` binary-searched range table (~43 range groups: Basic Latin, Latin-1, combining marks, Hebrew block, Arabic + Supplement + Extended-A + presentation forms, directional formats/isolates, whitespace/format runs), uncovered code points defaulting to `'L'`. Coverage boundary is documented at the definition.
- **Tests** (41 passing) — `resolveBidiLevels.test.ts` (23 cases: pure LTR/RTL, mixed embeddings, auto-base derivation, Arabic-Indic digits, W2 EN-after-AL, W7 EN-after-L, neutrals N1/N2, LRE/RLE/LRO/RLO overrides, LRI/RLI/FSI isolates, FSI content scoring, L1 trailing whitespace, empty text), `reorderBidiLine.test.ts` (6 cases: pure RTL, pure LTR, mixed, nested levels, out-reuse, sub-range), `getBidiRuns.test.ts` (7 cases: Arabic with embedded numbers, RLE/LRE embeddings, pure RTL/LTR, mixed, empty), `bidiClassBackend.test.ts` (5 cases: representative classification, uncovered-to-L default, lazy creation, seam install/restore/routing).

## Gaps

- **N0/BD16 bracket pairing is deferred** (documented in the header comment; charter Open direction 2). Mirrored brackets in mixed text resolve as plain neutrals (N1/N2), giving wrong-direction parentheses in the classic `hello (world) world` bidirectional cases. This is the most significant algorithmic omission for correct rendering of real-world mixed text.
- **No conformance harness.** UAX #9 ships `BidiTest.txt` and `BidiCharacterTest.txt` as machine-readable test suites. While the test count improved from ~14 to 41 with rule-by-rule coverage, the 445-line algorithm with its isolate/weak/neutral interaction space cannot be proven correct by hand-written behavioral samples alone. This remains the highest-leverage verification gap.
- **No mirroring query (L4).** A renderer needs `Bidi_Mirroring_Glyph` data (`(` to `)` in RTL) for correct glyph substitution. Nothing in the package or SDK exposes it.
- **No `explain*`/guards for the compact table coverage boundary.** A string with Thaana, N'Ko, Syriac, or other scripts outside the compact table silently resolves all-'L'. The diagnostics convention wants this queryable and warnable with the fixing call (`setBidiClassBackend`).
- **`setBidiClassBackend` is a module-scoped singleton targeted for removal.** The ratified explicit dependency model (2026-08-29) replaces all 48 `set*Backend` calls with Host fields. The `HasTextBidiClass` host facet is already typed in `@flighthq/types/Host.ts` (line 911), but textbidi's functions still reach for the module-scoped `_backend` internally instead of taking the backend as an argument or reading it from a host value. This is not a charter contradiction (the charter's decision predates the ratified model and addresses the compact-vs-full question, not the delivery mechanism), but it is a contract gap against the ratified codebase-level constraint.
- **No compact-table structural invariant test.** The flattened `_ranges` array (hand-authored triples) has no assertion that it is sorted, non-overlapping, and ordinal-valid; a hand edit could silently corrupt the binary search without failing any existing test.
- **Multi-paragraph text (P1).** `resolveBidiLevels` treats its input as one paragraph; class-B separators are L1-reset but do not split into independently-based paragraphs. Whether this is a package gap or a caller contract with `textlayout` is unresolved (charter Open direction 2).

## Charter contradictions

None. The implementation matches both charter decisions: compact default with rust-designated full table (Decision [2026-07-11] #1), and separate cell from `textsegment` (Decision [2026-07-11] #2). The known deferrals (N0, full table) are exactly the charter's Open directions 1-2. The `setBidiClassBackend` pattern is not a charter contradiction because the charter speaks to what data flows through the seam, not the delivery mechanism, and the explicit dependency model's host-migration target postdates the charter decision.

## Contract & docs fit

- **Types in `@flighthq/types`.** `BidiClass`, `BidiClassBackend`, `BidiRun`, `BidiDirection` all live in `@flighthq/types/Bidi.ts`. Correct.
- **Two export lanes.** `index.ts` (public: `getBidiRuns`, `reorderBidiLine`, `resolveBidiLevels`) and `contract.ts` (full: adds `createCompactBidiClassBackend`, `getBidiClassBackend`, `setBidiClassBackend`). Correct separation — the backend seam is contract-only.
- **`sideEffects: false`.** Declared and true: the compact table is lazily created on first query, not at import.
- **Single dependency.** `@flighthq/types` only. Correct.
- **Full unabbreviated names.** `resolveBidiLevels`, `reorderBidiLine`, `getBidiRuns`, `createCompactBidiClassBackend` — all self-identifying. Correct.
- **`out`-parameter on L2.** `reorderBidiLine` takes `out: number[]`, allocation-free across calls. Correct.
- **`crate: null`.** Charter says the full-table backend (not this algorithm cell) is the rust candidate. Fair, though hosting UAX #9 itself in rust later is an open question.
- **Package Map entry.** `textbidi` is listed in the Input/text line of the AGENTS.md Package Map. The prior review's gap here is closed.
- **Explicit dependency model tension.** The `HasTextBidiClass` host facet exists in `@flighthq/types/Host.ts` but is not wired — `resolveBidiLevels` and `getBidiRuns` call `getBidiClassBackend()` internally instead of receiving the backend as a parameter or through a host. This is the `set*Backend` singleton pattern the ratified model (2026-08-29) explicitly replaces. Candidate revision: the charter's decision wording ("A `getBidiClassBackend`/`setBidiClassBackend` seam") should be updated once the host migration slice reaches this package.

## Candidate open directions

- **Host migration for bidi-class backend.** The ratified explicit dependency model designates `setBidiClassBackend` for removal. Should `resolveBidiLevels` and `getBidiRuns` take the backend as a parameter, or should they accept a `HasTextBidiClass` host value? This is the same structural fork every `set*Backend` package faces, and the charter should record the decided shape once the migration slice reaches textbidi.
- **Paragraph splitting (P1).** Should `resolveBidiLevels` handle multi-paragraph text (split on class B, each with its own P2/P3 base), or is the caller (`textlayout`) contractually feeding one paragraph at a time? The charter gestures at "paragraph rules" in Open direction 2 without fixing the seam.
- **Mirroring query placement (L4).** Should `Bidi_Mirroring_Glyph` data live behind the same `BidiClassBackend` interface (one data seam) or as a sibling query? It is required for correct RTL rendering and is absent everywhere in the SDK today.
- **Conformance fixture policy.** Is a curated, checked-in set of level/reorder expectations derived from UAX #9's test data acceptable in-repo (size vs. assurance), or should conformance testing live only beside the future rust backend?
