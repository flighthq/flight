# Evidence discipline — one law and three action rules

**Status: consolidation of a single day's findings, untested elsewhere.** Every rule here was derived
on 2026-08-07, from one arc — SWF import instrumentation and the import-conformance scoreboard — by
four agents working the same problem. **No rule below has yet survived contact with work that is not
this arc.** A rule set written down at the end of an intense day is exactly the artifact that looks
authoritative and has not been tested across contexts, and the day's own law says self-reports
overstate. This document is a claim about one arc, not about the codebase.

**Falsification condition:** the first unrelated arc that either confirms one of these or fails to is
what upgrades or retires it. Until then, read them as findings with good instances, not as policy.

**This file must stay under 12,000 characters**, enforced by `npm run docs:check`. The number is
derived from the job — a law plus one instance per section, plus this framing — **and was fixed
before the file was cut to fit it, because a budget set after a tidying pass ratifies whatever that
pass happened to produce.** The instances the cut removed are not lost: they are in
[evidence discipline instances](evidence-discipline-instances.md), organised by the law each one
serves. **A rule without an instance is a slogan**, so each law below keeps the single instance with
the highest diagnostic value per character, and the companion holds the rest.

**Everything below is a search instruction, not a test.** Each entry tells you where to look or what
to read next; none tells you a claim is wrong. Used as verdicts they invert — the vividness tell
would discredit whoever describes a genuinely severe finding accurately, and the fidelity axis would
rank losses by harm instead of naming the check each one defeats. **A document of search instructions
read as a document of tests is this file's failure mode.** If an entry ever licenses rejecting
someone's work rather than reading something, it is being misused.

*Every section is arc-local, from the SWF-import/conformance arc of 2026-08-07, and untested on any
other work — if you quote a rule from this file, quote that fact with it.*

## The law: evidence is about whatever produced it

Its sharpest case is the self-report. **A self-report is evidence about the self-reporter, not about
what it carried** — so to get evidence about the payload, you need something that looked at the
payload. Every instance in this section derives from that in one step.

**Elevated instance — the repo you can reach is not the repo the claim is about.** Say it in those
words; the sophisticated version did not save anyone. **Five readers stated true, exact, checkable
numbers about trees that were not the one under discussion — all on the same day, several while
actively hunting that exact failure.** It is elevated because it recurred more than any other
instance, it defeats the checks people actually run, and its remedy is one question rather than a
technique: *which tree is this number about?*

## Preservation ordering — *when*

Order competing actions by how much they destroy. Destructive last.

**Elevated instance — report an instrument's weakness before you fix it.** A fix is a state change
and a finding is a fact about the prior state, so **the fix destroys what the finding is about.** A
repo where every instrument was silently improved on discovery would look, from its history, like a
repo whose instruments were always sound. Composed with the section above: **audit before you report
the count; report the weakness before you fix it.**

## Structure over convention — *how to enforce*

Make the false claim unrepresentable rather than discouraged. A rule you hold is a rule you can drift
off; three agents in one day each drifted off a rule they had written down.

**Elevated instance — attach the audit to the member, not to the count.** With each capability
carrying which audits reached it, the totals are derived and **can never outrun their audit** — a
bare `17/17/17` stops being discouraged and becomes unrepresentable. It is elevated because it is the
only instance that shows the general move: find the representation in which the false claim cannot be
written down.

**The two-rung floor — the minimum for landing any gate.** A gate that cannot fail is
indistinguishable from a gate that passes, and green is what both look like. Two mutations, in order,
and neither substitutes for the other:

1. **Did the mutation land at all?** Break the thing deliberately and confirm the world changed —
   without this rung a typo in the mutation reads as a robust gate.
2. **Did it move the quantity the instrument reads?** A mutation can land and still leave the gate's
   number untouched, which is the case that produces a confident green over a blind spot.

Both rungs are one command each and neither is inferable from the other. **The companion negative
control matters as much: mutate something the gate should *not* fire on and confirm it stays
green** — a gate that fires on everything is as useless as one that fires on nothing, and only the
negative control tells them apart. **This rule was quoted across an entire arc while living in no
file**, which is its own instance of this section: an unlanded rule is a convention no matter how
often it is repeated, and it was found by asking where each structure *lives* rather than whether it
exists.

**Three axes decide whether a structure actually protects anything: lifetime, reach, and when it is
encountered.** A structure must outlive the hazard it guards — a note in a workspace that dies with
the session is a caution with extra steps. It must be reachable by the agent it was written for — a
doc linked only from an index is met at the moment of curiosity, not at the moment of the decision.
**And it must be encountered before the mistake rather than after: a budget living in the file it
governs is read by everyone already writing into it and by nobody deciding whether to.** Only a gate
fires at the moment of the action, which is why the third axis usually resolves to *make it a gate*.

## Honest limit — *what to do when you cannot*

Name the hole. When nothing can close it, naming it is the whole of what can be done, and it is what
stops an artifact claiming more than it has.

**Elevated instance — expensive-to-verify and unverified are strongly correlated, and that
correlation is the finding.** When one boundary re-ran every cheap gate and none of the costly ones,
the unbacked set was not a random subset — **it was selected for by cost**, so it never shrinks on
its own and it fills with exactly the claims that most need checking. **But the set is selected by
cost without every member being expensive:** "I confirmed this test can fail" costs seconds and is
unverified only because nobody asks; it rode in on the same list as a 1.6 GB fetch and inherited its
excuse. **A true general law is an excellent place for a cheap fix to hide**, so split the list by
*why* before accepting any of it as unfixable. **Mark each unbacked claim with a fixed greppable
token rather than prose**, because the point is not that a reader is warned but that the set becomes
countable; the [unbacked register](unbacked-register.md) carries the practice and its own limit.

## Search instructions — where to look next

Each of these directed a search that found something the same day it was written. None is a verdict.

### A surface property that correlates with care gets read as the care itself

One law, and the forms in the companion are it applied to different surfaces. **Each property is a
reason to look, never a reason to believe** — and a reader holding four tells finds no match when the
fifth form arrives, where a reader holding the law derives it.

**Elevated instance — precision.** A correction reading *13 functions of which 3 exported* displaced
an original *19* and was accepted instantly by two readers; **both proved exactly right, at different
commits, the sharper one from the older tree.** Nothing about a number's form tells you when it was
taken. Elevated because it is the one form that fires on a *correction*, which is where scrutiny is
lowest.

**Also durable.** Separate the signal axis (reported, misreported, absent) from the fidelity axis
(missing, diminished, substituted): **the fidelity values order by which check they defeat —
existence, then count, then content comparison — which makes the axis an oracle specification rather
than a severity scale.** And **building the report for a suspected defect is the strongest test of
whether it is one**; an unexercised finding is a claim nothing has contradicted yet.

## Denominators

**Elevated instance — before ratifying a count, ratify the rule that decides when two things are one
entry or two.** A count with no stated individuation rule is not a measurement, it is a tally — and
unlike a missing member, **it cannot be closed by finding more.** The tell costs one question, asked
of the artifact rather than of its contents: *what would make these one entry instead of two?* If
nobody can answer, there is no denominator yet. One capability list split some format versions into
separate entries and collapsed others by no stated rule, and **a whole day of auditing its members
never reached it, because the question is about the set and not the rows.** Demand three properties
— mechanically evaluable, invariant under
behaviour-preserving refactor, and of a grain the consumer would accept. **Mechanical evaluability is
necessary and not sufficient:** one candidate rule ran cleanly and still moved the total from 80 to
77 when an `if`-chain became an equivalent `Map`, and **a rule whose count moves when only the source
style moves is measuring the source, not the thing.**

**And name the population in the output, in words.** "N of 82 importer-declared capabilities", never
a bare "N of 82" and never *total* unqualified. **A count you produced is a denominator over whatever
produced it, and that is usually not the population you meant** — capabilities counted over our own
importer rather than over the format, loss families counted over the searcher's vocabulary rather
than over the losses that exist, a hash oracle comparing output against our own earlier output, which
detects change and never wrongness. **Each measures consistency and reads as truth.** **A coverage
measurement's population is defined by the consumer, not by the corpus.**

## The test before quoting a number

Not a fourth rule — the check you run when a number is about to do work in an argument.

- **Where nothing recomputes, no number.** Not a better warning — **delete the figure and leave the
  recompute command.** A stamp warns without supplying a substitute, so it loses to any use that needs
  a value: the reader's choice becomes *subtract with a known-stale number* or *say nothing*, and the
  annotated figure is what makes the wrong option available. **Stamped-historical is the rule violated
  with a disclaimer attached.**
- **An instrument's scope must be derived, not chosen — its population, not only its vocabulary.** A
  gate built to catch stale numbers took its shape list from the grammar and its *file* list from what
  was in front of its author, **so the instrument inherited the very bias it existed to remove.**
- **Quote the source line rather than restating the number.** A quoted figure carries its own tree and
  is checkable against its source; a restated one is a new claim with nothing behind it, **and cannot
  be silently reunited with a different denominator in passing.**
- **Quantities with different meanings cannot be compared for direction.** Three counts moving "the
  same way" is not a pattern if the three measure different things.
- **A tally is evidence about how often you looked; a mechanism is evidence about what must be true.**
  Different kinds of claim, not different strengths of one.
- **A prediction asserts a base rate the way a ratio asserts a denominator.** Both are form-level
  claims and both need the population stated.
