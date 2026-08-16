# Capture Verification Tiers — what each leg checks, and what fails hard

**Status: items 1-4 IMPLEMENTED.** Written by builder2 at chief's request, folding the "examples-parity is signal-free" question and
the tool-capture verification-policy question into one, because they turned out to have the same shape. Read
this before changing a capture leg, a verification default, or a CI gate that consumes them.

## The organizing rule (blessed doctrine)

**A tier either has what it needs and gates hard, or it fails loudly saying so. There is no
silent degrade-to-success.**

A leg that reports success while checking almost nothing is worse than an absent leg, because an absent leg is
visibly absent. This is the rule the rest of this document exists to apply, and it decides the cases that come
up in practice:

- A gated check that compared **zero** things fails, and names what it lacked. It does not pass quietly.
- A known bug is **not** converted into a skip to make a leg green. Naming the bug in the skip reason does not
  change this — a skip is precisely how a real bug stops being seen. Skips are for legitimate backend
  differences, which is what the existing `effect-*` entries in `FLIGHT_PARITY_SKIP` are.
- An exemption must be one the check genuinely cannot evaluate (a run narrowed to a single renderer, an
  interrupted run), not one that is merely inconvenient.

## The finding that unifies both halves

Both halves are the same failure: **for the `examples` tool, checks that look configured are inert.** Neither
is a broken check. In each case the mechanism is sound and functional-tool scenes exercise it; examples were
simply never given the input it needs, and nothing says so out loud.

- **Parity** skips every examples scene because parity eligibility is gated on something examples do not have.
- **Render verification** never runs for examples at all, because the default keys off the tool name.

The consequence is a leg that reports success while checking almost nothing, which is worse than a leg that
is absent — an absent leg is visibly absent.

## What the live leg found

Items 1 and 2 shipped together, and the leg went from 107 silent skips to **64 parity comparisons passing,
3 failing, 1 uncovered**. Everything below was invisible before that.

**The uncovered entry is correct behaviour, not a residual gap.** `cross-backend-embed` ships only a `dom`
renderer, so under the parity leg's `canvas,webgl,webgpu` filter it has nothing to compare. It warns and does
not fail the run. This is why the coverage verdict is a **run-level** rule rather than a per-entry one: a
single-backend scene legitimately compares nothing, while a whole run that compares nothing is unconfigured.

**Three true positives, all pre-existing.** Every one was read from its screenshots rather than trusted from
its distance number:

1. `tilemap` / webgpu — **root cause found and fixed.** The example never called any
   `registerWgpu*TextureResolver`, so the tilemap's atlas texture had no resolver and nothing drew. The
   earlier readiness-gate hypothesis (`isWgpuExternalImageSourceReady` skipping a not-yet-decoded image) is
   **refuted**: the tileset is an `HTMLCanvasElement` drawn synchronously at module scope, ready by
   construction, and forcing repeated redraws did not change the outcome. No new diagnostic crumb was needed
   either — the existing guard already said exactly this, in words, in `logs.jsonl`. The inversion rule
   worked; nobody was reading the log. After the fix, `canvas·webgpu` parity is 0.00.
2. `bitmapfont-generate` — the divergence of 37.16 was **webgl drawing no text at all**, only the atlas
   strip. Canvas's solid white boxes are **not** a defect: under capture the example swaps in
   `createStubGlyphRasterizerBackend()`, because headless Chromium cannot share document fonts with the
   OffscreenCanvas rasterizer, and the stub draws a deterministic box per codepoint (`app.ts` says so).
   Real glyphs render only in an interactive browser. Fixed by builder — gl/wgpu BitmapText renderers
   existed but were never publicly exported, a stranded capability. **The expected post-fix state is both
   backends converging on matching boxes, not legible text**; boxes under capture are not evidence of a
   remaining bug. Whether the stub is the right capture backend for this example is a separate question.
3. `materialshowcase` — webgl·webgpu diverge by 20.64 against a tolerance of 15. Real, and reported by the
   validate leg; not characterized further here (see the capture-path caveat below).

**A resolver-registration asymmetry makes case 1 a recurrence generator.** `render-gl` offers
`registerStandardGlTextureResolvers` as a one-call bundle; `render-wgpu` exposes only the four individual
`registerWgpu*TextureResolver` functions with no equivalent bundle. Today **9 of 40** wgpu examples register
any resolver at all. The missing bundle is a suggestion for `render-wgpu`, not a change made here.

## The scene3d verifier stall — measured

Chased on foreman's ruling, measurement first rather than a hypothesis. **Result: the budget is right and
the scene is not too expensive, so cost does not explain the failure.** Verification wall-time for
`scene3d`, the most expensive example, against the 15,000 ms budget:

| Condition | webgl | webgpu | Budget used |
|---|---|---|---|
| isolation (1 entry) | 3,397 ms | 4,347 ms | 29% |
| full leg, 6 workers (3 runs) | 4,065–4,693 ms | 4,528–4,968 ms | ≤33% |
| full leg, 16 workers | 6,062 ms | 5,674 ms | 40% |
| full leg + whole-repo `check` + full `test` alongside | 5,125 ms | 6,233 ms | **42% (worst observed)** |

Page load is not a factor either: `goto` for `scene3d` measured 15–102 ms. Contention scales the cost
gently and sub-linearly — nearly tripling the workers and saturating the CPU with an unrelated build moved
it from ~4.3 s to ~6.2 s, still 2.4× inside the budget.

**So the failure is a discrete stall, not slowness**, and raising the timeout would be the wrong fix — it
would buy nothing against a verifier that never reaches a terminal state at all. Five instrumented runs
(three at 6 workers, one at 16, one under a saturated CPU) produced **zero** reproductions, against two
failures in the two runs before instrumentation, so the rate is low and it was not reproduced under
deliberately worse conditions than the ones that produced it.

What shipped, since the cause could not be named from behaviour alone: `explainCaptureVerificationStall`
replaces the bare `verifier did not run` sentinel. That string named a symptom shared by causes with
opposite remedies — a verifier that never registered (page/module failure) versus one that registered and
stalled mid-readback — and it discarded the single number that decides whether cost is even a candidate:
how long it actually waited. The reason now distinguishes never-registered, stalled-non-terminal,
passed-but-empty, and protocol-mismatch, and always reports waited-versus-budget. **A gate that silently
fails to run is the same inert-gate class as a check that silently passes**: the leg reported a failure
nobody could diagnose, so it got re-run instead of fixed. The next occurrence explains itself.

**Can the leg be widened safely? Yes, on this evidence.** At 16 workers with a full `check` and `test`
running alongside, the heaviest scene still used 42% of its budget and no entry failed across 108
measurements per run. Widening is bounded by the stall, not by the budget — and the stall is now
diagnosable rather than silent.

**`scene3d`'s verifier does not run under concurrent load — and it is not general webgpu flakiness.** A third
run corrected an earlier reading of this. Across three full leg runs: run 1 failed `tilemap`/webgpu (the real
resolver bug, since fixed — not a flake at all); run 2 failed `scene3d`/webgpu with "verifier did not run";
run 3 failed `scene3d` on **both** `webgl` and `webgpu` with the same message. `scene3d` passes in isolation
on both backends at `webgl·webgpu 0.17`.

The first characterization — "one webgpu entry per run, never the same twice" — was drawn from two points, one
of which was a genuine bug rather than a flake, and the third run falsifies it on both counts: the same entry
failed twice consecutively, and on a non-webgpu backend too. What the data actually supports is narrower and
more useful: **one specific heavy scene's verifier fails to run when the leg is under six-worker contention**,
which points at a load-dependent verifier timeout on `scene3d` rather than a diffuse backend flake. That is a
bounded thing to chase — start with the verifier's time budget against `scene3d`'s cost, not with WebGPU.

**Why capture and validate disagreed about webgpu — and why it turned out to be the argument FOR item 3.**
On this machine every `capture --tool=examples` webgpu screenshot across nine different scenes carried one
identical hash — a uniform blank frame — while the same scenes read back correctly through `validate` and
every canvas/webgl capture was distinct. The cause is stated plainly in `captureEntry.ts`: a software WebGPU
adapter cannot present to the swapchain, so a plain Playwright screenshot is blank regardless of what the
scene drew. `validate` never screenshots — it reads the surface back in-page (a `mapAsync` GPU readback for
WebGPU), which is why it saw the real frames.

The first reading of this was that verification would measure the harness rather than the scene, and that
item 3 should wait. **That was wrong, and inverted.** Verification is the readback path: `verify` defaulted
to `tool === 'functional'`, so examples never took it and fell through to the unpresentable screenshot.
Turning it on does not expose examples to the blank-frame problem — it is the fix for it. Enabling it made
`clock`/webgpu render correctly on the capture path, and the full smoke leg then passed 132 captures across
dom/canvas/webgl/webgpu with zero failures.

**That last sentence was originally offered as proof that every example registers a verifier and no backend
was left behind. It was not proof, and the claim is corrected here.** Those 132 captures ran on a leg where
verification was still inert: the `verify` default added to `captureEntry` was never reached, because three
call sites decided verification first and passed an explicit boolean — `captureSuite.ts`, which governs the
smoke leg, read a hardcoded `subject === 'functional'`. A leg that never verified cannot testify about
verifiers. The conclusion happened to be right; the evidence for it was not.

Re-measured on the fixed leg, where all 132 captures now emit a real `verifying render…` line:

| backend | entries | verified | failed |
|---|---|---|---|
| canvas | 28 | 28 | 0 |
| webgl | 40 | 40 | 0 |
| webgpu | 40 | 40 | 2 transient, both passed on retry |
| dom | 24 | 23 | 1 |

**Reaching the DOM verifier was not DOM verification.** All 24 DOM entries registered a target, but
`runRenderVerification` returned after checking that its element had a child or text. It did not read a
bitmap, measure coverage, call the scene's `assertRender`, or publish a fingerprint. The historical record
itself closes that distinction: the only DOM failure event recorded in the versioned suite history is the
structural sentinel `[verify:dom] blank render: no DOM output produced`. Extracting the message from every
revision yields 15/15 copies of that sentinel (repeated snapshots of the one event); the retained local
artifacts yield 8/8 copies across report, status, and log files, with no second DOM failure class. That is
evidence for the child check firing, not for any pixel oracle.

Page JavaScript cannot rasterize an arbitrary DOM subtree. The verifier now pauses at `readingBack` while
the Playwright runner screenshots the registered element and supplies its RGBA bytes back to the page.
DOM then runs the same coverage, `assertRender`, and fingerprint legs as the raster targets. The committed
evidence had been 43 functional and 24 example DOM `sha256` fields, compared by `capture:*:check`; there
were zero DOM coarse `fingerprint` fields, and the regression scripts excluded DOM. DOM is now included in
the parity/regression/baseline commands, so the coarse committed fingerprint is written by the baseline
leg and compared by the later regression leg rather than inferred from an exact screenshot capture.

Running every newly reachable oracle rejected five of the 43 functional DOM scenes instead of silently
blessing them. Two were renderer defects: DOM sprite scaling ignored a nearest-neighbor texture sampler,
and Shape bounds cropped miter geometry beyond the half-width envelope. Three were native-text oracle
assumptions: the decoration search band missed CSS line placement, default CSS underline skip-ink broke
the expected continuous run, and a sparse TextLabel grid landed just below its threshold despite visible
glyphs. After repairing those paths and re-running from fresh builds, all 43 functional and all 24 example
DOM entries wrote coarse fingerprints; independent regression runs then compared all 67 at distance
`0.00`. A forced `-1` tolerance on `node-blend-modes-advanced` rejected its fresh `0.00` distance, proving
the regression leg was comparing the committed fingerprint rather than merely writing it.

The former single DOM failure was `formatloading`; it passed when re-run alone, so the evidence supports
load dependence rather than a deterministic break, not a diagnosis. The two webgpu entries (`crossfade`, `effects`) hit
`render verifier did not reach a terminal state` and succeeded on retry — the same stall class as
`scene3d`, now visible on the smoke leg because verification finally runs there.

Two incidental facts worth keeping: identical hashes across unrelated scenes is a fast test for "the harness,
not the scene", and `logs.jsonl` captures only `warn`/`error` — a `console.log` probe records nothing.

## Part A — why all 107 example captures skipped

`test:examples:parity` runs `validate --no-regression`, so it *asks* for cross-backend comparison only. But a
renderer only enters the parity candidate set (`eligible`) via one of two paths in `captureValidation.ts`:

1. the scene declares explicit **parity groups** — `if (Object.keys(options.parityGroups).length > 0)`; or
2. the renderer has a **committed fingerprint baseline** — otherwise the loop hits `committed === null` and
   `continue`s *before* reaching `eligible.set(...)`.

Examples have neither. Every renderer takes the `continue`, `eligible` stays empty, and parity has no pairs
to compare — hence 107 skips and a green leg.

**This coupling is deliberate, and that matters for the fix.** The module header states the policy: parity
runs "only for backends that have a committed baseline, i.e. ones already proven stable." A baseline is
written only when two captures of the same scene agree, so *having* one is the evidence that the backend
renders deterministically. Comparing backends that were never shown to be self-stable would be flaky. So this
is an eligibility policy, not an oversight — the leg is **unconfigured**, not broken. The newer parity-groups
path exists precisely because a **same-run** comparison sidesteps the stability question: both captures come
from one load, so cross-load flakiness cannot affect them.

### Options

- **A1 — give examples explicit parity groups.** Uses the documented same-run path, needs no committed
  artifacts, and keeps examples environment-independent. **Chosen and implemented** — `examples` now shares
  the `visual` group with `functional` in `getFlightCaptureValidationPreset`.
- **A2 — make `--no-regression` waive the baseline gate.** Tempting and nearly a one-liner, but it silently
  re-admits backends never proven self-stable, which is the flakiness the policy was written to avoid. It
  would trade a silent skip for a flaky failure. **Not recommended.**
- **A3 — commit fingerprint baselines for examples.** Contradicts an existing decision: `tests.yml` excludes
  the regression tier from CI *because* those baselines are environment-coupled. Committing them for examples
  reintroduces exactly that coupling on the PR path. **Not recommended.**
- **A4 — drop the leg as redundant with examples smoke.** Honest, and better than the status quo, but it
  discards real signal: smoke proves each backend rendered *something*, parity proves they rendered the *same
  thing*. Those catch different bugs. Prefer A1; take A4 only if A1 proves impractical.

Whichever is chosen, **a leg that skips everything should fail, not pass.** **Implemented** as
`isCaptureParityCoverageFailure`, with `explainCaptureParityUncovered` supplying the reason as plain data.
Verified by A/B against the real leg rather than by unit tests alone: same command and example, only the file
differing, gave `ok` / exit 0 before and `FAILED` / exit 1 with the reason after.

## Part B — what verification actually does today

Three findings, one of which corrects the record:

- **Examples were never render-verified** — `const verify = opts.verify ?? tool === 'functional'`, and no
  examples script passed `--verify`, so the whole verification block including its throws was skipped for all
  107 entries. **Fixed** (item 3); the default now covers examples too.
- **The verify-timeout path does hard-fail for functional.** I could not reproduce a timeout false-green
  there: `waitForRenderVerification` swallows the Playwright timeout, but the caller then throws on
  `state === 'failed'` *and* on `state !== 'passed'`, which covers the null a timeout produces. So the
  recorded false-green class, as it applies to functional, appears already closed. I am flagging that rather
  than asserting it — if the original report was reproduced against examples, it is explained entirely by the
  point above, and no timeout was involved.
- **Blank-render detection works**, and today's tilemap/webgpu failure is it working correctly. Note it
  distinguishes "nothing drew" (`blank: true`, coverage 0) from "geometry drew but wrong"
  (`blank: false`, coverage > 0) — only the first is a blank-render failure.

## Proposed tier model

| Tier | Leg | Question it answers | Needs | Verdict |
|------|-----|--------------------|-------|---------|
| 1/2/4 | **smoke** (`capture --fail-on-error`) | Did it load, run, and draw *something*? | nothing | **hard fail** — load error, console error, or blank render |
| 3 | **parity** (`validate --no-regression`) | Do the raster backends agree with *each other*? | same-run parity groups, or a committed baseline | **hard fail** on divergence beyond tolerance; **hard fail** if zero comparisons ran |
| 5 | **regression** (`validate --no-parity`) | Does it still match the *committed* fingerprint? | committed, environment-coupled baselines | **hard fail locally**; excluded from CI by existing decision |
| — | **render verification** (`--verify`) | Did the page's own verifier reach `passed`? | in-page verifier | **hard fail** on `failed` or on any non-terminal state, including timeout |

The rule that makes this coherent: **a tier either has what it needs and gates hard, or it does not and says
so loudly.** There is no "silently degrade to success" state. Today parity has a third mode — *skip
everything and pass* — and that is the whole defect.

### Recommended changes

1. Make a zero-comparison parity run **fail**. Smallest change, highest value: it converts today's silent
   green into a loud "this leg is unconfigured", and would have caught this without anyone reading the code.
2. Give examples parity groups (A1), so the leg has real input.
3. Decide render verification for examples deliberately. **Implemented by enabling it**: `isVerifiedCaptureTool`
   now covers `examples` alongside `functional`, so an examples capture means "rendered and verified" rather
   than "the page loaded and a screenshot was taken". `reference` stays opt-in, since its pages only register
   a target once its own harness does.

## Baseline freshness annotates every gated comparison; it is not another leg

Each fingerprint baseline column records a `sourceHash`: the SHA-256 of the exact scene-source bytes when
that renderer's fingerprint was deliberately captured. Functional targets hash their backend-specific scene
file when one exists and otherwise their shared scene file; examples hash the shared `src/app.ts`. A comment
or reformat therefore changes the hash even when it changes no pixel. That is intentional evidence, not a
verdict.

The regression leg reads this metadata for every gated comparison, independently from whether the coarse
fingerprint passes its tolerance:

- **source hash changed** — the scene changed; recapture is owed by the scene owner even when the old
  fingerprint still happens to pass within tolerance;
- **source hash unchanged** — the scene did not change; a red is environment drift and must never be
  rebaselined, while a green confirms that the fingerprint describes the current source;
- **hash unavailable** — keep the original failure and say the freshness classification is unavailable.

The aggregate JSON report carries the same distinction mechanically as `sourceHashStatus` plus the recorded
and current hashes on both passing and failing checks. A changed source is therefore visible even when its
render moved less than the coarse tolerance — the case that used to leave a superseded fingerprint silently
green. Freshness remains an annotation rather than a gate: a cosmetic source edit does not become a build
break, and capture remains a deliberate act. This is the reachability-style **report-and-accept** choice;
making freshness a gate would train reflexive baseline regeneration and destroy the evidence the annotation
exists to protect.

`npm run capture:provenance` makes the same classification available without rendering. It imports the
canonical discovery and source-hash helpers rather than reconstructing the backend-specific-file fallback.
Its bare form is a census over every committed examples + functional fingerprint column, so a mismatch means
only that provenance cannot verify the current source — not that the rendered baseline is bad. The command
prints exact matches as a control and names the exact-vs-fingerprint freshness gap explicitly.

The census denominator and a validator denominator are equal only on a whole-corpus run. The inversion first
surfaced all 273 then-recorded functional mismatches because that particular run gated the full functional
corpus; “expected 273, got 273” is not a rule that generalizes to a filter. For a scoped run, pass its
`validation-report.json` with `--tool` and `--validation-report`. The script slices to passed/failed regression
checks — the columns the run actually gated — before comparing. A selection flag alone cannot establish that
a page loaded and reached the gate.

### A recorded hash is evidence; a back-derived one is an inference

The capture pipeline records `sourceHash` at write time, hashing the scene as it stands at the moment it
writes the column. Those values are ground truth. Columns predating the annotation could only be recovered
from history, and a recovered value is weaker evidence — the two grades sit in the same field and are not
distinguishable by looking.

Recovery is inherently lossy because **a capture rewrites every field of a column, but Git only records the
fields whose bytes changed.** Neither line identifies the capture on its own, and they fail on opposite
inputs: the `fingerprint` line goes stale when a recapture moves too few pixels to change the coarse grid,
and the `sha256` line goes stale when one backend's output is unchanged by a capture that did rewrite its
siblings. The later of the two blames is the last commit that demonstrably wrote the column, which is the
best history can answer. Its blind spot is a capture that changed nothing at all: Git records nothing, so
no blame can see it, and the recovered hash silently describes an earlier scene.

Two historical layouts matter to any such recovery: baselines predating the flatten refactor addressed
scenes as `tests/functional/<name>/src/app.ts`, and `scene2d-*` scenes were `displayobject-*` before the
package rename. Resolve a candidate path only when the file actually exists at that commit, so a wrong
guess cannot resolve into a plausible hash for the wrong file.

A column with no `sha256` line has nothing to blame and no recoverable hash. It carries none, and reports
`unavailable` — the honest answer. Do not fill one in to raise a completeness count.

The first metadata population did not run capture. It reconstructed each existing fingerprint's scene hash
from the Git commit that last wrote that fingerprint, so today's source is not falsely stamped onto an older
baseline.

## A fingerprint with no scene is not weak evidence — it is not evidence

**A gate must fail when its required evidence is zero; it must also fail when its evidence has no
referent.** Both halves are one rule, and this is its statement in general form — the repo enforces the
first half in four places and named it in none of them as a general invariant:

| Instance | Where | "Zero evidence" means | Proven to fire |
| --- | --- | --- | --- |
| parity tier | the table above, `captureValidation.ts` | zero comparisons ran | `isCaptureParityCoverageFailure` |
| regression tier | `captureValidation.ts` | zero entries had a committed baseline | `isCaptureRegressionCoverageFailure` |
| test selection | [testing.md](conventions/testing.md), `testRunCoverage.ts` | a selector matched no files or ran no tests | `testRunCoverage.test.ts` |
| check selection | `select.ts`, used by `check.ts` | a selector matched no package and no path | `select.test.ts` |
| baseline referent | `support.ts` | a fingerprint has no functional target | `support.test.ts` |

They are worth reading as one thing rather than four conventions that happen to rhyme: a green run that
checked nothing is not a pass, whatever the surface.

**The last column is the point, and it is what keeps this table from rotting.** A hand-maintained list of
instances does not enforce itself — a sixth gate will not add its own row. What each row must carry is a
test asserting the gate FIRES on zero evidence, not merely that it passes when evidence exists; a gate
believed to work because its implementation reads correctly is the same unproven claim the gate exists to
reject. Audited 2026-08-10: three of the four had one. Check selection did not — its guard was inline in a
script that executes on import, so nothing could test it. It was extracted into `select.ts` and given one.
When adding a gate of this family, add the row and the firing test together. The second half below is the same defect with the
evidence present and pointing nowhere. A committed fingerprint for a backend with no functional
target cannot be an unsupported control, because a control is a scene that *renders* — it is a leftover, and
the support matrix will happily render it as a mark. `support:check` fails on these
(`findOrphanedBaselineFingerprints` in `scripts/support.ts`).

This is why `⊘` is a single glyph rather than two. Splitting it into declared-control and orphan would make
the bad state *legible*; failing on it makes the bad state *unrepresentable*, after which `⊘` means
declared-control unambiguously — the other meaning cannot survive a passing tree.

> This is step 1 of the general split-or-delete test, stated once in
> [registration lifecycle](registration-lifecycle.md#when-a-vocabulary-collapses-two-meanings--the-canonical-test):
> an orphaned fingerprint is a leftover, not a legitimate state, so it is deleted rather than named.

Three ways a baseline loses its referent, all observed:

- **A dropped column.** The scene's canvas target goes away, its capture stays behind. Drop the key.
- **A scene rename.** The whole baseline file is left under the old name. Delete it *only* after confirming a
  live baseline exists under the new name; otherwise the file is the sole evidence and should be renamed.
- **A package rename sweeping filenames.** `c0eeab24e` renamed `@flighthq/scene` → `@flighthq/scene3d` and
  swept `functional/baselines/scene-morph.json → scene3d-morph.json` with it. Baseline filenames key off the
  **scene** name, not the package, so four scenes silently lost their evidence and read `⊘` instead of `✓`.
  Renaming them back restored seven real support marks. Deleting them would have destroyed the evidence.

An orphan can also strand *evidence about evidence*: deleting a baseline left a now-dangling named allowance
in `check-fingerprint-source-hashes.ts`. Check the allowance lists when removing a baseline.

### A missing premise is labelled, never argued

The documentation sibling of the two evidence rules above, and the same failure one layer up — in prose
rather than in a gate:

> **Never fill in a missing premise from reasoning. Fill it from measurement, or leave the gap visible and
> labelled.** Writing the premise in converts *unchecked* into *stated and unchecked*, which reads as
> verified and is strictly worse than an admitted gap. — builder2, 2026-08-10

The instance that produced it, and the distinction that decides the remedy. Two importers reached opposite
conclusions from the same axis conversion:

- **MD2's premise was FALSE.** Its comment called the Z-up→Y-up conversion a *reflection*; the matrix has
  determinant +1, so it is a rotation. A reflection would flip winding, so the false premise argued
  correctly to the wrong answer, and no reversal was applied. Measured: front faces culled. **A false
  premise is a bug — fix it.**
- **3DS's premise is merely ABSENT.** Its comment reasons soundly that a rotation preserves winding, but
  never states that 3DS files are authored counter-clockwise-front, which is what makes "no reversal
  needed" follow. **An absent premise is not a bug — label it**, because supplying it from plausibility is
  how it stops looking like a question.

Splitting the chain is what makes the label useful rather than defeatist: *"the conversion preserves
winding"* is verifiable synthetically and is now tested; *"the format is authored CCW-front"* needs an
external corpus. The honest label is not "this is unchecked" but **"exactly one link is unchecked, and
here it is."**

### Enumerating baselines: three traps that produce wildly wrong counts

**Do not re-derive the predicate — call `loadBaselineCoverage` (and `loadTargetCoverage`) from
`scripts/support.ts`.** They are exported for exactly this. Every trap below is a way a hand-rolled
equivalent disagrees with the real one while looking right, and the wrongest count of the three was off by
4.7×. This entry originally read "if you must count independently, know these", which framed re-derivation
as the normal path and the traps as things to remember; that is a detectable failure rather than an
impossible one, and the third trap has since caught a second person counting coverage. Calling the loader
removes the opportunity instead of documenting it.

The traps are kept because they explain *why* a hand count drifts, and because reading a disagreement
between two counts is easier when you know where they diverge:

- **Matrix scene IDs are not filenames.** The matrix renders `scene3d-morph` where the file is
  `scene-morph`, and `clip-contour-hdr` where the file is `scene2d-clip-contour-hdr`. Classifying off the
  displayed ID invents orphans that do not exist.
- **There is a third scene form.** Besides `<id>.<backend>.ts` and directory forms, a backend-agnostic
  `functional/scenes/<id>.ts` serves *every* backend. Missing it reported 145 orphans where there were 31 — a
  4.7× error that would have driven a mass deletion of live baselines.
- **Not every baseline entry carries a `fingerprint`.** Some columns hold only `sha256`. `loadBaselineCoverage`
  counts any non-null backend key; a hand count that requires `fingerprint` silently skips those and
  undercounts.

## An instrument that cannot discriminate is not a weak signal — it is noise

The same shape as *a fingerprint with no scene is not weak evidence* above, one layer up: applied to a
measuring instrument rather than to a stored artifact. Recorded because the instrument in question was
**built, validated, and deleted** on 2026-08-16, and a deleted thing leaves no trace to warn the next
person who has the same idea.

**What it was for.** The commissioning bar in `scripts/oracle-eligibility.ts` treats a scene's
`assertRender` as BINARY — `oracle: invoked` and nothing more. That is the only condition in the bar that
speaks to a render being *right* rather than merely stable, so a weak oracle is the cheapest route by
which a wrong picture reaches a permanent blessing, and the bar cannot see the difference between an
oracle sampling both the kept and the clipped side of a clip path and one checking that coverage exceeds
a floor. The instrument was to rank every scene oracle — 325 scene files, carrying the 465 oracle-bearing
cells the evidence census counts — by structural features of their assertion text
— throw sites, specific-pixel reads, comparison count, and whether the body bounds a quantity from both
sides — so the semantic review could be targeted instead of swept.

**The ground truth it was validated against, before use.** Oracles observed *throwing on a real render*
during two full capture sweeps. Those are demonstrably non-vacuous: whatever else is true of them, they
catch something, so a ranking that cannot place them above the corpus median is measuring a different
property than the one it claims.

The set needed pruning first, and the pruning is part of the record. Ten scenes were observed failing;
three of them — `svg-gradient`, `svg-stroke`, `bitmap-downscale-smoothing` — turned out to be **stale
capture residue** rather than renders (see the tool-capture cell). The first two have no scene file at
all and so never entered the scan; the third does, but the column that failed was a retired `webgl` one,
so its two live columns are not evidence of firing either. Excluding them leaves **12 oracle/renderer
pairs across 7 scenes**: `effect-halftone`, `effect-lift-gamma-gain`, `effect-outline`, `effect-sketch`,
`material-subsurface`, `particle-motion-blur`, `text-native`.

**The result: it could not.** Across 325 scanned oracles the scores ran 6–53 with a median of 15, and the
twelve known-firing pairs landed between the **23rd and 71st percentile, with 4 of 12 below the
median** — a flat distribution, indistinguishable from the corpus. (The unpruned 14-pair figure was 4 of
14 over the same percentile range; the conclusion does not turn on the pruning, and the pruned set is
the one that is actually ground truth.)

**So it was deleted, and the wording of that matters.** A metric that fails to separate the one class
there is ground truth for is not a weak signal to apply carefully, and it is not a starting point to
refine. It is noise, and a ranked list is worse than no list because it directs attention with false
confidence — the review would go to the scenes the metric happened to score low, and the reason it scored
them low is unknown. Keeping it "as a hint" would have preserved exactly the property that made it
useless while discarding the evidence that it was useless.

**What the failed measurement establishes for anyone who tries again.** A static proxy over assertion
text does not predict whether an oracle catches anything; the weak-oracle review has to stay semantic,
scene by scene. The one property that did look meaningful on inspection is worth carrying as a **human
review criterion** rather than a metric: the strongest oracles in this corpus make a PAIRED
positive-and-negative assertion, and say so themselves — `svg-clip-path` checks the kept side *and* the
clipped side, commenting *"without this, a clip that never applied would pass"*. An oracle that only
checks the effect happened passes an effect applied everywhere; one that only checks it did not happen
everywhere passes an effect that never ran. That reads clearly to a person and did not survive
mechanization.

## Scope

Not covered here: the tilemap/webgpu blank render itself (a real bug, possibly sharing a root cause with the
WGPU issue builder4 is chasing) and the CI job topology. This is about what the legs *check* and what they
*do* when they cannot check it.
