# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable 2D rendering SDK. The goal is to cover the full feature set of OpenFL and Lime — every capability they offer should be reachable here — without adopting their API shape or their reliance on implicit, stateful runtime behavior. It is written with AI code agents and a future C/C++ port of this codebase in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, package manifests, and generated API output. Use this file for project-level rules and architecture that are hard to infer from one or two files. Read it once at the start of each session; revisit the relevant section when a task touches package shape, exports, examples, rendering, graph internals, or publishing.

## Pre-Release Status and API Philosophy

Flight has not shipped to public users. There are no published consumers, no migration paths to maintain, and no backwards-compatibility obligations. Every API decision is foundational, not incremental. When something is wrong, rename it, restructure it, or remove it — do not accumulate workarounds for past choices.

Agent sessions are a direct part of shaping this API. The goal is not to implement tickets against a fixed design; it is to work toward a mature, deliberate golden path where every exported name, parameter order, and module boundary is something worth keeping. Treat naming, module shape, and API symmetry as first-class outputs of any task, not cosmetic concerns to defer.

The cellular architecture supports this directly. Each package and feature area is designed to grow — more renderers, more filter types, more graph families — without coupling to the rest of the SDK. A well-bounded feature is one a user can import in isolation and understand in full. The module graph and tree-shaking are not just performance concerns; they enforce that each feature stands on its own. If adding something forces a user to pull in unrelated weight, that is a design signal: the boundary is wrong or the abstraction is premature.

Approach every feature as if it is the final shape. Pre-release is the time to get this right.

Unless a task specifies otherwise, the goal when working on a feature area is to bring it to AAA completeness — implemented using industry-recognized terms and patterns, canonical in scope and naming. When a package is labeled `particles`, an agent should expect to find — and build toward — everything a developer would look for in a mature particles library: emitters, spawn rules, lifetime, forces, blending, pooling, and so on. This applies throughout the codebase. Packages are meant to be mature sub-libraries, not thin stubs. A feature area that is partially built is unfinished work, not a design choice.

When gaps in completeness are identified during a task, the default is to add them to the current task list and address them within the session. Gaps that cross package boundaries, require a design decision, or are too large for the current scope should be surfaced to the user as a suggestion rather than acted on autonomously.

## Relationship to OpenFL and Lime

OpenFL and Lime define the feature target, not the API. When deciding what to build, aim to support what they support — display objects, shapes, filters, blend modes, text, tilemaps, particle emitters, audio/video, and so on. When deciding how to expose it, design from scratch around Flight's constraints instead of mirroring OpenFL's classes, property setters, or implicit runtime behavior.

In practice:

- Prefer explicit data over runtime objects with hidden behavior. A filter is a plain data descriptor applied by an explicit per-backend function (a Canvas/CSS filter string or a multi-pass WebGL shader), not a `BitmapFilter` instance assigned to `displayObject.filters` that the runtime quietly applies on the next frame.
- Prefer plain values over wrapper types and accessors. Colors are packed RGBA integers (for example `0xeeddccff`) with one consistent convention across the SDK, not a color type or a mix of RGB-with-separate-alpha conventions.
- Prefer small, side-effect-free functions with explicit inputs and `out` parameters over methods that mutate shared state. Nothing "magic" should happen internally that the caller did not ask for: rendering, allocation, and update passes are all things the caller invokes by name.
- Accept more verbose user code when it buys clarity. Spelling out renderer registration, the pre-render update pass, and allocation is preferred over convenience that hides where work and memory go. Examples demonstrate this verbosity on purpose.

When a feature exists in OpenFL but the natural OpenFL API would require hidden state, eager side effects, or non-tree-shakable coupling, redesign the API to fit Flight's rules and keep the feature. The feature is the goal; the API shape is ours to choose.

## Ground Rules

- Unless instructed otherwise, assume work is scoped to the current worktree and its primary package domain. Do not reach across package boundaries automatically. If a task appears to require changes in another package, raise it as a question or suggestion rather than proceeding.
- Use `npm`, not `pnpm` or `yarn`.
- After editing source files, run `npm run fix` to apply linting, ordering, and formatting in one step. This is not optional. Unformatted or unlinted code will fail CI.
- Keep modules tree-shakable, and expose each package through a single root `.` entry — do not add per-file `exports` subpaths. Because every package is `"sideEffects": false`, importing from the root barrel tree-shakes identically to importing an individual module, so subpaths buy no bundle savings; they only add public surface and couple the published API to internal file names. Avoid forcing convenience APIs into low-level users' bundles by keeping the barrel a thin re-export, not by splitting entry points.
- Packages are designed to be import side-effect-free and declare `"sideEffects": false`. Do not register renderers, patch globals, start listeners/timers, or mutate shared state at module top level. Expose explicit `register*`, `init*`, or `create*` functions instead, and let callers opt in.
- Packages must not import from `@flighthq/sdk`. Examples usually import from `@flighthq/sdk` when demonstrating application usage, but may import individual packages when intentionally demonstrating lower-level or tree-shaken usage.
- Shared types — interfaces, type aliases, and kind symbols that cross package boundaries — belong in `@flighthq/types`. Do not define cross-package types inline in individual package files. Treat `@flighthq/types` as the codebase's header layer: the full API shape should be navigable from it alone, without importing any implementation packages. When building a new feature, define its types in `@flighthq/types` first, then implement against them — the header is the design surface.

## Design Constraints

- Exported function names include the full, unabbreviated name of the type they operate on. `getSurfaceWidth` in isolation leads directly to the surface domain; `getDisplayObjectBounds` to display objects. A function should be globally self-identifying without context. Never abbreviate type names in function names.
- Prefer globally unique exported function names, especially from package roots and the SDK barrel.
- Choose names — for packages, types, functions, and parameters — whose meaning transfers instantly and precisely. A word like `surface`, `timeline`, or `emitter` carries shared expectations; that shared understanding is a valid design signal. If a name requires explanation, look for a more precise word. Vocabulary should have an "obvious" quality to it: the right word is the one a reader would have reached for independently.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `dispose*` and `destroy*` are distinct teardown verbs, not synonyms. `dispose*` releases what keeps an entity reachable — detaching listeners, clearing observer registries — so it becomes eligible for garbage collection; the entity is plain GC-managed memory with nothing to free. `destroy*` immediately and deterministically frees a non-GC resource the entity owns (GPU framebuffers/textures, native handles), leaving the entity invalid. Choose by what teardown does: detach-and-release-to-GC → `dispose*`; free-a-resource-now → `destroy*`. (`release*` stays reserved for pool/cache `acquire`/`capture` brackets.)
- Use `Readonly<T>` everywhere mutation is not intended — function parameters, intermediate bindings, return types, and stored references. Default to `Readonly<>` and opt out only when mutation is deliberate. This mirrors C++ `const`: if it does not need to change, it should be marked so. Applies to object types and references; primitive values (`number`, `string`, `boolean`) do not require it. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is the same object as one input unless the function documents otherwise. Read all input values into locals before writing any output fields to avoid clobbering a value you still need to read.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Keep APIs portable to C/C++ idioms: prefer free functions over classes, explicit ownership over GC-reliant patterns, reusable value types over deep object hierarchies, and clear allocation boundaries over hidden allocation. Functions, not methods, as the default unit.
- Return sentinel values (`null`, `false`, or `-1`) for expected failure cases — missing results, invalid lookups. Throw only for programmer errors: precondition violations that represent API misuse and should never occur in correct code. Do not validate internal invariants that correct usage cannot reach, and do not introduce error-wrapping types.
- Use signals (`@flighthq/signals`) when an event may have multiple listeners, requires priority ordering, or supports cancellation — loose notification across the public API. Users opt into specific signal groups via `enable*` functions (for example `enableDisplayObjectSignals`), which is when the associated cost is assumed. These functions live in the package that owns the entity, not in `@flighthq/signals`. Use direct callbacks for strict internal wiring where a single callsite is guaranteed and loose dispatch is unnecessary.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.
- Loose module variables, pools, constants, and scratch objects usually belong at the bottom of the file after exported functions. This keeps the public API surface easy to scan first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, or architecture. Do not comment obvious assignments.
- Accessor and getter functions use the `get*` prefix. Boolean-returning functions use `has*` or `is*`.
- Leave touched files cleaner than you found them.

## Bundle Size Discipline

This SDK should behave like a hardware store: users can import one small tool without pulling in the whole building.

- `npm run size` is the direct size-reporting command and the preferred command for agents.
- `npm run size piratepig` filters by example name.
- `npm run size piratepig report=json` prints machine-readable JSON for easier agent parsing.
- `npm run size piratepig output=size-report.json` writes a JSON report file and prints `SIZE_REPORT_PATH:<path>`.
- `npm run size render=canvas` filters by renderer. Filters can be combined, for example `npm run size piratepig render=webgl report=json`.
- Prefer small package imports in examples when the example is intentionally demonstrating low-level or tree-shaken usage. Use `@flighthq/sdk` in examples that are meant to demonstrate application-level convenience.
- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger unless the size tradeoff is intentional and measured.

## Checkpoints

Run these at the points listed. Each check is fast; skipping them causes cascading failures that are slower to debug than the check itself.

- Run `npm run packages:check` after package-level changes: manifests, workspace references, exports, build targets, or side-effect behavior. Fix everything it reports before moving on — it catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- Run `npm run test:completeness` after adding, removing, or renaming exported functions to confirm every export has a colocated test.
- Run `npm run order` after adding, removing, or renaming exported functions or test `describe` blocks. Use `npm run order:fix` to rewrite order automatically.
- Run `npm run api` after public API changes to scan signatures and naming symmetry across packages.
- Run `npm run size` after changes to examples, package exports, barrel files, renderer registration, dependencies, or anything that may affect tree-shaking.
- Run the closest meaningful tests while iterating: a touched test file, a package workspace, or a Vitest project filter. Broaden once the local behavior is understood.
- Run `npm run check` for narrower completed changes. Run `npm run ci` before calling broad refactors, public API reshapes, example changes, packaging changes, or tree-shaking-sensitive work done.
- When adding a new package, copy the package shape from a nearby package, then run `npm run packages:check`. A package may spawn focused neighbor packages using a `-subpackage` suffix (for example `@flighthq/tween-easing` alongside `@flighthq/tween`) when the scope is clearly bounded and the split keeps both packages tree-shakable.

## Orientation Commands

- `npm run fix` runs all auto-fixers in sequence: `lint:fix`, `order:fix`, then `format`. Run this after any edit session before committing.
- `npm run api` prints compact exported function signatures for all packages.
- `npm run api <query>` filters packages and exported functions by the given query. Example: `npm run api application` or `npm run api --function register`.
- `npm run api:json` prints the same API data as JSON for tools and agents.
- `npm run check` is the default non-fixing quality sweep for agents and contributors. It runs `packages:check`, `typecheck`, `lint`, `format:check`, `order:check`, and `test:completeness`.
- `npm run packages:check` checks monorepo shape, package references, workspace dependency conventions, package export targets, packaging shape, and side-effect-free source invariants.
- `npm run test:completeness` checks for missing test files and missing tests for exported functions.
- `npm run order` reports exported functions and test `describe` blocks that are not alphabetized. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up. `npm run order:fix` rewrites files in place to apply the correct order; comments immediately preceding a declaration (with no blank line between them) are treated as attached and move with it.
- `npm run test` runs the normal root Vitest workspace, excluding the heavier `size` project. This is usually faster than chaining package/API/integration test scripts separately.
- `npm run size` builds matching examples and reports gzip output size against the baseline. It supports filtered runs, JSON reporting, and output file paths.
- `npm run functional` launches the functional test tool in `tools/functional`, a browser dev server that runs each functional test across its renderers (Canvas/DOM/WebGL) for visual and behavioral checks you cannot get from jsdom unit tests.
- `npm run capture:check` is the visual regression gate: captures every tool, compares each screenshot against its committed baseline, and exits 1 if any has changed. Run after committing baselines. `capture:explorer:check`, `capture:functional:check`, and `capture:landing:check` run each tool independently.

## Visual Capture and Agent Feedback

Two scripts produce screenshot and log output from examples and functional tests. They require Playwright browsers (`npx playwright install chromium`) and a running Vite server.

### One-shot capture

```
npm run capture:explorer [-- --filter=name --renderer=webgl,canvas --wait=500]
npm run capture:functional [-- --filter=name]
npm run capture:landing [-- --filter=name]
```

`capture:<tool>` captures one tool (`explorer`, `functional`, or `landing`), auto-starting the Vite server if `--url` is not given. It navigates to each matching entry, waits two animation frames, screenshots, collects logs, and exits. Output lands in `tools/output/{tool}/{name}/{renderer}/`.

### Watch capture (host only — requires Playwright)

```
npm run capture:explorer:watch [-- --filter=name --renderer=webgl]
npm run capture:functional:watch
npm run capture:landing:watch
```

`capture:<tool>:watch` auto-starts the Vite server, does an initial capture of all matched entries, then watches source files and re-captures on change (800ms debounce). An agent inside a sandbox reads the output files directly — no polling, no watch loop in the agent.

### Baselines

```
npm run capture:explorer:baseline [-- --filter=name]
npm run capture:functional:baseline [-- --filter=name]
npm run capture:landing:baseline [-- --filter=name]
```

`capture:<tool>:baseline` writes the current screenshot's sha256 to `tools/baselines/{tool}/{name}/{renderer}/baseline.sha256`; `capture:baseline` (no tool) updates every tool at once. The committed baseline is the hash text, not a PNG — `tools/baselines/` stays small and git-diffable, and screenshots never enter git (`tools/**/*.png` is ignored). Every subsequent capture re-hashes its screenshot and sets `status.json`'s `changed` from whether the hash matches. This requires a deterministic render: the capture harness sets `window.__flightCapture` before page scripts run, so an animated entry (the landing hero) can hold a fixed frame and stay byte-identical. Run baseline capture once after a rendering change is intentional; commit `tools/baselines/` to git.

### Output files

Each captured entry writes three files:

- `screenshot.png` — rendered frame. Read with the `Read` tool; Claude can view it directly.
- `logs.jsonl` — one JSON object per line: `{ __flight, t, level, channel, data }`, where `level` is the severity name (`error`/`warn`/`info`/`debug`/`verbose`) and `channel` is the free tag (or null).
- `status.json` — written last (the commit point). Shape:
  ```json
  { "state": "ready|error", "capturedAt": <unix ms>, "error": null|"message",
    "hash": "<sha256>", "baselineHash": "<sha256>|null", "changed": true|false|null }
  ```
  `changed: null` means no baseline exists yet. `changed: true` means the screenshot hash differs from the committed baseline hash; read `screenshot.png` in the output dir to see what changed. Check `capturedAt` against the time of your last source edit to confirm the output is fresh.

### Emitting logs from examples and functional tests

Logging lives in the `@flighthq/log` package, split so each consumer tree-shakes its half: examples and instrumentation import the lightweight **emit** side; the explorer and capture harness import the **listener** side. One package owns the contract.

```typescript
import { logInfo, logVerbose, log, LogLevel } from '@flighthq/log';

logInfo({ msg: 'world matrix', a: m[0], b: m[1], tx: m[4] }, 'render'); // 2nd arg is the channel
logVerbose('capture-only detail', 'batch'); // below the default console threshold — capture only
log(LogLevel.Warn, { flushReason: 'material', instanceCount: 15 }, 'batch');
```

`logError`/`logWarn`/`logInfo`/`logDebug`/`logVerbose` are sugar over `log(level, data, channel?)`. Emitting **no-ops until a sink is installed**, so the same calls are harmless in unit tests and in shipped/size builds (the emit side carries no console or formatting code — it tree-shakes to a forwarder). Levels gate visibility: the capture sink records **every** level; the console prints only levels at or above `setLogConsoleLevel` (default `Info`). The harness installs the sink (`setLogSink(createConsoleCaptureSink())`) before loading the example, so module-init logs are captured.

### Agent workflow with capture watch

1. Start the watch on the host: `npm run capture:explorer:watch -- --filter=myExample` (auto-starts the server).
2. Edit source files. The watch detects changes and re-captures automatically.
3. Read `tools/output/explorer/myExample/webgl/screenshot.png` with the `Read` tool to see the rendered frame.
4. Read `tools/output/explorer/myExample/webgl/logs.jsonl` to see structured log output.
5. Check `status.json` if you need to confirm the output post-dates your last edit.

## Writing Functional Tests

Functional tests live in `tests/functional/{testName}/`. Each test renders a scene across one or more backends and is validated visually — the screenshot is compared against a committed baseline, and `logs.jsonl` carries any structured log output. There is no programmatic assertion primitive yet; runtime failures surface as `pageerror` entries in `logs.jsonl` and as visual differences from the baseline.

Write a functional test when:

- The behavior involves rendering that jsdom unit tests cannot exercise (transforms, blending, clipping, filters, WebGL specifics, text layout).
- You want a persistent visual record of how a feature looks across backends.
- You want to detect rendering regressions automatically.

Agents are expected to generate new functional tests when implementing or verifying visual rendering behavior.

### Required file structure

```
tests/functional/{testName}/
├── package.json
└── src/
    ├── app.ts              ← scene setup; imports { height, render, scale, width } from ./render
    ├── render.ts           ← barrel: export * from './render.canvas'
    ├── render.canvas.ts    ← Canvas2D setup + render()
    ├── render.dom.ts       ← DOM setup + render()  (include when DOM renderer applies)
    └── render.webgl.ts     ← WebGL setup + render()
```

`render.webgpu.ts` is optional. `discoverEntries()` includes a test only when `package.json` exists and at least one `src/render.*.ts` file exists. The vite harness routes `/tests/{name}/{renderer}/` requests to the matching renderer file. The `render.ts` barrel is required for TypeScript to resolve the `./render` import in `app.ts` even though the harness overrides it at runtime.

### package.json

```json
{
  "name": "functional-test-{testName}",
  "private": true,
  "type": "module",
  "dependencies": {
    "@flighthq/sdk": "*"
  }
}
```

### app.ts

`app.ts` is a top-level async module. Build the scene tree and call `render(root)` at the end. The vite harness resolves `./render` to the active backend file.

```typescript
import { addNodeChild, createDisplayContainer } from '@flighthq/sdk';
import { height, render, scale, width } from './render';

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;
// build scene using (width / scale) and (height / scale) as logical dimensions
render(root);
```

`app.ts` may be `async` — `await` freely for asset loading (e.g. `loadImageSourceFromURL`).

### render.\*.ts

Each renderer file must export four constants and one function. Copy the pattern from an existing test — `clip`, `fill`, and `blend-mode` are clean references. Register only the node kinds your test uses.

```typescript
import type { DisplayObject } from '@flighthq/sdk';
import {
  ShapeKind,
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLShapeRenderer,
  defaultWebGLShapeCommands,
  prepareDisplayObjectRender,
  registerRenderer,
  registerWebGLShapeCommands,
  renderWebGLBackground,
  renderWebGLDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebGLCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createWebGLRenderState(canvas, { backgroundColor: 0xffffffff });
registerRenderer(state, ShapeKind, defaultWebGLShapeRenderer);
registerWebGLShapeCommands(defaultWebGLShapeCommands);
export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderWebGLBackground(state);
  renderWebGLDisplayObject(state, root);
}
```

### render.ts barrel

```typescript
export * from './render.canvas';
```

### Logging from a test

```typescript
import { logInfo, logWarn } from '@flighthq/log';
logInfo({ nodeCount: 42, pass: true }, 'test');
```

Logs appear in `logs.jsonl` after capture. The vite harness installs the capture sink before loading `app.ts`, so module-init logs are captured alongside render-time logs.

### Validating a new test

1. Run `npm run capture:functional -- --filter={testName}` (auto-starts the server).
2. Read `tools/output/functional/{testName}/{renderer}/screenshot.png` with the `Read` tool.
3. Read `tools/output/functional/{testName}/{renderer}/logs.jsonl` for structured output. Check for any `pageerror` entries.
4. Once the output looks correct, set the baseline: `npm run capture:functional:baseline -- --filter={testName}`.
5. Commit `tools/baselines/functional/{testName}/` (the `baseline.sha256` hash files). Future captures will report `changed` in `status.json` when a screenshot hash no longer matches its baseline.

## Core Patterns

### Kind Symbols

A `*Kind` symbol is the unique runtime identifier for a scene graph primitive type. Kinds serve two roles: they are the keys against which renderers are registered (`registerRenderer(state, FooKind, renderer)`), and they enforce scene graph hierarchy — a hierarchy node only accepts children whose kind belongs to the same hierarchy family.

Each kind must be defined exactly once, in the package that owns the type, at the point of entity construction. Do not define the same kind in multiple locations. Kinds are created with `Symbol()`, which guarantees uniqueness — no collision prevention or registry is needed. Users of the SDK can define their own kinds to introduce custom node types that integrate with renderer registration and the hierarchy system.

### Entity and Runtime

Public objects are plain entities with data fields. Each entity has a paired, intentionally opaque runtime object that stores package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, and renderer-specific data. Application code should treat runtime state as internal.

Subsystems attach their own state directly to the runtime object. A subsystem reads or writes a nullable property it owns on the narrowest runtime tier that has the capability — for example `GraphNodeRuntime.imageCache` or `HasGraphHierarchyRuntime.graphSignals`. The entity itself knows nothing about the subsystem. This keeps entities lean and decouples subsystems from each other. `NodeRuntime` is the base extension point, but it should stay empty until a subsystem truly applies to every node kind. Subsystem state belongs on the runtime object, not as new fields on the entity.

Use runtime slots for any internal mutable state that should not be part of the public API. Prefer adding nullable slots on the narrowest runtime tier that owns the capability, initializing them to `null`, and exposing lazy accessors if a subsystem needs convenience access. Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. This is a legacy approach — do not extend it; prefer runtime slots instead.

### Scene Graph

Scene graph hierarchy is shared across graph kinds. Functions such as `addNodeChild`, `removeNodeChild`, `getNodeParent`, `getNodeRoot`, `containsNodeChild`, and `swapNodeChildren` operate on `HierarchyNode` nodes, which is why the same hierarchy code supports display objects, sprite graphs, and future graph families.

Use graph-feature aliases for reusable graph APIs: `HierarchyNode`, `GraphAppearanceNode`, `Transform2DNode`, `BoundsNode`, and `Spatial2DNode`. These preserve graph-kind compatibility while making APIs depend on features rather than concrete graph families.

### Renderer Registration

Rendering is opt-in and kind-based. Each renderable node type is identified by a unique `*Kind` symbol, such as `DisplayObjectKind` or `SpriteKind`. Concrete renderers are registered with `registerRenderer(state, FooKind, renderer)`.

A renderer object provides:

- `createData(state, source)`: allocates per-node renderer data; return `null` if none is needed.
- `draw(state, renderNode)`: renders the node each frame.
- `drawMask(state, renderNode)`: renders the node as a mask (display objects only).

Render states hold these registrations. Before drawing, an update pass must run to propagate transforms, alpha, visibility, and blend mode from the scene graph into render nodes. Call `prepareDisplayObjectRender(state, source)` or `prepareSpriteRender(state, source)` before any draw call. Tests that skip this step will see incorrect or default render node values.

Do not call `registerRenderer` at module top level; expose a `register*` function and let callers opt in.

### Geometry Ownership

Geometry types (rectangles, vectors, matrices) follow explicit allocation and ownership rules:

- `create*`: allocates a new value.
- `copy*` / `set*`: mutates an existing value in place.
- `acquire*` / `release*`: pool allocation and return. Every `acquire*` must have a matching `release*`; treat them like paired brackets. Do not use `acquire*` and forget `release*`.
- No-allocation helpers write into an `out` parameter and are safe to call in hot loops.

## Testing

- One test file per source file, colocated in `src/`, named `*.test.ts`.
- `describe` blocks are alphabetized and mirror each file's exported function or object names.
- Test fixtures should use constructors and public helpers instead of object literals for SDK entity types unless the test is intentionally about structural compatibility with a `*Like` input.
- Vitest is configured with `globals: true`. `vi`, `describe`, `it`, and `expect` are available in test files without importing.
- Browser-facing packages (`render-canvas`, `render-webgl`, `render-dom`, etc.) use the `jsdom` test environment.
- `vitest-webgl-canvas-mock` mocks `'webgl'` and `'experimental-webgl'` contexts only, not `'webgl2'`. Tests in `render-webgl` that need a WebGL2 render state must mock `canvas.getContext` to return a fake `WebGL2RenderingContext`.
- While iterating, prefer the narrowest meaningful Vitest run: a touched test file, a package workspace, or a Vitest project filter. Broaden only after the local change is understood. Broad runs are confidence gates; focused tests are the normal editing loop. Do not use broad test runs as a substitute for reading the nearby source and tests.
- Run a package's tests with `npm run test --workspace=packages/<name>`.
- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.
- Root API and integration tests are for cross-package behavior that is awkward or less meaningful in one package's colocated unit tests. Prefer adding colocated unit tests first, then add API/integration coverage when the behavior crosses package boundaries, validates public SDK import paths, or demonstrates a complete user-facing flow.

## Packaging and Publishing

Packaging policy should be enforced by scripts and `npm run packages:check` rather than by memory. Treat this section as orientation for the current package shape, not as the source of truth.

- Packages currently publish `dist` plus colocated source `*.test.ts` files. Tests are intentionally included as examples and AI-readable documentation.
- Compiled test outputs are excluded from published packages.
- `prepack` cleans TypeScript state, removes package `dist` via `clean:dist`, and rebuilds so stale renamed files are not published.
- Prefer changing shared scripts and validation when package publishing policy changes, rather than hand-tuning individual package manifests.

## Package Map

- `@flighthq/types`: shared interfaces, kind symbols, and cross-package type contracts. This is the codebase's header layer — all public API shapes live here.
- `@flighthq/entity`: entity/runtime primitives used by higher-level packages.
- `@flighthq/geometry`: rectangles, vectors, matrices, typed-array capacity helpers, and pools.
- `@flighthq/node`: graph hierarchy, transforms, bounds, appearance, and invalidation.
- `@flighthq/displayobject`: Flash/OpenFL-style display objects such as bitmaps, shapes, text, containers, masks, stages, and videos.
- `@flighthq/sprite`: sprite/tilemap/quad-batch graph for atlas-based batch rendering.
- `@flighthq/world`: 3D world graph for spatial scene management. A doorway for future development; the road is mostly untaken and the package is not yet built out.
- `@flighthq/render`: renderer registration, render state/queue, render node data, update pipeline, transform/color propagation. Image render caching lives in the renderer packages (`imageRenderCache`, `canvasRenderCache`, `webglRenderCache`, `domRenderCache`), not in a standalone package.
- `@flighthq/render-canvas`, `@flighthq/render-dom`, `@flighthq/render-webgl`: concrete renderers.
- `@flighthq/filters`: blur, glow, bevel, drop-shadow, color-matrix, and convolution filters as plain data descriptors with explicit Canvas/CSS and multi-pass WebGL backends. Not OpenFL-style filter objects.
- `@flighthq/interaction`: hit testing, pointer dispatch, and object overlap detection.
- `@flighthq/materials`: color transform and shader-related utilities. A logical home for these concepts; 3D material support is planned as a future direction.
- `@flighthq/signals`: strictly-typed signals and slots for event dispatching. Signals support multiple listeners, priority, and cancellation. The package is effectively always present in the SDK; specific signal groups are opt-in via `enable*` functions defined in the owning package. Signals is fundamental infrastructure and should have few dependencies.
- `@flighthq/resources`: resource primitives and loading (image/audio/video/font resources, texture atlases, tilesets).
- `@flighthq/resources-loader`: batch queue for loading multiple resources in sequence or parallel.
- `@flighthq/spritesheet`: animation layer built on raw resources — a logical package providing sprite-based animation, analogous in structure to `particles`.
- `@flighthq/timeline`: MovieClip-style keyframe and timeline support.
- `@flighthq/timeline-spritesheet`: timeline implementation backed by spritesheet animation internally.
- `@flighthq/tween`: tween managers, tweens, and timers.
- `@flighthq/tween-easing`: easing functions for use with tween or any animation system.
- `@flighthq/input`: maps raw system inputs to a normalized internal representation, feeding into interactions, signals, and other consumers.
- `@flighthq/text-input`: supports user input editing within a text primitive.
- `@flighthq/text-layout`: renderer-agnostic glyph layout for rich text composition.
- `@flighthq/application`: optional package providing a main loop and responses to application lifecycle events.
- `@flighthq/media`: audio and video playback channels.
- `@flighthq/surface`: pixel-level manipulation of `ImageSource` values — read from or generate image data. Not used internally by renderers; user-facing.
- `@flighthq/sdk`: convenience barrel for applications and examples.
