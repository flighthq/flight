---
package: '@flighthq/textlayout'
updated: 2026-07-02
basedOn: ./review.md
---

# textlayout — Assessment

Verified against the live tree (14 source files, ~147 tests, ~37 exports) and the direction session (2026-07-02). Five charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 66/100.

## Recommended

Sweep-safe: within-package fixes, no design fork.

1. **Fix justification to distribute across actual word spaces.** Per charter Decision #3 — bug. Current model distributes at group boundaries; single-format text gets zero expansion. Count space characters within each group and distribute proportionally.

2. **Package Map description update.** Per charter Open direction #4.

## Backlog

- **Decompose `buildGroups` into passes.** Per charter Decision #2. Blessed but requires careful extraction and performance measurement. Truncation, bullets as post-passes. Not a quick sweep.
- **Vestigial `_text` parameter.** Per charter Open direction #1. User uncertain — leave for now.
- **Modern typography axis.** Per charter Open direction #3. UAX #14/29, full bidi — long-term, gated behind shaper widening.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: justification fix, Package Map
