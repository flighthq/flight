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

**Offer a ruling as an instance rather than as a rule.** Stated as a law it invites compliance;
stated as an instance it invites the law — **and three times in one arc a correct local ruling was
made for a narrower reason than the one that actually held**, which only surfaced because someone
generalised the instance rather than obeying the rule.

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

**Elevated instance — the repo you can reach is not the repo the claim is about.** One question, not
a technique: *which tree is this about?* Worked in the companion, with six more.

**The same law applied to EXPLANATIONS: a mechanism constructed to fit an observation always fits
it** — the self-diffing generator one level up, **so re-examining the reasoning can never catch it,
and the remedy is reading the source.** ⇒ **An observation may be reported without a mechanism. An
unexplained fact is a complete report.** Worked in the companion.

**The adversarial twin: the wrong answer is a TRUE answer to the question you did not ask.** Not
false — **misaddressed.** Checking whether it is true never finds it, because **it verifies as true
every time: it is true of the question it actually answers.** ⇒ **Evidence is about whatever QUESTION
produced it, and a question is easier to substitute than a producer, because nobody writes the
question down.**
**Its home is RETRIEVAL, not reasoning.** Every instance was a retrieval — a grep, a compiler lookup,
a git ref, a field access, a listing — and **a retrieval always answers the query as posed against
the store as structured, never the question as intended.** ⇒ **The gap is not a mistake in retrieval;
it is what retrieval IS**, so it needs no bad reasoning, only a store shaped differently from the
query.
★ **Which makes the check executable: RESTATE THE QUERY AS THE STORE RECEIVED IT.** You can **inspect
a query**; you cannot inspect an intent — for a grep the pattern, for the compiler the type graph,
for git the ref, for a listing the line it printed. **Compare that to the question you meant.**
**Limit: for human recall there is no inspectable query**, which is why those instances needed someone
else's tree while every tool instance was settled by reading the pattern. **The check is strongest
exactly where a tool is involved.**
**It does not license rejecting an answer for being confident or precise** — the remedy is a
restatement, not a suspicion. Companion carries the instances.

## Preservation ordering — *when*

Order competing actions by how much they destroy. Destructive last. **Audit before you report the
count; report the weakness before you fix it; and dispatching is destructive, so verify a diagnosis
before it becomes a priority.** Instances in the companion.

**And the same axis governs statements: THE INTERVAL BETWEEN A STATEMENT AND THE THING IT BEARS ON IS
ITS EPISTEMIC CONTENT.** A **prediction** before the fix is a test and after it a repair report; a
**check** before the action is a gate and beside it a report; a **caveat** before the work is a
permission and after it an excuse. ⇒ **Same words, different force, and the difference is only
whether the statement was made while it could still have changed the outcome.** **This reaches past
falsifiability** — permission and gating are not about being wrong at all — **so ask of any statement
not whether it is true but whether it was said in time.**

## Structure over convention — *how to enforce*

Make the false claim unrepresentable rather than discouraged. A rule you hold is a rule you can drift
off; three agents in one day each drifted off a rule they had written down.

**Elevated instance — attach the audit to the member, not to the count**, so totals are derived and
**can never outrun their audit.** ⇒ **This is the structural form of the denominators law below:
the fix for an aggregate that discards members is to carry the members.** Worked in the companion.

**The two-rung floor — the minimum for landing any gate**, because a gate that cannot fail and a gate
that passes both look green. **(1) Did the mutation land at all?** **(2) Did it move the quantity the
instrument reads?** — a mutation can land and leave the number untouched, **and neither rung is
inferable from the other.** **Plus the negative control: mutate something it should NOT fire on and
confirm it stays green**, since a gate that fires on everything is as useless as one that fires on
nothing. Worked in the companion.

**Three axes decide whether a structure actually protects anything: lifetime, reach, and when it is
encountered** — and only a gate fires at the moment of the action, which is why the third usually
resolves to *make it a gate*. The companion works each axis with its instance.

**Before building a gate, ask whether landing the change alters what the gate should say.** ⇒ **A
property check is idempotent under landing; a historical check is not.** *Is this ledger well-formed*
answers the same after the commit lands as before it; *did someone mutate a guarded line* does not,
**and implementing it against a moving baseline means landing the mutation makes the gate go quiet
about it forever.** A historical question needs a fixed baseline or it becomes a property check that
has silently changed its subject.

## Honest limit — *what to do when you cannot*

Name the hole. When nothing can close it, naming it is the whole of what can be done, and it is what
stops an artifact claiming more than it has.

**Elevated instance — expensive-to-verify and unverified are strongly correlated, and that
correlation is the finding.** An unbacked set is **selected for by cost**, so it never shrinks on its
own and fills with exactly the claims that most need checking — **but selected by cost is not the
same as every member being expensive**, and **a true general law is an excellent place for a cheap
fix to hide.** Split the list by *why* before accepting any of it as unfixable, and **mark each
unbacked claim with a fixed greppable token rather than prose**, so the set becomes countable rather
than merely flagged. The [unbacked register](unbacked-register.md) carries the practice, the worked
instance, and its own limit.

## Denominators

**A contested denominator is often a sign the aggregate is the wrong instrument.** A ratio
aggregates, and **what a ratio discards is WHICH MEMBERS** — so when a population cannot be defined,
the usual reason is that **the question was never about a population. It is about members.** ⇒ **When
a denominator is contested, ask whether the question needs a ratio at all: often it does not, and the
contest DISSOLVES rather than being settled.** This is the invariance rule at its sharpest — **an
aggregate is blind to exactly what it is invariant under**, and no choice of denominator repairs an
instrument that discards the thing being asked about. The companion carries the case: **two
defensible denominators giving opposite conclusions, replaced by a per-member measure needing
neither.**

**Where a count is genuinely the right instrument, ratify the individuation rule first.** A count with
no stated rule is a tally, and **unlike a missing member it cannot be closed by finding more.** One
question: *what would make these one entry instead of two?* **It is about the set, not the rows**,
which is why auditing members never reaches it. Demand **mechanically evaluable, invariant under
behaviour-preserving refactor, and of a grain the consumer would accept** — and **mechanical
evaluability is necessary and not sufficient.**

**And name the population in the output, in words.** "N of 82 importer-declared capabilities", never
a bare "N of 82" and never *total* unqualified. **A count you produced is a denominator over whatever
produced it, and that is usually not the population you meant** — the companion lists the three
costumes one arc found it in. **Each measures consistency and reads as truth.** **A coverage
measurement's population is defined by the consumer, not by the corpus.**

## Form asserts what content does not

**Emphasis** claims equal strength; **parallel grammar** claims equal warrant; **adjacency** claims
comparability; **ordering in a transcript** claims dependency; **precision** claims currency. **Five
surfaces, one mechanism** — each caught by someone noticing directly, never by a check. **The same
mechanism reads a surface property as the care it correlates with:** vividness, deliberation,
mechanicalness. **Every one is a reason to look, never a reason to believe.**

**Why no check reached them: the law above asks you to restate the question an answer answers, and a
FORM MAKES NO STATEMENT.** ⇒ **There is nothing to restate, so the instrument returns not a pass but
an INAPPLICABILITY** — which reads like silence.

★ **So this class needs a TRANSLATION, not a restatement: write the form out as the sentence it would
be, then check that sentence.** *These are in parallel grammar* becomes *I am claiming they are
equally warranted* — **and once translated it is an ordinary claim the existing check handles.**
**The translation is what makes this a rule rather than a list: a list of five cannot catch the
sixth.**

**Before a number does work in an argument:** quote the source line rather than restating it; **where
nothing recomputes, no number**; and derive an instrument's scope rather than choosing it. Instances
in the companion.
