---
package: '@flighthq/capture'
updated: 2026-07-13
basedOn: ./review.md
---

# capture — Assessment

See [charter](./charter.md) for blessed direction. First review (2026-07-13) now exists. The Approved ledger below is carried forward verbatim — note its items were frozen against the scripts tooling home, which has since been absorbed into `@flighthq/tool-capture` (see review.md gap 2 and candidate open direction 1 for the re-homing question).

## Recommended

Sweep-safe, within `@flighthq/capture`, no design fork:

1. **`explain*` queries for the silent sentinels** — `explainCaptureFingerprintComparison(a, b)` returning which cause produced Infinity (unparseable a / unparseable b / grid-size mismatch) and `explainCaptureBaselineParse(text)` distinguishing malformed JSON from non-object, both plain data and separately importable, per the diagnostics rule. — review.md gap 3.
2. **Format-pinning tests against the tooling twin** — assert `formatCaptureBaseline` output parses back identically and matches the documented byte format (sorted columns, canonical field order, trailing newline) across edge inputs (empty record, one-field columns), pinning the shape the Rust crate and `tool-capture`'s duplicate `writeBaseline` must both conform to. — review.md gap 1 (drift risk).

## Approved

- [2026-07-03 · picked] **Per-test fingerprint tolerance overrides.** Make the regression fingerprint tolerance customizable per test (in the test's own declaration, alongside `renderers`/oracle config), replacing reliance on the single global `--regression-tolerance=5` in `scripts/compare-render.ts`. — 2026-07-03 direction session, items 4 and 10.
- [2026-07-03 · picked] **Hash raw decoded RGBA pixels instead of PNG bytes.** `capture:check` (`scripts/capture-core.ts`) computes its sha256 over the decoded RGBA buffer, removing PNG-encoder drift as a failure mode. PNG output is unchanged — it remains the gallery/agent-debugging artifact (charter Decision, 2026-07-03). — 2026-07-03 direction session, item 9.
- [2026-07-03 · picked] **Accelerate fingerprint capture the way the PNG capture check was accelerated.** Baselining sweeps are slow overall; the standard `capture:check` PNG path was recently highly accelerated, and `compare-render.ts`'s fingerprint loads (fresh page per test × backend, twice when baselining for self-stability) should get the same treatment. — 2026-07-03 direction session, item 5.
- [2026-07-03 · picked] **Pin the clock in the capture harness.** Stub `performance.now`/`Date` in `launchBrowser`'s init script to advance a fixed delta per animation frame (alongside the existing seeded `Math.random`), so time-parameterized scenes are deterministic at any `--frames=N`, not just frame 1 — letting more currently "nondeterministic — not baselined" tests join the gated set. Coordinate the design with the `clock` package charter (the shared time primitive); the harness pin is a natural consumer of that seam. — 2026-07-03 direction session, item 13.

## Backlog

- **Tool adoption** (tool-capture and `scripts/compare-render.ts` importing this package, removing the duplicated compare + baseline-format logic) — parked: cross-package, and blessed to follow the Rust parity crate per the 2026-07-09 Decision; tool-capture's Open direction 0 is the same item from the consumer side. — review.md gap 1.
- **Re-home the outstanding 2026-07-03 Approved items** (per-test tolerance overrides, raw-RGBA hashing, clock pinning — none yet delivered) — parked: a ledger/ownership decision for the user, since their execution home moved to `@flighthq/tool-capture`; surfaced as review.md candidate open direction 1. — review.md gap 2.
- **Per-column tolerance field in the baseline record shape** — parked: a format decision (review.md candidate open direction 2) that should precede the Rust crate freezing the shape. — review.md gap 4.
- **Rust parity crate `flighthq-capture`** — parked: the blessed next sequence step; a build pass of its own. — review.md gap 5.
- **Content-addressed image storage in flight-assets** — parked on its prerequisite: an upload + automatic-release pipeline for flight-assets (charter Open direction 3).
- **A/B differential capture prototype** — merge-base vs head captured in the same run; evaluate for pull-request gating (charter Open direction 4).
- **Evaluate Chromium `--deterministic-mode`** (+ `--disable-partial-raster`) for capture stability (charter Open direction 5).
- **Measure Chromium-upgrade fingerprint drift** — quantify across a real Playwright bump before any policy; if real, the answer is clarity (docs/skip messaging), not machinery (charter Open direction 2).
- **Add deterministic test fonts to flight-assets** as text-rendering tests need them (charter Decision, 2026-07-03).
- **Charter banner + Approved-item path staleness** (references to `scripts/capture-core.ts` etc.) — parked: charter edits are the user's gate; flagged as candidate docs revisions in review.md.
