# Evidence discipline — one law and three action rules

**Status: consolidation of a single day's findings, untested elsewhere.** Every rule here was derived
on 2026-08-07, from one arc — SWF import instrumentation and the import-conformance scoreboard — by
four agents working the same problem. **No rule below has yet survived contact with work that is not
this arc.** A rule set written down at the end of an intense day is exactly the artifact that looks
authoritative and has not been tested across contexts, and the day's own law says self-reports
overstate. This document is therefore a claim about one arc, not about the codebase.

**Falsification condition:** the first unrelated arc that either confirms one of these or fails to is
what upgrades or retires it. Until then, read them as findings with good instances, not as policy.

The instances are the valuable part. A rule without an instance is a slogan; these are holdable only
because each one has concrete cases behind it.

**This file must stay under 12,000 characters.** The number is derived from the job, not from the
current size: five sections, each a law plus four or five instances of roughly a paragraph, plus this
framing. **It is stated here before the file has been cut to fit it — at the time of writing the file
is over — because a budget set after a tidying pass ratifies whatever that pass happened to produce.**
A doc that grows by accretion never has a moment where anyone decides its size; this is that moment,
taken deliberately and in advance. Enforcement joins `npm run docs:check` once the file is under, on
the same principle as any other gate: **the number before the gate, never a check that arrives red.**

**Everything below is a search instruction, not a test.** Each entry tells you where to look or what
to read next; none of them tells you a claim is wrong. Used as verdicts they invert — the vividness
tell would discredit whoever describes a genuinely severe finding accurately, and the fidelity axis
would rank losses by harm instead of naming the check each one defeats. **A document of search instructions read as a
document of tests is this file's failure mode.** If an entry ever licenses rejecting someone's work
rather than reading something, it is being misused.

## The law: evidence is about whatever produced it

*Arc-local, 8 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Its sharpest case is the self-report. **A self-report is evidence about the self-reporter, not about
what it carried** — so to get evidence about the payload, you need something that looked at the
payload. Everything below in this section derives from that in one step.

- **Evidence that X exists is not evidence that only X exists.** A parcel format was assumed to be
  squash-only because a `squashed.diff` was visible; it also carried ten per-commit patches with full
  SHAs, and a whole remedy was nearly abandoned on the strength of the thing that *was* seen. **Seeing
  one member of a set tells you nothing about the set's other members** — look for what else is there
  before concluding from what is.
- **The repo you can reach is not the repo the claim is about.** Say it in those words; the
  sophisticated version did not save anyone. Three readers stated true, exact, checkable numbers about
  a tree that was not the one under discussion — all three on the same day, all three while actively
  hunting that exact failure.
- **Announcing a change is not shipping it, and the announcement travels faster.** A note saying "I am
  landing this in the doc" went out in a parcel whose commits did not contain it; the wording was
  present-tense, the work was real, and it landed two commits later — so every reader of that parcel
  held a true-sounding claim about a file none of them had. **It surfaced only because a reader opened
  the file and grepped for the words.** The author was the person who wrote this rule, and it happened
  anyway.
- **An importer that returns a document reports success by being non-null.** `createScene2DFromSwf`
  returned a document while having silently dropped content. This is why `importdiagnostics` exists:
  it is the independent reader for the importer, not a feature beside it.
- **A generator that diffs against itself has no independent reader.** Regenerating in memory and
  comparing to the committed file verifies that the file matches what the generator would produce, and
  nothing about whether what it produces is true. Six proof records naming tests that never exercised
  the capability they were cited for passed this gate.
- **A proof identifier certifies that the producer asserted something, not that the assertion was the
  right one.** Checking that a proof name resolves is checking resolvability; checking that the named
  test exercises the named capability is checking validity. They are different checks.
- **A count of your own verification work is a self-report.** Three separate counts were audited and
  all three were smaller than claimed. Audit yours before you report it, then say which members the
  audit actually reached.
- **An audit certifies a population at a moment, and anything added afterwards — including the fix the
  audit produced — is outside it.** A count and its audit drift apart by default, and the drift hides
  because both numbers are still true of something, just not of each other.

## Preservation ordering — *when*

*Arc-local, 3 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Order competing actions by how much they destroy. Destructive last.

- Inspect before `drop_caches`; capture before restore.
- **Report an instrument's weakness before you fix it.** A fix is a state change and a finding is a
  fact about the prior state, so the fix destroys what the finding is about. A repo where every
  instrument was silently improved on discovery would look, from its history, like a repo whose
  instruments were always sound.
- Composed: **audit before you report the count; report the weakness before you fix it.**

## Structure over convention — *how to enforce*

*Arc-local, 4 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Make the false claim unrepresentable rather than discouraged. A rule you hold is a rule you can drift
off; three agents in one day each drifted off a rule they had written down.

- **Attach the audit to the member, not to the count.** With each capability carrying which audits
  reached it, the totals are derived and can never outrun their audit — a bare `17/17/17` stops being
  discouraged and becomes unrepresentable.
- **Choose a channel without the hazard instead of remembering to avoid it.** Prose through `-m`,
  anything carrying an identifier through `--file`: shell substitution then cannot occur, rather than
  being something each author must remember not to trigger.
- **Name the tree in the assignment, not in the report.** An order that will produce a coverage claim
  should already say which version it covers, so the reader never has to choose — and before assigning
  an exhaustive read, ask who else is editing that file. **An exhaustive read of a file under active
  edit is stale before it lands, which is a property of the schedule and not of the reader.** Three
  readers lost a day's claims to this in one day; the countermeasure cannot be more care.
- **Put a coverage caveat in a table, not a sentence.** A sentence can be skimmed past; a table of
  which files were read in full, partially, and not at all cannot.

## Honest limit — *what to do when you cannot*

*Arc-local, 5 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Name the hole. When nothing can close it, naming it is the whole of what can be done, and it is what
stops an artifact claiming more than it has.

- **State what an instrument cannot see, beside what it checks.** A hand-maintained audit list makes
  *forgetting* to record an audit visible and cannot make a *false* audit claim visible; saying so is
  what keeps it an honest declaration rather than a measurement.
- **A judgement recorded as a judgement can be overturned; a judgement made silently becomes a fact.**
  Marginal calls cost one sentence to record and are otherwise unrevisitable.
- **Say what would change the claim.** "Three data points, two producers" is a live caution because it
  names its own upgrade: a fourth from a third producer would move it, a fourth from the same producer
  would not.
- **Expensive-to-verify and unverified are strongly correlated, and that correlation is the finding.**
  When one boundary re-ran every cheap gate and none of the costly ones, the unbacked set was not a
  random subset — it was *selected for by cost*, so it never shrinks on its own and it fills with
  exactly the claims that most need checking: recaptured baselines, "I confirmed this test can fail",
  network acceptance runs, timings, and anything about the sender's own environment. **But the set is
  selected by cost without every member being expensive** — "I confirmed the test can fail" costs
  seconds to check and is unverified only because nobody asks; it rode in on the same list as a 1.6 GB
  fetch and inherited its excuse. **A true general law is an excellent place for a cheap fix to hide**,
  so split the list by *why* before accepting any of it as unfixable. **Measured on the first register
  built this way: three of six entries were cheap or trivially reproducible** — a higher free fraction
  than the correlation alone would predict, which is the law's own falsification condition returning
  data rather than agreement. **Mark each unbacked claim with a
  fixed greppable token rather than prose** — a sentence saying you considered backing lets nobody
  enumerate anything, and the point is not that a reader is warned but that the set becomes countable.
  Keep a register of merged-but-unbacked claims with class and commit: when a constraint lifts, that
  register is the work order, and without it nobody can say which merged claims to revisit. **The
  register must also cover skips inside the backed set** — a gate that runs green while skipping files
  every run is backed for what it ran and silent about what it did not. **And the register carries its
  own limit at the top or it becomes the best false-assurance instrument in the building: it can only
  hold what someone noticed nobody looked at, so a short register is evidence about what we thought to
  register, not about how much is unchecked.** **Even the
  backed side has this shape at its edge:** the boundary that re-ran every gate could not run suites
  needing a browser, a GPU, or the network, and skipped two contract files on every run — so the
  subsumption is near-total, and the exceptions are, predictably, the expensive ones.
- **A clean result is a result, not an absence of one.** A file with no unreported loss path settles a
  chunk of the denominator; recording it as a positive finding is the only way it counts.

## Search instructions — where to look next

*Arc-local, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Each of these directed a search that found something the same day it was written. None is a verdict;
see the note at the top.

### A surface property that correlates with care gets read as the care itself

One law, and the four forms below are it applied to different surfaces. **Each property is a reason to
look, never a reason to believe** — and a reader holding four tells finds no match when the fifth form
arrives, where a reader holding the law derives it.

- **Vividness.** A CFF reader's stated reason for refusing CID-keyed fonts was that they fail
  *silently, for every glyph*; measured, they fail loudly. The true reason — the outcome is
  unpredictable per font — was the stronger argument for the same refusal. **A rationale more vivid
  than its conclusion needs is doing rhetorical work.**
- **Precision.** A correction reading *13 functions of which 3 exported* displaced an original *19* and
  was accepted instantly by two readers; both proved exactly right, at different commits, **the sharper
  one from the older tree.** Nothing about a number's form tells you when it was taken.
- **Deliberation.** A guard shows someone anticipated a failure, a comment that they considered it, a
  three-of-four convention that a rule exists — **and none of them gives a caller anything to
  enumerate.** A comment above a silent decline answers *was this considered* while leaving *is this
  reported* untouched, so it suppresses the search while looking like diligence.
- **Mechanicalness.** A rule a script can evaluate looks settled: **a stated rule shows someone
  decided, not that the rule decides.** One such rule ran cleanly and still moved a count from 80 to 77
  when an `if`-chain became an equivalent `Map`.

**Expect a fifth surface** — grepping `explain*` functions, TODOs, or tests would be the next one, on
the same intuition.

### The rest

- **Separate the signal axis from the fidelity axis.** Signal — is the failure reported, misreported,
  or absent? Fidelity — is the content missing, diminished, or substituted? Orthogonal, and **the worst
  cells are the ones no cheap check reaches**; searching them on purpose found a morph losing one path
  pair, a sprite whose bounds omit an unresolvable child, rich text keeping its size and box while
  losing its font family, and a duplicate font id leaving the wrong font in place. **The fidelity
  values order by which check they defeat, not by harm** — existence, then count, then content
  comparison — which makes the axis an oracle specification rather than a severity scale. Demand that
  property of the next axis rather than treating it as a happy accident of this one.
- **A search finds syntax, not the thing you were looking for.** A sweep for `if (x !== null) push(x)`
  produced eleven candidates; one could not be made to fire at all, because the streams it guards are
  built in lockstep. **It survived three readings because at no point did anyone try to make it
  happen.** ⇒ **Building the report for a suspected defect is the strongest test of whether it is one,
  and deferring that is not caution: an unexercised finding is a claim nothing has contradicted yet.**
  The cut runs both ways — the same sweep would miss a loss whose syntax it does not match.
- **A hedge written for a negative result silently expires when the result comes back positive.** A
  search command carried a note — *empty above means not wired in my clone, which may be behind* — the
  search returned data, and the caveat evaporated with no decision. **A positive result removes the
  trigger to re-read your own qualifier.**
- **Do not renumber a denominator because investigation shrank it.** When effort both grows the
  numerator and shrinks the denominator, the ratio improves from effort alone regardless of what the
  effort found — **and it arrives dressed as rigour.** Report counts instead and the question dissolves.

## Denominators

*Arc-local, 7 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

- **Before ratifying a count, ratify the rule that decides when two things are one entry or two.** A
  count with no stated individuation rule is not a measurement, it is a tally — and unlike a missing
  member, it cannot be closed by finding more. The tell costs one question, asked of the artifact
  rather than of its contents: *what would make these one entry instead of two?* **If nobody can
  answer, there is no denominator yet.** One capability list split some format versions into separate
  entries and collapsed others by no stated rule; the margin was three entries wide in either
  direction, and a whole day of auditing its *members* never reached it because the question is about
  the set, not the rows. Any `N of M capabilities` figure has this hole until the rule is written.
  Beware the second-order version: an under-defined rule for fixing an undeclared convention
  relocates the arbitrariness from the rows to the rule, **where it is harder to see because a written
  rule looks settled**. Require a definition something mechanical can evaluate, then run it and report
  the count it yields rather than the count you expect — the rule applies to the entries that already
  look right, so the direction of the move is not knowable in advance. **Mechanical evaluability is
  necessary and not sufficient:** one candidate rule was extractable, ran cleanly, and still moved the
  total from 80 to 77 when an `if`-chain was rewritten as an equivalent `Map` lookup with identical
  behaviour on every input. **A rule whose count moves when only the source style moves is measuring
  the source, not the thing.** Demand three properties — mechanically evaluable, invariant under
  behaviour-preserving refactor, and of a grain the consumer would accept — and expect the
  hand-maintained part you removed to reappear at the joint between the rule and the rows, where
  nobody looks because the rule is now "mechanical".
- **Stamping makes a claim checkable; attaching makes it unnecessary.** Stamp when you must describe,
  attach when you can deliver. **Any number computed over a mutable artifact carries that artifact's
  identity or it is not a measurement** — one arc needed that four times before stating it once, and
  *"2,611 of 2,611 lines"* is its sharpest form, since 100% is the most convincing number available
  and says nothing without which 2,611. **But most of the day's version of this was not a stamping
  problem at all: five readers stated true, exact numbers about trees other people could not see, and
  at least two of them could simply have sent the file.** A dependency is relational — confirming
  something landed tells you nothing about whether it arrived — **so read the consumer's side, or
  hand them the artifact and remove the question.**
- **Name the denominator in the output, in words.** "N of 82 importer-declared capabilities" — never a
  bare "N of 82", and never *total* unqualified. A self-derived denominator cannot show what was never
  implemented, so a ratio over it measures the corpus against our own model and reads as coverage of
  the format.
- **When two populations have been quoted as one number, say which is unmeasured.** What our importer
  handles and what the format has are different totals; the second answers "how complete is this
  import" and nobody had produced it. The missing measurement is reported beside the one we have.
- **A ceiling on a count is also a release from waiting for it.** If a population can never be known
  complete — because every new way of looking has found more — then it cannot be a precondition for
  anything downstream, and work gated on it waits forever **while the wait looks like diligence the
  whole time.** Read half of that ruling alone and you get an indefinite hold justified by rigour,
  which is more expensive than the imprecision it was avoiding. State both directions together.
- **A count you produced is a denominator over whatever produced it, and that is usually not the
  population you meant.** One arc found the same defect in three costumes in a day: capabilities
  counted over our own importer rather than over the format; loss families counted over the
  searcher's vocabulary of failures rather than over the losses that exist; and a hash oracle
  comparing output against our own earlier output, which detects change and never wrongness — so a
  defect present at first capture stays green forever. **Each measures consistency and reads as
  truth.** Say which population, in the output, in words.
- **A denominator can be arbitrary rather than wrong, and that is worse.** Splitting some format
  versions into separate capabilities and collapsing others — by no stated rule — left a count whose
  margin was three entries wide in either direction. A missing member is an error you can close; **an
  undeclared convention is a denominator that moves whenever someone else applies it**, and nothing
  flags the shift.

## The test before quoting a number

*Arc-local, 3 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Not a fourth rule — the check you run when a number is about to do work in an argument.

- **Quantities with different meanings cannot be compared for direction.** Three counts moving "the
  same way" is not a pattern if the three measure different things; variety of quantity is what makes
  the comparison invalid, not what strengthens it.
- **A tally is evidence about how often you looked; a mechanism is evidence about what must be true.**
  Different kinds of claim, not different strengths of one, which is why substituting a tally for a
  mechanism trades down even when the count is accurate.
- **A prediction asserts a base rate the way a ratio asserts a denominator.** Both are form-level
  claims and both need the population stated.
