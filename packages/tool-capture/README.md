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

## Observe one page

`observe` is the zero-integration eyes primitive. It always emits the best available screenshot and diagnostics rather than enforcing a suite gate:

```sh
tool-capture observe http://localhost:5173/example --out capture
```
