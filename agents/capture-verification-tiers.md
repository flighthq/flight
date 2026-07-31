# Capture Verification Tiers — what each leg checks, and what fails hard

**Status: PROPOSAL, not a decision.** Written by builder2 at chief's request, folding the "examples-parity is
signal-free" question and the tool-capture verification-policy question into one, because they turned out to
have the same shape. Nothing here is implemented. Read this before changing a capture leg, a verification
default, or a CI gate that consumes them.

## The finding that unifies both halves

Both halves are the same failure: **for the `examples` tool, checks that look configured are inert.** Neither
is a broken check. In each case the mechanism is sound and functional-tool scenes exercise it; examples were
simply never given the input it needs, and nothing says so out loud.

- **Parity** skips every examples scene because parity eligibility is gated on something examples do not have.
- **Render verification** never runs for examples at all, because the default keys off the tool name.

The consequence is a leg that reports success while checking almost nothing, which is worse than a leg that
is absent — an absent leg is visibly absent.

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
  artifacts, and keeps examples environment-independent. **Recommended.**
- **A2 — make `--no-regression` waive the baseline gate.** Tempting and nearly a one-liner, but it silently
  re-admits backends never proven self-stable, which is the flakiness the policy was written to avoid. It
  would trade a silent skip for a flaky failure. **Not recommended.**
- **A3 — commit fingerprint baselines for examples.** Contradicts an existing decision: `tests.yml` excludes
  the regression tier from CI *because* those baselines are environment-coupled. Committing them for examples
  reintroduces exactly that coupling on the PR path. **Not recommended.**
- **A4 — drop the leg as redundant with examples smoke.** Honest, and better than the status quo, but it
  discards real signal: smoke proves each backend rendered *something*, parity proves they rendered the *same
  thing*. Those catch different bugs. Prefer A1; take A4 only if A1 proves impractical.

Whichever is chosen, **a leg that skips everything should fail, not pass.** A `--require-coverage`-style
verdict (fail when zero comparisons ran) would have surfaced this on day one instead of leaving a green tick.

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
