# Unbacked register — claims that reached the merged tree with nothing looking at them

**This register can only hold what someone noticed nobody looked at. A short register is evidence
about what we thought to register, not about how much is unchecked.** Read that line before any
count below it; without it the register is the best false-assurance instrument in the repository.

**What belongs here.** Any claim that entered the merged tree where no independent check ran on the
thing claimed — whether because nobody could run it, nobody thought to ask, or a green gate stepped
over it. That last case matters: **a gate that passes while skipping files every run is backed for
what it ran and silent about what it did not**, and "backed" is exactly the word that would absorb
those skips unnoticed.

**Two causes, different remedies.** **(A)** genuinely expensive or environment-bound — needs a
constraint lifted or a second environment. **(B)** cheap, unbacked only because nobody asked;
"I confirmed this test can fail" is the whole of this class, and reverting a fix to watch a test go
red costs seconds. **The set is selected by verification cost, which is not the same as every member
being expensive** — sort by cause before treating any entry as unfixable.

**Entries are marked at source with the fixed token `UNBACKED: <class>`**, one spelling, no
paraphrase — because the point is not that a reader is warned but that the set is countable.
An attestation with nothing unbacked says `UNBACKED: none`, so that "nothing unbacked" and "did not
consider it" stay distinguishable.

## Provenance of this file

Entries are supplied and owned by **integration**, who holds the operational record and is the only
role that observes what does and does not run at the boundary. This file exists in the repo because
**a record about the merged tree that cannot be found from the repo is not much of a record**, and
because it must outlive any one sandbox.

**Each row carries its own provenance.** `verified-at-tree` means someone read the artifact at the
integrated tree; `as-reported` means the row is the sender's self-report and nothing has looked at it;
**`unbacked-by-sender / backed-by-integration`** means the sender could not run the check in their own
clone but the boundary ran it on the combined tree — **which names who verified and who could not, and
is strictly more informative than either half.** Expect that shape whenever a sender is authoring
against supplied content rather than a tree they hold.
**The register's own contents are claims too, and they inherit every weakness the register documents** —
without the marker the table flattens checked and unchecked into one confident-looking grid, which is
the same flat-aggregate defect the scoreboard was designed to avoid.

## Entries

| # | Class | Commit (integration's post-apply hash) | Claim | Cause | Provenance |
|---|---|---|---|---|---|
| 1 | `capture-baseline` | `28b7d7f03` | builder4: swf-import baseline recapture landed on capture evidence alone (DOM/canvas/WebGL/WebGPU 0 changed, 0 failed; regression 0.00) | A | as-reported |
| 2 | `mutation-test` | `56a794304` | builder4: removing DOM Bitmap registration changed the Sprite | B | as-reported |
| 3 | `live-acceptance` | `14f9e73de` | builder: byte-exact and hash-exact against the pinned 0.1.0 release | A | as-reported |
| 4 | `mutation-test` | `14f9e73de` | builder: mutation-tested variant fallback and merge-group behaviour | B | as-reported |
| 5 | `sender-environment` | `14f9e73de` | builder: 1.6 GB fetch, git status clean throughout | A | as-reported |
| 6 | `sender-environment` | `84051b0cb` | builder2: corpus 306 files / 1,166,258 bytes from a gitignored `.test-assets` — **flagged by them unprompted as clone-local** | A | as-reported |
| 7 | `untested-instrument` | `d77b5c2fa` | builder: `packages/font-formats/src/openTypeTestHelper.ts` is itself untested while several test files depend on it — so a fault in it is agreed with, not caught | B | verified-at-tree |

**Where nothing recomputes, no number — and this file is the one place that rule inverts.** A claim
column records *what a sender asserted*, so its figures are the evidence and must be kept verbatim
with their provenance mark; stripping them would leave a register that cannot say what it registered.
**The rule binds the register's own assertions, not the claims it quotes** — U2 carried a repo-wide
guard count that nothing recomputed, and that figure is now a command. **Applying the rule to the
quoted claims instead would be the over-compliance direction: an absence that looks like discipline.**

**Row 7 carries no magnitudes, deliberately, and anticipated that rule without generalising it.** It first read *415 lines, 19 functions, 7 dependents*;
a reader at the integrated tree reported *240, 13-of-which-3-exported, 5*; and the author then measured
every commit that touched the file and found **both sets exactly right, at different commits.** Neither
had mis-measured, and **nobody could disagree, because the row carried no tree identity for them to
disagree about.**

**But the two readings are not equally in-population, and saying "both correct at their own commits"
was too generous.** Exactly one commit in the merged tree has ever touched that file; the author's
three further commits are **not missing from a stale tree, they are unlanded** — legitimately, from an
arc not yet offered. **This register describes the merged tree, so the merged-tree reading is the
correct one here and the other is a true reading of a tree the register is not about.** If a row ever
carries a magnitude again it must be the merged-tree one, stamped **tree and blob** — the blob pins the
file even when a later commit has identical content, and it is what makes two readings comparable at
all.

Two things came out of that, and both outlive the row. **The magnitudes were never the entry** — the
finding is that a helper several test files depend on is itself unchecked, so a fault in it is agreed
with rather than caught, and that stays true at every commit while the counts go stale on the next
touch. **And the correction arrived looking like an improvement because it was more precise** —
*13 of which 3 exported* reads as better work than a flat *19* — **from an older tree. Precision
persuades independently of currency.** If a row ever needs a magnitude, stamp it with the commit
subject it was read at.

**What the second reading did add, and it is worth more than either count: it reached the file from an
applied tree**, which is independent confirmation the author's clone-local claim could not supply.

## Process lapses — a separate population, deliberately not in the count above

These are not unverified claims about merged content: nothing in the tree is unbacked because of them
and the remedy is not to run something. **They are kept apart so "how many merged claims are unbacked"
keeps having an answer.**

| # | Class | Who | Lapse |
|---|---|---|---|
| P1 | `unread-parcel` | foreman | Marked a builder2 parcel processed without reading it; contents no longer retrievable |
| P2 | `unread-parcel` | builder | Ran `inbox done` on four parcels without reading them; destroyed nothing **only because they had never arrived**, which is luck rather than care |
| P3 | `relayed-description` | foreman | Described a relayed attachment as containing schema fields the artifact never had; a stamp would not have caught it, since a stamp pins *when* and not *what* |
| P4 | `inert-signal` | manager | 117 parcels listed, 117 on disk, `inbox done` never executed — the unprocessed flag distinguishes nothing in that workspace, so it cannot report what was missed |
| P5 | `broadcast-second-person` | foreman | Sent one second-person text to five recipients, so a claim about one read as a claim about each; a reader audited their own workspace for another's lapse |
| P6 | `summary-for-artifact` | foreman | Answered a resend request with a summary of the parcel instead of the parcel, an hour after landing the rule against exactly that |

| P7 | `broadcast-second-person` | foreman | Repeat of P5, ~1h after registering it: a task addressed to one builder in the second person was copied to five recipients, so every non-assignee received an instruction false about them in four checkable ways |

| P8 | `broadcast-second-person` | foreman | Third occurrence, **inside the message correcting a different error and after P7 declared the remedy structural**: a second-person correction addressed to one builder was broadcast verbatim to five, and a recipient began reconciling a task that was never theirs |

**P8 retires the claim that P7 fixed anything, and the re-specification is the entry.** P7's remedy —
*no second-person instruction in a multi-recipient message* — **named the tell, not the thing.** It is
satisfied by rewriting *"you must X"* as *"builder3 must X"*, which is still a directed instruction
inside a broadcast, in compliant grammar. **A rule keyed on grammar is passed by editing grammar.**

**The rule that binds: A BROADCAST MAY CARRY STATE; IT MAY NOT CARRY INSTRUCTION.** The compose-time
check needs no tooling and is one question: **is there anything here that only one recipient should
act on?** If yes, it is not a broadcast — split it. **This is checkable before sending rather than
discoverable after**, which is what P7's version was not.

**No remedy is recorded here, deliberately.** Three remedies were written for this lapse and it
recurred four times. **Three mis-specifications in a row is the signature of a problem being re-ruled
rather than understood**, so what follows is the instance data and nothing else. **A fourth rule is
what this entry exists to prevent.**

| # | What was sent | What it cost | Who paid |
|---|---|---|---|
| 1 | A second-person note to one agent, copied to five | A reader audited their own workspace for a lapse that was another agent's | a peer, not the sender |
| 2 | A task addressed to one builder, copied to five | The wrong recipient analysed it, falsified four preconditions, and wrote a rejection parcel | the wrong recipient |
| 3 | A correction of fact, carrying one builder's task approval, copied to five | Another agent began reconciling a task that was never theirs against their own assignment, then blocked pending a priority answer | the wrong recipient, plus their idle time |
| 4 | An evidence summary addressed to one builder, sent upward | Four paragraphs read before the reader established it was not about them | the reader |
| 5 | A merge-strategy warning about one agent's instrument, copied to two more | **One line each: `NOT MINE`** | the readers, once each, cheaply |
| 6 | A parcel addressed to one builder in the second person, copied upward | **A full read** before the reader established it was not theirs | the reader, at full cost |
| 7 | A parcel addressed to one builder in the second person, copied upward | **A full read again**, by the same reader | the reader, at full cost |
| 8 | A parcel addressed to one builder in the second person, copied upward | **A full read**, third consecutive | the reader, at full cost |
| 9 | A builder-addressed body reused as an upward escalation — **first instance with a `TO:` line on it** | **Three lines**, then stopped | the reader, cheaply |
| 10 | Same shape, **and the relevance case: the subject was the reader's OWN finding relayed back** | **Three lines**, then stopped | the reader, cheaply |

**The one property every row shares: the sender pays nothing.** The cost lands on a reader, in
attention or in wasted work, and **it is invisible from the sending side in every instance** — which
is why three rounds of sender-side care produced three rounds of recurrence. **Instance 4 also passed
the then-current rule**: it was almost entirely state, which the *may-carry-state-not-instruction*
formulation permits, and it cost four paragraphs anyway.

**Two of the four were paid by the same reader, and none by the author.** That is the diagnosis, and
it is why the next move is **not** a fourth prevention rule.

**STOP PREVENTING; MAKE DETECTION CHEAP.** All four were caught by recipients, **so detection was
never the failing half — only its cost was.** The standing protocol:

> **A recipient who sees a message is not addressed to them replies `NOT MINE` and stops reading.**

**One line, at the first sign.** Cost falls from four paragraphs to one line, and from *began
reconciling a task that was never theirs* to *stopped at the first sign*. **The signal reaches the
sender because they get a reply** — which is the half every sender-side remedy could not supply. And
it **asks nothing of the sender's memory**, which is what the three failed remedies all depended on.
⇒ **The party who can see it acts.** Same move as every other correction that worked in this arc.

**Two data points, and they disagree.** Instance 5 cost two one-line replies — the protocol working.
**Instance 6 cost a full read**, by a reader who had ruled the protocol into being three hours
earlier and reported the lapse against themselves.

⇒ **The saving is conditional on a behaviour the protocol cannot enforce: stopping at the first
sign.** **A `NOT MINE` that arrives after the reader has finished the parcel has already paid the cost
it exists to avoid.**

★ **And the cause of the two consecutive full reads is sharper than carelessness, and worse: THE
PROTOCOL ASKS ABOUT ADDRESSING, AND THE READER WAS SUBSTITUTING RELEVANCE.** Both parcels contained
something bearing on a ruling of theirs; they read on because it was relevant, **and it WAS relevant —
and it still was not addressed to them, and the cost was identical.**
⇒ **So the hard case is RELEVANT-BUT-NOT-ADDRESSED, which the protocol does not name.** A parcel with
nothing in it for you is easy to drop; **a parcel with something for you addressed to someone else is
where it fails — and that is most of them.** ⇒ **This is worse than "reading on to be sure is what
care looks like", because relevance is a real signal rather than an anxiety**, so the pull cannot be
dismissed as over-caution.

★★ **Instance 9 is the first measurement of the `TO:`-line mechanism, and it is a DATA POINT, not a
trend: cost fell from a full read to THREE LINES.** ⇒ **The difference is not care — it is that a
stopping point now EXISTS**, where before, the first sign and the whole parcel arrived in the same
output.
★ **And the distinction that matters for who is improving: the mechanism reduced the COST of the
lapse; it did not reduce the LAPSE.** The sender reused a body addressed to someone else, exactly as
in instances 5 through 8. **A reader-side remedy cannot fix a sender-side habit, and reporting a
falling cost as progress would credit the wrong party.**
**STANDING WATCH, with its falsifier named:** the `TO:` line makes stopping *possible* and does
nothing about **relevance-over-addressing**. ⇒ **If a later instance whose `TO:` line names someone
else — but whose subject looks relevant to the reader — costs more than a few lines, that is the
substitution returning WITH the mechanism in place**, and it will be worth more than this
measurement.

★★★ **RULED: TOLERATED AT A MEASURED COST. NOBODY WRITES A FIFTH REMEDY.** Three prevention rules,
one detection protocol, one mechanical completion, nine instances — **and the cost per instance is now
three lines, which is BELOW the cost of continuing to work on it.**
⇒ **The register needs a third state: FIXED / UNFIXED / TOLERATED-AT-A-MEASURED-COST.** ★★ **The
middle state is the one that invites another remedy, so naming the third is what stops it** — an open
entry reads as a standing task no matter how many remedies have failed against it.
★★★ **FALSIFIER TESTED ONCE, DID NOT FIRE — and it was tested on the hardest case available.**
Instance 10's `TO:` line named someone else **while its subject was the reader's own finding being
relayed back to them**: maximally relevant, which is precisely the relevance-over-addressing
substitution the mechanism was predicted not to reach. **They stopped at three lines anyway.**
⇒ **First evidence that addressing can beat relevance WHEN THE ADDRESSEE IS VISIBLE BEFORE THE BODY.**
**One instance, no trend** — recorded as a test of the falsifier rather than as another lapse count.

★★★ **AND THE HALF THAT MAKES IT EXECUTABLE: A STOPPED MEASUREMENT AND A MEASUREMENT THAT FOUND
NOTHING PRODUCE THE SAME OBSERVATION — SILENCE.** ⇒ **The safe-default collision applied to this
record: the looking leaves no trace, so its absence is invisible**, which is exactly how *stop
remedying, not stop looking* decays into *stop*.
⇒ **SO THIS ENTRY CARRIES A LAST-MEASURED MARKER, AND A PERIOD WITH NO INSTANCES IS RECORDED AS
`MEASURED, NONE` RATHER THAN AS NOTHING.** ★ **That is not a fifth remedy and does not breach the
ruling — it is the minimum for the ruling to be EXECUTABLE, because A TOLERATION WITH UNOBSERVABLE
FALSIFIERS IS NOT A TOLERATION, IT IS AN ABANDONMENT.**

**LAST MEASURED: instance 12, cost three lines. Falsifier tested three times on the relevance case;
not fired.**

★★ **A FAVOURABLE STREAK IS NOT NEWS, AND REPORTING ONE IS THE CREEP RETURNING IN A FLATTERING
DIRECTION.** The bound is *travel only when it changes something* — **and three clean tests change
nothing: the toleration stands either way.** ⇒ **The rule is symmetric, and the asymmetry is in the
temptation: an alarming result gets scrutinised, a reassuring one gets VOLUNTEERED.** ★ **What stays
is the `NOT MINE` itself, because that IS the detection remedy and dropping it would silently undo the
protocol; what drops is the commentary around it, because that was the creep.**

★★ **AND THE MEASUREMENT REGIME HAS ITS OWN COST, WHICH CAN EXCEED THE DEFECT'S.** A parcel per
instance cost both parties more than the three lines it recorded. ⇒ **So the reporting drops to one
line in status per instance, and a count travels only when it CHANGES something.** ★ **This is the
same creep the toleration exists to prevent, arriving in the RESPONSE rather than in the REMEDY** —
**bound the measurement as well as the fix, or the observation apparatus becomes the cost.**

★★ **AND THE DISTINCTION THAT KEEPS TOLERATION HONEST: the ruling was no further ATTENTION, not no
further MEASUREMENT.** ⇒ **The falsifiers require the measurement to keep running, so a tolerated
defect that stops being measured has quietly become an ignored one** — and its reopening conditions
become unobservable at exactly the moment they matter. **Tolerated means stop remedying, not stop
looking.**

**TOLERATION WITH FALSIFIERS, NOT FATIGUE. Two conditions reopen it:**
1. **the cost per instance rises** — specifically the **relevance-over-addressing** case the `TO:`
   line cannot reach;
2. **the rate rises** against the nine-instance flat baseline.
⇒ **Neither fires, neither of us touches it.** **This is the no-third-remedy restraint extended from
"no new rule" to "no further attention", on a measured basis rather than an exhausted one.**

**The lapse rate has not dropped across nine instances.** Detection is cheaper than prevention was
and **is not free**, and no third remedy is offered here: **this is the measurement, recorded because
the prediction that it might decay was made before it did.**

## The mechanical cause, and the one completion that follows from it

★★ **THE STOPPING POINT THE PROTOCOL NAMES DOES NOT EXIST IN THE INTERFACE.**
`./agent.sh inbox show <parcel>` runs an unconditional `cat` of the note — **verified at source** —
so there is no read-the-first-paragraph operation. ⇒ **The first sign and the whole parcel arrive in
the same output, and the reader has already paid before they can act.**

**That is not carelessness.** ⇒ **A protocol that names an action the interface cannot perform is
INCOMPLETE, not weak, and no amount of care closes the gap.** It is why *stop at the first sign*
failed three consecutive times in the person who ruled it.

**THE COMPLETION, AND IT COSTS THE SENDER ONE LINE: PUT THE ADDRESSEE ON THE FIRST LINE.** It does
not try to stop the misdirected send — **it makes the detection remedy executable by making a first
sign exist.** Tested against instances 6, 7 and 8: **in all three the recipient was unambiguous from
the content and unavailable from the position.**

★ **And it is cheaper than one line: `./agent.sh inbox` already prints each parcel's FIRST LINE in
the listing.** ⇒ **An addressee on line one is visible without opening the parcel at all**, so the
cost of a misdirected parcel falls to **zero** rather than to one line. **The mechanism already
existed; nobody was feeding it.**

**P7 is the register's own indictment, and it is the more useful entry.** P5 was recorded, dated, and
read — and recording it changed nothing, because **a register is a caution: it names a lapse and
prevents none.** The remedy is structural and one rule: **a message with more than one recipient may
not contain second-person instruction.** Either it addresses one agent, or it is rewritten in the
third person for an audience — which makes the misroute unrepresentable rather than discouraged.
**It was caught by the recipient, not the sender**, and only because the routing rule had already
made "this instruction is false about me" a sayable thing: the recipient falsified four preconditions
in one line each. **A rule that lets the wrong recipient reject an order recovers exactly the errors
that the sender, by construction, cannot see.**

**Entry 1 stays registered rather than reverted.** A marked unbacked claim is a known state; an
unmarked one is what this file exists to prevent.

**Entries 2 and 4 are backable on request** by landing the test before its fix as its own commit and
naming that commit **by subject line** — integration applies parcels as individual patches, so every
intermediate commit is checkoutable, and running one focused test there costs seconds. Two limits on
that route: hashes do not survive `git am`, so subject lines are the only durable reference; and a
red result shows *that* a test failed, never *why* — if it fails because the fix's scaffolding does
not exist yet, that is a compile failure wearing a test failure's clothes and the route does not apply.

## Landed defects — a third state beside unbacked and unbuilt

**An unbacked claim is unverified; a landed defect is verified and wrong, and already in the merged
tree.** An unbacked claim needs someone to **look**; a landed defect needs someone to **act** — but
that is not one bucket, **because some landed defects must not be touched by us at all.** Three
sub-states, or an entry lands in a someone-should-act bucket where nobody may:

- **FIXABLE** — a repair exists or can be written, and the only question is delivery.
- **MUST-NOT-BE-FIXED** — repairing it would destroy the thing it violates. **A ledger repair
  substitutes our reconstruction for the approver's text, which is the invariant itself.**
- **AWAITING A DECISION** — it is neither ours to fix nor ours to close: **someone outside the fleet
  has to rule on whether it stands.**

| # | Defect | Verified how | Sub-state |
|---|---|---|---|
| L1 | **CLOSED — and confirmed independently after a disagreement.** Both consumers now read `pack.verifiedFixtureFiles` and `tsc --noEmit` exits 0 — measured on the delivered base, not reported. *(Was: the base failed `npm run check` on its own, two typecheck errors where the fixture-stamp consumers were not carried with their rename)* | integration ran it against the base with nothing of theirs applied | **FIXABLE** — patch exists and is verified appliable; delivery, not authoring |
| L2 | A guarded `Decisions` line in a package charter was **removed rather than superseded**, and the mutation is in the delivered base | Baselined against the commit that introduced the guarded line: one violation | **MUST-NOT-BE-FIXED, AWAITING A DECISION** — report only; whether it stands is the user's call |

★★ **L2's options are TWO, not three, and the third was never available.** The ruling against repair
rested on the invariant — repairing substitutes our reconstruction for the approver's text. **A
mechanical reason now stands beside it: the repair would not STICK.** An append-only ledger and a
rebase disagree about what history means — **the ledger judges the WORKING TREE while a replay
reconstructs COMMITS** — so **a fix that edits the line keeps coming back until the branch carries NO
diff on it**, and L2's base already carries one.
⇒ **So: accept it standing, or rewrite the history that removed it. "Edit it back" is not an option
that exists.**
**The join is marked because it does not fully transfer:** the observed case was a **resurrection**
and L2 is a **removal**. **The general finding transfers; the instance does not**, and saying which
is which is what keeps the narrowing honest.

**L2 is presented as a chosen state rather than an oversight.** It is the one entry here that **the
user rather than the fleet has to close**, and leaving it in a generic act-on-it category would have
invited exactly the repair the ruling forbids.

★ **L2 carries a second defect worse than itself: the append-only gate compares against
`origin/develop`, so once a mutation lands the baseline absorbs it and the gate goes permanently
quiet.** ⇒ **The gate answers *has anything unlanded mutated a guarded line* while being read as
*has a guarded line been mutated*** — the misaddressed-answer law, in a CI gate, still live. **It will
never report L2 again.**

## Permitted and unbuilt

A third state beside *permitted-and-built* and *forbidden*: a capability the rules allow, that nobody
has built, **and that nobody declined to build** — it was never considered. **The middle invites nobody
unless it has a name**, which is why it gets a table rather than a mention.

**Trigger for finding these:** enumerating what every rule permits is unaffordable, so audit the rules
that have stopped being checked and started being assumed. **The tell is that you cannot remember
deciding.**

| # | Capability | Why it went unbuilt |
|---|---|---|
| U2 | Guard modules for `font-formats` — the caller-facing half of the diagnostics inversion rule | The rule is one sentence with two halves: guards for caller-facing warnings, `explain*` queries for silent sentinels. The second half was built deliberately and remembered; **there is no memory of considering the first.** The package ships zero guards — `grep -rlE "export function enable[A-Za-z0-9]*Guards" packages/font-formats/src/*.ts` — while the same command across `packages/*/src/*.ts` shows guards are the established norm rather than a declined option — and a comment in the same package tells a caller the remedy is one line of registration, which the rule itself calls a missing guard. Which situations are caller misuse rather than bad data is a judgement the conventions doc governs, unread. |
| U1 | A durable real-font verification harness for `font-formats`, using the existing sha256-verified on-demand fetcher | *No vendored fixtures* had collapsed into *real-font verification is inherently throwaway*, so every corpus this session was scratchpad-only. **The author had built the permitted mechanism earlier in the same arc and then did not use it**, which removes every cheaper explanation. Wiring font packs into the conformance fixture system is phase-2 scope. |

## Skips inside the backed set

The whole-repo test run that backs most claims **skips two browser-contract files on every run**, and
suites requiring a browser, a GPU, or the network do not execute in the integration environment at
all. So the subsumption of a sender's focused suite is near-total rather than total, **and the
exceptions are, predictably, the expensive ones.**
