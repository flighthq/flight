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
dom/canvas/webgl/webgpu with zero failures, confirming every example already registers a verifier and that
no backend was left behind.

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

## Scope

Not covered here: the tilemap/webgpu blank render itself (a real bug, possibly sharing a root cause with the
WGPU issue builder4 is chasing) and the CI job topology. This is about what the legs *check* and what they
*do* when they cannot check it.
