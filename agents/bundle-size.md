# Bundle Size

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. `npm run size` builds matching examples and reports gzip output size against the committed baseline — it is the preferred size command for agents. Run it after changes to examples, package exports, barrels, renderer registration, dependencies, or anything that may affect tree-shaking.

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

- **The report identifies the pin's age.** In a Git checkout, `npm run size` shows the last-change
  commit and author date for each `tools/size/size.baseline.json` entry (`@unknown` means that
  provenance is unavailable), so you can inspect the comparison point rather than assume it is
  current. The pin can still include drift from earlier work. **For any figure you intend to report,
  measure parent-versus-commit on the same tree**; pin provenance explains the baseline comparison,
  while parent-versus-commit isolates your change.
- **A missing baseline reports `passed`.** A key with no pin has no threshold, so a new fixture enters
  unbounded and the truthful output would be "no baseline", not a pass.

## The screw and the lawnmower

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Command surface

- `npm run size` — report all examples.
- `npm run size piratepig` — filter by example name.
- `npm run size render=canvas` — filter by renderer. Filters combine: `npm run size piratepig render=webgl`.
- `npm run size piratepig report=json` — machine-readable JSON, for easier agent parsing.
- `npm run size piratepig output=size-report.json` — write a JSON report file; prints `SIZE_REPORT_PATH:<path>`.
- `npm run size:baseline` — rewrite the size baseline. **Not an agent's call.** See below.
- `npm run size flight-diagnostics log-console` — build the release-stub/diagnostics pair, report
  the diagnostics gzip delta, and measure the log emitter plus console sink.
  The release build owns the canonical `flight-diagnostics:canvas` baseline key; the un-stubbed
  build is its mechanically derived `flight-diagnostics:canvas:diagnostics` variant.

## Do not rewrite the baseline

**An agent does not run `npm run size:baseline` (or `test:size:baseline`) without the user's explicit
permission.** The pins are the user's record of what this SDK costs, and a rewrite is how a real
increase stops being visible: the number that would have shown up at merge is replaced by one that
agrees with the change that caused it.

This is why `size` reports rather than gates — there is no red to clear, so there is no pressure to
clear it. **Report the delta and leave the pin alone.** If a change legitimately costs bytes, that is
a fact for the user to see and accept, not one for the tool to absorb.

Measure it honestly and say so: `npm run size <example>` for the affected fixture, and
parent-versus-commit on the same tree for any figure you intend to report. Both are cheap — a single
filtered example is seconds; the unfiltered sweep over all 46 is the slow one.

## The discipline these numbers protect

- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger — unless the size tradeoff is intentional and measured.
- In examples, prefer small package imports when the example intentionally demonstrates low-level or tree-shaken usage. Use `@flighthq/sdk` only for examples meant to demonstrate application-level convenience.
- Example render adapters enable authoring diagnostics. The size build replaces only that
  `enableFlightDiagnostics(state)` call with a no-op, so ordinary baselines continue to measure the
  release import graph; the diagnostics variant preserves the call and console to track its explicit
  overhead.
