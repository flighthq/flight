---
package: '@flighthq/swf'
updated: 2026-08-07
---

# swf — the loss-path audit

Where this importer can lose something without saying so. **Enumeration only: nothing here is wired, on
purpose.** Wiring is separate work that can be estimated from this list rather than guessed at.

**The real output is a denominator, not a list of wires.** A capability with no loss path needs no
instrument, so "how much can we see" is a fraction of the capabilities that *can* silently lose something
— and that population was unknown before this audit. 80 was never the target.

## What this audit has actually read

Stated per file, because an audit certifies a population at a moment and its own report is not evidence of
its own coverage.

| File | Read? | Result |
| --- | --- | --- |
| `swfShape.ts` | yes, in full | **no unreported loss path** — every early exit nulls the whole shape, which *is* reported |
| `swfMorphShape.ts` | yes, in full | one unreported family |
| `swfBitmap.ts` | yes, in full | **none at import** — its failure surfaces as a throw in the resolve lane |
| `swfText.ts` | yes, in full | one unreported family |
| `swfDocument.ts` | **partially** — the reject set and the definition-storing patterns; ~2,850 lines not read line by line | two unreported families found so far |

`swfFilter.ts`, `swfFrameAction.ts`, `swfReader.ts` and `swfEditText.ts` are **not yet read**.

## Confirmed unreported loss paths

### 1. A morph definition that does not decode is dropped silently

`if (decode() !== null) state.morphShapes.set(characterId, decode)`. Every failure inside
`swfMorphShape.ts` funnels here, so a morph character simply does not exist in the document and nothing
says why. Affects `swf.morph.define-morph-shape` and `-2`.

### 2. A static-text body that does not compose is dropped silently

`if (shape !== null) state.shapes.set(pending.characterId, shape)` in `appendSwfPendingTextShapes`. Same
shape as the morph case: the character vanishes. Affects `swf.text.define-text` and `-2`.

### 3. The whole-document reject path is almost entirely unreported

The tag loop has roughly eight distinct `return null` causes — snapshot-budget exhaustion, a duplicate
sprite id, a sprite body that does not end where it should, malformed lossless/video/bounded definitions,
a tag body overrunning its bounds — and **none emits a crumb**. The eight container-level `Reject` kinds
cover signature, container kind, decompressor, declared length, truncation and decompression failure;
they cover nothing *inside* the tag stream.

This is the same collapse already fixed for no-decompressor-versus-corrupt, with eight causes instead of
two. It matters more than the count suggests, because several of those causes are **verdicts about us
rather than about the file**: a document refused by our own snapshot budget and a document that is
genuinely malformed are not the same finding.

## Conflated causes — not losses, but not distinguishable either

`MAX_SHAPE_RECORDS` exhaustion nulls the shape and reports `swf.shape-body-unreadable`, the same kind a
malformed body produces. Nothing is lost silently, so this is not a loss path — but the crumb says the
file was unreadable when the truth is that **our cap refused it**. Same class as the snapshot budget
above.

## Capabilities audited and found to have no loss path

These are not gaps. A capability that cannot silently lose anything is correctly outside the
can-silently-lose denominator, and conflating it with *not yet audited* would make that denominator too
large and every ratio built on it too small.

- **`swf.document.set-background-colour`** — `readSwfBackgroundColor` reads three bytes and either sets
  the colour or, on a truncated body, returns without setting and the tag loop then rejects the whole
  document. It sets, or the document rejects. There is no third outcome for an instrument to report.

Strong candidates **not yet read**, and deliberately not claimed: the linkage capabilities
(`swf.linkage.symbol-class`, `swf.linkage.export-assets`) and `swf.placement.instance-name`, all of which
appear to be carried-or-reject-the-document rather than partially losable.
