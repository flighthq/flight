---
package: '@flighthq/capture'
crate: flighthq-capture
draft: false
lastDirection: 2026-07-09
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# capture — Charter

> **CHARTERED; first build directed 2026-07-09 (standalone policy/format layer).** Blessed during the 2026-07-03 render-verification direction session. Today the capability lives in the tooling layer (`scripts/capture-core.ts`, `scripts/compare-render.ts`, `scripts/baseline-store.ts`) plus the fingerprint math in `@flighthq/surface`. The approved near-term work in [assessment.md](./assessment.md) executes against that tooling; the package extraction follows.

## What it is

`@flighthq/capture` is the **deterministic render capture and verification primitive** — the SDK-side home for reading back a rendered frame, fingerprinting it, comparing it against a baseline or against another backend, and defining the committed baseline format. The Rust workspace already reserves the matching crate (`flighthq-capture`, the headless offscreen wgpu → PNG / fingerprint conformance gate); this package is the TS upstream it conforms to.

The sequence blessed on 2026-07-03: build the TS `capture` package, then build the Rust parity version (usable from wasm), then the tools (`capture-core`, `compare-render`, the gallery) import this package instead of owning the logic.

## North star

One importable, environment-agnostic verification vocabulary shared by the tools, the examples/functional harnesses, and the Rust/wasm parity instrument. The three check tiers keep their distinct meanings:

- **Regression** — one target compared against a known committed baseline.
- **Parity** — consistency between render backends rendering the same scene.
- **Smoke** — builds, runs, no error, not blank (stays in the tools; listed here so the vocabulary is complete).

Capture must be fast (baselining sweeps every test × backend) and its outputs must serve both machines (hashes, fingerprints, raw pixels) and humans/agents (PNGs in the gallery, `screenshot.png` for debugging).

## Boundaries

- **Owns:** fingerprint/baseline formats and their comparison policy (tolerances, per-test overrides), pixel readback → hash/fingerprint orchestration, the baseline store shape.
- **Consumes:** `@flighthq/surface` for pixel-level operations (`createSurfaceFingerprint` and friends are surface ops on an `ImageSource`; see Open direction 6 for the exact seam).
- **Stays in tools:** browser driving (Playwright), dev servers, the gallery UI, CI wiring. The package must never depend on Playwright or Node-only APIs — it is the same plain-data, importable-in-isolation cell as every other package, which is what lets the Rust/wasm build exist.

## Decisions

_Append-only, dated, blessed rulings — frozen from the 2026-07-03 direction session._

- **[2026-07-03]** **Regression testing means one target versus a known baseline.** Its committed baseline is the record of what that target rendered; it is not a cross-backend or cross-implementation check.
- **[2026-07-03]** **Parity testing means consistency between render backends** rendering the same scene in the same run. It needs no committed baseline and is the environment-independent tier.
- **[2026-07-03]** **Capture-mode PNGs are a first-class artifact, not an implementation detail.** They are used by agents for visual debugging and locally by the gallery view. Any change to hashing or baseline formats must keep producing the PNG outputs.
- **[2026-07-03]** **Hash raw decoded RGBA pixels, not PNG bytes.** The PNG is the display artifact (gallery is local — network size is not a concern); the verification value is computed from the raw pixel buffer, which also lets reviewing agents and tools work without a PNG decode step.
- **[2026-07-03]** **Baseline values stay environment-agnostic.** Do not couple a baseline's value to environment identity (no environment stamps, no per-environment baseline files). Resilience comes from what is hashed/fingerprinted and how it is compared, not from environment bookkeeping.
- **[2026-07-03]** **Package existence and sequence blessed:** TS `@flighthq/capture` first, then the Rust parity crate (`flighthq-capture`, wasm-capable), then the tools import the package.
- **[2026-07-03]** **Test fonts are distributed via `flight-assets`.** Fonts needed for deterministic text rendering are added to the flight-assets release archive as needed, not committed to this repository and not taken from the host system.
- **[2026-07-09] First-build scope = the pure policy/format layer; surface keeps the pixel math (resolves Open direction 6).** The package owns, as plain importable functions with no Playwright/Node I/O: the baseline record shape + serialize/parse (the `Record<column, { fingerprint?, sha256? }>` format, `format*`/`parse*` + field get/set — no `fs`), the tolerance comparison policy (`compareCaptureFingerprints` = parse two fingerprint strings via surface + `compareSurfaceFingerprints`; `evaluateCaptureRegression`/`evaluateCaptureParity` applying a tolerance → a pass/diff result), the default tolerances (regression 5, parity 15), and the tier vocabulary type (`regression` | `parity` | `smoke`). It **depends on `@flighthq/surface`** for the pixel math (`createSurfaceFingerprint`, `compareSurfaceFingerprints`, `parseSurfaceFingerprint` stay in surface) and does NOT re-export them (keeps `api:check`'s single-export rule). Playwright driving, dev servers, gallery, CI wiring, and the baseline file I/O stay in the tools.
  **Why:** the blessed Boundaries put pixel math in surface and the comparison-policy + baseline format in capture; extracting only the pure layer makes the package importable-in-isolation and Rust/wasm-conformable, per the blessed sequence (TS package → Rust parity → tools adopt).
- **[2026-07-09] Tool adoption is deferred to the blessed later step.** The first build ships the standalone package + tests; migrating `scripts/compare-render.ts` / `baseline-store.ts` / `verify.ts` to import it (removing their duplicated logic) follows the Rust parity crate, per the 2026-07-03 sequence — it is not part of this build (it touches the currently-green render tooling).

## Open directions

1. **WebGL software rendering (SwiftShader pinning).** Genuinely on the fence. The framing to settle: functional tests exercise Flight's _use of the API_, not the GPU backend itself — which argues for pinning a software rasterizer (as WebGPU already is, via `--use-webgpu-adapter=swiftshader`) so output is machine-independent. Against: it stops observing the real driver path entirely.
2. **Chromium-version sensitivity of fingerprints.** Unproven that a Chromium upgrade actually moves the coarse fingerprint beyond tolerance (it would be nice if it did not). Before adopting any policy, measure it across a real Playwright/Chromium bump. If it does break, the response is to be clear about it (documentation, a clean skip/message) — not machinery; not convinced anything is required.
3. **Content-addressed image storage in flight-assets.** Open to storing full captures/baseline images content-addressed (`<sha256>.png`) in flight-assets, but it requires a pipeline to upload and automatically produce a new release first. The pipeline is the prerequisite, not the storage format.
4. **A/B (differential) capture.** Capture the merge-base and the head in the same run on the same machine and diff them — no stored baselines, fully environment-independent. Genuine curiosity; likely fits pull requests rather than merges to main. Needs a prototype to judge cost and signal.
5. **Chromium `--deterministic-mode`.** Sounds interesting — evaluate what the umbrella flag (plus `--disable-partial-raster`) actually changes for capture stability before adopting.
6. **The seam with `@flighthq/surface`.** Fingerprint create/compare/format/parse currently live in surface. Decide whether capture re-exports, wraps, or takes ownership of the comparison-policy layer while surface keeps the pixel math.

## Origin decisions (from other charters and docs)

- **[Rust docs · rust/index.md]** `flighthq-capture` is already named as the native conformance gate: headless offscreen wgpu → PNG / fingerprint, no window, no browser. This charter makes the TS side of that pairing explicit.
- **[2026-07-03 · this session]** Deterministic clock pinning in the capture harness is blessed (see assessment › Approved) and ties to the `clock` package charter — the capture harness's fixed time-step per frame is a natural `clock` consumer/backend once that package exists.
