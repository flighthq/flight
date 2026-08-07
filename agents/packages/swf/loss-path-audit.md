---
package: '@flighthq/swf'
updated: 2026-08-07
---

# swf — the loss-path audit

Where this importer can lose something without saying so. **The enumerate-only rule has been lifted:
families are now wired as they are confirmed, one commit each.** A row's wiring state is stated on the row;
`agents/packages/swf/instrumentation.json` is the machine record of which wires have a fire proof and which
have a silence proof.

**Wiring a family is also the strongest test of whether it is one.** Family 6's third member survived
three readings as a loss and did not survive an attempt to make it fire.

**The real output is a denominator, not a list of wires.** A capability with no loss path needs no
instrument, so "how much can we see" is a fraction of the capabilities that *can* silently lose something
— and that population was unknown before this audit. 80 was never the target.

## Wiring state, as counts

Counts rather than a ratio, deliberately. A denominator that shrinks when you investigate while the
numerator grows from the same investigation improves from effort alone, and would arrive dressed as
rigour.

**13 loss paths · 12 wired with a fire proof · 1 demonstrated not-a-loss · 0 unfalsified**, across 12 numbered families.

**These are derived from the table below and never typed** — `npm run capabilities:numbers` recomputes
them and fails when this sentence drifts. **The first run of that derivation corrected them.** The figure
quoted all session was a different pair entirely — deliberately not repeated, since a stamped figure is
still a figure someone can reach for. It was neither a row count nor a family count: it
took the family numbering as the unit and then subtracted 6c as though it were a family of its own, when
6c shares family 6 with 6a/6b. **A count with two units in it, which is the individuation defect in
miniature, in the doc that records that defect.**

The unit is the **row** — one enumerated loss path. The `#` column groups rows into families, which is
why 13 and 12 both appear and why neither alone is the answer.

**Wired and fire-proven; the correctness of what each diagnostic *says* is unaudited.** The count is of
wires that FIRE, not of wires that say something TRUE — *has a reporting path* is not *reports
correctly*. Nothing here is withdrawn; the number simply stops carrying a meaning it never had.

What that caveat does and does not cover, so it is not read as wider than it is. Every fire proof asserts
the entry's `severity` and its full `detail` object, so the **payload at the tested input** is checked.
What is unaudited is whether those values are right across the inputs nobody tested: whether a severity is
the correct one of four, whether a `capability` attribution points at the capability a user would agree
lost something, whether a count is counting the right thing. **A wrong name leaves a caller confidently
wrong and acting; silence only leaves them uninformed** — so this is the more dangerous half, and it is
the half no instrument here measures.

**The twelfth arrived after the list was called settled, and the way it arrived is the finding.**
`npm run capabilities:silent-drops` sweeps for the shape that hides a silent drop. It reported three
matches, two already accounted for, and one that was not: `DoInitAction` declined its script and reported
nothing, while `DoAction` — **four lines below it, the identical decline, the identical shape** — reported
`swf.frame-script-declined`. Three passes over this file read both branches and nobody saw the asymmetry.
**A mechanical sweep found in one run what reading did not find in three**, which is the argument for the
sweep and equally the limit of the reading.

| # | Family | State |
| --- | --- | --- |
| 1 | morph definition undecodable | wired · fire + silence |
| 2 | static text uncomposable | wired · fire + silence |
| 3 | edit text unparseable | wired · fire + silence |
| 4 | blend mode behind an unfinished filter list | wired · fire + silence |
| 5 | ABC blob yielding no frame scripts | wired · fire + silence, names which DoABC form |
| 6a/6b | AVM2 frame script declined | wired · fire + silence, separates unreadable body from declined commands |
| 6c | morph path pair declined | wired as a guard · **demonstrated not reachable from SWF bytes**, silence proof only |
| 7 | sprite bounds union short | wired · fire + silence, reports a **count** |
| 8 | appearance channel with no node | wired · fire + silence |
| 9 | edit text font id unresolved | wired · fire + silence — **the recorded hole closed**, see below |
| 10 | font character id reused | wired · fire + silence |
| 11 | whole-document reject path | wired · eight container `Reject` kinds |
| 12 | init action declined without a crumb | wired · fire + silence — **found by the shape sweep, not by reading** |

**One hole remains, and it is WIRE-level rather than row-level — which the artifact could not express.**
6c's `swf.morph-path-pair-declined` wire has no fire proof and structurally cannot get one. Its capability
row also carries a *second* wire that IS fire-proven, so a non-empty `fires` made the row read as covered.
**A consumer following the artifact bytes would have counted zero holes there and been right about the
bytes.** The fix within the existing schema is to withdraw the row's `scope` audit, which is now done:
`scopeAudited` is 25 of 27, and the two withdrawn rows are where a wire is not covered by its row's proof.

**Found by builder4 asking an exact reconciliation question about two empty arrays, not by me.** They
also caught a third gap my hand-written note omitted — `swf.script.do-abc-anonymous` had no silence
proof and I had listed only two. **A note about an artifact is a third population again, and mine
disagreed with the bytes.** Both silence gaps are now closed.

**Row 9's hole closed, and how it closed is the point.** It was recorded as an absent silence proof for
want of a `DefineFont2` that parses. Nobody went back to try harder. It closed because a separate check —
proving each version-ternary wire routes to *both* generations, not only the one it was written on —
needed a parsing `DefineFont2` for its own reasons, and a glyph-less one turned out to be enough.
**A recorded hole is cheap to close later; an unrecorded one is never closed at all**, because nothing
says it is there.

That version-routing check found three of my own wires proven on one branch only — the morph, text and
font wires each carry a `version === n ?` ternary. **This is the same audit-drift shape, applied to me:
I had already run that check on the shape generations and did not carry it to the wires I wrote next.**

## What this audit has actually read

Stated per file, because an audit certifies a population at a moment and its own report is not evidence of
its own coverage.

Every row below is **a self-report by the agent who did the reading**. Nothing has checked it; the
something-else-looking is whoever opens the file and disagrees. Treat a row as a claim about what was
read, not as evidence that it was read well.

| File | Read? | Result |
| --- | --- | --- |
| `swfShape.ts` | yes, in full | **no unreported loss path** — every early exit nulls the whole shape, which *is* reported |
| `swfMorphShape.ts` | yes, in full | two unreported families, one of them a *partial* loss |
| `swfBitmap.ts` | yes, in full | **none at import** — its failure surfaces as a throw in the resolve lane |
| `swfText.ts` | yes, in full | one unreported family |
| `swfEditText.ts` | yes, in full | one unreported family |
| `swfFilter.ts` | yes, in full | one unreported family |
| `swfFrameAction.ts` | yes, in full | three unreported families, plus the truncation below |
| `swfReader.ts` | yes, in full | **no independent loss path** — every overrun sets the `valid` flag its callers check |
| `swfDocument.ts` | **partially** — the reject set, the definition-storing patterns, every cap call site, and a search for each known drop shape; not read line by line | five unreported families found so far |

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

### 6. The house-style pattern has three more instances, found by searching for the shape

Foreman predicted a fourth instance on the evidence of three. A single search for
`if (x !== null) collection.set/push(...)` with no `else` found **three** more, one of them a kind of loss
the first three did not have:

- `swfFrameAction.ts:30` — an ABC **method body** that does not parse is skipped, so any frame script
  bound to it silently never appears.
- `swfFrameAction.ts:164` — an AVM2 **frame script** whose commands do not parse is dropped. Affects
  `swf.script.do-abc` and `swf.script.do-abc-anonymous`.
- `swfMorphShape.ts` — **a single morph path pair that fails is skipped and the morph continues with
  fewer paths.** **Corrected on wiring: this branch could not be shown reachable.**
  `readSwfMorphShapePaths` walks the start and end record streams in lockstep and breaks the moment
  either runs out, so both halves of a pair are built with identical structure and the winding,
  contour-count and closedness mismatches `createPathMorph` declines on cannot arise from SWF bytes. It
  is a defensive guard, not a demonstrated loss path. **I listed it as a loss because it matched the
  searched-for shape, without asking whether it could fire — a search finds syntax, not losses.** The
  wire is in place with a silence proof and no fire proof, and the gap is recorded as a gap.

**This is the argument for a pattern-level remedy rather than seven wires.** The shape is mechanically
greppable, which means it is also mechanically *enforceable* — a lint rule over
`if (… !== null) …set(…)` with no `else` would prevent the eighth instance rather than wait for someone
to find it. A three-patch fix would have left these three, and the same search would have found them.

### 7. A sprite's bounds are silently too small when a child's bounds do not resolve

`swfDocument.ts:1303` — `if (childBounds === null) continue` inside the bounds union. The child is skipped
and the sprite's authored extent is computed from the remainder, so the authored rectangle is **smaller
than the sprite's contents** and nothing says a child was left out. **The second *partial* loss in a
surviving object**, after the morph path pair. Affects `swf.timeline.define-sprite`.

**What it does *not* cost, narrowed by an independent read after I first wrote this row.** I originally
implied the short box is what culling, hit testing, and layout read. It is not. Node existence is decided
from the parsed definitions, not from bounds: `populateSwfTimelineNode` retains the node when
`targetBounds` is null, a placed sprite is populated recursively regardless, the GL renderer traverses
visible children without testing authored bounds, and aggregate world bounds merge enabled child world
bounds — so the descendants still contribute. **The skip omits an authored local-bounds shortcut, not the
child, its rendering, or the aggregate box.** The loss is real and stays *diminished*; the consequence is
a reporting gap, not wrong output. Recording the narrowing because the alarming reading is the one that
would have jumped the queue.

### 8. The appearance report silently omits placements whose node was never allocated

`swfDocument.ts:755` — a placement carrying an advanced blend or a filter list is skipped when
`nodes.get(...)` returns undefined, which happens when its character was never imported. The appearance
report is the *only* carrier for those two channels, so the placement's blend and filters are lost with no
crumb. Affects `swf.placement.blend-mode` and `swf.placement.filter-list`.

### 9. An edit text silently loses its font family

`swfDocument.ts:1148` resolves a font name with `parsed.fontNames.get(fontId) ?? ''`, and `swfEditText`
then applies `if (fontName !== '') format.font = fontName`. **The `RichText` survives with its size, box
and colour and simply has no font family.** The source documents the decline — a font declared by class
name rather than character id is not resolved — but documenting it is not reporting it, and a caller
enumerating losses sees nothing.

**Found by searching for the partial-loss shape on purpose**, after that shape was named as a blind spot.
It is the third member of the worst cell: a surviving object carrying less, with no signal.

### 10. A duplicate font character id silently overwrites the first font

`swfDocument.ts:1967` — `state.fontOutlineSources.set(fontId, source)` with **no duplicate guard**. Every
other definition kind checks `definedCharacters` and rejects the document on a repeat: sprites at 1763,
buttons at 1886, bounded definitions at 2107. **Fonts do not.** A second `DefineFont2` carrying the same
character id discards the first font's glyph table and nothing says so.

Two things make it worth listing separately from the other families. It is **inconsistent with the
package's own handling of the same malformation**, so the rule a reader infers from the other three is
wrong here. And it is a **surviving-but-wrong** case rather than a surviving-but-diminished one: the
document imports, the font exists, and it is the wrong font — **no existence check and no count can see
it.** (`fontId === 0` also returns silently at 1966.)

**Found by searching for a shape nobody had searched: a store with no duplicate guard.** The audit's
earlier passes looked for things that vanish and then for things that shrink; this one looks intact.

### 11. The whole-document reject path is almost entirely unreported

The tag loop has roughly eight distinct `return null` causes — snapshot-budget exhaustion, a duplicate
sprite id, a sprite body that does not end where it should, malformed lossless/video/bounded definitions,
a tag body overrunning its bounds — and **none emits a crumb**. The eight container-level `Reject` kinds
cover signature, container kind, decompressor, declared length, truncation and decompression failure;
they cover nothing *inside* the tag stream.

This is the same collapse already fixed for no-decompressor-versus-corrupt, with eight causes instead of
two. It matters more than the count suggests, because several of those causes are **verdicts about us
rather than about the file**: a document refused by our own snapshot budget and a document that is
genuinely malformed are not the same finding.

## Two axes, not one ladder

The severity ladder — *report missing*, *report wrong*, *no failure at all* — is about **signal**. It is
not the only axis. **Content fidelity is orthogonal to it, and its three values order themselves by which
check they defeat:**

| Fidelity | What survives | Caught by |
| --- | --- | --- |
| **Missing** | nothing | an existence check |
| **Diminished** | the object, carrying less | existence passes — **a count catches it** |
| **Substituted** | the object, at full size, wrong | existence passes, count passes — **only a content comparison** |

**That ordering is the useful part: each value defeats one more class of check, so the axis says what the
oracle needs rather than only what went wrong.**

**It orders by *check defeated*, not by *harm*.** A missing font may hurt a user more than a substituted
one. The axis is an oracle specification — it says what you must build to see a thing, and nothing about
how bad the thing is. Read as a severity scale it will justify the wrong priorities.

**And one consequence for the oracle it specifies: a hash comparison detects *change*, not *wrongness*.**
It compares an output against a previously recorded run of this importer, so a substitution present at
first capture hashes identically forever and reports green. Catching *that* needs an expectation derived
from the format's own structure — *distinct glyph tables equals the count of `DefineFont*` tags* — which
fails on the duplicate store the first time it runs, with no prior capture to compare against. Crossed with signal, the worst cell is *substituted with
no signal* — nothing about the output distinguishes it from a clean import.

Members found so far: `swfMorphShape.ts:180` and `swfDocument.ts:1303` are **diminished**;
`swfDocument.ts:1967` is **substituted**; the rest are **missing**.

**A search shaped by one fidelity value cannot find another**, and this audit has needed three distinct
queries to reach three values — *things that vanish*, *things that shrink*, *stores with no duplicate
guard*. **Each new query shape has returned something, which is a reason to doubt that the list is
complete rather than evidence that it is.** A search's coverage is bounded by the searcher's vocabulary of
failures, and that vocabulary grew three times while this audit was being written.

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

## A gap in the census itself, and why its self-check could not see it

The declared enumeration had **no button capability**, while `readSwfButtonDefinition` ends in
`state.sprites.set(buttonId, { frames: [placements], … })` — a button *is* retained content, and
`MAX_BUTTON_RECORDS` truncates that retained list. `swf.button.define-button` and
`swf.button.define-button-2` are now declared; the count moved from 80 to 82.

**The census probe's self-check reports any capability the walk emitted that the explicit list forgot, and
it could never have caught this.** No button `hit()` was ever added to the walk and no button entry to the
list, so the two agree and the check is silent. **It detects list-versus-walk disagreement, not
walk-versus-reality** — a capability absent from both is invisible to it by construction. Two artifacts by
one author agreeing is not corroboration, and it removes the trigger to look further.

What found it was comparing `capabilities.json` against [tag-coverage.md](tag-coverage.md) — **two
artifacts with different provenance**, which had never been compared. That cross-check is cheap and found
a real denominator gap on its first run. **Its own honest limit: it flagged four tags and two were false
positives** (`DefineBitsLossless` is covered under labels naming pixel formats rather than the tag;
`ShowFrame` is a frame boundary, not a capability). A one-in-two hit rate makes it a candidate detector,
not a proof.

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
