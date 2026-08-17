# Inert-gate audit

Audited at `6369398b6` against this doctrine: a verification tier either gates its claimed subject or
fails loudly; it must not silently degrade to success. The referenced `agents/capture-verification-tiers.md`
was not present in this clone or reachable history, so capture tier names below use the executable mapping
documented in `captureValidation.ts`: smoke is Tiers 1/2/4, parity is Tier 3, and committed-fingerprint
regression is Tier 5.

**The three standing questions, enumerated.** Every finding below interrogates an **instrument** —
a gate, a check, a script whose exit status someone reads as a verdict:

> **Q1 — what exact bad state must make this process fail, and has it ever failed on that state?**
> **Q2 — can the bad state reach it in production?**
> **Q3 — which way does it fail when it is wrong: toward *stop*, or toward *proceed*?**
> **Q4 — what proposition does this instrument actually evaluate, and is it the one its readers believe
> it answers?**

They fail independently and in that order of discovery, not of importance. Q1 unproven means the gate
may be incapable of failing; Q2 unmet means it is capable but never reached; Q3 is not a pass/fail on the
gate at all — it prices the other two, because an instrument that fails toward *proceed* is strictly
worse than one that fails toward *stop*, and nobody investigates a green.

**Q4 is logically prior to Q1–Q3 and numbered last only because it was written last: read it first.**
There is no point asking whether an instrument can fail, whether the bad state reaches it, or which way
it fails, until you know what it is asserting. An instrument can satisfy Q1–Q3 completely and still be
worthless — capable of failing, reachable by the bad state, failing toward *stop*, and evaluating a
proposition adjacent to the one anyone cares about. **That failure is invisible precisely because the
instrument is working.** Its worked instance is
[a differential oracle is blind upstream of the fork](#2026-08-16-a-differential-oracle-is-blind-upstream-of-the-fork),
which is deliberately not restated here: parity evaluates *the backends agree* while its readers took it
to mean *the render is correct*, and the population that proves it is measured in that section rather
than quoted twice. The general form is there too — a differential oracle can only find divergence, so it
is blind by construction to anything upstream of the fork, and what settles a question the instrument
cannot reach is a **discriminating input**, not more green.

A caution for anyone re-measuring that population: **a naive grep understates it badly.** Of the
`appendShapeBeginFill` call sites in `functional/scenes/`, only 13 pass an inline 8-hex literal; **106
pass `colors[i]` or `colors[i % colors.length]`**, and a further 34 pass a named identifier. A pattern
matching literals sees roughly a fourteenth of the surface and reports a confident small number — Q4
applied to your own search.

**Three ways that same search has since come back wrong, all in the direction of a confident small
number.** They are worth listing because each looks like a result:

- **Wrong argument position.** `appendShapeLineStyle(shape, thickness, color, …)` takes its colour
  **third**. A parser reading argument two classifies `thickness` values and reports **0 colour literals
  across 105 sites**. **A zero from a parser is the shape of a parser looking in the wrong place** —
  disbelieve it before publishing it. Corrected, that family contributes 68 more sites.
- **Wrong scope.** Two partitions agreed exactly on 192 call sites, and both were scoped to
  `functional/scenes/`. Repo-wide the surface is **426** across both colour-taking functions. Agreement
  is worth the independence of the weakest shared step, and scope is a step.
- **Enumerating the bad form instead of the good one.** A check for "any surviving six-digit literal"
  silently passes a bare `0` — which is opaque black under 24-bit RGB and **fully transparent** under
  packed RGBA, i.e. the exact defect, in production importer source. **Enumerate the accepted form and
  flag the remainder**, so the check fails toward *stop*.

**The rule that would have prevented every one of them**, reached by `builder2` after four of these in
a row and sharpened by `manager` after it failed a fifth time:

> **Enumerate the DEFINITION space, not the usage space** — a usage space always has another usage
> outside it, and a definition space closes.
> **But only if enumerated by what FLOWS, not by how it is SPELLED.**

The second half is not decoration; it was learned by the first half failing. An enumeration over the
correct boundary — every exported function of the owning package — still came up short by six, because
its filter matched the *identifier* `color` and those six take a `MorphShapeColorEndpoint` **struct**
with no parameter of that name. It answered *"which functions have a parameter spelled colour"* while
being read as *"which functions take a colour."* **A correct boundary with a name-based predicate is
still a leaking boundary**, and it looks closed, which is worse than looking incomplete.

**Where that leaves the strongest available form of the claim.** A count is a claim about *a search*;
a chokepoint is a claim about *the code*. The count here was wrong by six and the chokepoint survived
both corrections — so when both are available, prefer the one that **cannot be wrong because of how you
looked**. And when even the chokepoint is challenged, drop to the **type**: the data interface's field
list is not a list anyone maintains by hand, and extending it is a visible act with a compiler behind it.

**And a zero that means "not measured here" rather than "nothing here":** `appendShapeBeginGradientFill`
and `appendShapeLineGradientStyle` report 0 to every scalar-argument parser **by construction** — their
colours are `number[]`. A 0 in that row beside rows reading 121 and 68 reads as no-problem-here. It is
not a finding; the arrays need their own instrument, and none has been run.

**A scope boundary sits beside them and is deliberately not a fourth question** — see
[the standing questions audit instruments, not inferences](#2026-08-16-the-standing-questions-audit-instruments-not-inferences).
Q1–Q3 all assume the measuring apparatus is at fault. When the instrument measured correctly and the
*conclusion* drawn from it did not follow, none of them reaches it, and the check is a different one:
*what else is equally consistent with this measurement?*

**Enumeration history, so the numbering is not mistaken for age.** The 2026-08-16 entries were written in
separate clones by agents who could not read each other's sections, so each was deliberately written
ordinal-free — numbering then would have asserted the contents of a document the author could not see,
and two sections both claiming to be third is worse than none claiming it. This pass was made once every
2026-08-16 entry was on one tree and all three were verified present by content, each exactly once.

## 2026-08-16: every gate reads the functional scenes; nothing executes them

Filed at manager's instruction as a standing gap, deliberately **not** as cleanup attached to the revert
that exposed it. The revert closes one bad guard. The gap it revealed is permanent and was here before
that guard existed.

**The instance.** A guard added to `createWgpuRenderEffectPipeline`
(`packages/effects-wgpu/src/wgpuRenderEffectPipeline.ts`, `cc3d61ed3`) threw on any `sampleCount > 1`.
Functional scenes call that constructor at **module scope**, so the throw fired on import: the affected
scenes could not be loaded at all, never mind rendered. Integration reports **102 scenes** unable to
execute, with **every gate green** at the point it reached them. That count and the green are theirs, not
mine, and are recorded here as relayed.

What is measured here is the consequence, on this clone, at `cc3d61ed3`: a capture of the `effect-`
scenes on `webgpu` returned **42 failed, 10 captured**, and **42 of 42** failures carried the identical
string `sampleCount 4 is unsupported`. Not one had any other cause. The same cells were `ready` in a
capture taken 2h18m earlier, before the guard landed — so the population is not merely broken, it is
newly broken, and the only instrument that noticed was a real browser.

**Q2 in its purest form to date.** Ask what has to be true for a check to catch an unloadable scene: the
check must *load the scene*. Measured on this tree, nothing does.

- **Typecheck reads them.** `functional/tsconfig.json` sets `"include": ["scenes/**/*.ts"]`, so every
  scene is fully typechecked. `createWgpuRenderEffectPipeline(state, { sampleCount: 4 })` is a
  well-typed call expression. It always was. A `throw` reachable at module scope is not a type error and
  no amount of static strictness makes it one.
- **The tooling enumerates them as paths.** `packages/tool-capture/src/captureEntries.ts` and
  `scripts/watch-capture.ts` are the only non-test files naming `functional/scenes`, and they treat it as
  a directory of *routes*, not modules to import.
- **No test imports one.** `git grep -l "from '.*functional/scenes" -- '*.test.ts'` returns nothing, and
  `functional/` appears in no Vitest project.

So the bad state — a scene module that throws on import — has **no path to any check between commit and
capture**. It is not that the gates are weak on this; it is that the class of defect and the class of
instrument do not intersect. Every gate is a reader; the defect is only visible to an executor.

> **A scene is source that every gate parses and no gate runs. Static-clean is the strongest claim the
> check surface can make about it, and the check surface does not say so.**

This is the reachability question from
[a gate can fire in its test and be unreachable in production](#2026-08-16-a-gate-can-fire-in-its-test-and-be-unreachable-in-production)
with the polarity flipped once more. There, a gate could not fire because its input list could not contain
its trigger. Here, no gate is even implicated: the trigger is well-formed input to every one of them. That
is why it fails toward *proceed* (Q3) with nothing anomalous to notice — green is the correct output of
each instrument individually, and the aggregate green is still false.

**The cheapest closure is an executor, not a better reader.** Anything that imports every scene module and
reports the ones that throw would have caught all 102 in seconds, with no browser, no adapter, and no
pixels — the failure is at import, so it needs no rendering at all. That is a different shape from every
existing functional gate, all of which are downstream of a successful load.

**A measurement caution, since this doc already carries its sibling.** Sizing the population by grep
undercounts it. `createWgpuRenderEffectPipeline(state, { sampleCount: 4 })` as a single-line pattern
matches **29** scene files; the capture that actually executed them failed **42**. The remaining 13 pass
the same value through a binding or a differently-formatted argument. The grep is not wrong about what it
matched — it is wrong about what a reader takes the number to mean, which is Q4 pointed at your own
search, exactly as recorded for the `appendShapeBeginFill` sweep at the top of this file. **Both times the
undercount ran in the direction that made the problem look smaller.**

## 2026-08-16: a check that starts failing after an unrelated fix may have been passing for the wrong reason

The dangerous instinct this exists to name: a green check turns red immediately after a fix lands, and the
obvious reading — *the fix broke it, revert* — is exactly backwards when the check was only ever passing
because two errors cancelled. Reverting restores the false pass by re-breaking the thing that was fixed.

**The instance.** `effect-lut-grade`'s scene never supplied a LUT, so its grade had always been identity —
a defect present from the day the scene was written. Its assertion should have failed from that day. It did
not, because the renderer's signed-shift unpacking scrambled the channels into something that happened to
clear the assertion's threshold. The RGBA migration corrected the unpacking, the cancellation disappeared,
and the assertion began reporting what had been true all along.

> **A passing check can be the product of two errors cancelling. Fixing either one alone makes it fail —
> so a check that goes red beside an unrelated fix is evidence about the CHECK's history, not necessarily
> about the fix.**

**Two accounts were both right, and neither was the mechanism.** "Pre-existing" was true of the DEFECT.
A same-host before/after bracket — the cell captured `ready` with its assertion passing before the
migration, `error` after, with the earlier capture's recorded `sourceHash` proving it predated the change —
was true of the OBSERVATION. They were answering different questions and appeared to contradict each other.
The reconciliation was a third thing: which of two defects was still masking the other. **When two careful
accounts conflict, check whether they are answering the same question before adjudicating between them.**

**The scan this demanded, and its result.** If one assertion was clearing its threshold on wrongly-unpacked
channels, others might have been. That is answerable rather than speculative when both sides of the fix
have been captured on one host: diff every cell's assertion outcome across the renderer change.

| | count | cells |
| --- | ---: | --- |
| cells present in both roots | 493 | the whole corpus |
| **passed under the old renderer → fails after the fix** | **2** | `effect-lut-grade` webgl + webgpu |
| failed under the old renderer → passes after | 2 | `env-ibl/webgpu`, `material-alpha-map-pbr/webgpu` — both WebGPU buffer-map timeouts, i.e. flaky capture recovering, not a masked defect |

**Lut-grade was the only one.** That is a measured answer over the full corpus with both sides present, not
an absence of evidence.

**What the scan does not answer, stated so it is not over-read:** it detects assertions whose verdict
FLIPPED. An assertion that passed before for a wrong reason and still passes now — on correct pixels — is
invisible to it. That is a different question, and its criterion is the delta-versus-expected-value shape
recorded in the entry below, not this one.

**And the assertion is not the thing to fix.** The fix belongs in the scene that never supplied a LUT. The
assertion is now doing exactly its job and is the only reason anyone knows; loosening its threshold to make
the red go away would restore the silence it just broke.

## 2026-08-16: an assertion that the render CHANGED can be satisfied by the wrong change

The differential-oracle blindness recorded above, one level down — inside a single scene's own assertion,
where it is harder to see because the assertion looks specific. Diagnosed by builder; the bracket that
forced the diagnosis is recorded here because the interpretation was wrong twice before it was right.

**The instance.** `effect-lut-grade`'s scene assertion samples one cell and throws unless it differs from
the authored colour:

```ts
const maxChange = Math.max(Math.abs(r - 255), Math.abs(g - 48), Math.abs(b - 48));
if (maxChange < 15) throw new Error(`… is within 15 of original (255,48,48) — LUT grading not applied`);
```

It asserts **difference from the input**. It never states what the graded output should BE. So any
perturbation satisfies it — including a perturbation produced by a defect.

**Which is exactly what happened, and it took two bugs.** The scene never supplies a LUT to
`createLookupTableGradeAdjustment`, so the grade has always been identity: no grading, ever. That should
have failed this assertion from the day it was written. It did not, because the *old* renderer's
signed-shift defect scrambled `0xff3030ff`'s channels into something that happened to differ from the
authored value by ≥15. **Two defects cancelling into a passing assertion.** The RGBA migration corrected
the unpacking, removed the accidental cancellation, and the assertion began correctly reporting what had
been true all along.

> **A passing scene assertion is not proof the render is right. It can be the product of two defects
> whose errors happen to cancel — and the shape that makes this possible is asserting that something
> CHANGED rather than what it changed TO.**

**Why the interpretation was wrong twice first**, which is the part worth copying. A smoke report called it
pre-existing, which closed the question. A same-host bracket then contradicted that: the cell captured
`ready` and its assertion PASSED before the migration, and `error` after, with the earlier capture's
recorded `sourceHash` proving it predated the change. That looked like the migration causing a regression.
Both readings were half right and neither was the mechanism: the bug was pre-existing, AND something did
change — **which of two defects was still masking the other.** Neither "pre-existing" nor "newly broken"
was a category the truth fit in.

**The consequence for the commissioning bar**, and it qualifies an argument this arc won rather than
merely adding to it. The bar treats a passing scene assertion as its correctness condition, on the reasoning
that it is the only place semantic intent enters the pipeline. That reasoning stands for a *missing*
assertion. It does not stand for a *delta-shaped* one: an assertion that says only "something happened"
encodes no intent about the output, so a cell can satisfy the bar's one semantic condition while nothing
has ever stated what its pixels should be. The bar cannot see the difference — `oracle: invoked` is binary,
and the static ranking attempt recorded in [capture verification tiers](capture-verification-tiers.md)
could not separate strong assertions from weak ones either.

**The review criterion this yields**, more useful than the ranking that failed: an assertion should state
the expected VALUE, not the distance from the input. `svg-clip-path` does it (`kept point is #33ccff`,
`clipped point is black`); `effect-lut-grade` did not. When an assertion's failure message says *"is within
N of original"*, it is a difference assertion, and it will pass for any reason the pixels move.

### Addendum — the ruling this produced, and one correction to how it was sharpened

Filed as an addendum to the non-discriminating-threshold scan rather than as its own finding: same
question — *does this assertion prove anything* — reached from the assertion's **message text** instead
of from its **bound**. (That scan is not on this base at `f183929a7`; the cross-reference is by name and
still needs wiring when it lands. Nothing below depends on it.)

**The ruling.** Requiring a scene assertion is **necessary, not sufficient**. A second requirement sits
beside it: the assertion must be **value-shaped** — stating what the output should BE, not that it differs
from the input. A delta-shaped assertion satisfies the gate while proving nothing.

**The cheap syntactic tell beat the clever metric.** Worth recording as a result about instrument design,
not just about this scene. A static ranking of assertion strength was built, validated against twelve
assertions already observed firing on real renders, and **deleted**: it spread those twelve across the
23rd–71st percentile and put four of them below its own median, so it could not discriminate. What
did work is a grep for the phrase *"is within N of original"* in the failure message. The failure message
is where the author states, in prose, what they believed they were checking — so a difference assertion
announces itself in the one place nobody thought to read. **The simpler instrument won, and it won because
it read a channel the sophisticated one ignored.**

**One correction to the sharpened form, because the flattering version is not what the evidence shows.**
The upgrade offered was that the delta shape is blind to *each* of the two defects **independently** —
that neither *no LUT supplied* nor *bad channel unpacking* would have been caught alone. That is not what
this assertion does, and the arithmetic settles it. Pre-fix the scene passed
`createLookupTableGradeAdjustment({ strength: 1 })` with **no LUT**, an identity grade, so the red cell
renders its authored `0xff3030ff` unchanged:

    maxChange = max(|255-255|, |48-48|, |48-48|) = 0,  and  0 < 15  ->  throws

So *no LUT supplied*, alone, **is** caught by this assertion — which is precisely the mechanism already
recorded above ("that should have failed this assertion from the day it was written"). Only the unpacking
defect is invisible to it. Accepting the stronger phrasing would have contradicted the section it was
strengthening.

**The true stronger form, which does hold.** A delta-shaped assertion partitions every possible defect
into two classes: those that leave the sampled pixel *identical* to the authored value, and those that
*move* it. It catches the first class, which contains essentially one degenerate member — the total no-op.
It is blind to the second, which is **unbounded**: every wrong grade, every wrong channel order, every
partially-applied LUT, every unrelated effect that happens to tint the cell. So the shape is not a
correctness check that happens to have a hole; it is a **no-op detector** being read as a correctness
check. That is strictly stronger than "two defects cancelled" — it holds for one defect, for three, and
for a tree with no defects at all — and unlike the version offered, it survives contact with the
arithmetic.

## 2026-08-16: what the good version looks like — a guard that refuses to answer

Every other instance in this document is an instrument that failed toward *proceed*: green while checking
the wrong proposition, or silently dropping what would have contradicted it. This one is the counterexample,
recorded because the document had no worked example of the shape it keeps asking for, and because it caught
a live instance of the very failure the entry above describes.

**The instance.** After the base moved, a capture was re-run to refresh a census whose facts were known to
be stale. It produced **zero cells** — not a crash, a refusal, from `resolveStaticServer`
(`packages/tool-capture/src/captureServer.ts:217-222`):

> The static build is older than the current source. This capture measures the PREVIOUS code, so a change
> under test will look like it had no effect. Run `npm run build:functional` and retry.

**Three properties worth copying, in the order they matter.**

**It names the consequence, not the symptom.** "Dist is older than source" is a fact about timestamps and
means nothing to a reader in a hurry. *"A change under test will look like it had no effect"* is what
happens next, and it is the sentence that makes someone stop. Compare the collapsed verdict recorded
elsewhere in this document — one message covering two causes with opposite remedies — which named a
symptom and sent the investigation the wrong way.

**It refuses rather than degrading.** There is no partial answer, no warning-and-continue, no count that
would have to be caveated. A stale capture's output is *the most persuasive wrong answer available*: it
reports the pre-change result, which reads as **"the change had no effect"** rather than as a failure to
observe it. A number that plausible must not be produced at all.

**It is deliberately wide, and the source says so.** It fires on any capture-source edit, including ones
that cannot reach the bundle, and pays an unnecessary rebuild when it does. Its own comment records why the
narrowing was rejected: *"a stale dist silently served 22 missing routes and cost the fleet most of a day,
and every narrowing is a new chance to mis-classify one source as irrelevant. Pay the rebuild."* A gate
whose false-positive cost is a rebuild and whose false-negative cost is a day of wrong answers should be
tuned toward the rebuild — and the reasoning is recorded at the gate rather than in someone's memory.

**Why it belongs in this document rather than in a praise file.** It answers Q3 — *which way does it fail
when it is wrong* — with **stop**, on an instrument where failing toward *proceed* would have been
invisible. And it caught a real instance: the census being refreshed was stale in exactly the way the
message predicts, four scenes had gained oracles the old capture facts could not see, and one cell was
being reported as lacking the very thing it had. **The guard was the only thing in the loop that knew.**

## 2026-08-16: a silent omission makes the data you DO see unfalsifiable

`scripts/oracle-calibrate.ts` built its identity set from the cells that parsed AND reported `ready`. A
cell that failed on **every** run therefore entered no map, no identity set, and no bucket: it did not
report as `incomplete`, it **vanished**, and the totals still looked complete without it. Fixed at
`53ae51767`; `readRun` now tracks `seen` — every identity with a `status.json` present, whatever the file
says — separately from the subset that yielded a hash.

**The numbers, on real local data rather than a fixture.** Two capture runs the author had been quoting
throughout the arc:

| | agreed | disagreed | incomplete | accounted | seen |
| --- | ---: | ---: | ---: | ---: | ---: |
| before | 483 | 0 | 164 | 647 | — |
| after | 483 | 0 | 172 | 655 | 655 |

Eight cells were absent from every report the tool had produced. The same defect had already published
`491 agreed / 0 disagreed / 0 incomplete` for a 493-cell corpus in a real cross-host CI run, caught only
because a reader happened to know the corpus size.

> **A silent omission does not just lose data; it makes the data you DO see unfalsifiable, because the
> thing that would contradict it is exactly what went missing.**

**The same defect bit the same person twice, in opposite directions.** The tool silently dropped eight
cells from every calibration report. Separately, six of those same cells surfaced through a different
check and were reported as live render defects — they were stale residue from deleted scenes, and the
report was retracted. Neither reading corrected the other, because neither side knew the cells were being
dropped by the other instrument. One instrument said nothing about them and the other said the wrong
thing, and the two errors were mutually invisible.

**What the eight actually were, since "eight cells" is a count and this document does not accept counts.**
Seven are residue: `svg-gradient/{canvas,webgl,webgpu}` and `svg-stroke/{canvas,webgl,webgpu}`, whose
scenes no longer exist, plus `bitmap-downscale-smoothing/webgl`, a column its scene no longer has —
status dated three weeks stale, absent from the second run entirely, absent from the coverage manifest.

The eighth is live and was worth finding: **`env-ibl/webgpu`** is a required coverage-manifest cell whose
scene files exist, and it failed in **both** runs, same day, with
`createBitmapFromWgpuRenderState: frame capture buffer did not map within 8000ms`. Consistently failing,
not flaky — and it had been mislabelled as environment flakiness on the belief it had captured in one run.

**The sharpest part is a cross-instrument disagreement.** The commissioning bar in
`scripts/oracle-eligibility.ts` reads the same capture tree and reported `env-ibl/webgpu` correctly as
`capture-failed`, and withheld its sibling `env-ibl/webgl` as `sibling-column-failed`. So one instrument
dropped the cell while another named it, over identical input, and nobody noticed the first was wrong
**because the second was right**. A spot-check for the cell would have found it present. That is what makes
this failure mode different from a gate that cannot fire: the missing data is not merely absent, it is
covered for.

**And the consequence is worth more than the eight cells, because it names a detector nobody has built.**
The contradicting evidence was never missing. It was sitting in another instrument's output, available and
unread, for the entire arc — `capture-failed functional/env-ibl/webgpu` in one report while the other
reported nothing about that cell at all. Nobody went looking because the second instrument was right and
nothing suggested the first was wrong.

> **Agreement between instruments reading the same input is not the thing to check for. DISAGREEMENT
> between them is a signal, and nothing currently watches for it.**

Every check in this repository asks whether one instrument is internally sound — can it fail, is it
reached, which way does it fail, what does it actually assert. None asks whether two instruments over the
same input describe the same world. That question needs no new measurement: both reports already exist,
and the comparison is free.

Two cautions for whoever builds it, so it is not stillborn. **Divergence is not by itself a defect** — the
calibrator's population is the capture tree while the commissioning bar's is the coverage manifest, so
residue legitimately appears in one and not the other. The detector's output is *where two instruments
disagree about a cell, and whether that difference is explainable*, not *they must match*. And it must
report the difference **by name**: a count of divergences is the same failure this entry is about, one
level up.

**Q2 and Q4 together, which is why the remedy is an assertion rather than a wider search.** The bad state
could reach the instrument (it did, eight times) and the instrument evaluated a proposition adjacent to
the one its readers wanted: *of the cells that produced a hash somewhere, how many agreed* rather than *of
the cells in this run, how many agreed*. No amount of re-running answers that. The fix is that the tool
now prints `cells seen` and asserts `agreed + disagreed + incomplete === seen`, printing
`accounting: BROKEN — N bucketed vs M seen` when it does not, so the discrepancy no longer requires a
reader who already knows the corpus size. **A total that does not reconcile must say so in the report that
carries it.**

The limit that remains, stated rather than implied: a cell with **no** `status.json` in **any** run is
still invisible here, because nothing on disk distinguishes "never attempted" from "does not exist". That
needs the coverage manifest — the same requirement join `oracle-check.ts` uses for the same gap.

## 2026-08-16: a differential oracle is blind upstream of the fork

The largest population this audit has recorded, and the clearest instance of its central question —
*does the check actually fail on the bad state it is supposed to catch?* Traced by builder from two
unrelated-looking symptoms (`effect-tone-map`'s transposed channels and `effect-channel-mixer` appearing
not to apply); the code locations and the population below were verified independently before this entry
was written.

**The instance.** `appendShapeBeginFill` (`packages/shape/src/shapeCommands.ts:143`) takes a **24-bit
RGB** colour. That is stated at `packages/types/src/ShapeFillRegion.ts:8-10`, in a comment that names the
hazard exactly:

> `24-bit RGB (0xRRGGBB)` — opacity is the separate `alpha` on the fill, not a fourth channel. This is
> the shape authoring convention, NOT the packed RGBA most SDK colors carry.

Functional scenes pass packed **32-bit RGBA**. Every backend then reads the wrong bytes, because every
backend implements the documented convention correctly — canvas at
`packages/scene2d-canvas/src/canvasShapeCommands.ts:454-459` does `(color >> 16) & 0xff`,
`(color >> 8) & 0xff`, `color & 0xff`, and the GL and WGPU mesh shape renderers pass `region.color`
through to the same 24-bit interpretation. For an author writing `0xff5ce0ff` meaning R=`ff` G=`5c`
B=`e0` at full alpha, the renderer reads R=`5c` G=`e0` B=`ff`: every channel shifted one byte, red
discarded, alpha read as blue.

**The population, counted rather than estimated.** Of 163 functional scene files calling
`appendShapeBeginFill`, **117 pass a 32-bit RGBA value at at least one of 119 call sites**; 66 call sites
pass a correct ≤24-bit value. Counted by extracting the colour argument at every call site and resolving
scalar and array constants declared in the same file — 7 call sites remain unresolved, all of them a
`color` parameter of a local helper.

> **A DIFFERENTIAL ORACLE CAN ONLY EVER FIND DIVERGENCE, SO IT IS BLIND BY CONSTRUCTION TO ANYTHING
> UPSTREAM OF THE FORK.**
>
> Corollary, for the gate this instance is about: **parity proves agreement, not correctness.**

Roughly a hundred scenes rendered demonstrably wrong colours, every backend agreed exactly, and the
parity gate stayed green throughout. The gate did not malfunction, no baseline was stale, and this was
not a near miss: it is the gate working exactly as designed, on the wrong question. A comparator's whole
power comes from its operands differing, so it can see only what happens AFTER the point where its
operands could diverge. The wrong 24 bits were chosen before that point — in a shared authoring
convention every backend then read identically and correctly — so they were never among the states parity
is capable of distinguishing.

This is why a **discriminating input** settled it and no amount of parity green ever could have. The two
are not the same kind of evidence at different strengths; the differential gate has no sensitivity to this
class at all, and running it a thousand more times adds nothing. It is the same shape as the commissioning
bar's `oracle: invoked` blindness recorded elsewhere in this arc: agreement and stability are not
correctness, and only something that states what the pixels should MEAN can tell the difference.

**Question 3, at a scale not seen before in this arc.** The audit's standing question is whether a check
fails on the bad state it claims to catch. Here the honest answer is that the bad state was never in the
set of states the check CAN distinguish — not unreachable (the trigger arrived, at 119 call sites), not
untested, simply outside the sensitivity of a comparator whose operands were both wrong in the same way.
The general form above is what makes that predictable in advance rather than only in hindsight: for any
differential check, ask where the fork is, and treat everything upstream of it as unmeasured.

**The sharper edge: the divergence was known, and documentation was the remedy that was tried.** Someone
wrote a precise comment describing the mismatch instead of removing it, and it did not prevent 117 scenes
from getting it wrong. That is the diagnostics convention's *missing guard* pattern one level up — a
missing **design fix**, not a missing warning. It also contradicts the codebase map's own constraint,
which names this exact hazard: *"Colors are packed RGBA integers (`0xeeddccff`) with one convention across
the SDK, not a color type or a mix of RGB-with-separate-alpha conventions."* A comment that warns callers
about a convention mismatch is evidence the convention is wrong, not that callers need reminding.

**Ruled:** fix the API, not the ~100 callers. Pre-release, no migration obligation, and leaving the trap
armed for caller 118 is the worse outcome.

## 2026-08-16: the standing questions audit instruments, not inferences

A scope boundary on this document's method, recorded because the method got strong enough in one day to
start absorbing things it does not fit — and filing an error under the wrong doctrine is the same error
one level up.

Every standing question here interrogates an **instrument**: what bad state must make it fail, whether it
has ever failed on that state, whether that state can reach it, which way it fails when it is wrong. All
of them assume the thing at fault is the measuring apparatus.

**There is a second failure with its own check: the instrument measured correctly and the CONCLUSION
drawn from it did not follow.** No amount of interrogating the instrument reaches it, because the
instrument is fine.

The worked instance is from the same day. A ranking metric was validated against known-firing oracles;
the measurement — 12 oracle/renderer pairs, scores spanning the 23rd to 71st percentile of a 325-oracle
corpus, 4 below the median — was correct, checked, and correctly scoped. The inference drawn from it was
that *uniformity across the set made a host-coupling explanation more credible*. That does not follow.
Uniformity distinguishes a single cause from a mixed population; it says nothing about WHICH single
cause, and was equally consistent with the rival hypothesis already on the table (a real render change
with no commit found). What actually supported host-coupling was a different pair of facts: that 436 of
450 baselined cells reproduce in that environment, and that the 14 which do not are GPU-heavy WebGPU plus
DOM text/stroke — a composition predicted in advance rather than read off the result.

**The check that catches it is not "state your population".** It is: *what else is equally consistent
with this measurement?* Population discipline — the habit that catches a true count generalised past the
cells it examined — would have passed this case cleanly, because the population was right. The two
failures are independent, and a reader who has just internalised one is at their most likely to file the
other underneath it.

## 2026-08-16: no gate can tell whether a functional scene still LOADS

A **Q2** instance at corpus scale — the bad state cannot reach any check — and the reason it is worth its
own entry is that **the obvious remedy does not work, and the next reader will propose it.**

**The instance.** A guard added to `createWgpuRenderEffectPipeline` rejected `sampleCount > 1`. **102 live
call sites passed `sampleCount: 4`** — 91 functional scenes and 11 examples — every one at *module scope*,
so each throw fired as its scene module executed. Those 102 scene modules became unloadable and **nothing
in the repository said so**: `npm run check` was green across 29 stages and the whole-repo sweep was green
at 1554 files / 18619 tests.

**Why every gate missed it.** To `check`, `typecheck`, `lint` and the entire vitest surface, a functional
scene is **data** — no gate imports one. Only a capture executes them. And `sampleCount: 4` is a perfectly
valid `number`, so the type layer had nothing to object to. **The whole static surface can be green while
the functional corpus is unloadable.**

★ **THE OBVIOUS REMEDY WAS TESTED AND FAILS. Do not propose it again.** "A gate that merely *imports* every
functional scene module would catch this cheaply, and needs no renderer" — plausible, and wrong:

```
plain node (tsx)   ->  IMPORT FAILED: window is not defined
vitest jsdom       ->  FAILED: Failed to resolve entry for package "@flighthq/sdk"
```

Both are **environmental** and fire long before the module reaches the pipeline call, because scenes call
`createWgpuCanvasElement(...)` and `createWgpuRenderState(...)` at module scope. Such a gate would report
**~200 scenes broken on every run, forever** — as useless as one that never fires, and worse in one
respect: it would be switched off within a week, and the hole would then carry a closed ticket.

**What works, and it is what actually found the 102: a static ARGUMENT check.** Scanning for
`createWgpuRenderEffectPipeline(…, { sampleCount: N })` with `N > 1` needs no runtime, no browser and no
GPU, and completes in under a second. **The guard belongs at the argument, not at the execution** — a
lint-shaped rule about values a backend cannot honour. It generalises to every backend-neutral options
type where one backend accepts a field another cannot fulfil.

**State the direction, because the instrument is one-way.** The static check **cannot tell you a scene
runs**; it can only tell you a scene **cannot** run, for this one cause. That is fine — one-directional
instruments are sound as long as the direction is declared. This one fails toward *stop* and yields only
true positives, since a caller passing an unhonourable value is broken by construction.

> **The general property — "does this scene still load?" — is capture-only and nothing cheap will answer
> it. The specific property — "does any caller pass a value this backend cannot honour?" — is statically
> decidable. Put the guard on the second and stop hunting for a cheap version of the first.**

## 2026-08-16: a gate can fire in its test and be unreachable in production

Found at `866c7712d`, closed at `f8d13e12b` and `14b9788c4`. This entry is one worked instance and a
resulting amendment to the method above; it is not a new population sweep.

**The instance.** `scripts/oracle-check.ts` implements the four-state table in
[render oracle repository](render-oracle-repository.md) §6 through the pure `joinOracleState`, and three
of those states — `missing`, `pending-uncaptured`, and `orphan` — each had a firing test in
`scripts/oracle-state.test.ts` that **passed**. Two are hard failures (`missing-reference-image`,
`orphaned-reference-image`) and one is the narrow allowance that lets a commissioned run stay green.
All three were unreachable from the running gate.

The cause was one level above the gate. `check()` built its cell list **from the extracted pack images
alone**, so it could only ever ask *do the bytes we already have still match* — the one question that
cannot detect an absence. A required cell that no pack supplied never entered the list, so `missing` and
`pending-uncaptured` had no input to fire on; and every pack-derived cell arrived marked `required: true`
by construction, so `orphan` had none either. The consequence in use: a freshly commissioned cell
reported **nothing at all** rather than `pending`, and a reference image that silently stopped being
published read as a clean run.

> **A tested gate wired to a list that cannot contain its trigger. The passing test is not incidental to
> the concealment; it IS the concealment.**

An audit that greps for gate names finds all three covered. An audit that asks *has this gate ever fired
on that state* also finds all three covered — it has fired, in the test. Both audits return green on a
gate that cannot fire on the tree.

**The method amendment.** The question this document has asked of every finding is:

> **Q1** — what exact bad state must make this process fail, and has it ever failed on that state?

For these three the honest answer was **yes**, and they would have passed that audit unchanged. The
question is necessary and not sufficient, so it gains a companion:

> **Q2 — can the bad state reach it in production?**

Firing is not reachability. A gate can be provably capable of failing and still sit somewhere its trigger
never arrives. The two questions fail independently: a gate that has never fired is unproven, and a gate
that fires only in its own fixtures is unreachable, and neither symptom is visible from the other's
evidence.

**Reachability cuts both ways**, found the same day at `14b9788c4` and worth recording beside it. The
commissioning bar's sibling-column condition was reachable by a trigger that should not have existed:
`findScenesWithAFailedColumn` read every capture fact in the artifacts root, and a capture root
*accumulates* — a fresh run writes the current suite and deletes nothing. A three-week-old `error` record
for `bitmap-downscale-smoothing/webgl`, a column the scene no longer has, was withholding that scene's two
live columns. So the companion question has a mirror — *can a state that is not bad reach it?* — and the
same fix answers both: intersect the gate's input with the live manifest rather than with whatever is on
disk.

That fix is not local to this gate, which is why the residue half is filed separately in the
[tool-capture cell](packages/tool-capture/status.md) `## Open` and the two entries point at each other.
Read either alone and it reads as an incident; read together they are one rule with three known
instances — this gate, the capture-analysis read that produced seven retracted defect reports, and
`evidence:baseline`'s exact-`--target` fix. **Operate on a declared list, not on found state.** A
directory listing, an artifacts root, and a pack manifest are all statements about what once happened,
never about what is live now.

**Why the coverage landed where it did.** `oracle-eligibility.ts` (442 lines) had 37 tests while
`oracle-check.ts` and `oracle-commission-batch.ts`, which touch the real tree and the real workflow, had
none. That distribution is not an accident of effort:

> A pure function is cheap to test **and** cheap to get wrong, because it cannot be wired to the wrong
> thing. So coverage accumulates there, while the wiring — where being wrong actually costs — stays
> untested.

Whether the pieces connect is not testable by the instrument that tests the pieces. The only instrument
that answers it is running the real process and diffing its output and exit codes against the same run
before the change; that is what established the closure here, on the real tree rather than in fixtures.

**Closure.** The requirement join was extracted to `withRequiredIdentities` in `scripts/oracle-state.ts`
and covered by seven tests, three of which drive it end to end through `joinOracleState` to assert the
three formerly unreachable states. Before that, all three were observed firing against the real tree and
then reverted: required-and-unpinned with no request → `missing`, exit 1; the same cell with an open
request → `pending-uncaptured`, exit 0; a pinned image with its requirement removed → `orphan`, exit 1.

## 2026-08-13 follow-up: repository check processes

Audited at `e6f845bbb`. This pass derived the population from process-level verdicts, not from the
`*:check` suffix: a gate is a process whose exit status is consumed by `scripts/check.ts`, a hook, CI,
or a documented checkpoint. An alias is not another gate, and a report/generator is not a gate unless a
caller treats its exit as a verdict. That makes the bare `npm run check` runner's 24 unique leaf stages
the primary population. The seed list contributes 17 of those leaves; `build:check` and `capture:check`
are composites, while the two capture leaves and `reachability:runtime:check` are independent processes
outside the bare runner. The findings below are ranked; this is not a suffix inventory.

For every finding the question was: _what exact bad state must make this process fail, and has it ever
failed on that state?_ Cheap mutations were restored immediately. No frequency or repository-wide defect
rate is inferred from this deliberately adversarial sample.

| Rank | Gate | State that must be red | Has this gate failed on that state? | Finding |
| ---: | --- | --- | --- | --- |
| 1 | `capture:{examples,functional}:check` | Every selected target has a screenshot hash, and any mismatch is red | **No for missing evidence.** A missing `sha256` becomes `baselineHash=null`, `changed=null`; the final predicate only consumes render failures and `changed > 0`. Existing hashes can and do reject mismatches. | **P1 — strict capture evidence is partial.** Current discovery finds 7 target columns without screenshot hashes. Validation separately fails a wholly zero-comparison regression run, but becomes green after one comparison; 79 current target columns lack fingerprints. These include the WebGPU columns for `effect-blend-advanced`, `material-blend-modes`, `node-blend-modes`, and `node-blend-modes-fixed`. Other covered columns let the processes return green. **RECOMMENDATION:** require coverage for every selected target, with named exceptions rather than `null` evidence. |
| 2 | `reachability:check` | Removing an exported registrar from the claimed inverse/ownership population is red | **No outside three effects backends.** Renaming `registerWgpuUnlitMaterial` to `installWgpuUnlitMaterial` reduced the reported inventory from 301 to 300, yet the command exited 0 with `Built-in runners and per-kind registrars are exact inverses` and an unchanged lane baseline. | **P1 — the headline is broader than the hard population.** Only `effects-canvas`, `effects-gl`, and `effects-wgpu` feed `violations`; the repository-wide registrar census, `UNCATALOGUED` rows, and lane drift are non-blocking inventory. The command guide describes that distinction, but the command name and green headline do not. **RECOMMENDATION:** qualify the verdict as effects-only, or promote the intended repository-wide ownership/inverse conditions into the failure predicate. |
| 3 | `portable:check` | A shipped use of a runtime-dynamic mechanism outside the claimed C++-lowerable subset is classified or red | **No for `Object.defineProperty`.** The token screen and `violationOf` cover seven named mechanisms only; neither recognizes it. The surviving `render-gl` and `render-wgpu` uses are runtime-tier accessors, precedented as lowerable by opacity, so they are not proof of a violation; they prove the construct never reaches classification. The seven implemented rules are live. | **P2 — the verdict claims a semantic subset while enforcing a syntax list.** **RECOMMENDATION:** either classify and calibrate `defineProperty` or narrow the success line and contract to the seven enumerated escapes. |
| 4 | Direct selector-aware leaf checks | A selector matching no files is configuration failure, not proof that the named subject is clean | **No in five direct leaves.** `exports:check`, `order:check`, `portable:check`, `reachability:check`, and `type-home:check` each exited 0 for `__inert_gate_no_match__`; exports explicitly reported `0 files`. | **P2 — the shared zero-selection guard stops at the aggregate runner.** `npm run check -- __inert_gate_no_match__` exits 1 by name, as do the corresponding `test` and `size` controls. The normal scoped checkpoint `npm run check <selector>` is therefore protected; the exposed path is specifically a direct leaf invocation with a selector. **RECOMMENDATION:** make selector resolution return a required nonempty selection to every selector-aware leaf. |
| 5 | `tool-capture` CLI gate invocations | An unknown option, especially a misspelled strictness option, is usage error | **No.** `flag`/`hasFlag` recognize options opportunistically, but no command validates the remaining `argv`; an option such as `--fail-on-chagned` is ignored and leaves `failOnChanged=false`. | **P2 — a typo can turn an intended gate into an ordinary capture.** The fixed root npm scripts spell their flags correctly, so this does not invalidate those exact aliases; it invalidates ad hoc/documented CLI gating as fail-closed. **RECOMMENDATION:** declare allowed value/boolean options per command and reject unknowns before starting a server or browser. |
| 6 | `check:append-only-ledgers` | A working-tree edit to a guarded historical line is red | **Only when a baseline revision resolves.** With a baseline, editing a `Decisions` line failed by cell, section, and original text. When every candidate contains `HEAD` (or no candidate resolves), the process prints that it verified nothing and returns 0; its tests pin this outcome. | **P2 — loud skip still satisfies an exit-status gate.** On a fully integrated checkout, an uncommitted ledger edit is never read even though the implementation says the working tree is the subject. CI's fetched branch comparison normally supplies a baseline for work in flight; local/pre-commit use can be false-green. **RECOMMENDATION:** when guarded working-tree files differ from `HEAD`, use `HEAD` as the baseline; otherwise distinguish “not applicable” from a successful verification in callers. |

Finding 2 is now closed by the separate committed identity set in
`scripts/reachability-registrars.json`. `reachability:check` diffs exact `(package, registrar)` pairs and
names every addition and loss; `reachability:registrars:baseline` is the explicit whole-repository-only
acceptance path. The decisive replay renamed one registrar to a replacement, keeping the census at 301:
the gate exited 1 and named both `registerWgpuUnlitMaterial` as `LOST` and its replacement as `ADDED`.

### Confirmed live negatives

The findings above do not make every nearby gate suspect. The older mutation table below remains the
evidence for its eleven original stages. This follow-up independently broke and restored six newer
subjects: `backend-prefix:check` rejected the wrong exported registrar prefix and named its actual bad
segment; `catalog:check`, `facets:check`, `capabilities:check`, `capabilities:sites:check`, and
`instrumentation:check` each rejected a deliberately stale generated artifact by path. Their restored
forms all passed. The append-only check rejected an edited ledger line when a baseline was present.

The aggregate runner also fails closed on an empty selector and continues through independent leaves
before returning its aggregate verdict. The `test` and `size` selector controls likewise rejected an
empty selection. These are real negative controls, not inferences from a clean run.

### Borderline, explicitly undecided

- `catalog:check` currently verifies a declared empty Stage 4 catalog. It is mutation-proved live against
  stale output and says `0 entries`; whether the catalog must already be populated is a product decision,
  not an inert-gate verdict.
- `reachability:runtime:check` is not currently false-green: a clean run exits red with 52 unprobed
  assemblies, 8 probed-empty assemblies, and 8 collision keys. It is also absent from the aggregate and
  CI. The process computes `stateAdapter.canFail` and `orderedComparator.canFail` negative controls but
  does not consume them in its failure predicate; the existing baseline failures mask that gap. Treat it
  as a report-shaped `:check` whose intended blocking contract is undecided, not as evidence of safety.

## 2026-08-13 follow-up: which check processes CI actually invokes

that doc audits whether a gate CAN fail; this audits whether it RUNS.

"That doc" is everything above this section. The distinction matters because the two failures are
independent and neither implies the other: a gate can be mutation-proved live and never execute, and a
gate can execute on every push while being unable to fail. The `5eba48616` follow-up above found two
instances of the first by hand; this pass asks it of the whole population rather than of whichever
gates someone thought to check. Audited at `18930fda1` against all four `.github/workflows/*.yml`,
over the 162 scripts in the root `package.json`.

**Result: 40 of 162 are reachable from CI; 122 are not.** Of the 40, 18 are named directly in a
workflow and 24 are leaves of bare `npm run check` (two are reached both ways).

### Method: a name grep of the workflows is wrong in both directions

Neither direction is safe alone, which is why the number above is not a grep count.

- **False negatives.** The workflows name only 18 scripts, but `npm run check` (tests.yml, `quality`)
  fans out to 24 leaf gates that appear in no `.yml` at all. Grepping `packages:check` across the
  workflow files returns zero hits, and it runs on every push. Resolving this needs the closure:
  `npm run X` inside script bodies transitively, the `scripts/check.ts` gate table matched back by
  underlying script FILE plus check-flag rather than by label, and the matrix values behind
  `npm run ${{ matrix.check }}`. Two gates (`lint`, `format:check`) are registered through a ternary
  rather than an array literal, so even a parse of that table misses them.
- **False positives.** A first pass scored `test:regression` and `electron:gallery` as invoked. Both
  hits were in workflow COMMENTS — and one of them is the comment explaining why regression is
  EXCLUDED. Scoring a documented exclusion as coverage is the worse error of the two, because it
  reports the gap as closed.

Cross-check: 24 leaves in bare mode is the same count the `e6f845bbb` pass above derived
independently ("the bare `npm run check` runner's 24 unique leaf stages").

### Findings: gate-shaped, exits nonzero on a real bad state, nothing in CI runs it

| Gate | Subject | Disposition |
| --- | --- | --- |
| `evidence:check` | capture coverage manifest census | **Wired** into bare `npm run check` |
| `capture:{examples,functional}:check` | committed screenshot hashes | **Wired** onto the render-test matrix, pinned backends only |
| `reachability:runtime:check` | registrar runtime probe | Left alone; blocking contract undecided above |
| `test:size` | the `tools/size` vitest suite | **Not a finding after all, and the script no longer exists — see below** |

`evidence:check` is the sharpest case, because its own header states the intent it was denied: it
needs no browser, and "that is what makes it cheap enough to gate on rather than to run only at
acceptance time." Built to be gated on; not gated on. It is now mutation-proved live in the direction
that matters — pinning an oracle on `effect-bloom/canvas` that the scene does not export made it exit
1 naming `effect-bloom/canvas#oracle (pinned, no longer carried)`, which is exactly the pin-stopped-
being-true case the header says it exists to catch. It is green on the current tree, so wiring it
does not import a standing red.

Its placement is load-bearing and should not be "simplified" later. The coverage manifest is a
COMMITTED file, so a commit that deletes a pin from it touches no code and routes down the docs lane
under the `code`/`docs` filter split. Put in `quality`, the gate against silently retiring coverage
would itself be silently skippable through the exact door the manifest exists to close — the same
anti-correlation between a gate's coverage and its subject that the `docs:check` finding above
records. Bare `check` runs on every code path.

`test:size` earns its own line for the general shape, not the specific gap: **something that belongs
to no lane is invisible to any single-lane audit.** It is missed by the check/size route (it is not a
`check.ts` gate and is distinct from the invoked `size`, which is `scripts/size.ts`) and by the test
route (its header records that it is no longer a project of the master `vitest.config.ts`, so
`npm run test` does not collect it). A check of either route alone reports it covered by the other.

**Correction: that reachability fact is true, and the conclusion drawn from it was wrong.** Listing it
beside the other three implied its SUBJECT was unguarded. It is not. `tools/size/size.test.ts` and the
already-invoked `npm run size` both import `collectSizeCases` / `didSizeChecksPass` from
`scripts/size-runner` and both read the same `tools/size/size.baseline.json`, so the size budget is
gated on every push. `test:size` is a second front-end over one runner and one baseline — not an
orphaned gate.

Two things follow, and the second is the reason this correction is recorded rather than deleted.

- **The fence was deliberate and still holds.** `aeb609c0d` merged the master config to a single
  jsdom project including `packages/**/src/**`, and the SAME commit pointed `test-size.ts` at its own
  config and wrote the explanatory comment. `tools/size/vitest.config.ts` needs `environment: 'node'`
  and a 300s timeout for real builds; it cannot join a suite tuned for per-file environment reuse.
  Restoring it to the master config would be wrong.
- **Underneath the wrong conclusion there was a real, smaller finding.** Four assertions in that suite
  needed no build at all — two on the size-case declarations, one on the key format, one on the debug
  stub's transform — and were reachable only through a five-minute lane nothing ran. They now live in
  `scripts/size-runner.test.ts` and `scripts/size-debug-stub.test.ts`, which the ordinary suite
  collects. Three of them also carried `if (…) return` guards that made them pass vacuously whenever a
  filter narrowed the case set; the guards are gone, so they can now fail. The fifth assertion reads
  the built `results` and correctly stayed behind.

**Superseded 2026-08-13 by `afeeacea9`.** That commit reworked the size lane and deleted `test:size`,
`tools/size/size.test.ts`, and `tools/size/vitest.config.ts` outright, replacing them with
`scripts/size-fast-runner.ts` and `size:minified`. The reachability observation and the correction under
it are kept as the record of a reasoning error worth not repeating, not as live findings — the subject is
gone. One thing did NOT survive the two changes meeting: the single build-dependent assertion left behind
in `tools/size/size.test.ts` was the only test of `getFlightDiagnosticsSizeDelta`, which is still exported
and still used by `size-minified.ts`. Deleting the file took that coverage with it, invisibly to both
changes — the deletion had no reason to know the file held unique coverage, and the move had left exactly
one assertion there. It is restored in `scripts/size-runner.test.ts`, where it needs no build at all.

The generalisable part is not the size suite. **A reachability finding says a process does not run; it
does not say the subject is uncovered.** Those are different claims, and the second needs its own
check — here, one grep for who else imports the runner.

### Reachable is not the same as effective

Every gate on the INVOKED list is only known to RUN. The tables above this section are the evidence
on whether each can fail, and they find live P1/P2 defects in several of them. The two audits compose;
neither substitutes for the other.

### And a third question, found while wiring: does anyone RECEIVE the red?

Auditing invocation turned one up that neither question above asks. `nightly.yml`'s two jobs —
`test:coverage` and `api` generation — both run, and both can fail, and until `75da6b20b` **nothing
routed their failure anywhere**: no `if: failure()`, no issue, no notification, in any of the four
workflow files. A scheduled run has no author watching it, so a red landed in a log nobody opens.

That is the same defect one step further along the chain. A gate that cannot fail, a gate that never
runs, and a gate whose red reaches no one are three distinct ways to hold a verification that verifies
nothing, and passing either of the first two checks says nothing about the third. The fix routes each
failing job to one deduplicated issue, keyed on a stable title so a persistent failure accumulates
comments on one issue rather than filing a new one nightly — an unread inbox being the next way the
same defect comes back.

### Q3: WHICH WAY does it fail when it is wrong?

The questions above establish *that* an instrument is defective. This one prices it. A gate that cannot
fail, one that never runs, one whose red reaches nobody, and one that answers a narrower question than
the one asked are all ways to hold a verification that verifies nothing — but two instruments with the
same defect are not equally expensive. **An instrument that fails toward "proceed" is strictly worse
than one that fails toward "stop", because nobody investigates a green.**

**Worked instance, and it is deliberately not a gate.** `parcel-new-commits.sh` in the integration agent
root answers "which patches in this parcel are not already on my tree?" It hashes patch content — and
the patch content *includes surrounding context lines*. So a patch that has already landed reports
**NEW** on a re-send as soon as the file's context has moved: once because the patch was landed via a
hand-resolved conflict (the resulting commit is then not byte-identical to the patch), and once because
the same file had been separately edited. Both occurred within one day.

The narrower-question defect is the familiar one: the script evaluates *"have I seen this exact patch
text?"* while every caller reads it as *"is this change on my tree?"* Those diverge the moment anything
rewrites context. **The direction is the part this section adds.** Erring toward NEW costs a look. The
same script erring toward LANDED would silently discard a commit and leave no artifact at all — the
failure its own header says it exists to prevent. Identical defect, identical doctrine, opposite blast
radius.

The fix is a second pass that compares **changed lines** — every `+` and `-`, context-free and
order-independent — against commits touching the same files, run only when the exact-content pass
misses. Note what the direction question forces during the repair itself: the first version of that
pass compared **added lines only**, which would have called a commit landed when it added the same lines
while *deleting* different ones. That converts a cost-a-look failure into a silent-discard failure —
**the repair would have moved the defect to the expensive side while appearing to fix it.** Comparing
both signs is what keeps the looser test safe, and the check that caught it was asking, of the fix,
the same question being asked of the original.

Two consequences worth carrying:

- **A looser test is only safe where it fails toward the cheap side.** Widening a comparison to catch
  more cases is sound when a false positive costs a look, and unsound when it costs a silent discard.
  Decide which you have *before* widening.
- **This is the one instance in this document whose evidence comes from outside the gate population.**
  The other findings are gates in `scripts/` and CI. This is a shell script in one agent's workflow,
  which is the argument that the questions are not a property of gates — they are a property of
  instruments, and every workflow is full of instruments nobody audits because they are not called gates.

### Not invoked, with a reason (12)

Reportable but not defects — separating these from the four above is the point of reporting both
columns rather than a flat list.

- `test:regression` and its two leaves: excluded BY NAME in `tests.yml`, environment-coupled baselines.
- `build:check`: the preflight was removed deliberately; `check` runs `packages:check` and `typecheck`
  as its first two gates.
- `test:browser`, `test:smoke`, `test:parity`: aggregates whose leaves the render matrix runs directly.
- The corpus family — `conformance`, `conformance:fixtures`, `check:import-conformance`,
  `import:conformance:index`, `oracle:woff2-reversal` — needs an externally-acquired corpus, and
  `npm run fixtures` appears in no workflow. **This is a gap that had not been filled, not a structural
  impossibility.** An earlier draft of this section called it CI-absent "by construction" and that was
  wrong: the licence policy forbids VENDORING, while expressly permitting testing against licensed
  material by fetching on demand, keeping it outside the repo, and committing nothing. A workflow step
  that fetches into a gitignored cache is the sanctioned pattern, not an exception to it. The two
  phrasings invite opposite actions from a future reader, which is why the correction is recorded here
  rather than quietly amended.

One nuance that is pre-loaded to be misread by anyone skimming for "is conformance covered": the 24
files under `conformance/**/*.test.ts` DO run in CI, in the `conformance` vitest project of
`npm run test`. They are not the gate. Every one of these CLIs sits behind an
`import.meta.url === process.argv[1]` main-guard, so importing the module in a test runs no corpus and
produces no verdict. **Green conformance unit tests say nothing about corpus conformance.**

### Not gates (104), by exclusion reason

The population is what makes the four findings meaningful, so it is counted rather than listed.

| Count | Category | Why not a gate |
| ---: | --- | --- |
| 15 | Baseline / acceptance updaters | Rewrite the thing a gate compares against; manual by design |
| 12 | Generators | Their `:check` counterpart is invoked and compares the committed output |
| 4 | Fixers (`fix`, `lint:fix`, `order:fix`, `format`) | Mutate the tree; the non-fixing form gates |
| 24 | Reports, queries, `:json` variants, diagnostic instruments | Return data, not a verdict; `unchecked`/`untested` are documented as non-gating |
| ~46 | Dev servers, harnesses, cleanup, local tooling | No verdict and no CI role |
| 3 | Git hooks (`precommit`, `prepush`, `prepare`) | Local, not CI; both `precommit` gates are independently reached by bare `check`, so nothing is hook-exclusive |

### Caveat

This is static reachability read from the workflow files; no workflow was executed. It establishes
which processes CI starts, not what they do when they get there.

## Re-measured at `092a14194` — the examples findings in the `2026-08-12` severity-ranked table are CLOSED

Scope: this closes the EXAMPLES-side rows of the severity-ranked table dated `2026-08-12` (ranks 2 and 4),
and nothing else. It does not speak for findings added to this document later or above — name the table
and the date when re-scoping, never a position like "below", which silently re-points when someone
inserts a section.

Every examples-side finding in that table has since been fixed. The findings were real when
recorded; the tree moved. Re-measured numbers, derived by running the tool's own accounting rather
than by counting inputs:

| Claim as recorded | Re-measured |
| --- | --- |
| examples fingerprints cover `0/108` current targets | `108/132` targets HAVE a fingerprint |
| all 108 current targets lack a matching fingerprint | the same 108 is the count that has one |
| 41 fingerprint columns belong to 14 retired entry names | **0 orphans**; 41 entries ↔ 41 baseline files, 1:1 |
| examples screenshot hashes cover `117/132` | `131/132` |
| examples parity forms ZERO comparisons | **65 parity passed**, 0 failed, 1 uncovered — the tier is live |

Targets are derived as entry × its own renderer set (an example contributes only the renderers for
which `src/render.<renderer>.ts` exists), which is how `discoverEntries` enumerates them.

**Scoping that still holds, and that this document should have said explicitly:** the batch
(`tool-capture.batch.json`, which `test:examples` and `test:functional` drive) passes
`--no-regression` for BOTH subjects. Committed fingerprints are therefore consumed only by the
separately-invoked `test:*:regression` legs, which `AGENTS.md` scopes to the environment where the
baselines were captured. That is narrow-by-design, not inert — but a gate that is narrower in
practice than it reads is its own hazard, so state the scope wherever the examples gate is described.

**No coverage floor is enforced above zero.** Deleting one renderer column kept a run green (exit 0)
while deleting every column correctly failed. This held in the regression tier (79/441 functional,
24/132 examples targets uncompared) and again in the parity tier (43/324 parity units form no
comparison, run exits green).

**REGRESSION TIER: CLOSED** by the capture baseline coverage manifest
(`scripts/capture-baseline-coverage-manifest.json`, mechanism in
`packages/tool-capture/src/captureBaselineCoverageManifest.ts`). The tier now pins the exact SET of
`entry/renderer` identities that have comparable baseline evidence — 362 functional, 107 examples —
and names every gain and loss individually; both directions hard-fail, and acceptance is a separate
`--update-coverage` path that refuses an entry-filtered run. Falsified on both subjects against the
pre-fix commit: with a target's fingerprint deleted, pre-fix reports `✓ ok` exit 0 while other
comparisons still pass, post-fix exits 1 naming the identity. The case that justifies identities over
a count was constructed directly — a same-count swap (two functional targets lose their fingerprints,
two different ones gain real ones, total unchanged at 21 for the `node-` filter) is reported clean by
every count-shaped check and is named in all four parts by the manifest.

**HOW TO READ A FAILING REGRESSION TARGET — the freshness oracle hashes SCENE SOURCE ONLY, never SDK
source.** `getCaptureSceneSourceHash` sha256s the scene file and nothing else, so the `changed` /
`unchanged` classification answers *did the author touch this scene*, never *did rendering change*. That
is correct scoping for an authorship oracle, but it fixes how the output must be read: **a pure rendering
regression can never appear as `changed`.** It can only ever appear as a target with ZERO source change
and a bad distance. So `unchanged` is not the reassuring branch — it is the one that has no authorship
explanation, and every clean-but-failing target is a candidate rendering regression. Such targets must
never be batch-recaptured; recapture would bless the regression as the new reference and destroy the
evidence.

**CONFIRMED, DO NOT RECAPTURE: `material-wireframe/webgl`.** Zero scene-source change since its baseline
(recorded hash matches the current file exactly), yet a regression distance of 18.04 against a tolerance
of 5. The baseline is the honest party here; the output is the suspect. It is the only one of the 52
failing functional targets that owes neither of the two candidate causes.

**A CONFIRMED-CORRECT CAUSE CLEARS ONLY A TARGET THAT OWES NOTHING ELSE.** Of the 52 failing targets, 30
owe both candidate causes, 21 owe `e2b99fc68` alone, **0 owe `b467652e8` alone** — its set is a strict
subset. Shares of a failing set overlap and are not disjoint groups, so "this commit accounts for 58% of
failures" never licenses "confirming it clears 58% of targets."

**PARITY TIER: STILL OPEN.** The 43/324 parity units that form no comparison are not covered by this
mechanism; the manifest pins regression evidence only. A parity-side equivalent is unbuilt.

## Severity-ranked findings

The eleven `scripts/check.ts` stages are live. Every one was mutation-proved red, and a compound mutation
proved the runner continues through later stages before returning an aggregate failure.

The release graph and capture matrix have six material trust gaps, ranked by the amount of trust they can
silently absorb:

| Rank | Gate | Claimed or implied trust | Evidence: actual failure behavior | Severity-ranked finding | Recommendation |
| ---: | --- | --- | --- | --- | --- |
| 1 | Nightly `promote` | `main` advances only to a known-good commit | It needs only `resolve`, `coverage`, and API-printing jobs. It neither waits for nor queries the exact SHA's `tests.yml` result, so it can promote after build, isolated-test, quality, size, or render failure. The push triggers CI on `main` only after promotion. | **P0 — known-good predicate is incomplete** | **RECOMMENDATION:** Require the exact pinned SHA's complete per-commit gate conclusion before promotion. |
| 2 | Examples Tier 3 / `Render · examples · parity` | Current Canvas/WebGL/WebGPU output agrees | All 108 current validation targets lack a matching fingerprint baseline. Legacy parity admits only baselined targets, so it forms zero pairs. A clean scoped run exited 0 with `0 parity passed`, `6 skipped`; all 41 entries have zero eligible pairs. The 41 example fingerprint columns that do exist belong to 14 retired entry names. | **P0 — parity tier forms zero comparisons** — CLOSED, see the re-measurement above: 65 parity pairs now form | **RECOMMENDATION:** Use explicit same-run parity groups or fail when required fingerprints/pairs are absent. |
| 3 | Examples Tier 4 / `Render · examples · smoke` | Every example renders non-blank | Direct examples smoke defaults `verify=false`. Replacing `bitmap` Canvas rendering with a no-op produced changed screenshots, `0 failed`, and exit 0. The examples parity leg did reject the same blank build as a verifier load failure, so aggregate CI has a second-line catch, but the smoke/not-blank gate itself is false-green. | **P1 — smoke does not prove non-blank output** | **RECOMMENDATION:** Enable verifier/readback and require every selected example target to publish a non-blank result. |
| 4 | Tier 5 regression / `test:*:regression` and `capture:*:check` | Current output matches committed baselines | Missing baselines become skips or `changed=null`, and no minimum coverage is enforced. Fingerprints cover examples `0/108` current targets and functional `310/416`; screenshot hashes cover examples `117/132` and functional `401/416`. An all-missing suite succeeds. | **P1 — CLOSED for the regression tier, OPEN for parity** — the EXAMPLES numbers are CLOSED (see above); the coverage floor above zero is now gated for regression by the capture baseline coverage manifest, and remains ungated for parity | **LANDED:** an exact-set manifest of `entry/renderer` identities with a named +/- diff and a separate `--update-coverage` acceptance path. Parity has no equivalent yet. |
| 5 | Nightly `api` | API quality/generation contributes to promotion | `npm run api` and `npm run api:json` only print parsed output; neither invokes rules nor persists/diffs an artifact. An `isEven(...): number` mutation made both commands exit 0 while `api:check` exited 1 for an accessor violation. | **P1 — parser smoke does not enforce API policy** | **RECOMMENDATION:** Add `api:check`, or narrow the job's documented trust claim to parser smoke. |
| 6 | `edge-publish` dependencies | Published snapshots passed CI | By explicit policy it needs only `build` and `test-fast`. A snapshot can publish despite failures in isolated/tool-capture tests, quality, size, harness builds, or any render leg. This is documented reduced fidelity, not accidental control flow, but the artifact must not be described as fully CI-gated. | **P1 — snapshot evidence intentionally omits six families** | **RECOMMENDATION:** Either add the omitted dependencies or label snapshots as build-plus-fast-test gated. |

**ONE DEFECT, FOUR MANIFESTATIONS: the pipeline records which evidence EXISTS and never records which
evidence SHOULD exist.** Wherever evidence is optional, its absence is indistinguishable from
satisfaction. This is not three gates each missing a check — it is one missing concept, surfacing once
per evidence kind over the SAME target set. It will surface again in any tier added until something
declares what ought to be there.

| # | Tier | Two-arm proof | Result |
| --- | --- | --- | --- |
| 1 | Fingerprint regression | one target's fingerprint deleted while others still compare | run stays **green**: the zero-floor is satisfied by any single comparison |
| 2 | Screenshot hash (`capture:check`) | `node-alpha/canvas` sha256 **wrong** vs **absent** | wrong → `±`, **exit 1**. absent → `✓`, **exit 0**. Deleting a baseline is safer than breaking one. |
| 3 | Tier-4 oracle (`functionalVerify.ts`) | `node-alpha` fill broken, oracle intact vs export misspelled | intact → **exit 1** named on canvas/webgl/webgpu. misspelled → **exit 0**. |
| 4 | Oracle outcome not recorded anywhere | tried to confirm one target's oracle result from its own artifacts | `status.json` and `logs.jsonl` carry **no** oracle record; the outcome is only inferable from control flow (a failure writes `state: 'error'`). Observed, not mutated. |

Manifestation 2 was found independently and landed as rank 1 of the `2026-08-13` table above; this row is
corroboration by a second method, not a separate finding.

**The census itself was inert by NON-INVOCATION until 2026-08-13, which is the same defect one level up.**
`evidence:check` was written to gate, falsified in both directions, and then wired to nothing: not
`scripts/check.ts`, not any workflow. A deliberate opt-out and an oversight look identical from outside,
so the category had to be established before the remedy — a check CI genuinely cannot run belongs in
[boundary-only checks](boundary-only-checks.md), and only a check CI *can* run is fixable by wiring.
Established by control rather than by reading its header: the census reads committed baselines and scene
sources off disk, and it exits 0 with `.artifacts` and the functional dist both absent. So it can run in
CI, and it is now a stage of the whole-repo `npm run check`, which the `quality` job runs under a **code**
change trigger — the right one, since an oracle export vanishing is a code change and not a docs change.
Falsified after wiring: dropping one pin from the manifest makes the whole sweep exit 1 naming
`material-subsurface/webgl#oracle`, not merely the standalone script.

**Manifestation 4 is closed, and its first fix had a hole worth keeping on the record.** The verifier now
records `oracle: 'invoked' | 'absent'` from the branch that calls, and `captureEntry` carries it into
`status.json`. But the error-path status wrote a hardcoded `null`, with the `verification` binding scoped
inside the `try` — so the record was dropped on exactly the path that motivated the field. An oracle that
runs and rejects a frame both ran and failed, and the artifact said it never ran while carrying an error
message only that oracle body could produce. A reader who trusts the field then counts a live oracle as a
dead one. Fixed by hoisting the binding; pinned by `captureEntry.e2e.test.ts`, whose two arms separate
"oracle threw" from "failed before the assert step". **Measured after the fix, over a full functional
capture of all 493 targets: 374 invoked, 119 absent, 0 unrecorded — every oracle the census pins actually
runs.** The general shape: a field that reports whether a step happened must survive the failure of that
step, or it only ever describes the successful case.

**Current exposure, measured per TARGET (entry × declared renderer), which is what the gates select:**
functional 493 targets — 88 carry no fingerprint, 43 no screenshot hash, 119 no oracle; examples 132
targets — 1 carries no screenshot hash, and **none** carry an oracle, because the examples harness has no
`assertRender` equivalent at all. Counting baseline *columns* instead gives smaller numbers (33 rather
than 43 for screenshots) because a target with no baseline file has no column to count — the column view
structurally cannot see the targets that are missing entirely.

**The exposed set is GROWING.** Of the 14 functional scenes with no screenshot hash, 10 first appeared in
the two days before this entry: nothing requires a new scene to arrive with a baseline, so every scene
that lands widens the gap silently.

**Ten of those fourteen scenes are this session's own work** — `node-transform-mirror`,
`swf-mirrored-placement`, `mesh-tangent-mirror-handedness`, `text-markup-color`, and all six `svg-*`
scenes. `node-transform-mirror` has been ungated on all three of its backends from the moment it landed:
it was written this session to close the mirroring blind spot, and it was itself partly inert. A
deliverable of this session could not fail its own gate. That is the strongest argument that exists for
why this sweep was worth running, and it is recorded here rather than left for review to find.

**FIX (landed):** the capture baseline coverage manifest carries all three evidence kinds as columns on
one row per target, rather than three parallel manifests — a target's evidence profile is one fact, and
three files would be three places for it to drift. A loss is named `target#kind`. The acceptance path and
the scoped-run guard are inherited unchanged. One rule makes the consolidation safe: a run declares which
kinds it OBSERVED, and unobserved kinds are never reported lost — otherwise a validate run, which sees
only fingerprints, would report every screenshot and oracle pin as missing.

Two lower-ranked findings remain:

- **P2 FINDING:** Capture treats `BACKEND_UNAVAILABLE` as a successful skip and has no required-backend or minimum-target
  count. A whole GPU backend can disappear while the job remains green. The skip is visible in logs but does
  not gate. **RECOMMENDATION:** Require named backend exceptions and a minimum executed-target count.
- **P3 FINDING:** `tests.yml` runs `npm run size` twice in the same job. Both invocations are live, but the
  second adds cost, not independent evidence. **RECOMMENDATION:** Remove the duplicate invocation.

## `scripts/check.ts`

The bare runner is run-all/report-all. A compound `math` mutation (top-level side effect, type error,
`eval`, and top-level `vi.mock`) made `packages:check`, `typecheck`, `lint`, `portable:check`, and
`mocks:check` red while the other six stages still executed. Each remaining subject was then mutated
independently.

| Stage | Protected subject | Failure verified |
| --- | --- | --- |
| `packages:check` | Workspace topology, package metadata/layers, side-effect and SDK barrel policies | Top-level side-effect mutation failed the stage. |
| `typecheck` | SDK/examples/scripts, functional scenes, tools/root configs | Type mutation failed; the full helper still attempted all three TS projects. |
| `lint` | Oxlint rules with zero warnings | `eval` mutation failed. |
| `format:check` | Repository formatting | Bad spacing failed `oxfmt --check`. |
| `order:check` | Exported-function and test-block ordering | Moving a `describe` name out of order failed. |
| `exports:check` | Exported function test completeness | Adding an untested exported function failed. |
| `type-home:check` | Public type ownership in `@flighthq/types` | Adding an exported interface outside the type home failed. |
| `portable:check` | Portable-source allowlist | Non-portable `eval` failed. |
| `mocks:check` | Mock-tier census and policy | Unregistered top-level `vi.mock` failed. |
| `api:check` | Duplicate API names and accessor-prefix contracts | `isEven(...): number` failed. |
| `support:check` | Generated renderer support matrix matches its source census | Mutating the generated heading failed as stale output. |

Scoped `npm run check <selector>` intentionally omits the whole-repository package, API, and support stages;
the bare command includes them. That is a documented scope distinction, not an inert gate.

## Per-commit CI (`tests.yml`)

| Leg | Protected subject | Failure-verified/how or limitation |
| --- | --- | --- |
| `changes` | Run code legs for all changes except Markdown and `agents/**` | **Inert for two subjects — see the follow-up finding below.** The all-except filter is structural and its action failure is a job failure, but the exclusions are not purely a cost optimization: `docs:check` and the agent-tooling sources both live inside the excluded set. |
| `build-check` | Package policy plus all TypeScript project checks | Active: the package/type compound mutation failed. Every ordinary verification leg needs this job. |
| `build` | Root TS build and emitted packages | Active by `tsc -b`; compile failure is nonzero. It reruns after snapshot version stamping inside `edge-publish`. |
| `harness-build` · functional | Functional Vite harness bundles | Active build command; a clean build is required before success. |
| `harness-build` · examples | Examples Vite harness bundles | Active; clean `npm run build:examples` completed during this audit. |
| `test` | Per-package tests in their declared environments, including serialized tool-capture/browser contracts | Active: a deliberately false `math` assertion made the package-config command exit 1. This is the only unit-test leg that includes tool-capture and preserves package environments. |
| `test-fast` | Ordinary root unit tests in merged jsdom | Active: the same false assertion made the merged-config command exit 1. It deliberately excludes tool-capture; the isolated `test` leg covers that exclusion, but `edge-publish` does not wait for it. |
| `quality` | All eleven `scripts/check.ts` subjects | Active; every stage mutation-proved. |
| `size` | Gzipped example/fixture bundles stay below 105% of baseline | Active: lowering `bitmap:canvas` baseline to one byte made the filtered command exit 1. The identical command is unnecessarily run twice. |
| `render-test` · functional smoke | Functional build/load, page errors, verifier assertions, and non-blank readback | Active: functional capture defaults verification on; verifier/load failures increment `failed`. |
| `render-test` · functional parity | Same-run agreement against Canvas reference for available targets | Active explicit parity groups; unlike legacy parity, these do not need baselines. There is still no suite-level minimum comparison count. |
| `render-test` · examples smoke | Example build/load and page/console/network errors | Partially active, but non-blank verification is off. The no-op renderer mutation exited 0. |
| `render-test` · examples parity | Example verifier load plus cross-backend parity | Load/blank failures are active, but parity is inert: zero current eligible pairs because all matching fingerprints are missing. |
| `edge-publish` | Build and publish `edge`/`next` snapshot | Publication is active, but its dependency set is only `build` plus `test-fast`; six other verification families cannot block it. |

### Follow-up finding: a gate can be live and still never run on its subject

Audited at `5eba48616`, after the table above. The original audit asked, for each stage, _does it fail when
its subject is broken?_ — and answered yes for all eleven `scripts/check.ts` stages. It did not ask the
prior question: _does it run when its subject changes?_ Two gates fail that second question, and no amount
of mutation-proving the stage would have revealed it.

**P1 — `docs:check` is excluded from CI by its own subject.** The chain is `changes` → `code` = `**` minus
`**/*.md` minus `agents/**`; `build-check` runs `if code == 'true'`; `quality` needs `build-check` and is
the only path to `npm run check`, which contains `docs:check`. But `docs:check`'s entire subject _is_
`AGENTS.md` and the `agents/**` cells. A commit touching only those produces `code == 'false'` and runs
nothing, so the gate's coverage is anti-correlated with its subject: the docs-only changes most likely to
break docs are exactly the ones never checked. Measured over the 40 commits ending at `5eba48616`,
**12 (30%) trigger zero CI legs**, including `f839a2252`, which introduced an `AGENTS.md` line claiming the
texture model had "only M2 implemented" while the linked doc said M2–M5 had landed. **RECOMMENDATION:**
give `changes` a second `docs` output and a `docs` job that runs `docs:check` without depending on
`build-check`, so docs-only commits stay cheap but are still gated.

That victim also shows the two defects are independent and both required: even had `quality` run,
`docs:check` has no staleness rule, so it would have passed. Fixing the filter makes the gate fire; it does
not by itself make it catch this. Any new AGENTS.md content rule is born inert until the filter is fixed.

**P1 — `agents/**` holds executable tooling with no automated coverage of any kind.** The exclusion reads as
a docs exclusion, but the path also contains `todo.mjs`, `scaffold.mjs`, `bless-queue.mjs`, `todo-items.mjs`,
and `todo-target.mjs` — the tooling agents run to find work. These are excluded from the CI path filter
_and_ independently ignored by the linter (`.oxlintrc.json` ignores `agents/**`) _and_ outside the
`tsconfig.json` include list. Three independent exclusions, so fixing any one leaves them uncovered.
**RECOMMENDATION:** treat the executable subset as code — narrow the CI filter exclusion to `agents/**/*.md`
rather than `agents/**`, and take the linter exclusion down to match.

## Nightly CI (`nightly.yml`)

| Leg | Protected subject | Failure-verified/how or limitation |
| --- | --- | --- |
| `resolve` | Pin one `develop` SHA for all nightly work | Active: downstream checkout uses the emitted SHA. This establishes identity but says nothing about that SHA's per-commit CI conclusion. |
| `coverage` | Tests plus global V8 thresholds (85% statements, 75% branches, 90% functions, 85% lines) | Active Vitest/coverage exit status; test failures or threshold misses fail the job. It is not a substitute for the per-package environment, build, quality, size, or render legs. |
| `api` | API extractor can parse and print text/JSON | Active only as parser smoke. Both invocations accepted an API-policy mutation that `api:check` rejected, and their output is not persisted or diffed. |
| `promote` | Fast-forward `main` to the pinned SHA | Push/fast-forward failure is loud, but the known-good predicate is incomplete: `needs` contains only `resolve`, `coverage`, and `api`. |

## Capture tiers

| Tier | Subject | Failure-verified/how or inert/why |
| --- | --- | --- |
| 1: build/load/capture | Functional and examples | Active. Build, navigation, selector, screenshot, and non-skippable load failures return nonzero. |
| 2: error-free render | Functional and examples | Active for page errors and error logs under `--fail-on-error`. Backend-unavailable text is downgraded to success-with-skip, with no minimum backend coverage. |
| 3: cross-backend parity | Functional | Active same-run comparison using explicit Canvas-reference groups. It does not require a committed baseline. Entries with fewer than two available/allowed targets form no pair without failing. |
| 3: cross-backend parity | Examples | Inert. Legacy eligibility requires fingerprints; current coverage is `0/108`, hence zero pairs. Focused clean evidence: `0 parity passed`, `6 skipped`, exit 0. |
| 4: verifier/non-blank | Functional smoke | Active because functional capture defaults `verify=true`. |
| 4: verifier/non-blank | Examples smoke | Inert in the direct CI command because examples default `verify=false`. A blank no-op Canvas implementation was accepted. The separate parity process currently supplies a second-line blank check. |
| 5: coarse fingerprint regression | Functional | Partial: 310 of 416 current validation targets have fingerprints; the other 106 skip. Local/environment-coupled, not in per-commit CI. |
| 5: coarse fingerprint regression | Examples | Inert for current entries: 0 of 108 validation targets have fingerprints; all existing example fingerprints are orphaned under retired names. |
| Strict screenshot-hash check | Functional and examples | Partial: 401/416 and 117/132 current targets have SHA baselines. Missing hashes produce `changed=null`, so `--fail-on-changed` still succeeds for them. |

## Consolidated recommendations

1. **RECOMMENDATION:** Make promotion consume a conclusion for `tests.yml` at the exact pinned SHA, or repeat every required
   gate inside the promotion workflow. Do not infer yesterday's PR success from branch membership.
2. **RECOMMENDATION:** Give examples explicit same-run parity groups, as functional already has, or make missing required
   fingerprints and zero-pair suites fail nonzero. Delete/regenerate the 14 orphan baseline files.
3. **RECOMMENDATION:** Enable verifier/readback for the direct examples smoke command and require a verified/non-blank count
   equal to the selected target count.
4. **RECOMMENDATION:** Add baseline-coverage manifests/minima to fingerprint and SHA regression commands. Missing baselines may
   be an explicit allowlisted exception, never an uncounted success.
5. **RECOMMENDATION:** Run `api:check` in nightly (or remove the API job from the promotion-quality claim). Persist/diff a
   generated artifact only if API drift itself is intended to gate.
6. **RECOMMENDATION:** Decide whether snapshot policy intentionally permits every omitted failure. If yes, label snapshots
   “build + fast-test gated”; if no, add the missing jobs to `edge-publish.needs`.
7. **RECOMMENDATION:** Remove the duplicate size invocation and require an explicit minimum for renderer targets that may be
   skipped as backend-unavailable.
