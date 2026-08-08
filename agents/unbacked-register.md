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
