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

## The law: evidence is about whatever produced it

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

Order competing actions by how much they destroy. Destructive last.

- Inspect before `drop_caches`; capture before restore.
- **Report an instrument's weakness before you fix it.** A fix is a state change and a finding is a
  fact about the prior state, so the fix destroys what the finding is about. A repo where every
  instrument was silently improved on discovery would look, from its history, like a repo whose
  instruments were always sound.
- Composed: **audit before you report the count; report the weakness before you fix it.**

## Structure over convention — *how to enforce*

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

## The test before quoting a number

Not a fourth rule — the check you run when a number is about to do work in an argument.

- **Quantities with different meanings cannot be compared for direction.** Three counts moving "the
  same way" is not a pattern if the three measure different things; variety of quantity is what makes
  the comparison invalid, not what strengthens it.
- **A tally is evidence about how often you looked; a mechanism is evidence about what must be true.**
  Different kinds of claim, not different strengths of one, which is why substituting a tally for a
  mechanism trades down even when the count is accurate.
- **A prediction asserts a base rate the way a ratio asserts a denominator.** Both are form-level
  claims and both need the population stated.
