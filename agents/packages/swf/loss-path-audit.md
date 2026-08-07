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

Every row below is **a self-report by the agent who did the reading**. Nothing has checked it; the
something-else-looking is whoever opens the file and disagrees. Treat a row as a claim about what was
read, not as evidence that it was read well.

| File | Read? | Result |
| --- | --- | --- |
| `swfShape.ts` | yes, in full | **no unreported loss path** — every early exit nulls the whole shape, which *is* reported |
| `swfMorphShape.ts` | yes, in full | one unreported family |
| `swfBitmap.ts` | yes, in full | **none at import** — its failure surfaces as a throw in the resolve lane |
| `swfText.ts` | yes, in full | one unreported family |
| `swfEditText.ts` | yes, in full | one unreported family |
| `swfFilter.ts` | yes, in full | one unreported family |
| `swfFrameAction.ts` | yes, in full | one unreported family, plus the truncation below |
| `swfReader.ts` | yes, in full | **no independent loss path** — every overrun sets the `valid` flag its callers check |
| `swfDocument.ts` | **partially** — the reject set and the definition-storing patterns; ~2,850 lines not read line by line | three unreported families found so far |

**Only `swfDocument.ts` remains partially read.** Everything else in the package has now been read in
full.

## Confirmed unreported loss paths

*Each family below was found by reading the source named in it. If you quote one, quote this line with it:
**found by inspection, not by a test — no instrument currently detects any of these.*** That is the point
of the list, and it is also its limit.

### 1. A morph definition that does not decode is dropped silently

`if (decode() !== null) state.morphShapes.set(characterId, decode)`. Every failure inside
`swfMorphShape.ts` funnels here, so a morph character simply does not exist in the document and nothing
says why. Affects `swf.morph.define-morph-shape` and `-2`.

### 2. A static-text body that does not compose is dropped silently

`if (shape !== null) state.shapes.set(pending.characterId, shape)` in `appendSwfPendingTextShapes`. Same
shape as the morph case: the character vanishes. Affects `swf.text.define-text` and `-2`.

### 3. An edit-text body that does not parse is dropped silently

`if (factory !== null) state.editTexts.set(characterId, factory)`. The third instance of one pattern —
morph, static text, and now edit text all vanish the same way. Affects `swf.text.define-edit-text`.

### 4. An unparseable filter list silently drops the placement's blend mode

`hasBlendMode` is gated on `filterListComplete`, so a filter list that does not fully parse causes the
blend-mode byte to go unread. The placement keeps the filters decoded so far and **loses its blend mode
with no crumb**. There is a `@flighthq/log` guard for the unknown filter id, but that is the warning layer,
not the structured one — a caller enumerating losses sees nothing. Affects `swf.placement.blend-mode`.

### 5. An ABC blob that yields no frame scripts is skipped silently

`if (byClass === null) continue`. Affects `swf.script.do-abc` and `swf.script.do-abc-anonymous`.

### 6. The whole-document reject path is almost entirely unreported

The tag loop has roughly eight distinct `return null` causes — snapshot-budget exhaustion, a duplicate
sprite id, a sprite body that does not end where it should, malformed lossless/video/bounded definitions,
a tag body overrunning its bounds — and **none emits a crumb**. The eight container-level `Reject` kinds
cover signature, container kind, decompressor, declared length, truncation and decompression failure;
they cover nothing *inside* the tag stream.

This is the same collapse already fixed for no-decompressor-versus-corrupt, with eight causes instead of
two. It matters more than the count suggests, because several of those causes are **verdicts about us
rather than about the file**: a document refused by our own snapshot budget and a document that is
genuinely malformed are not the same finding.

## The class: crumbs whose cause could be our own configuration

**Any diagnostic whose cause could be our own configuration must say which. Where it cannot distinguish,
it must say cause-unknown rather than pick one.** A wrong attribution is worse than no crumb: silence is a
known unknown someone might investigate, while a confident wrong attribution is a **false known** nobody
will. The third state is always available and always better than a confident wrong one.

This importer has **thirteen configuration limits** across five files. Eleven of them can refuse or
truncate real content, and **not one is currently distinguishable from a defect in the file** — every one
is a verdict about *us* that a conformance run would score against the corpus.

They fall into three severities, worst last:

| Severity | What a consumer sees | Members |
| --- | --- | --- |
| **Report missing** — a known unknown | the document is rejected, no crumb | `MAX_BUTTON_RECORDS`, `MAX_SPRITE_NESTING`, `MAX_TIMELINE_FRAME_ENTRIES` |
| **Report wrong** — a false known | a crumb blames the file | `MAX_SHAPE_RECORDS`, `MAX_GRADIENT_RECORDS`, `MAX_SHAPE_STYLES` → `swf.shape-body-unreadable`; `MAX_FONT_GLYPHS` → `swf.font-glyph-table` |
| **No failure at all** — scored as a clean pass | silence, and less content than the file authored | `MAX_FRAME_ACTIONS`, `MAX_TEXT_RECORDS`, `MAX_GRADIENT_STOPS`, `MAX_MORPH_STYLES` |

Two limits are correctly outside the class: `MAX_PIXELS` surfaces as a **throw** in the resolve lane,
which is loud and not an import-time loss; `MAX_GOTO_DEPTH` bounds playback rather than import, and the
diagnostic sink is closed by then.

### The worst member, because it produces no failure signal at all

`readSwfFrameActions` loops `for (let actions = 0; actions < MAX_FRAME_ACTIONS; actions++)`. On reaching
the cap the loop **exits and the function returns a script built from the first 10,000 actions** — not
null, not declined. The import succeeds, the frame script runs fewer commands than the file authored, and
nothing anywhere says so.

**This makes `swf.script.do-action`'s trustworthy-silence claim false.** Its wire covers a block *declined*
for carrying non-playback commands; it does not cover a block *truncated* at our cap. That capability's
`scope` audit marker has been withdrawn in
[instrumentation.json](instrumentation.json) rather than the wire being quietly repaired.

**This is not a failure of the scope audit, and saying so would misplace the remedy.** Property (3) asks
whether a *claim* covers what can be lost — and a silent truncation makes no claim, so there is nothing
for a scope audit to check. **A scope audit can only audit existing claims; it cannot find losses that
make none.** That is precisely why this loss-path audit is not redundant with it: **it is the only
instrument that reaches a loss which never announces itself.**

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
