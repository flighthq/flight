# SWF capability individuation — **unratified**

What decides whether two things are one capability row or two. Read this before quoting any
`N of M capabilities` number for SWF, and before adding or splitting a row in `capabilities.json`.

**`capabilities.json` is frozen** until a rule below is ratified. The committed count is **82**. Both
candidate rules yield something else, and neither is ratifiable as it stands.

## The problem this doc exists for

A count with no stated individuation rule is not a measurement. It is a tally.

82 was never *wrong*; it was never *defined*. Nothing said what would make `DefineShape` and
`DefineShape2` one entry instead of two, so the number could not be checked — only recounted. Unlike a
missing member, this cannot be closed by finding more rows: every other denominator correction closed an
error, and this one says the instrument had no scale marked on it.

The tell costs one question — **what would make these one entry instead of two?** — and if nobody can
answer, there is no denominator yet.

## The candidate rule, and why it needed two readings

The proposed rule is **"routes distinctly"**: if the importer routes two tag codes differently, they are
two things the importer does. That is not a convention being chosen — it is what *capabilities of the
importer* already means.

But "routes distinctly" is itself under-defined, which is the same defect one level in. A separate case
arm? One arm that reads a version and branches inside? A shared reader taking a version parameter? An
under-defined rule for fixing an undeclared convention just relocates the arbitrariness from the rows to
the rule, somewhere harder to see, because a written rule looks settled.

So both readings the phrase can bear are implemented, and both totals are reported. Neither is elected
here.

- **Reading A — "discriminated".** Two tag codes are one capability iff no decision anywhere in
  `packages/swf/src` ever mentions one without the other. A *decision* is the maximal boolean expression
  a `=== TAG_*` comparison participates in.
- **Reading B — "same dispatch arm".** Two tag codes are one capability iff they enter the same arm of
  the tag loop, with predicate helpers inlined one hop.

## What they measure

Run `npm run capabilities:individuation`. On the tree that produced this doc:

| Reading | Total | Composition |
| --- | --- | --- |
| A — discriminated | **80** | 40 non-tag rows + 40 tag classes |
| B — same dispatch arm | **66** | 40 non-tag rows + 26 tag classes |
| committed | 82 | — |

Reading A merges two row pairs the importer genuinely cannot tell apart: `ExportAssets`/`SymbolClass`
and `PlaceObject3`/`PlaceObject4`. Reading B additionally collapses the fonts, the JPEG family, the
buttons, and — in one class — shapes 1–4, both texts, both morph shapes, and edit text.

**Neither is 85.** The prediction that splitting the three collapsed entries would raise 82 to 85 applied
the rule to the collapsed rows only; the rule applies to the split rows too, and there it *merges*. Both
measured numbers are below the committed one.

## The finding that outranks both numbers

**Reading A is not stable under a behaviour-preserving refactor.**

Rewriting `resolveSwfShapeVersion`'s if-chain as an equivalent `Map` lookup — same inputs, same outputs,
same behaviour for every byte of every file — collapses the four `DefineShape` versions into one class
and lowers the total. Measured, not predicted: the same script run against the rewritten source.

**The measurement was 80 → 77, and that pair is a one-off historical result, not a live property.** It was
taken against a deliberately modified tree that no longer exists, at the commit whose subject is
`docs(swf): measure both individuation readings; reading A moves under a no-op refactor`. Nothing
recomputes it — `npm run capabilities:numbers` gates the 80 because that is the current tree, and cannot
gate the 77 because reproducing it requires editing the source first. **A reader who needs the current
figure must redo the experiment; quoting 77 as today's value is quoting a tree nobody has seen.** The
finding is the *direction* and the fact that it moves at all, which is what survives.

A rule whose denominator moves when only the source style moves is **measuring the source, not the
importer**. That is a third axis of incomparability of exactly the kind already known — a number that
shifts while nothing about the importer or the corpus changed — except produced by the individuation rule
itself rather than by bookkeeping around it.

Reading B is stable under that rewrite. It is also coarse enough to call shapes, text, morph shapes, and
edit text a single capability, which no consumer of a conformance score would accept.

**So the syntactic-fact requirement is satisfiable and still not sufficient.** Being extractable from
source makes a rule checkable; it does not make it a rule about behaviour. A stated rule shows someone
decided; it does not show the rule decides.

## The tag-dispatch cross-check, and its measured ceiling

`npm run capabilities:tag-dispatch` cross-checks the declared list against the tags the importer actually
dispatches on. **It reports and does not enforce, and it is deliberately absent from `npm run check`.**

**The ceiling is 42 of 82.** Only capabilities whose identity is a tag can be checked this way;
everything individuated by a fill kind, a stroke property, a placement flag bit or a backend axis is
invisible to it. The script measures and prints that number on every run rather than carrying it in
prose, so it cannot go stale while looking authoritative.

**I estimated this ceiling before building it, and the estimate was high — wrong in the flattering
direction.** The measured value is whatever `npm run capabilities:tag-dispatch` prints; the estimate is
deliberately not repeated here, because a stamped stale figure still supplies a value to anyone who needs
one, and supplying it is the whole harm. What is worth keeping is that the estimate was wrong and which
way.

### What it catches, and the hole found by trying to make it fail

Two defect classes, **both verified by mutation rather than asserted**: a capability row naming a tag the
importer never dispatches on, and a tag constant declared but never dispatched on. Each was made to fire
by a deliberate edit, and the edit reverted.

The first attempt at that verification **failed, and the failure was the useful part.** A planted row
naming a nonexistent tag did *not* trigger the defect — it landed in "out of scope", the bucket meaning
*not identified by a tag, nothing to see*. A claim with no code behind it and a legitimately non-tag
capability were **collapsing into one bucket, and the bucket read as fine.** That is the same
two-populations-read-as-one shape the capability work keeps finding, reproduced inside the instrument
built to check it.

It cannot be fixed mechanically: from an id alone, `swf.bitmap.define-bits-jpeg-9` and `swf.fill.solid`
cannot be told apart as "names a tag that does not exist" versus "is not a tag capability". So rows whose
id *reads* like a tag claim but match no declared tag are now reported as **check by hand**, with the
ambiguity stated. On the current list two legitimate rows land there — `swf.axis.sound-format-non-mp3`
and `swf.bitmap.define-bits-jpeg-tables`, the latter a composite of two tags. **A visible bucket that
needs a human beats an invisible one that does not ask.**

## The third sweep: where a safe default and a measured negative are the same value

`npm run capabilities:default-collisions`. **Reports, does not enforce, absent from `npm run check`.**

`null` because nothing was looked up and `null` because something was looked up and found nothing are the
same bytes. **The representation stores the distinction away at write time**, so no care at read time
recovers it — by the time a reader is being careful, the two states are already one value.

**Its arity is neither per-site nor cross-site: it relates a WRITE to a READ.** A line-by-line read sees
one site and cannot see that two writers converge; the silent-drop sweep sees a shape and not where its
value is later consumed. This one names the convergence and still cannot see the consumer, so it reports
where a distinction was *available to lose*, not where losing it cost anything.

**Measured: 193 candidates, of which 22 of 31 multi-cause sentinels report nothing at any of their
returns.** The remaining nine are already resolved or partly resolved by diagnostic wiring.

**That number moved under this doc without the doc noticing, which is why the check exists.** It read 23
until `readSwfFile` was wired, and the sweep's own headline had been stale for hours. `npm run
capabilities:numbers` now recomputes every quoted figure here and fails when the prose drifts from it.

**The precision signal is the remedy already in the tree.** A diagnostic report at a sentinel return is
exactly what re-separates two causes the return value merges — so a function with as many reports as
sentinel returns has resolved its collision, and one with none has not. `uncompressSwfSource` returns a
sentinel from six places and reports eight distinct kinds; `readSwfFile` returns one from five places and
reports nothing. **The fix is countable, which is why that form is ranked rather than listed flat.**

**The ceiling is real rather than formulaic: a safe default no measurement can produce is fine**, and the
sweep cannot tell that from a genuine collision without reading the site — it does not know which values
the surrounding logic can compute. The 149 `field initialised to an empty value` matches are mostly that
case. Every match is a candidate.

### The first instance was in this cell's own artifact, written the same hour

`instrumentation.json` shipped with `lossPath: null`, and three different writer situations reached it:
no loss-family audit covered the capability, an audit covered it and its identity was recovered, and an
audit covered it but the identity could **not** be recovered. The first and third are opposite meanings —
*nobody audited this* versus *someone did and we cannot say who or when* — stored as identical bytes.

No row was in the third state, so the value was **correct by luck rather than by construction**, and the
consumer had already been told to read `null` as *unaudited*. It is now encoded as three explicit states
(`identified` / `unaudited` / `unidentified` with a reason). Verified by forcing the lookup to fail: 14
rows become `unidentified` where they would previously have read as `unaudited`.

## Where the importer's routing and the rows' grain disagree

The join between rows and tags is by name, and the disagreements are reported by the script rather than
smoothed over:

- **`DefineBitsLossless` / `DefineBitsLossless2` are covered by four rows keyed on pixel format**, not by
  tag. That is a second individuation rule, live in the same file: some rows individuate by tag, some by
  the format byte inside the payload. Neither reading above can adjudicate it, because both take the tag
  code as the unit.
- **`End`, `ShowFrame`, `JPEGTables`, `DefineBits`** are structural and correspond to no capability.
- **`DefineFontInfo2` and `SoundStreamHead2`** share a row with their version-1 tag.

## Two blind spots in the instrument, both measured

Found by testing the extractor, not by reading it. Both moved the *breakdown* by two rows each way; the
totals 80 and 66 held.

- **Six tags are routed by numeric literal in a `Map`, never through a `TAG_*` constant** — a
  constant-based extractor cannot see them at all. Without a table naming them they are silently counted
  as "not tag-shaped", which is a wrong composition rather than a missing row. That table is
  hand-maintained and **nothing detects a new literal-routed tag appearing.**
- **The name join is spelling-dependent.** Capability ids use British spelling and tag constants use the
  format's American spelling, so `swf.document.set-background-colour` missed `TAG_SET_BACKGROUND_COLOR`
  and fell into the non-tag bucket. One normalisation covers the known case; a future divergence fails
  the same silent way.

Both are the hand-maintained mapping the rule was supposed to remove, reappearing as the joint between
the rule and the rows.

## What a ratifiable rule would have to do

Not a proposal — the properties any candidate must be tested against, since the two above each fail one:

1. **Invariant under behaviour-preserving refactor.** Reading A fails; test it the same way, by rewriting
   a router and re-running.
2. **Fine enough that the classes are the things a consumer would name.** Reading B fails.
3. **States what happens when the importer's routing and a row's grain disagree** — and if the answer is
   a mapping, says in the doc that the mapping is the part that drifts.
