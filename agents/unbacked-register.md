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
tree.** It gets its own section because the remedies differ completely: an unbacked claim needs
someone to look, **a landed defect needs someone to act, and neither the register's cause split nor
the unbuilt table has a slot for it.**

| # | Defect | Verified how | State |
|---|---|---|---|
| L1 | The delivered base fails `npm run check` on its own — two typecheck errors where the fixture-stamp consumers were not carried with their rename | integration ran it against the base with nothing of theirs applied | Migration patch exists and is verified appliable; **delivery, not authoring** |
| L2 | A guarded `Decisions` line in a package charter was **removed rather than superseded**, and the mutation is in the delivered base | Baselined against the commit that introduced the guarded line: one violation | **Report, do not repair** — the ledger ruling stands |

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
