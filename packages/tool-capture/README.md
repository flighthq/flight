# `@flighthq/tool-capture`

Deterministic browser capture and reporting for canvas, DOM, WebGL, and WebGPU pages.

## Choose the contract

- **Observe:** zero page integration. Produces agent eyesight and explicit `usable`, `blank`, `timedOut`, retry, and error diagnostics.
- **Capture gate:** a manifest plus CLI flags. Produces deterministic screenshots, logs, hashes, and smoke failures.
- **Verification:** one shared page adapter. Adds asserted non-blank readback, fingerprints, parity, and regression without capture code in each example.
- **Benchmark:** repeatable page work with backend completion fences, robust statistics, calibrated scores, relative comparisons, and committed performance baselines.

Every command writes versioned `status.json` files and an aggregate `report.json` envelope intended for CI and AI agents. Capture retries transient navigation/protocol failures in a fresh page; `observe` retries blank or timed-out attempts while preserving the best full-page evidence from its final attempt.

## Capture a suite

Add a `tool-capture.json` manifest to a package:

```json
{
  "subject": "my-app",
  "entries": [
    {
      "name": "home",
      "renderers": ["canvas", "webgl"],
      "routes": {
        "canvas": "pages/home/canvas/",
        "webgl": "pages/home/webgl/"
      }
    }
  ]
}
```

Then capture either an existing server or an already-built directory:

```sh
tool-capture capture --url http://localhost:5173
tool-capture capture --dir dist
```

Each target writes `screenshot.png`, `logs.jsonl`, and `status.json` beneath `.artifacts/<subject>/<entry>/<renderer>/`. Common reporting controls are built in:

```sh
tool-capture capture --dir dist --frames 1 --fail-on-error
tool-capture capture --dir dist --update-baseline
tool-capture capture --dir dist --fail-on-changed
tool-capture capture --dir dist --renderer webgl,webgpu --parallel 4
```

Use `runCaptureSuite` when entries or server lifecycle are generated programmatically. It owns browser setup and teardown, deterministic frame synchronization, parallel or sequential scheduling, baseline policy, interruption, summaries, and the final verdict.

## Install verification once

Raw consumers can register, render, and verify with one call after constructing their normal renderer state:

```ts
await installCaptureTarget({
  renderer: 'webgl',
  state,
  render: () => renderScene(scene),
  assertRender,
});
```

The adapter is inert outside a tool-capture browser. During capture it registers readable WebGL/WebGPU state before drawing and publishes the complete versioned terminal contract only after assertions pass. A project whose shared renderer factory already registers the target needs one runner-level line and zero capture-specific lines in each example:

```ts
await verifyCaptureTarget(exampleModule, renderer);
```

Fingerprints use the `<grid-size>:<rgb-hex>` format produced by `formatSurfaceFingerprint`. Once the page reaches a terminal verification state, validation is turn-key:

```sh
tool-capture validate --dir dist --no-regression
tool-capture validate --dir dist --no-parity
tool-capture validate --dir dist --update-fingerprints
```

Optional manifest policy keeps intentional exceptions beside the suite:

```json
{
  "subject": "my-app",
  "entries": [],
  "validation": {
    "fingerprintSkip": ["audio-only"],
    "paritySkip": {
      "video": "all",
      "approximate-effect": ["canvas"]
    }
  }
}
```

Explicit groups compare any target IDs, including DOM and WASM-backed variants. DOM targets are rasterized to the same normalized 16×16 RGB fingerprint as canvas/GPU targets. A reference produces clear reference-to-target failures instead of an increasingly noisy all-pairs matrix:

```json
{
  "validation": {
    "parityGroups": {
      "visual": {
        "targets": ["dom", "canvas", "webgl", "webgpu", "wasm:webgl"],
        "reference": "canvas",
        "tolerance": 15
      }
    }
  }
}
```

Legacy manifests retain raster-only all-pairs behavior. Explicit groups are same-run comparisons and do not require committed regression fingerprints, though each target still reports its independent regression-baseline status.

`runCaptureValidation` exposes the same validation lifecycle programmatically. Comparison tolerances and baseline formats come from `@flighthq/capture`; `tool-capture` owns browser execution and reporting.

## Benchmark repeatable render work

`installCaptureTarget({ render })` and Flight's normal functional-target registration automatically expose the last rendered scene as benchmark work. Custom/WASM pages can call `registerCaptureBenchmarkTarget({ kind, run, synchronize })`; `synchronize` must fence submitted work. Screenshots, fingerprinting, page startup, and calibration are outside timed intervals.

```json
{
  "benchmark": {
    "reference": "canvas",
    "warmupIterations": 3,
    "iterations": 10,
    "samples": 7,
    "sampleDurationMs": 20,
    "maxRetries": 1,
    "regressionTolerance": 0.2,
    "stabilityTolerance": 0.1
  }
}
```

```sh
tool-capture benchmark --dir dist --update-benchmarks
tool-capture benchmark --dir dist
tool-capture benchmark --url http://localhost:5173 --renderer canvas,webgl --samples 11
```

The update command writes stable baselines to `<subject>/benchmarks/<entry>.json`; a target whose median absolute deviation exceeds the configured stability tolerance is not baselined. Transient navigation, browser, and protocol failures retry in a fresh page (`maxRetries`, default 1), while deterministic verification failures do not. Every run writes `.artifacts/<subject>/benchmark-report.json` with raw samples, median, p95, MAD, retry count, browser/host metadata, CPU/GPU calibration throughput, normalized work, reference ratios, baseline choice, and percentage change.

`iterations` is a minimum: the runner adaptively increases it until each timed sample reaches `sampleDurationMs`, avoiding zero-duration and timer-quantization noise for very fast targets.

No calibration makes performance completely host-independent: renderer workloads stress different parts of CPUs, drivers, and GPUs. The gate therefore prefers a same-run ratio when `reference` is available, because shared host conditions cancel best. Choose a reference with a comparable resource path; a CPU-DOM versus discrete-GPU ratio still reflects that machine's CPU/GPU balance. Otherwise the gate compares `median × calibration throughput`, an estimate of host-normalized work. Keep raw medians for same-machine trends, use ratios for heterogeneous CI, and treat calibrated scores as a useful secondary signal rather than a physical unit. Benchmarks run serially by design so ordinary capture worker concurrency cannot contaminate them.

## Batch many resources and subjects

Treat each resource as an entry. Routes may point at one reusable preview page with resource and renderer query parameters, so large catalogs need no generated HTML:

```json
{
  "subject": "asset-library",
  "entries": [
    {
      "name": "spaceship",
      "renderers": ["canvas", "webgl", "webgpu"],
      "routes": {
        "canvas": "preview/?asset=spaceship&renderer=canvas",
        "webgl": "preview/?asset=spaceship&renderer=webgl",
        "webgpu": "preview/?asset=spaceship&renderer=webgpu"
      }
    }
  ]
}
```

Use an existing server and tune the resource worker pool for the host:

```sh
tool-capture capture --url http://localhost:5173 --parallel 12 --frames 1 --fail-on-error
tool-capture validate --url http://localhost:5173 --parallel 12 --update-fingerprints
tool-capture validate --url http://localhost:5173 --parallel 12
```

The existing `capture` and `validate` baseline commands remain independent. To run the usual capture-then-validation workflow across several packages, add `tool-capture.batch.json` at the repository root:

```json
{
  "subjects": [
    {
      "name": "icons",
      "args": ["--manifest=packages/icons/tool-capture.json", "--url=http://localhost:5173", "--parallel=12"]
    },
    {
      "name": "models",
      "args": ["--manifest=packages/models/tool-capture.json", "--dir=packages/models/dist", "--parallel=6"]
    },
    {
      "name": "shaders",
      "args": ["--manifest=packages/shaders/tool-capture.json", "--dir=packages/shaders/dist"],
      "operations": ["validate", "benchmark"]
    }
  ]
}
```

```sh
tool-capture batch
tool-capture batch --only models
tool-capture batch --filter terrain --renderer webgl,webgpu
tool-capture batch --subjects-parallel 2
```

Arguments after `batch` override each subject's defaults. Subjects run sequentially unless `--subjects-parallel` is set; targets use each subject's `--parallel` worker pool. All operations reuse the subject's server, and capture/validation share a browser so capture-supplied fingerprints avoid validation reloads. Before benchmarking, that parallel visual browser is closed and a clean serial browser is launched so GPU/process contention cannot contaminate timing. Standalone validation flattens entries × renderers into the same balanced page queue. `runCaptureWorkflow` and `runCaptureBatch` provide the same composition for generated resource catalogs.

## Observe one page

`observe` is the zero-integration eyes primitive. It actively polls presented pixels, ignores dev-server WebSocket shutdown noise, and retries twice by default. If a canvas remains blank, it captures the full page so an error overlay or loading UI is visible instead of cropping the only useful evidence away. A clean blank result exits nonzero, but `screenshot.png`, `status.json`, and `report.json` remain available:

```sh
tool-capture observe http://localhost:5173/example --out capture --retries 2
```
