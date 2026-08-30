# Bundle Size

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. Run a size command after changes to examples, package exports, barrels, renderer registration, dependencies, or anything that may affect tree-shaking.

## Two numbers, two commands

The subject splits by what the number *means*, and the two are not interchangeable.

| | `npm run size` | `npm run size:minified` |
| --- | --- | --- |
| pipeline | esbuild, **unminified**, tree-shaken | Rollup + terser (`passes: 3`, property mangling) |
| answers | *how much code did this keep* | *how many bytes does this ship* |
| baseline | `tools/size/size.unminified.baseline.json` | `tools/size/size.baseline.json` |
| cost | ~1 minute cold, ~3s from cache | ~10 minutes |
| where | every PR, and while you work | nightly |
| gates | never — always exits 0 | fails a case over its pin |

**Only `size:minified` produces a shipping number.** The unminified figure runs about 1.58× larger
(measured range 1.42–1.82 across the 139 cases), so quoting it as bundle cost overstates by half.
It exists because tree-shaking is the thing most changes actually affect, and esbuild and Rollup
agree far more closely on *what survived* than their minifiers agree on *how small it packs*.

`npm run size` is the one to reach for by default. It compares against its own committed baseline,
reports in both directions, and suppresses movement below `max(32 B, 0.25%)` — a band set at 3× the
largest run-to-run drift observed, so an unchanged tree stays quiet while a newly-reachable function
(hundreds of bytes, spread across every bundle that reaches it) shows up plainly.

## `size` reports; it does not gate — deliberately

**`npm run size` is not wired into `npm run check`, and that is the design, not an oversight.** A gate
that goes red on intentional growth pushes an agent toward `npm run size:baseline` to clear it — which
an agent may not do in any case, see [below](#do-not-rewrite-the-baseline) — and
that rewrite re-pins to the new measurement unconditionally, at any magnitude, granting a fresh
allowance above the higher floor. **Gating would manufacture the laundering it was meant to prevent.**
The invariant above is enforced by a person reading the report, not by a failing exit code.

Recorded 2026-08-10 after four agents independently read the absence as a defect and one proposed
wiring it. Nothing in this file said otherwise, and **a design decision recorded nowhere is
indistinguishable from an oversight.**

Two consequences worth knowing when you read a delta:

- **The report identifies the pin's age.** In a Git checkout, `npm run size:minified` shows the
  last-change commit and author date for each `tools/size/size.baseline.json` entry (`@unknown` means
  that provenance is unavailable), so you can inspect the comparison point rather than assume it is
  current. The pin can still include drift from earlier work.
- **For any figure you intend to report, measure parent-versus-commit on the same tree.** A delta
  against a pin of unknown age attributes everyone else's accumulated drift to your change. This is
  not advice you have to follow by hand: `npm run size` caches each tree it measures, so

  ```sh
  git stash && npm run size && git stash pop && npm run size -- --ref=HEAD
  ```

  reports your change in isolation. It became practical only when the sweep dropped to a minute —
  at ten minutes a run, nobody measured twice, which is how a `+0.02 KB` figure read off a stale pin
  once reached a ruling when the honest isolated number was 19 bytes.
- **A missing baseline reports `passed`.** A key with no pin has no threshold, so a new fixture enters
  unbounded and the truthful output would be "no baseline", not a pass.

## The screw and the lawnmower

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Command surface

Four names, two subjects. Each check **reads** under its bare name and **writes** under `:baseline`.

- `npm run size` — unminified sweep, reported against the committed unminified baseline.
- `npm run size collision` — filter by example name. `render=canvas` filters by renderer, and the two
  combine: `npm run size collision render=webgl`.
- `npm run size -- --ref=<commit>` — compare against a commit you measured earlier rather than the
  baseline. This is the parent-versus-commit mode; the reference must already be in the cache.
- `npm run size report=json` — machine-readable, carrying both `raw` and `gzip` bytes per case.
- `npm run size:baseline` — rewrite the unminified baseline.
- `npm run size:minified` — the terser sweep. Interactively it refuses a bare full run and tells you
  the cost; pass a filter or `-- --yes`. Also takes `report=json` and `output=<path>` (which prints
  `SIZE_REPORT_PATH:<path>`).
- `npm run size:minified:baseline` — rewrite the shipping pins. **Not an agent's call.** See below.
- `npm run size:minified flight-diagnostics log-console` — build the release-stub/diagnostics pair,
  report the diagnostics gzip delta, and measure the log emitter plus console sink.
  The release build owns the canonical `flight-diagnostics:canvas` baseline key; the un-stubbed
  build is its mechanically derived `flight-diagnostics:canvas:diagnostics` variant.

Measurements are cached per tree under `.cache/size-fast/` (gitignored), so re-running `npm run size`
on an unchanged tree answers in about three seconds instead of re-measuring.

## Do not rewrite the baseline

**An agent does not run `npm run size:minified:baseline` without the user's explicit permission.**
Those pins are the user's record of what this SDK costs, and a rewrite is how a real increase stops
being visible: the number that would have shown up at merge is replaced by one that agrees with the
change that caused it.

This is why `size` reports rather than gates — there is no red to clear, so there is no pressure to
clear it. **Report the delta and leave the pin alone.** If a change legitimately costs bytes, that is
a fact for the user to see and accept, not one for the tool to absorb.

**`npm run size:baseline` is a different act and carries no such restriction.** The unminified
baseline is not a cost claim — nothing quotes it as what the SDK ships — so rewriting it launders
nothing. It is a record of what the tree currently shakes to, and its diff is the size report a
reviewer reads. Update it when a change legitimately moves it, the way you would a lockfile.

Measure honestly and say so: `npm run size <example>` for the affected fixture, and
parent-versus-commit for any figure you intend to report. The unminified sweep is a minute over all
139 cases and seconds from cache; the terser sweep is the slow one.

### ACCEPTED-BUT-UNWRITTEN — the shape bounds registry, 2026-08-13

**The `shapes` pins in `size.baseline.json` disagree with the tree on purpose. Do not close the gap.**
The user's instruction is that the baseline number is not to be written, and it outranks any earlier
ruling; what has to survive is the reasoning, not the number.

Accepted at **net −3,320 gzip**. GL and WGPU pay for cursor/context/traversal machinery they never
needed — they always called the kernel directly — without the outline-stack removal that pays for it
on the other three lanes. And **"GL/WGPU barely move" was a design guarantee that turned out wrong as
stated**, which is the part worth keeping: the pins now record a prediction that failed, and a rewrite
would erase the evidence that it failed.

This entry exists because **an un-updated pin looks exactly like an overlooked chore.** A future
reader finds a stale-looking number, one command away from tidy, and no reason not to. The reason is
here. Nothing in the tooling can express "deliberately not updated" — `size:minified` will keep
failing these cases nightly, and that red is the intended state, not a task.

## Size fixtures vs examples

**Size measurement must not depend on examples.** Examples exist to demonstrate usage — under the explicit dependency model they will naturally import `webHost`, `scene2dGlPipeline`, and other whole-store consts, because convenience is the point of a demo. Measuring those tells you "the whole store is this big," which is not the interesting question. The interesting questions are:

- What does a **minimal app** cost?
- What does **adding one feature** cost?
- Does the **whole-store const** (`webHost`, `scene2dGlPipeline`) cost more than the sum of its parts?
- Is the cost of a **manual pipeline** with one renderer honest?

These require purpose-built fixtures that control exactly what is imported. Today's 7 dedicated fixtures under `tools/size/fixtures/` are the right shape — the ~132 example-derived measurements become a secondary check (do examples grow unexpectedly?) rather than the primary cost surface.

### Where fixtures live

`tools/size/fixtures/`, one directory per fixture, same structure as today:

```
tools/size/fixtures/
  sprite-only/           ← minimal: one renderer, one texture resolver
  sprite-text/           ← sprite + text label
  full-2d-gl/            ← scene2dGlPipeline — the whole-store 2D cost
  manual-pipeline/       ← manual createGlPipeline with one renderer
  host-web-full/         ← webHost — the whole-store host cost
  host-web-window-only/  ← webWindowBackend alone
  scene2d-gl-pipeline/   ← scene2dGlPipeline — the whole-store 2D pipeline cost
  scene2d-gl-pipeline-sprite/ ← manual pipeline with one renderer
  effects-gl/            ← sprite + one effect runner
  ...
```

Each fixture is a standalone workspace package (`"private": true`, `"flightSize": { "name": "..." }`), measured per backend just like examples. Fixture names describe the import profile, not a feature or a demo.

### Structural validity — not a blank screen

A size fixture must represent a **real import graph that would render pixels**. The bundler's tree-shaking is reachability-based: if a fixture imports `spriteRenderer` and threads it through `createGlPipeline → createGlRenderState → render`, the bundler retains the full render path. If it only imports the symbol and assigns it to a `Reflect.set(globalThis, ...)` escape hatch, it retains the symbol but may eliminate internal branches that the real call chain would keep alive.

The structural validity floor:

1. **Construct the full call chain.** Host (or raw context) → context state → pipeline → render state → at least one node → `prepareScene2DRender` → `render*Scene2D`. This is code that would produce pixels in a browser. It does not need to run.
2. **Use the `Reflect.set(globalThis, ...)` escape only for the terminal value** — the render call's result or a node reference. The escape prevents the bundler from eliminating the entire fixture as dead code. It must sit at the END of the call chain, not in the middle, so every intermediate construction is reachable.
3. **No synthetic shortcuts.** Don't import a renderer without threading it into a pipeline. Don't create a pipeline without passing it to a render state. Don't create a render state without calling render through it. Each fixture is a skeleton app, not a bag of imports.

### Capture for validity evidence

Size fixtures should also be **capturable** — runnable through the visual-capture tool to produce a screenshot proving the fixture renders visible output. This is a secondary check, not the primary measurement:

- A fixture that measures 18 KB but renders a blank screen has a bug in its call chain — the 18 KB is a lie about what the feature costs, because the feature isn't working.
- A fixture that measures 18 KB and renders a blue rectangle with a sprite is honest — that's what the import graph costs when it actually works.

Capture is not pixel-perfect regression (that's functional tests' job). It is **existence evidence**: the fixture produces output, therefore the measured import graph is the real one. A blank capture is a failing fixture, regardless of its byte count.

Captures live alongside the fixtures: `tools/size/fixtures/<name>/baseline.png`. They are captured once when the fixture is authored and re-captured when the fixture's imports change structurally. They are not regression-tested frame-by-frame — a visual spot-check that something rendered is sufficient.

### Coverage adequacy

The pipeline is the coverage map. Every registry family that can be included or excluded is a dimension:

- **Extremes**: bare minimum (one renderer, one resolver) and full pipeline (the whole-store const). These are the floor and ceiling.
- **Single-addition deltas**: bare + text, bare + shape, bare + effects, bare + tilemap. Each tells you what one feature costs over the floor.
- **Host extremes**: full `webHost` vs single-backend imports (`webNetBackend`, `webAudioDeviceBackend`).
- **Cross-cutting**: SWF import (already exists), format loading, diagnostics overhead (already exists).

A fixture is missing if a registry family has no dedicated measurement — no fixture where it is the only addition over the baseline. The `explain()` diagnostic (when built) can validate this from the other direction: a fixture whose explain report shows unused registrations is either too broad or documenting whole-store cost intentionally.

### Transition

The existing 7 fixtures stay as-is. New fixtures are added as the explicit dependency model lands — each new const (`scene2dGlPipeline`, `webHost`, manual pipeline variants) gets a size fixture on arrival. Example-derived measurements remain in the baseline as a secondary signal but are no longer the primary cost surface. Examples are free to import `@flighthq/sdk`, `webHost`, and other convenience consts for clarity without distorting the size story.

## Paired comparisons — aggregate vs single-capability

Each whole-store const has a single-capability counterpart fixture. The pair answers: does tree-shaking exclude unused registrations? A substantially smaller counterpart means yes; close numbers mean one renderer or family drags the rest.

| Pair | Aggregate | Counterpart | Delta | % smaller | Ratio |
| --- | --- | --- | --- | --- | --- |
| **Pipeline** (`scene2d-gl-pipeline:webgl` / `scene2d-gl-pipeline-sprite:webgl`) | 43,217 B | 14,271 B | 28,946 B | 67.0% | 3.03× |
| **webHost** (`host-web-full:canvas` / `host-web-window-only:canvas`) | 12,811 B | 3,391 B | 9,420 B | 73.5% | 3.78× |

Both unminified tree-shaken gzip. The pipeline pair was measured at tree `99091faf5`; the webHost
aggregate reflects the later Accessibility R3 baseline at `6b6238e9e`.

**Interpretation (fixed):** sprite-only is ~67% smaller than the full pipeline — tree-shaking works and the aggregate measures the honest whole store. The webHost pair shows the same pattern at ~74% smaller. A ratio above 2× is the healthy signal; a ratio near 1× would mean a single capability drags most of the aggregate, which is a decomposition defect.

## The discipline these numbers protect

- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger — unless the size tradeoff is intentional and measured.
- In examples, prefer small package imports when the example intentionally demonstrates low-level or tree-shaken usage. Use `@flighthq/sdk` only for examples meant to demonstrate application-level convenience.
- Example render adapters enable authoring diagnostics. The size build replaces only that
  `enableFlightDiagnostics(state)` call with a no-op, so ordinary baselines continue to measure the
  release import graph; the diagnostics variant preserves the call and console to track its explicit
  overhead.
