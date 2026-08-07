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

**Everything below is a search instruction, not a test.** Each entry tells you where to look or what
to read next; none of them tells you a claim is wrong. Used as verdicts they invert — the vividness
tell would discredit whoever describes a genuinely severe finding accurately, and the fidelity axis
would rank losses by harm instead of naming the check each one defeats. **A document of search instructions read as a
document of tests is this file's failure mode.** If an entry ever licenses rejecting someone's work
rather than reading something, it is being misused.

## The law: evidence is about whatever produced it

*Arc-local, 5 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Its sharpest case is the self-report. **A self-report is evidence about the self-reporter, not about
what it carried** — so to get evidence about the payload, you need something that looked at the
payload. Everything below in this section derives from that in one step.

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

*Arc-local, 3 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Make the false claim unrepresentable rather than discouraged. A rule you hold is a rule you can drift
off; three agents in one day each drifted off a rule they had written down.

- **Attach the audit to the member, not to the count.** With each capability carrying which audits
  reached it, the totals are derived and can never outrun their audit — a bare `17/17/17` stops being
  discouraged and becomes unrepresentable.
- **Choose a channel without the hazard instead of remembering to avoid it.** Prose through `-m`,
  anything carrying an identifier through `--file`: shell substitution then cannot occur, rather than
  being something each author must remember not to trigger.
- **Put a coverage caveat in a table, not a sentence.** A sentence can be skimmed past; a table of
  which files were read in full, partially, and not at all cannot.

## Honest limit — *what to do when you cannot*

*Arc-local, 4 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

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
- **A clean result is a result, not an absence of one.** A file with no unreported loss path settles a
  chunk of the denominator; recording it as a positive finding is the only way it counts.

## Search instructions — where to look next

*Arc-local, 3 instruments, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

Each of these directed a search that found something the same day it was written. None of them is a
verdict; see the note at the top.

- **Separate the signal axis from the fidelity axis.** Signal — is the failure reported, misreported,
  or absent? Fidelity — is the content missing, diminished, or substituted? They are orthogonal, and
  **the worst cells are the ones no cheap check reaches**. Searching them on purpose found four
  members: a morph that silently loses one path pair, a sprite whose bounds omit an unresolvable
  child, rich text that keeps its size and box while losing its font family, and a duplicate font id
  that overwrites the first glyph table so the font exists and is the wrong font. A ranking would
  have said *this is worse*; the axis said *where to look*.
  **The fidelity values order by which check they defeat, not by harm** — missing fails an existence
  check, diminished passes existence and fails a count, substituted passes both and needs a content
  comparison. That makes the axis an oracle specification: it says what you must build to see the
  failure, and nothing about how much the failure costs a user. Demand that property of the next
  axis rather than treating it as a happy accident of this one.
- **A rationale more vivid than its conclusion needs is worth reading first.** A CFF reader's stated
  reason for refusing CID-keyed fonts was that they would fail *silently, for every glyph*; measured,
  they fail loudly. The true reason — that the outcome is unpredictable per font — was the stronger
  argument for the same refusal. The extra vividness was doing rhetorical work, which is the same
  smell as a tally standing in for a mechanism. **This licenses one action: read the reason.**
- **An artifact that shows deliberation is not an artifact that provides reporting.** A guard shows
  someone anticipated a failure; a comment shows someone considered it; neither gives a caller
  anything to enumerate. Auditing by grepping for guards marked a capability covered whose loss no
  caller can see, and a comment two lines above a silent decline answers *was this considered* with a
  yes while leaving *is this reported* untouched — so it suppresses the search while looking like
  diligence. A third form is neither: three of four definition kinds rejecting a duplicate id is a
  convention that **displays a rule without providing one**, and a reader who infers it from the
  three has read intent and concluded about code. A fourth is a rule itself: **a stated rule shows
  someone decided; it does not show the rule decides**, so a written convention that cannot be
  mechanically evaluated is the same artifact wearing a better hat. **Expect a fifth: grepping
  `explain*` functions, TODOs, or tests, on the same intuition.**

## Denominators

*Arc-local, 6 instances, all from the SWF-import/conformance arc of 2026-08-07. Untested on any other work — if you quote this rule, quote this line with it.*

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
