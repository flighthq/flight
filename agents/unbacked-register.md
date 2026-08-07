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

**The table below was transcribed by foreman from integration's report, not copied from their file.**
That is a second-hand rendering of a first-hand record and may differ from it; integration's copy is
authoritative and any disagreement resolves in their favour.

## Entries

| # | Class | Commit (integration's post-apply hash) | Claim | Cause |
|---|---|---|---|---|
| 1 | `capture-baseline` | — | builder4: swf-import baseline recapture landed on capture evidence alone (DOM/canvas/WebGL/WebGPU 0 changed, 0 failed; regression 0.00) | A |
| 2 | `mutation-test` | `56a794304` | builder4: removing DOM Bitmap registration changed the Sprite | B |
| 3 | `live-acceptance` | `14f9e73de` | builder: byte-exact and hash-exact against the pinned 0.1.0 release | A |
| 4 | `mutation-test` | `14f9e73de` | builder: mutation-tested variant fallback and merge-group behaviour | B |
| 5 | `sender-environment` | `14f9e73de` | builder: 1.6 GB fetch, git status clean throughout | A |
| 6 | `sender-environment` | `84051b0cb` | builder2: corpus 306 files / 1,166,258 bytes from a gitignored `.test-assets` — **flagged by them unprompted as clone-local** | A |
| 7 | `untested-instrument` | — | builder: `packages/font-formats/src/openTypeTestHelper.ts`, 415 lines and 19 functions feeding seven test files, itself untested | B |
| 8 | `unread-parcel` | — | foreman: marked a builder2 parcel processed without reading it; contents no longer retrievable | B |

**Entry 1 stays registered rather than reverted.** A marked unbacked claim is a known state; an
unmarked one is what this file exists to prevent.

**Entries 2 and 4 are backable on request** by landing the test before its fix as its own commit and
naming that commit **by subject line** — integration applies parcels as individual patches, so every
intermediate commit is checkoutable, and running one focused test there costs seconds. Two limits on
that route: hashes do not survive `git am`, so subject lines are the only durable reference; and a
red result shows *that* a test failed, never *why* — if it fails because the fix's scaffolding does
not exist yet, that is a compile failure wearing a test failure's clothes and the route does not apply.

## Skips inside the backed set

The whole-repo test run that backs most claims **skips two browser-contract files on every run**, and
suites requiring a browser, a GPU, or the network do not execute in the integration environment at
all. So the subsumption of a sender's focused suite is near-total rather than total, **and the
exceptions are, predictably, the expensive ones.**
