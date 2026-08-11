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

**The trigger for adding a row is the final tree, not the parcel.** A claim is registered when it is
newly present in the final tree integration attests, whatever put it there — parcel, base move, or
integration's own edit. Mechanically: sweep `git log <last-attested>..HEAD` for baseline, corpus, perf
and mutation claims before attesting, not just the parcels applied along the way. **This wording is
deliberately identical in shape to the whole-repo gate rule** ("the gate runs on the final tree,
whatever put the commits there") **so the two cannot drift apart again.** The earlier, implicit
per-parcel shape of this trigger had the same blind spot the gate rule was corrected for this morning:
commits arriving by base move fire no parcel and no attestation event, so a claim that entered that way
was invisible to the register for as long as the per-parcel shape stood, with nothing to announce that
it had gone uncounted. A trigger with this blind spot does not produce a wrong count — it produces a
count that reads as complete while quietly missing a whole arrival path, which is worse, because the
number is the thing people trust.

## Entries

| # | Class | Commit (integration's post-apply hash) | Claim | Cause | Provenance |
|---|---|---|---|---|---|
| 1 | `capture-baseline` | `28b7d7f03` | builder4: swf-import baseline recapture landed on capture evidence alone (DOM/canvas/WebGL/WebGPU 0 changed, 0 failed; regression 0.00) | A | as-reported |
| 2 | `mutation-test` | **unresolved** | builder4: removing DOM Bitmap registration changed the Sprite | B | as-reported, **commit unresolved** |
| 3 | `live-acceptance` | `14f9e73de` | builder: byte-exact and hash-exact against the pinned 0.1.0 release | A | as-reported |
| 4 | `mutation-test` | `14f9e73de` | builder: mutation-tested variant fallback and merge-group behaviour | B | as-reported |
| 5 | `sender-environment` | `14f9e73de` | builder: 1.6 GB fetch, git status clean throughout | A | as-reported |
| 6 | `sender-environment` | `84051b0cb` | builder2: corpus 306 files / 1,166,258 bytes from a gitignored `.test-assets` — **flagged by them unprompted as clone-local** | A | as-reported |
| 7 | `untested-instrument` | `3dc27f69f` | builder: `packages/font-formats/src/openTypeTestHelper.ts` is itself untested while several test files depend on it — so a fault in it is agreed with, not caught | B | verified-at-tree `aa279c96a` |
| 8 | `perf-size` | `feat(effects-gl): report per-effect resolution so a passthrough stops reading as complete` (subject, not hash — see below) | builder2: `npm run size` run read-only over the effects-gl dispatch, effects/webgl −0.4%; no pin rewritten | A | as-reported |
| 9 | `capture-baseline` | `d7d8fbc8e` | builder2: restores support-matrix tick marks for `scene-morph`, `scene-skin-morph-compose`, `scene-skinning` and `scene-transparent` from fingerprints captured before the rename that swept them (`c0eeab24e`), never re-verified against what those scenes render today. The matrix is internally consistent — realization plus committed fingerprint — which is weaker than agreement. Whoever next runs `test:functional:regression` in the environment its baselines were captured in should check those four first. | A | as-reported |
| 10 | `capture-baseline` | `9c5b5ed4f` + `924be5c97` (both shared, on `origin/develop`) | `builder` **as reported to foreman — not derivable from the tree, since these arrived by base move through no parcel.** The two non-uniform-scale skinning scenes (`scene-skin-nonuniform-normals`, `shadow-skin-nonuniform`, webgl + webgpu) landed with their fingerprint baselines and 50 new `support-matrix.json` entries, captured in whichever environment ran the capture. The `support:check` and `fingerprint-source-hashes:check` gates both pass, proving the matrix is internally consistent with the committed fingerprints — weaker than agreement, same shape as row 9. Integration is barred from the regression and parity legs, so nobody in the integration path has compared these baselines to what the scenes actually render. | A | verified-at-tree `c5ed5e5ce` — integration read the commits and the baseline files, not the pixels |

**Row 10 was corrected twice on the way in, and the first correction was itself over-corrected — which
is the more useful half.** As landed it opened `builder:`, an attribution **integration cannot derive**:
agent identity is not in git, every commit here carries the user's name and email, and parcels arrive
re-parented, so *the tree cannot answer who authored a line*. The first instinct was to delete the name
as a guess. **That was wrong, and row L5 in the ledger below is why** — it records the same authorship
from builder's own report of building `shadow-skin-nonuniform`. Foreman held evidence integration does
not. **Unverifiable-by-me is not the same as unfounded, and deleting a fact because I personally cannot
check it destroys information the file exists to keep.** The right move is the one the provenance column
was built for: keep the name, mark how it is known. It now reads `builder` as reported to foreman, not
derivable from the tree. Second, it cited `check-fingerprint-source-hashes:check`, which runs nothing. **One gate
has two names and the row had a third.** `npm run check` prints the label `fingerprint-source-hashes:check`
(registered in `scripts/check.ts`); the standalone npm script is `check:fingerprint-source-hashes`; the
implementation is `scripts/check-fingerprint-source-hashes.ts`. A name assembled from the file plus a
`:check` suffix looks right and matches nothing. **Any command quoted in this file should be pasted from
a run, never reconstructed** — a wrong command name is exactly the class of error that survives review,
because reading it does not execute it.

**Row 8 names its commit by SUBJECT, and the column heading is the reason it has to.** "Integration's
post-apply hash" is not a stable identifier: a rebase onto a moved `origin/develop` re-mints every
hash, and this row's original one (`ff08be351`) died within the hour of being written — the batch
carrying it was rebased before it ever reached the user. **That is the same mechanism that produced
the two `unresolved` rows above**, which are treated there as bad luck rather than as a defect in what
the column asks for. A subject survives every rebase, every re-parent, and every re-application; a
hash survives none of them. **New rows should carry the subject.** The existing hashes are left alone
because re-deriving them now would be the invented-substitute repair this file exists to prevent.

**Row 8 is the whole of what this batch left unbacked, and that is a change in the register's shape
rather than a quiet batch.** The same parcel carried a `mutation-test` claim — the class that has
occupied four of the eight rows — and it is absent above **because it was converted instead of
registered.** builder2 stated that disarming the re-registration seam fails exactly 2 tests and
disarming the resolution wire exactly 4, with no silence test moving either time. Both were re-run at
the integrated tree by short-circuiting each condition and restoring it: **2 failed / 279 passed, then
4 failed / 277 passed, against a 281 baseline, with the named failures matching the wires and nothing
else moving.** Cost: two package test runs.

**That is the class-B mechanism working, and it is worth naming because the register is where the
mechanism goes to die.** A `mutation-test` row is cheap to write and cheap to clear, so a register
that keeps accumulating them is not recording an unaffordable check — it is recording that nobody
spent the two minutes. **The correct steady state for class B is an empty column**, and any row of it
should read as debt rather than as inventory. Row 8 stays because a size figure measured in the
sender's clone is not reproducible at the boundary; that is a real (A), not an unspent (B).

**Where nothing recomputes, no number — and this file is the one place that rule inverts.** A claim
column records *what a sender asserted*, so its figures are the evidence and must be kept verbatim
with their provenance mark; stripping them would leave a register that cannot say what it registered.
**The rule binds the register's own assertions, not the claims it quotes** — U2 carried a repo-wide
guard count that nothing recomputed, and that figure is now a command. **Applying the rule to the
quoted claims instead would be the over-compliance direction: an absence that looks like discipline.**

**Two commit hashes in the table once did not survive re-reading. Row 2 remains marked unresolved
rather than repaired.** Its `56a794304` resolves to `fix(resources): decode embedded images as
bitmaps`, which touches `packages/image` and `packages/scene3d-resources` and no DOM file; no commit
in the merged tree matches the claim. **The claim may still be true — the reference is not**, and
inventing a plausible substitute is the one repair this file exists to prevent.

**Row 7's hash has since been resolved, and the failure mode is worth keeping.** `d77b5c2fa` was not
a valid object because it was a pre-landing SHA — `git am` re-parents on apply, and the commit that
actually landed is `3dc27f69f`; `git patch-id --stable` confirms the two are the same change
(`472e28b78b29afa0ce320af81c0dcefba3f08bbe`). It resolved only inside the clone that authored it and
nowhere else, which is exactly the trap this file's own naming rule exists to prevent — the rule did
not fail, the hash was simply recorded true of a tree and never re-derived after landing. Verified at
`aa279c96a`.

**Row 7 previously carried a long argument about which of two magnitude readings was in-population.
It rested on "exactly one commit in the merged tree has ever touched that file", which is false —
seven have — and both readings (*415 lines, 19 functions, 7 dependents* and *240, 13-of-which-3-
exported, 5*) are now superseded.** Measured at `328d5fdc7`, blob `6a9e0f5c3`: **590 lines, 8
exported functions, 9 dependents.** Recompute rather than quote:
`wc -l packages/font-formats/src/openTypeTestHelper.ts`.

**The magnitudes were never the entry.** The finding is that a helper several test files depend on is
itself unchecked, so a fault in it is agreed with rather than caught — true at every commit, while
the counts go stale on the next touch. Two things survive the correction: **a more precise reading
persuades independently of its currency** (*13 of which 3 exported* reads as better work than a flat
*19*, from an older tree), and **the second reading's real contribution was reaching the file from an
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
| L3 | Six `conformance/*-formats` suites (`awd2`, `gltf`, `md2`, `md5`, `obj`, `threeDs`) — **the entire scene3d format-importer family and nothing else** — each throw a `beforeAll` hook timeout at 10000ms, zero assertion failures, in the full resource-loader test run (`packages/scene3d-resources/src/{awd2,gltf,md2,md5,obj,threeDs}Load.test.ts`). **Timeout-class, not a correctness defect as reported.** Builder3's Stage 2 commit was suspected first; the control clears it. | **Bounded fact, settled:** builder3 ran the affected suite on the identical tree with `5973f3df6` reverted, **twice** — both runs produced the same 6 timeouts, 21 files / 105 tests passed, 9 skipped, 0 assertions, surviving removal of the suspected change. On the CURRENT tree, `5973f3df6` present and unreverted, the identical suite run with only `--hookTimeout=60000` (default 10000) passed **27/27 files, 114/114 tests, 0 failures** — setup latency is `>10s, <60s`, **not a hang, not an assertion defect, Stage 2 cleared either way this is sliced.** Integration independently reproduced a green→red→green flip on an *unrelated* suite (`conformance/swf`) on a fully unmodified tree within 20 minutes, same signature — evidence of environment-dependence in the general class, not evidence about these six specifically. **Cause, settled:** all six `beforeAll` hooks share the identical shape — `vi.resetModules()`, `vi.doMock('@flighthq/net/contract', …)` mocking `sendNetRequest`, `vi.doMock('@flighthq/scene3d-formats/contract', …)` mocking the format parser, then `await import('./…Load')` — **no network call, no filesystem read, no corpus fetch; `sendNetRequest` is a `vi.fn()` that is never invoked during setup.** The on-demand-corpus-fetch hypothesis is **ruled out** by direct read of all six files. The cost is module-graph reset plus re-import under remocking, run six times (once per suite) in the same worker. | **FIXABLE — cause identified: `vi.resetModules()` + dynamic re-`import()` under `vi.doMock` exceeds the 10s default hook timeout for this suite shape, most likely from contention when several such suites re-evaluate their module graphs in the same worker.** Not builder3's or this commission's to fix. Repair is either raise `hookTimeout` for these six (or the whole `scene3d-resources` project) in Vitest config, or reduce the per-file module-reset cost (e.g. share the mock setup instead of re-importing per suite) — a config change, not a source defect. |
| L4 | `camera-orthographic/webgl` fails functional capture (1 changed) on the tree carrying the WGPU covector fix. Suspected first as fallout from that change; the evidence rules it out. **Decaying, not static:** every run this stays unfixed reports the scene changed, and the correct response converges on *ignore it* — the same cry-wolf cost integration named about the six loader-hook timeouts, except here it is a regression check quietly losing its own coverage rather than a suite timing out. It does not stay confined to the scene that earned it. | **Deterministic** — three runs, three identical results, always 1 changed, not intermittent. **Isolated** — in the same five-target camera batch, `effect-camera-motion-blur/webgl` captured clean; not webgl-wide. **Backend-specific** — `camera-orthographic/webgpu` is a clean tick in the same run, same scene, other backend, no drift. **Reachability** — the scene carries zero skin/skeleton references against a 207-line control, so a skinning change cannot touch it. Three runs, one batch, one backend comparison — all from `builder`, `functional/` zero dirty throughout. | **FIXABLE — genuine scene-and-backend-specific baseline staleness, not noise and not environmental** (a machine/rasterizer cause would not spare the sibling webgl target in the same batch or the same scene's webgpu column). Not the covector arc's to fix. **Goes to the next genuinely free builder ahead of anything discretionary** — whoever owns `camera-orthographic`'s baseline should re-capture it deliberately, as its own change, with the delta stated. |
| L5 | Material `doubleSided` does not reach the shadow depth pipeline on **either** backend — a shadow-casting mesh authored single-sided casts an incomplete or missing shadow silhouette regardless of the material's `doubleSided` flag, on both WebGL and WebGPU. Found incidentally while `builder` built the `shadow-skin-nonuniform` functional scene: the test bar needed **both windings authored** into the geometry to work around the gap, rather than relying on the material flag. | Discovered as a required workaround, not measured as a standalone repro — `builder` needed geometry authored with both windings for the shadow pass to render correctly, which only makes sense if the shadow depth pipeline ignores `doubleSided` and single-culls regardless of the material setting. Cross-backend (both WebGL and WebGPU exhibit it), which argues for a shared shadow-pipeline assumption rather than a per-backend bug. | **FIXABLE — not urgent, not this arc's to fix.** Affects shadow silhouette correctness for any double-sided shadow caster (thin geometry, cards, cloth). Whoever owns the shadow depth pipeline on each backend should thread `doubleSided` into its culling state the way the main color pass already does. |
| L6 | `package-lock.json` carries two entries (a workspace declaration and its resolved link) for `examples/runners/web/src/wasm`, a path that is **untracked and absent from a fresh checkout** — `git ls-files` returns nothing under it, `test -d` fails. The repo's `workspaces` globs (`packages/**`, `examples/**`, `tools/*`) resolve it by filesystem lookup, so nothing in the checkout ever generates the directory the lock expects. **Latent, not yet triggered in the merged tree.** | Found and cross-checked by two builders independently. First clone (builder2): an `npm install` that had real re-resolution work to do (a genuine dependency change) re-walked the workspace globs, could not find the directory, and **delisted the two entries** — a small, easy-to-miss lock diff (1 insertion / 4 deletions) that reverting confirmed was not needed for the environment fix to work. Second clone (`builder`): the directory was equally absent, but `@types/jsdom` was already fully resolved in the lock at base, so the install only *materialized* existing entries and never re-walked the globs — a **non-trial**, not a counterexample, and initially mis-reported as one before the distinction was caught. **The trigger is now understood precisely: an install has to re-resolve (real dependency work) to exhibit it; a pure materialization cannot.** | **FIXABLE — not this arc's to take.** The dangerous install is exactly the one the npm-install-after-`package.json`-change rule already tells every agent to run, so this will keep recurring on ordinary dependency changes until someone either makes the `wasm` workspace real (present and buildable) or removes the stale lock entries. Whoever owns the `examples/runners/web` build should decide which. |
| L7 | `render-wgpu` destroys a texture **mid-frame while recorded bind groups still reference it**, if a texture is replaced (for example grown) during frame recording. The submit fails and **the entire frame blanks — not just the draw that used the texture.** The package already carries the safeguard for the other resource: `WgpuRenderState.retiredBuffers` (`packages/types/src/WgpuRenderState.ts:268`) is drained after `device.queue.submit` in `wgpuBackground.ts`, under a comment naming exactly this hazard for clip pops and grown particle instance buffers. **There is no texture sibling.** Manager ruled it gets its own entry rather than being filed inside the WGPU skin-palette arena fix that found it — *"a general defect that happens to have been found here… if it is filed only as part of this fix, the next person replacing a texture mid-frame re-finds it."* Same shape as the gate-trigger fix that had to be swept to its sibling the same afternoon. | **The DEFECT is verified-at-tree by integration at `50e1bc966`; the FIX is not, because it has not landed.** `retiredTextures` returns **zero hits across the whole repository**, and `git log 924be5c97..HEAD -- packages/render-wgpu packages/scene3d-wgpu` is empty — the arena work is in `builder`'s clone, not in merged history. So the missing-sibling condition is a present fact about the tree this file lives in, independently checked, not a report. The repair itself (`retiredTextures` added beside `retiredBuffers`, both destroyed post-submit; whole-repo check green, scene3d-wgpu 341/341, render-wgpu 206/206) is **as-reported by `builder`** and has passed through no integration gate. | **FIXABLE — repair authored, NOT YET LANDED.** Do not record this as CLOSED until the arena parcel comes through integration and `retiredTextures` is present in merged history; the row flips then, on evidence. Until it does, any mid-frame texture replacement anywhere in `render-wgpu` blanks the frame. |

★ **L7 IS FILED WITH ITS FIX OPEN, AND THAT IS A CORRECTION TO THE SUGGESTED TEXT, NOT A QUIBBLE.** It
arrived proposing sub-state **CLOSED — fixed as part of the arena work**, which is true of `builder`'s
clone and false of this tree: the fix is unlanded, so a reader of merged history would go looking for a
safeguard that is not there. **A register whose rows describe merged claims must be read against merged
history, and the two diverge exactly when work is in flight.** This is the same divergence that produced
row 7's disputed counts — *a sender's reading can be true of a tree this file is not about.* The useful
consequence of splitting the row is that the DEFECT half got **stronger**: it is now verified-at-tree
rather than as-reported, because integration could check the missing sibling directly. **Where a claim
divides into a condition and a repair, they can carry different provenance, and collapsing them to one
takes the weaker of the two.**

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
