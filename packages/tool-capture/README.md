# `@flighthq/tool-capture`

Deterministic browser capture and reporting for canvas, DOM, WebGL, and WebGPU pages.

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

## Validate fingerprints

The same manifest and server options drive the tolerant parity/regression pass when pages publish a render fingerprint:

```js
window.__ftVerification = {
  render: 'webgl',
  coverage: 1,
  fingerprint: '1:25acc0',
};
```

Fingerprints use the `<grid-size>:<rgb-hex>` format produced by `formatSurfaceFingerprint`. Once the page exposes a non-null fingerprint, validation is turn-key:

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

`runCaptureValidation` exposes the same validation lifecycle programmatically. Comparison tolerances and baseline formats come from `@flighthq/capture`; `tool-capture` owns browser execution and reporting.

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
      "operations": ["validate"]
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

Arguments after `batch` override each subject's defaults. Subjects run sequentially unless `--subjects-parallel` is set; entries use each subject's `--parallel` worker pool. Capture and validation reuse the subject's server, avoiding a second build/startup. `runCaptureWorkflow` and `runCaptureBatch` provide the same composition for generated resource catalogs.

## Observe one page

`observe` is the zero-integration eyes primitive. It always emits the best available screenshot and diagnostics rather than enforcing a suite gate:

```sh
tool-capture observe http://localhost:5173/example --out capture
```
