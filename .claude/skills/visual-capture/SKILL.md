---
name: visual-capture
description: Capture screenshots and structured logs from Flight examples, functional tests, and the external reference examples (the OpenFL/Starling/AwayJS ports in the flight-reference repo), then read them back to verify rendering. Use when you need to SEE what a renderer drew (debug a visual bug, confirm a change looks right across backends, "test/capture the <name> reference example"), set or update a screenshot baseline, or interpret the screenshot.png / logs.jsonl / status.json output files. Covers one-shot capture, reference-example capture (auto-clones flight-reference), watch mode, baselines, and emitting logs from a scene.
---

# Visual capture and agent feedback

These scripts turn examples, functional tests, and reference examples into screenshot + log output an agent can read directly. They run **in the agent sandbox** — Playwright installs and drives a headless browser here, no host needed; only _live_ viewing in a real browser (the `dev:*` servers) is for a human. They require Playwright Chromium (`npx playwright install chromium`, plus `sudo npx playwright install-deps chromium` on Linux) and a Vite server (auto-started unless `--url` is given). For the built-in tools the tool name is `examples` or `functional`; the external corpus is `reference` (below).

## One-shot capture

```
npm run capture:examples   [-- --filter=name --renderer=webgl,canvas --wait=500]
npm run capture:functional [-- --filter=name]
```

`capture:<tool>` navigates to each matching entry, waits two animation frames, screenshots, collects logs, and exits. Output lands in `tools/output/{tool}/{name}/{renderer}/`.

### Capture produced no output? Install the browser's system libraries — you have sudo

If a `capture:*` run stops **right after `Ready at http://…`** with no `screenshot.png`, an empty log, and often a **signal exit (130/144)** instead of a clear error, it is almost never your scene and almost never resource pressure — headless Chromium failed to launch because its **system libraries are missing** (`chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file`, Chromium exits 127, and the harness aborts). `capture:functional` / `capture:examples` do **not** surface this — it reads like a hang, which is a real misdiagnosis trap. Confirm in one line with a tiny Playwright launch (`chromium.launch()` logs the `libglib` error), then fix it **in this sandbox** (it grants sudo/install — do not defer baseline capture to the host):

```
sudo npx playwright install-deps chromium
```

After that, capture runs fully in-sandbox, **including WebGPU** (SwiftShader software Vulkan) — a `.webgpu.ts` scene reads back its frame the same as WebGL. If only the WebGPU leg then fails with "did not produce a render image" while an existing scene (e.g. `material-toon`) captures both legs, the fault is your scene's wgpu wiring, not the environment.

## Reference examples (external OpenFL/Starling/AwayJS corpus)

The reference examples live in a **separate** repo (`flight-reference`), not in this tree. When asked to "test/capture the `<name>` reference example" (e.g. `load-3ds`, `md5-animation`, `awd-suzanne`), use this — one command clones, builds against the local SDK, captures, and drops a PNG you read back:

```
npm run capture:reference -- --filter <name>   [--frames 2] [--fail-on-error] [--update-baseline] [--refresh]
npm run list:reference                          # print the case names you can filter on
```

- **First run auto-clones + installs** `flight-reference` into `.cache/flight-reference` (needs network + a few minutes); later runs reuse it. Pass `--refresh` to pull latest and reinstall.
- It starts flight-reference's Vite dev server pointed at **this** monorepo's source (`FLIGHT_REPO`), enumerates every framework/corpus/case with a Flight port, and captures the ones matching `--filter` (substring of `framework/corpus/case`, so `load-3ds` matches `awayjs/examples/basic-load-3ds`). Omit `--filter` to capture all.
- **Prerequisite:** Playwright Chromium — `npx playwright install chromium` and, on Linux, `sudo npx playwright install-deps chromium`. If it's missing the command tells you and exits.
- **Output** lands under `.artifacts/reference/{framework}/{corpus}/{case}/{renderer}/` (gitignored) — `screenshot.png` + `status.json`, same shape as below. Read the PNG with the `Read` tool.
- **3D scenes** read back the WebGL frame in-page (via a registered functional target), which is why a headless/Docker capture isn't a black rectangle. If a 3D reference case _does_ come back black, that case likely hasn't registered a functional target yet (the shared `scene3d.ts` and the inline-GL apps each publish one) — that's a flight-reference-side gap, not a capture failure.
- To view it live in a real browser instead (for a human — the agent uses capture): `npm run dev:reference -- <case>`.

## Eyes mode (`--observe`) — never "cannot capture"

A normal capture **fails closed** on a blank WebGL/WebGPU readback: it throws `WebGL verifier did not produce a render image` and writes _no_ screenshot — so a review dead-ends with nothing to look at. Add `--observe` (works on `capture:examples`, `capture:functional`, `capture:reference`) to **fail open** instead: it always writes a `screenshot.png` (best-available frame, black if the render truly produced nothing) plus an `observe` diagnostics block in `status.json`, and never gates or touches baselines.

```
npm run capture:reference -- --observe --filter <case>
npm run capture:functional -- --observe --filter <name>
```

Read the `observe` block to interpret what you're seeing without guessing:

```json
"observe": { "blank": true, "backend": "webgl", "verifyTargetKind": "webgl",
             "verifyPublished": false, "coverage": 0, "pageErrorCount": 0, "errorCount": 0 }
```

- `pageErrorCount > 0` → **broken code** (the page threw). Read `logs.jsonl` for the exception — this is a real bug to fix.
- `blank: true` + `pageErrorCount: 0` + `coverage ≈ 0` + a registered `verifyTargetKind` → the page **ran cleanly but rendered nothing**. On a simple scene this is a real bug; on a **heavy 3D scene** it's **UNKNOWN** (a software-GL quirk _or_ a specific render-path bug — not a proven limitation; see "Known failure modes" below). Verify on real hardware before concluding anything.
- `blank: false` / `coverage > 0` → something drew; just read `screenshot.png`.

Use `--observe` whenever a plain capture reports "did not produce a render image" — it converts that dead-end into an image plus a machine-readable reason.

## Known failure modes & verdicts — read before concluding "it's impossible"

This subsystem has several _distinct, silent_ failure modes; hitting a different one each run makes it feel nondeterministic ("saw it yesterday, doomed today"). Don't invent a unifying "it's broken" story — match the symptom to a known verdict. Most are already fixed; the rest have a settled answer, so start here instead of re-deriving it.

| Symptom | Verdict | Do this |
| --- | --- | --- |
| Capture prints `✓ ok` then the process **hangs** (never returns) | Was a real bug in the CLI exit path — **fixed** (`process.exit(0)` on success) | If it recurs, the dev-server child or a Playwright handle is keeping the loop alive; exit explicitly, don't `pkill` and call it broken |
| `--observe` blank, `pageErrorCount > 0` | **Your code threw** at load/run | Read `logs.jsonl` for the exception — a real bug to fix (this is how a stale import / `__name`-in-init-script surfaces) |
| `--observe` blank, `0` errors, `verifyTargetKind` set, `coverage ≈ 0` on a **heavy 3D scene** (skinning, IBL/cubemap, `rgba16f`) | **UNKNOWN, not impossible** — see the hard facts below | Don't call it a proven SwiftShader limit. Flag it; verify on real hardware; only dig deeper if you're specifically root-causing |
| `--observe` blank on a **2D / app-loop** scene at default frames, then fine with `--frames 5` | **Captured too early** (app-loop first tick hasn't drawn) — warmup **fixed** it | `observe.warmupFrames > 0` means it recovered on its own; nothing to fix |

**Hard environment facts (proven — do not re-run these experiments):**

- **You cannot move off SwiftShader in this sandbox.** Playwright's Chromium pins `SwiftShader Device … (ANGLE/Vulkan)` regardless of `--use-angle=gl`, `--use-gl=egl`, `--disable-features=Vulkan`, `GALLIUM_DRIVER=llvmpipe`, old headless, or `--in-process-gpu` (crashes). Mesa llvmpipe is installed but never selected. Swapping the GL backend is a dead end here.
- **SwiftShader is not the obvious wall.** The core GPU-skinning primitive — vertex-shader `texelFetch` of an `RGBA32F` texture — **works** on SwiftShader (verified). So a heavy-3D blank is _specific_, not "SwiftShader can't do skinning." It may be a real, fixable render-path bug or an opaque miscompile — but it is **not** an established hardware limitation. Treat it as unknown.
- WebGPU, WebGL2, Canvas, DOM all render in-sandbox (SwiftShader; see `agents/maturity-gaps.md`). Simple 3D (`basic-view`) renders fine; only some advanced scenes blank — which is why "blank" alone is never proof the code is broken.

## Watch capture (long-running — requires Playwright)

```
npm run capture:examples:watch [-- --filter=name --renderer=webgl]
npm run capture:functional:watch
```

`capture:<tool>:watch` does an initial capture of all matched entries, then watches source files and re-captures on change (800 ms debounce). Run it as a background process (in the sandbox or on a host) and just read the output files as they update — no polling, no watch loop in the agent.

## Baselines

```
npm run capture:examples:baseline   [-- --filter=name]
npm run capture:functional:baseline [-- --filter=name]
```

`capture:<tool>:baseline` writes the current screenshot's sha256 to `tools/baselines/{tool}/{name}/{renderer}/baseline.sha256`; `capture:baseline` (no tool) updates every tool. The committed baseline is the **hash text, not a PNG** — `tools/baselines/` stays small and git-diffable, and screenshots never enter git (`tools/**/*.png` is ignored). Every later capture re-hashes its screenshot and sets `status.json`'s `changed` from whether the hash matches. This needs a deterministic render: the harness sets `window.__flightCapture` before page scripts run, so an animated entry (a moving scene) can hold a fixed frame and stay byte-identical. Run baseline capture once after a rendering change is intentional, and commit `tools/baselines/`.

The `capture:*` baselines (screenshot hashes) are distinct from the `test:*:regression` fingerprint baselines — see `docs/conventions/npm-scripts.md`.

## Output files

Each captured entry writes three files into `tools/output/{tool}/{name}/{renderer}/`:

- `screenshot.png` — the rendered frame. Read it with the `Read` tool; Claude views it directly.
- `logs.jsonl` — one JSON object per line: `{ __flight, t, level, channel, data }`, where `level` is the severity name (`error`/`warn`/`info`/`debug`/`verbose`) and `channel` is the free tag (or null).
- `status.json` — written last (the commit point):
  ```json
  { "state": "ready|error", "capturedAt": <unix ms>, "error": null|"message",
    "hash": "<sha256>", "baselineHash": "<sha256>|null", "changed": true|false|null }
  ```
  `changed: null` = no baseline yet. `changed: true` = the screenshot hash differs from the committed baseline; read `screenshot.png` to see what changed. Check `capturedAt` against your last edit time to confirm the output is fresh. An `--observe` run adds an `observe` block (see Eyes mode above) and leaves `baselineHash`/`changed` null.

## Emitting logs from a scene

Logging lives in `@flighthq/log`, split so each consumer tree-shakes its half: examples/instrumentation import the lightweight **emit** side; the examples and capture harness import the **listener** side.

```typescript
import { log, logInfo, logVerbose, LogLevel } from '@flighthq/log';

logInfo({ msg: 'world matrix', tx: m[4] }, 'render'); // 2nd arg is the channel
logVerbose('capture-only detail', 'batch'); // below the default console threshold — captured, not printed
log(LogLevel.Warn, { flushReason: 'material', instanceCount: 15 }, 'batch');
```

`logError`/`logWarn`/`logInfo`/`logDebug`/`logVerbose` are sugar over `log(level, data, channel?)`. Emitting **no-ops until a sink is installed**, so the same calls are harmless in unit tests and shipped/ size builds (the emit side carries no console or formatting code — it tree-shakes to a forwarder). The capture sink records **every** level; the console prints only levels at or above `setLogConsoleLevel` (default `Info`). The harness installs the sink before loading the page, so module-init logs are captured.

## Typical loop

1. Start a watch on the host: `npm run capture:examples:watch -- --filter=myExample`.
2. Edit source. The watch re-captures automatically.
3. Read `tools/output/examples/myExample/webgl/screenshot.png` to see the frame.
4. Read `tools/output/examples/myExample/webgl/logs.jsonl` for structured output.
5. Check `status.json` if you need to confirm the output post-dates your last edit.
