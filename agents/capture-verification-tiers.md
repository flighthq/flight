# Capture Verification Tiers — what each leg checks, and what fails hard

**Status: items 1, 2 and 4 IMPLEMENTED; item 3 open and blocked on a live finding (see "What the live leg
found").** Written by builder2 at chief's request, folding the "examples-parity is signal-free" question and
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
2. `bitmapfont-generate` — broken on **both** backends, differently, which is why they diverge by 37.16.
   Canvas draws solid white boxes where glyphs belong; webgl draws no text at all, only the atlas strip.
3. `materialshowcase` — webgl·webgpu diverge by 20.64 against a tolerance of 15. Real, and reported by the
   validate leg; not characterized further here (see the capture-path caveat below).

**A resolver-registration asymmetry makes case 1 a recurrence generator.** `render-gl` offers
`registerStandardGlTextureResolvers` as a one-call bundle; `render-wgpu` exposes only the four individual
`registerWgpu*TextureResolver` functions with no equivalent bundle. Today **9 of 40** wgpu examples register
any resolver at all. The missing bundle is a suggestion for `render-wgpu`, not a change made here.

**One webgpu entry fails per full run, and it is not the same entry twice.** Run 1 failed `tilemap` (the real
resolver bug, now fixed); run 2 failed `scene3d` with "verifier did not run", which then passes twice in
isolation at `webgl·webgpu 0.17`. The full leg runs six concurrent workers, so this reads as webgpu verifier
flakiness under parallel load rather than a scene defect. It matters for item 3 directly: turning verification
on more widely would amplify exactly this, so the flakiness wants a cause before the tier wants more coverage.

**The capture path and the validate path do not agree about webgpu, and item 3 depends on which is right.**
On this machine every `capture --tool=examples` webgpu screenshot across nine different scenes carries one
identical hash — a uniform blank frame — while the same scenes render correctly through `validate`, and
canvas/webgl captures are all distinct. Enabling `--verify` for examples captures (item 3) would therefore
fail every webgpu example here, for a reason that is not the scene's fault. **Item 3 should not ship until
this discrepancy is explained**, because it decides whether verification would be measuring the scene or the
harness. Two incidental facts worth keeping: identical hashes across unrelated scenes is a fast test for
"the harness, not the scene", and `logs.jsonl` captures only `warn`/`error` — a `console.log` probe records
nothing.

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

- **Examples are never render-verified.** `captureEntry.ts`: `const verify = opts.verify ?? tool === 'functional'`.
  No examples script passes `--verify`, so the entire verification block — including its throws — is skipped
  for all 107 entries. An examples capture passes on "the page loaded and a screenshot was taken".
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
3. Decide render verification for examples deliberately: either enable `--verify` for the examples smoke leg
   — closing the black-frame hole — or record explicitly that examples are load-gated only, so the gap is a
   documented choice rather than an accident of a default. **Prefer enabling it**; a black frame passing a
   render check is precisely the false-green class this whole question started from.

## Scope

Not covered here: the tilemap/webgpu blank render itself (a real bug, possibly sharing a root cause with the
WGPU issue builder4 is chasing) and the CI job topology. This is about what the legs *check* and what they
*do* when they cannot check it.
