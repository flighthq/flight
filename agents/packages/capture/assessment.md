---
package: '@flighthq/capture'
updated: 2026-07-03
basedOn: null # no review yet — items frozen directly from the 2026-07-03 direction session
---

# capture — Assessment

See [charter](./charter.md) for blessed direction. The package does not exist yet; the Approved items below execute against the current tooling home (`scripts/capture-core.ts`, `scripts/compare-render.ts`, `scripts/baseline-store.ts`, and the fingerprint functions in `@flighthq/surface`) and migrate into the package when it is built.

## Recommended

No sweep-safe items beyond the Approved set (package does not exist yet; a first review follows the build).

## Approved

- [2026-07-03 · picked] **Per-test fingerprint tolerance overrides.** Make the regression fingerprint tolerance customizable per test (in the test's own declaration, alongside `renderers`/oracle config), replacing reliance on the single global `--regression-tolerance=5` in `scripts/compare-render.ts`. — 2026-07-03 direction session, items 4 and 10.
- [2026-07-03 · picked] **Hash raw decoded RGBA pixels instead of PNG bytes.** `capture:check` (`scripts/capture-core.ts`) computes its sha256 over the decoded RGBA buffer, removing PNG-encoder drift as a failure mode. PNG output is unchanged — it remains the gallery/agent-debugging artifact (charter Decision, 2026-07-03). — 2026-07-03 direction session, item 9.
- [2026-07-03 · picked] **Accelerate fingerprint capture the way the PNG capture check was accelerated.** Baselining sweeps are slow overall; the standard `capture:check` PNG path was recently highly accelerated, and `compare-render.ts`'s fingerprint loads (fresh page per test × backend, twice when baselining for self-stability) should get the same treatment. — 2026-07-03 direction session, item 5.
- [2026-07-03 · picked] **Pin the clock in the capture harness.** Stub `performance.now`/`Date` in `launchBrowser`'s init script to advance a fixed delta per animation frame (alongside the existing seeded `Math.random`), so time-parameterized scenes are deterministic at any `--frames=N`, not just frame 1 — letting more currently "nondeterministic — not baselined" tests join the gated set. Coordinate the design with the `clock` package charter (the shared time primitive); the harness pin is a natural consumer of that seam. — 2026-07-03 direction session, item 13.

## Backlog

- **Full package creation** — extract `@flighthq/capture` from the scripts layer per the charter sequence (TS package → Rust parity crate → tools import it). Needs its own build pass; follows the normal chartered-unbuilt queue.
- **Content-addressed image storage in flight-assets** — parked on its prerequisite: an upload + automatic-release pipeline for flight-assets (charter Open direction 3).
- **A/B differential capture prototype** — merge-base vs head captured in the same run; evaluate for pull-request gating (charter Open direction 4).
- **Evaluate Chromium `--deterministic-mode`** (+ `--disable-partial-raster`) for capture stability (charter Open direction 5).
- **Measure Chromium-upgrade fingerprint drift** — quantify across a real Playwright bump before any policy; if real, the answer is clarity (docs/skip messaging), not machinery (charter Open direction 2).
- **Add deterministic test fonts to flight-assets** as text-rendering tests need them (charter Decision, 2026-07-03).
