# Flight Reference tool-capture integration

This is the implementation brief for an agent working in the `flight-reference` repository. The objective is to replace `scripts/capture.ts` with the public `@flighthq/tool-capture` workflow and make capture, visual verification, implementation parity, and repeatable benchmarks first-class CI contracts.

The integration is complete only when Flight Reference owns case discovery and renderer-specific draw adapters while tool-capture owns browser lifecycle, deterministic time, retries, screenshots, logs, status files, baselines, fingerprinting, comparison, benchmark sampling, reports, interruption, and exit verdicts.

## Current state to remove

As of the repository inspected for this brief:

- `scripts/capture.ts` discovers targets, launches Vite and Playwright, waits for frames, takes screenshots, hashes them, writes artifacts, compares baselines, formats output, and decides the exit code itself.
- That script dynamically imports individual source files from `.cache/flight-latest/packages/tool-capture/src`. Do not preserve those private source imports.
- `content/harness/verify.ts` and `content/harness/target.ts` are older copies of Flight verification contracts. They do not publish the current versioned terminal state or automatic benchmark target.
- The existing capture script covers Flight, OpenFL, and Starling inconsistently and does not expose the full case matrix as one comparison suite.
- Existing artifacts live under `.capture-output`; tool-capture's normal location is `.artifacts/<subject>/`.

Keep the Vite case discovery and external-framework adapters. Delete duplicated capture machinery after the replacement passes its acceptance checks.

## 1. Consume the package through its public root

Add `@flighthq/tool-capture` as a development dependency at a version containing the capture/validation/benchmark workflow. Import only from `@flighthq/tool-capture`; do not import `dist/*`, `src/*`, or `.cache/flight-latest/packages/tool-capture/src/*`.

For unpublished Flight development, extend the browser-facing Vite aliasing so `@flighthq/tool-capture` resolves to `$FLIGHT_REPO/packages/tool-capture/src/browser.ts`. Node scripts should continue to resolve the package normally (or use the built workspace package), because the package's Node root contains orchestration while its browser-conditioned root contains only the page protocol and adapters. The installed package remains the default when `FLIGHT_REPO` is absent.

Verify both modes:

```sh
npm run check
FLIGHT_REPO=/path/to/flight FLIGHT_SDK_WATCH=1 npm run check
```

The production build must prove that browser-side root imports select `dist/browser.js`; fail the build if Node built-ins, Playwright, or CLI formatting occur in the page graph.

## 2. Make case discovery a shared data source

Extract the case/implementation/renderer discovery currently split between `vite.config.ts` and `scripts/capture.ts` into one side-effect-free module, for example `scripts/reference-cases.ts`. Both the Vite plugin and capture-manifest generator must consume it.

Each discovered target needs:

- stable case id: `<framework>/<corpus>/<case>`;
- stable target id: `<implementation>:<backend>`, such as `flight:webgl`, `openfl:canvas`, or `starling:webgl`;
- exact preview route;
- backend kind: `dom`, `canvas`, `webgl`, or `webgpu`;
- whether repeatable benchmark work is registered;
- any intentional capture, parity, or benchmark exclusion with a reason in repository documentation.

Do not silently default every Flight or external implementation to WebGL. Use the renderer list already discovered for the preview UI.

## 3. Generate one declarative capture manifest

Add a small generator such as `scripts/write-capture-manifest.ts`. Its only responsibilities are reading shared case discovery and writing `tool-capture.json`; it must not launch a browser or implement capture policy.

Use `content` as the subject so committed baselines remain colocated under `content/baselines/`. Group equivalent implementations into one entry:

```json
{
  "subject": "content",
  "entries": [
    {
      "name": "openfl/display/bitmap",
      "renderers": ["flight:webgl", "openfl:webgl", "openfl:canvas"],
      "routes": {
        "flight:webgl": "openfl-tests/display/bitmap/flight/webgl/",
        "openfl:webgl": "openfl-tests/display/bitmap/webgl/",
        "openfl:canvas": "openfl-tests/display/bitmap/canvas/"
      }
    }
  ],
  "validation": {
    "parityGroups": {
      "openfl": {
        "targets": ["openfl:webgl", "flight:webgl", "flight:canvas", "flight:dom"],
        "reference": "openfl:webgl"
      },
      "starling": {
        "targets": ["starling:webgl", "flight:webgl"],
        "reference": "starling:webgl"
      },
      "awayjs": {
        "targets": ["awayjs:webgl", "flight:webgl", "flight:webgpu"],
        "reference": "awayjs:webgl"
      }
    }
  },
  "benchmark": {
    "reference": "flight:webgl",
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

Targets absent from an entry are ignored by its parity group. Keep tolerances at tool defaults initially; add a per-group tolerance only after inspecting a stable, intentional rasterization difference. Never add an exclusion merely to make CI green.

Commit the generated manifest if reviewability is more valuable than regeneration. Otherwise test the generator deterministically and produce it under `.cache/` before every capture command.

## 4. Replace the page-side verification copy

Replace the implementation in `content/harness/verify.ts` with imports or thin re-exports from `@flighthq/tool-capture`. The repository should no longer maintain its own copies of:

- `FunctionalVerification`;
- surface snapshot/fingerprint logic;
- WebGL framebuffer readback;
- WebGPU frame capture;
- presented-frame waiting;
- `registerFunctionalTarget` or `registerWgpuFunctionalTarget`.

Keep `@ft/verify` as the stable alias used by cases, but make it a thin module that re-exports the page APIs from the `@flighthq/tool-capture` root in both installed and local-source modes. The root alias from step 1 selects `src/browser.ts` during local Vite development; do not add a second private-file alias.

Update `content/harness/target.ts` and the four target factories to match current Flight harness behavior:

- `registerFunctionalTarget` wraps the first successful render and automatically exposes repeatable benchmark work;
- each target supports `benchmark?(root)`;
- the normal Flight factories invalidate the root and redraw inside `benchmark(root)` so timing measures real work rather than a dirty-check no-op;
- WebGL synchronization uses `gl.finish()`;
- WebGPU synchronization awaits `device.queue.onSubmittedWorkDone()`;
- DOM synchronization forces pending layout;
- specialized scenes that cannot repeat safely leave the benchmark target unavailable and are reported as skipped.

For the usual Flight case, retain the runner-level one-line verification call:

```ts
await verifyCaptureTarget(caseModule, renderer);
```

Do not add capture code to every Flight sample.

## 5. Register external implementation surfaces

Parity against OpenFL, Starling, or AwayJS requires those pages to publish a terminal verification fingerprint too. In each framework adapter—not each sample—register the renderer-owned surface once with `installCaptureElementTarget`:

```ts
await installCaptureElementTarget({
  renderer: 'webgl',
  element: canvas,
  gl,
  render: () => adapter.renderOneDeterministicFrame(),
});
```

Use `renderer: 'canvas'` for Canvas 2D and `renderer: 'dom'` for a DOM root. Pass the existing WebGL context; never request a second context from the canvas. The `render` callback must represent one repeatable unit of useful work and must not include asset loading, page startup, screenshots, or logging.

If a framework owns an animation loop, expose a deterministic adapter operation that advances and renders exactly one frame. If repeatable rendering is unsafe, install verification without `render` and allow benchmarking to report the target as unsupported. A blank or missing verification result is a failure, not an expected skip.

## 6. Replace capture scripts with CLI composition

Build once, serve the built directory through tool-capture, and use the standard commands:

```json
{
  "scripts": {
    "capture:manifest": "tsx scripts/write-capture-manifest.ts",
    "capture": "npm run build && npm run capture:manifest && tool-capture capture --dir dist --verify --fail-on-error",
    "capture:update": "npm run build && npm run capture:manifest && tool-capture capture --dir dist --verify --update-baseline",
    "capture:check": "npm run build && npm run capture:manifest && tool-capture capture --dir dist --verify --fail-on-error --fail-on-changed",
    "capture:validate": "tool-capture validate --dir dist",
    "capture:validate:update": "tool-capture validate --dir dist --update-fingerprints",
    "capture:benchmark": "tool-capture benchmark --dir dist",
    "capture:benchmark:update": "tool-capture benchmark --dir dist --update-benchmarks"
  }
}
```

Keep those individual commands for local diagnosis and baseline updates. For the required CI path, add a `tool-capture.batch.json` plan so capture and validation reuse one browser/server and benchmark gets a fresh uncontended serial browser:

```json
{
  "subjects": [
    {
      "name": "content",
      "args": ["--manifest=tool-capture.json", "--dir=dist", "--verify", "--fail-on-error", "--fail-on-changed"]
    }
  ]
}
```

Add `"capture:all": "npm run build && npm run capture:manifest && tool-capture batch"` and use it in CI. If a long-lived preview server is already running, use `--url` instead of `--dir`. Keep baseline updates as separate individual commands so screenshot, fingerprint, and performance baseline changes remain independently reviewable.

Delete `scripts/capture.ts` after the standard CLI produces equivalent or better screenshots, logs, statuses, baselines, summaries, interruption behavior, and exit codes. Remove its direct Playwright, hashing, filesystem, server, formatting, and baseline-store code.

## 7. Migrate artifacts and baselines deliberately

Add `.artifacts/` to `.gitignore` and remove `.capture-output/` after consumers and documentation are updated. CI should upload:

- `.artifacts/content/report.json`;
- `.artifacts/content/validation-report.json`;
- `.artifacts/content/benchmark-report.json`;
- every failed target's `screenshot.png`, `logs.jsonl`, and `status.json`.

The grouped entry layout changes baseline identity from separate `<case>/<implementation>.json` files to one `<case>.json` whose columns are implementation-qualified target ids. Write a one-time migration script or regenerate baselines in a dedicated reviewable commit. Never mix a baseline rewrite with renderer behavior changes.

Baseline procedure:

1. Run capture and validation twice without updating; investigate nondeterminism first.
2. Run `capture:update` and `capture:validate:update` on a controlled environment.
3. Review screenshots and fingerprint distances.
4. Commit visual baselines separately.
5. Run the benchmark update at least three times; only stable targets should be written.
6. Commit benchmark baselines separately with the browser and host description in the commit/PR notes.

## 8. CI policy

Use two lanes:

### Required visual lane

Run capture with verification, regression, and parity. Missing screenshots, blank frames, page errors, protocol mismatches, and visual regressions must fail. This is the lane that protects AI-agent eyesight and must retain failed artifacts even when the command exits nonzero.

### Controlled performance lane

Run benchmarks serially on a pinned runner when possible. Gate same-run ratios where a comparable reference target exists; otherwise gate calibrated normalized work. Do not treat calibration as a machine-independent physical unit. Keep raw medians and environment metadata in the uploaded report.

For heterogeneous pull-request runners, begin with report-only benchmark execution. Enable regression failure only after enough runs show that the selected references and stability tolerance are reliable.

## 9. Reliability and scale checks

Before removing the old path, demonstrate all of the following:

- filter one known OpenFL Stage3D case and capture a non-blank Flight screenshot in headless CI;
- capture a known reference implementation screenshot and compare it with its Flight target;
- intentionally blank each backend and confirm capture/validation exits nonzero while preserving evidence;
- intentionally throw during page startup and confirm logs/status identify the error;
- terminate a run and confirm partial reports are valid and the process exits as interrupted;
- run at least 20 targets with parallel capture/validation and confirm paths and reports do not collide;
- run benchmark twice and confirm it remains serial, records raw samples, and fences WebGL/WebGPU work;
- force one transient page failure and confirm a fresh-page retry is recorded;
- run installed-package and `FLIGHT_REPO` modes;
- run `npm run fix`, `npm run check`, and `npm run ci`.

## 10. Completion criteria

The Flight Reference integration is complete when:

- `scripts/capture.ts` and private tool-capture source imports are gone;
- one shared discovery model drives both preview routes and capture entries;
- every supported Flight and reference target either publishes terminal verification or has a documented, intentional unsupported reason;
- Flight and external implementations participate in explicit same-case parity groups;
- repeatable targets participate in synchronized benchmarks;
- standard CLI commands own all browser and report behavior;
- baseline changes are reviewable and deterministic;
- required CI preserves useful visual evidence on every failure;
- the README and `agents/index.md` document the new commands and artifact locations.

Do not copy logic back out of tool-capture to work around an integration issue. Reduce the failing case, fix the shared package when the behavior belongs there, then update the package version used by Flight Reference.
