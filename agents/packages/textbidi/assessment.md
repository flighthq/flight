---
package: '@flighthq/textbidi'
updated: 2026-07-13
basedOn: ./review.md
---

# textbidi — Assessment

## Recommended

Sweep-safe, within-package:

1. **N0/BD16 bracket pairing** — implement the paired-bracket rule inside `resolveIsolatingRunSequences` with a small canonical bracket-pair table (the ON-class bracket set is tiny and script-independent). The charter's Open direction 2 names it; it is pure algorithm work over the existing pass structure, no seam change.
2. **Conformance fixture suite** — a curated, checked-in set of level/reorder expectations derived from UAX #9's test data (isolates, overflow depth, weak-type chains, neutral runs at sos/eos, numbers in RTL) exercising `resolveBidiLevels` + `reorderBidiLine`. The highest-leverage verification for code already written.
3. **`explainBidiClassBackend()` + `enableTextBidiGuards`** — plain-data query for the active backend and its coverage boundary, and an opt-in guard (via `@flighthq/log`) warning once when text contains code points the compact table resolves by default-'L', naming `setBidiClassBackend` as the fix. Straight application of the diagnostics convention to a known silent boundary.
4. **Compact-table sanity test** — an invariant test asserting the range table is sorted, non-overlapping, and ordinal-valid (guards future hand edits of the flattened triples).

## Backlog

- **Multi-paragraph handling (P1)** — parked: whether `resolveBidiLevels` splits on class-B separators or the caller feeds single paragraphs is a seam contract with `textlayout`; needs a charter ruling (Open direction noted in the review).
- **Mirroring query (L4, `Bidi_Mirroring_Glyph`)** — parked: design fork on where the data lives (extend `BidiClassBackend` vs. sibling seam); route to charter Open directions.
- **Full Unicode class + bracket tables** — parked: designated `flight-rs` backend (charter decision + Open direction 1).
- **`textlayout`/`textshaper` integration** — parked: cross-package (charter Open direction 3).
- **Package Map entry for `@flighthq/textbidi`** — parked: admin-doc revision gated by the user.

## Approved

_Empty — awaiting the user's verbal approval gate._
