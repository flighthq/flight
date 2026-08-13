# Bundle Size

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. Run a size command after changes to examples, package exports, barrels, renderer registration, dependencies, or anything that may affect tree-shaking.

## Two numbers, two commands

The subject splits by what the number *means*, and the two are not interchangeable.

| | `npm run size` | `npm run size:minified` |
| --- | --- | --- |
| pipeline | esbuild, **unminified**, tree-shaken | Rollup + terser (`passes: 3`, property mangling) |
| answers | *how much code did this keep* | *how many bytes does this ship* |
| baseline | `tools/size/size.unminified.baseline.json` | `tools/size/size.baseline.json` |
| cost | ~1 minute cold, ~3s from cache | ~10 minutes |
| where | every PR, and while you work | nightly |
| gates | never — always exits 0 | fails a case over its pin |

**Only `size:minified` produces a shipping number.** The unminified figure runs about 1.58× larger
(measured range 1.42–1.82 across the 139 cases), so quoting it as bundle cost overstates by half.
It exists because tree-shaking is the thing most changes actually affect, and esbuild and Rollup
agree far more closely on *what survived* than their minifiers agree on *how small it packs*.

`npm run size` is the one to reach for by default. It compares against its own committed baseline,
reports in both directions, and suppresses movement below `max(32 B, 0.25%)` — a band set at 3× the
largest run-to-run drift observed, so an unchanged tree stays quiet while a newly-reachable function
(hundreds of bytes, spread across every bundle that reaches it) shows up plainly.

## `size` reports; it does not gate — deliberately

**`npm run size` is not wired into `npm run check`, and that is the design, not an oversight.** A gate
that goes red on intentional growth pushes an agent toward `npm run size:baseline` to clear it — which
an agent may not do in any case, see [below](#do-not-rewrite-the-baseline) — and
that rewrite re-pins to the new measurement unconditionally, at any magnitude, granting a fresh
allowance above the higher floor. **Gating would manufacture the laundering it was meant to prevent.**
The invariant above is enforced by a person reading the report, not by a failing exit code.

Recorded 2026-08-10 after four agents independently read the absence as a defect and one proposed
wiring it. Nothing in this file said otherwise, and **a design decision recorded nowhere is
indistinguishable from an oversight.**

Two consequences worth knowing when you read a delta:

- **The report identifies the pin's age.** In a Git checkout, `npm run size:minified` shows the
  last-change commit and author date for each `tools/size/size.baseline.json` entry (`@unknown` means
  that provenance is unavailable), so you can inspect the comparison point rather than assume it is
  current. The pin can still include drift from earlier work.
- **For any figure you intend to report, measure parent-versus-commit on the same tree.** A delta
  against a pin of unknown age attributes everyone else's accumulated drift to your change. This is
  not advice you have to follow by hand: `npm run size` caches each tree it measures, so

  ```sh
  git stash && npm run size && git stash pop && npm run size -- --ref=HEAD
  ```

  reports your change in isolation. It became practical only when the sweep dropped to a minute —
  at ten minutes a run, nobody measured twice, which is how a `+0.02 KB` figure read off a stale pin
  once reached a ruling when the honest isolated number was 19 bytes.
- **A missing baseline reports `passed`.** A key with no pin has no threshold, so a new fixture enters
  unbounded and the truthful output would be "no baseline", not a pass.

## The screw and the lawnmower

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Command surface

Four names, two subjects. Each check **reads** under its bare name and **writes** under `:baseline`.

- `npm run size` — unminified sweep, reported against the committed unminified baseline.
- `npm run size collision` — filter by example name. `render=canvas` filters by renderer, and the two
  combine: `npm run size collision render=webgl`.
- `npm run size -- --ref=<commit>` — compare against a commit you measured earlier rather than the
  baseline. This is the parent-versus-commit mode; the reference must already be in the cache.
- `npm run size report=json` — machine-readable, carrying both `raw` and `gzip` bytes per case.
- `npm run size:baseline` — rewrite the unminified baseline.
- `npm run size:minified` — the terser sweep. Interactively it refuses a bare full run and tells you
  the cost; pass a filter or `-- --yes`. Also takes `report=json` and `output=<path>` (which prints
  `SIZE_REPORT_PATH:<path>`).
- `npm run size:minified:baseline` — rewrite the shipping pins. **Not an agent's call.** See below.
- `npm run size:minified flight-diagnostics log-console` — build the release-stub/diagnostics pair,
  report the diagnostics gzip delta, and measure the log emitter plus console sink.
  The release build owns the canonical `flight-diagnostics:canvas` baseline key; the un-stubbed
  build is its mechanically derived `flight-diagnostics:canvas:diagnostics` variant.

Measurements are cached per tree under `.cache/size-fast/` (gitignored), so re-running `npm run size`
on an unchanged tree answers in about three seconds instead of re-measuring.

## Do not rewrite the baseline

**An agent does not run `npm run size:minified:baseline` without the user's explicit permission.**
Those pins are the user's record of what this SDK costs, and a rewrite is how a real increase stops
being visible: the number that would have shown up at merge is replaced by one that agrees with the
change that caused it.

This is why `size` reports rather than gates — there is no red to clear, so there is no pressure to
clear it. **Report the delta and leave the pin alone.** If a change legitimately costs bytes, that is
a fact for the user to see and accept, not one for the tool to absorb.

**`npm run size:baseline` is a different act and carries no such restriction.** The unminified
baseline is not a cost claim — nothing quotes it as what the SDK ships — so rewriting it launders
nothing. It is a record of what the tree currently shakes to, and its diff is the size report a
reviewer reads. Update it when a change legitimately moves it, the way you would a lockfile.

Measure honestly and say so: `npm run size <example>` for the affected fixture, and
parent-versus-commit for any figure you intend to report. The unminified sweep is a minute over all
139 cases and seconds from cache; the terser sweep is the slow one.

## The discipline these numbers protect

- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger — unless the size tradeoff is intentional and measured.
- In examples, prefer small package imports when the example intentionally demonstrates low-level or tree-shaken usage. Use `@flighthq/sdk` only for examples meant to demonstrate application-level convenience.
- Example render adapters enable authoring diagnostics. The size build replaces only that
  `enableFlightDiagnostics(state)` call with a no-op, so ordinary baselines continue to measure the
  release import graph; the diagnostics variant preserves the call and console to track its explicit
  overhead.
