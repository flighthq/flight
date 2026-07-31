# Bundle Size

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. `npm run size` builds matching examples and reports gzip output size against the committed baseline — it is the preferred size command for agents. Run it after changes to examples, package exports, barrels, renderer registration, dependencies, or anything that may affect tree-shaking.

## The screw and the lawnmower

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Command surface

- `npm run size` — report all examples.
- `npm run size piratepig` — filter by example name.
- `npm run size render=canvas` — filter by renderer. Filters combine: `npm run size piratepig render=webgl`.
- `npm run size piratepig report=json` — machine-readable JSON, for easier agent parsing.
- `npm run size piratepig output=size-report.json` — write a JSON report file; prints `SIZE_REPORT_PATH:<path>`.
- `npm run size:baseline` — rewrite the size baseline after an intentional, measured change.
- `npm run size flight-diagnostics log-console` — build the release-stub/diagnostics pair, report
  the diagnostics gzip delta, and measure the log emitter plus console sink.
  The release build owns the canonical `flight-diagnostics:canvas` baseline key; the un-stubbed
  build is its mechanically derived `flight-diagnostics:canvas:diagnostics` variant.

## The discipline these numbers protect

- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger — unless the size tradeoff is intentional and measured.
- In examples, prefer small package imports when the example intentionally demonstrates low-level or tree-shaken usage. Use `@flighthq/sdk` only for examples meant to demonstrate application-level convenience.
- Example render adapters enable authoring diagnostics. The size build replaces only that
  `enableFlightDiagnostics(state)` call with a no-op, so ordinary baselines continue to measure the
  release import graph; the diagnostics variant preserves the call and console to track its explicit
  overhead.
