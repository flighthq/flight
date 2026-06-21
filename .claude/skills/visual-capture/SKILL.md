---
name: visual-capture
description: Capture screenshots and structured logs from Flight examples, functional tests, and the landing page, then read them back to verify rendering. Use when you need to SEE what a renderer drew (debug a visual bug, confirm a change looks right across backends), set or update a screenshot baseline, or interpret the screenshot.png / logs.jsonl / status.json output files. Covers one-shot capture, watch mode, baselines, and emitting logs from a scene.
---

# Visual capture and agent feedback

Two scripts turn examples and functional tests into screenshot + log output an agent can read directly.
They require Playwright browsers (`npx playwright install chromium`) and a running Vite server (the
scripts auto-start one unless `--url` is given). The tool name is one of `examples`, `functional`, or
`landing`.

## One-shot capture

```
npm run capture:examples   [-- --filter=name --renderer=webgl,canvas --wait=500]
npm run capture:functional [-- --filter=name]
npm run capture:landing    [-- --filter=name]
```

`capture:<tool>` navigates to each matching entry, waits two animation frames, screenshots, collects
logs, and exits. Output lands in `tools/output/{tool}/{name}/{renderer}/`.

## Watch capture (host only — requires Playwright)

```
npm run capture:examples:watch [-- --filter=name --renderer=webgl]
npm run capture:functional:watch
npm run capture:landing:watch
```

`capture:<tool>:watch` does an initial capture of all matched entries, then watches source files and
re-captures on change (800 ms debounce). An agent in a sandbox just reads the output files as they update
— no polling, no watch loop in the agent.

## Baselines

```
npm run capture:examples:baseline   [-- --filter=name]
npm run capture:functional:baseline [-- --filter=name]
npm run capture:landing:baseline    [-- --filter=name]
```

`capture:<tool>:baseline` writes the current screenshot's sha256 to
`tools/baselines/{tool}/{name}/{renderer}/baseline.sha256`; `capture:baseline` (no tool) updates every
tool. The committed baseline is the **hash text, not a PNG** — `tools/baselines/` stays small and
git-diffable, and screenshots never enter git (`tools/**/*.png` is ignored). Every later capture re-hashes
its screenshot and sets `status.json`'s `changed` from whether the hash matches. This needs a
deterministic render: the harness sets `window.__flightCapture` before page scripts run, so an animated
entry (the landing hero) can hold a fixed frame and stay byte-identical. Run baseline capture once after a
rendering change is intentional, and commit `tools/baselines/`.

The `capture:*` baselines (screenshot hashes) are distinct from the `test:*:regression` fingerprint
baselines — see `docs/conventions/npm-scripts.md`.

## Output files

Each captured entry writes three files into `tools/output/{tool}/{name}/{renderer}/`:

- `screenshot.png` — the rendered frame. Read it with the `Read` tool; Claude views it directly.
- `logs.jsonl` — one JSON object per line: `{ __flight, t, level, channel, data }`, where `level` is the
  severity name (`error`/`warn`/`info`/`debug`/`verbose`) and `channel` is the free tag (or null).
- `status.json` — written last (the commit point):
  ```json
  { "state": "ready|error", "capturedAt": <unix ms>, "error": null|"message",
    "hash": "<sha256>", "baselineHash": "<sha256>|null", "changed": true|false|null }
  ```
  `changed: null` = no baseline yet. `changed: true` = the screenshot hash differs from the committed
  baseline; read `screenshot.png` to see what changed. Check `capturedAt` against your last edit time to
  confirm the output is fresh.

## Emitting logs from a scene

Logging lives in `@flighthq/log`, split so each consumer tree-shakes its half: examples/instrumentation
import the lightweight **emit** side; the examples and capture harness import the **listener** side.

```typescript
import { log, logInfo, logVerbose, LogLevel } from '@flighthq/log';

logInfo({ msg: 'world matrix', tx: m[4] }, 'render'); // 2nd arg is the channel
logVerbose('capture-only detail', 'batch'); // below the default console threshold — captured, not printed
log(LogLevel.Warn, { flushReason: 'material', instanceCount: 15 }, 'batch');
```

`logError`/`logWarn`/`logInfo`/`logDebug`/`logVerbose` are sugar over `log(level, data, channel?)`.
Emitting **no-ops until a sink is installed**, so the same calls are harmless in unit tests and shipped/
size builds (the emit side carries no console or formatting code — it tree-shakes to a forwarder). The
capture sink records **every** level; the console prints only levels at or above `setLogConsoleLevel`
(default `Info`). The harness installs the sink before loading the page, so module-init logs are captured.

## Typical loop

1. Start a watch on the host: `npm run capture:examples:watch -- --filter=myExample`.
2. Edit source. The watch re-captures automatically.
3. Read `tools/output/examples/myExample/webgl/screenshot.png` to see the frame.
4. Read `tools/output/examples/myExample/webgl/logs.jsonl` for structured output.
5. Check `status.json` if you need to confirm the output post-dates your last edit.
