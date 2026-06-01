# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable 2D rendering SDK inspired by OpenFL and Lime. It is written with AI code agents and a future C/C++ port in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, package manifests, and generated API output. Use this file for project-level rules and architecture that are hard to infer from one or two files.

## Read This First

Read this file once at the start of a fresh agent session, then revisit the relevant section when a task touches package shape, exports, examples, rendering, graph internals, or publishing.

- Use `npm`, not `pnpm` or `yarn`.
- On Windows, prefer Bash (Git Bash or WSL) over PowerShell when running shell commands. If Bash is unavailable, `cmd.exe` is preferred over PowerShell.
- After editing source files, run `npm run fix` to apply linting, ordering, and formatting in one step. This is not optional. Unformatted or unlinted code will fail CI.
- Keep modules tree-shakable. Packages expose small subpaths and avoid forcing convenience APIs into low-level users' bundles.
- Packages are designed to be import side-effect-free and declare `"sideEffects": false`. Do not register renderers, patch globals, start listeners/timers, or mutate shared state at module top level. Expose explicit `register*`, `init*`, or `create*` functions instead, and let callers opt in.
- Packages must not import from `@flighthq/sdk`. Examples usually import from `@flighthq/sdk` when demonstrating application usage, but may import individual packages when intentionally demonstrating lower-level or tree-shaken usage.
- Shared types - interfaces, type aliases, and kind symbols that cross package boundaries - belong in `@flighthq/types`. Do not define cross-package types inline in individual package files.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.

## Task Triggers

- Run `npm run packages:check` after package-level changes such as package manifests, workspace references, exports, build targets, or side-effect behavior.
- Run `npm run coverage` after adding, removing, or renaming exported functions.
- Run `npm run order` after adding, removing, or renaming exported functions or test `describe` blocks. Use `npm run order:fix` when you want the repository tool to rewrite order for you.
- Run `npm run api` after public API changes to scan signatures and naming symmetry.
- Run `npm run size` after changes to examples, package exports, barrel files, renderer registration, dependencies, or anything that may affect tree-shaking.
- Run the closest meaningful tests while iterating: a touched test file, a package workspace, or a Vitest project filter. Broaden once the local behavior is understood.
- Run `npm run check` for narrower completed changes. Run `npm run ci` before calling broad refactors, public API reshapes, example changes, packaging changes, or tree-shaking-sensitive work done.

## Bundle Size Discipline

This SDK should behave like a hardware store: users can import one small tool without pulling in the whole building.

- `npm run size` is the direct size-reporting command and the preferred command for agents.
- `npm run size piratepig` filters by example name.
- `npm run size piratepig report=json` prints machine-readable JSON for easier agent parsing.
- `npm run size piratepig output=size-report.json` writes a JSON report file and prints `SIZE_REPORT_PATH:<path>`.
- `npm run size render=canvas` filters by renderer. Filters can be combined, for example `npm run size piratepig render=webgl report=json`.
- Prefer small package imports in examples when the example is intentionally demonstrating low-level or tree-shaken usage. Use `@flighthq/sdk` in examples that are meant to demonstrate application-level convenience.
- Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger unless the size tradeoff is intentional and measured.

## Design Constraints

- Prefer globally unique exported function names, especially from package roots and the SDK barrel.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `Readonly<T>` marks inputs that should not be modified. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is the same object as one input unless the function documents otherwise. Read all input values into locals before writing any output fields to avoid clobbering a value you still need to read.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Keep APIs portable to C/C++ style ownership and memory rules.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- Loose module variables, pools, constants, and scratch objects usually belong at the bottom of the file after exported functions. This keeps the public API surface easy to scan first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, or architecture. Do not comment obvious assignments.

## Orientation Commands

- `npm run fix` runs all auto-fixers in sequence: `lint:fix`, `order:fix`, then `format`. Run this after any edit session before committing.
- `npm run api` prints compact exported function signatures for all packages.
- `npm run api <query>` filters packages and exported functions by the given query. Example: `npm run api application` or `npm run api --function register`.
- `npm run api:json` prints the same API data as JSON for tools and agents.
- `npm run check` is the default non-fixing quality sweep for agents and contributors. It runs `packages:check`, `coverage`, failing `order:check`, `lint`, and `typecheck`.
- `npm run packages:check` checks monorepo shape, package references, workspace dependency conventions, package export targets, packaging shape, and side-effect-free source invariants. Run this after any package-level change and fix everything it reports before moving on.
- `npm run coverage` checks for missing test files and missing tests for exported functions.
- `npm run order` reports exported functions and test `describe` blocks that are not alphabetized. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up. `npm run order:fix` rewrites files in place to apply the correct order; comments immediately preceding a declaration (with no blank line between them) are treated as attached and move with it.
- `npm run test` runs the normal root Vitest workspace, excluding the heavier `size` project. This is usually faster than chaining package/API/integration test scripts separately.
- `npm run size` builds matching examples and reports gzip output size against the baseline. It supports filtered runs, JSON reporting, and output file paths.

## Core Patterns

### Entity and Runtime

Public objects are plain entities with data fields. Each entity has a paired, intentionally opaque runtime object that stores package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, and renderer-specific data. Application code should treat runtime state as internal.

Subsystems attach their own state directly to the runtime object. A subsystem reads or writes a nullable property it owns on the narrowest runtime tier that has the capability, for example `GraphNodeRuntime.imageCache` or `HasGraphHierarchyRuntime.graphSignals`. The entity itself knows nothing about the subsystem. This keeps entities lean and decouples subsystems from each other. `NodeRuntime` is the base extension point, but it should stay empty until a subsystem truly applies to every node kind.

Use runtime slots for any internal mutable state that should not be part of the public API. Prefer adding nullable slots on the narrowest runtime tier that owns the capability, initializing them to `null`, and exposing lazy accessors if a subsystem needs convenience access. Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. This is a legacy approach. Do not extend it; prefer runtime slots instead.

### Scene Graph

Scene graph hierarchy is shared across graph kinds. Functions such as `addGraphChild`, `removeGraphChild`, `getGraphParent`, `getGraphRoot`, `containsGraphChild`, and `swapGraphChildren` operate on `HasGraphHierarchy` nodes, which is why the same hierarchy code supports display objects, sprite graphs, and future graph families.

Use graph-feature aliases for reusable graph APIs: `GraphHierarchyNode`, `GraphAppearanceNode`, `GraphTransform2DNode`, `GraphBoundsNode`, and `GraphSpatial2DNode`. These preserve graph-kind compatibility while making APIs depend on features rather than concrete graph families.

### Renderer Registration

Rendering is opt-in and kind-based. Each renderable node type is identified by a unique `*Kind` symbol, such as `DisplayObjectKind` or `SpriteKind`. Concrete renderers are registered with `registerRenderer(state, FooKind, renderer)`.

A renderer object provides:

- `createData(state, source)`: allocates per-node renderer data; return `null` if none is needed.
- `draw(state, renderNode)`: renders the node each frame.
- `drawMask(state, renderNode)`: renders the node as a mask (display objects only).

Render states hold these registrations. Before drawing, an update pass must run to propagate transforms, alpha, visibility, and blend mode from the scene graph into render nodes. Call `updateDisplayObjectBeforeRender(state, source)` or `updateSpriteBeforeRender(state, source)` before any draw call. Tests that skip this step will see incorrect or default render node values.

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
- While iterating, prefer the narrowest meaningful Vitest run: a touched test file, a package workspace, or a Vitest project filter. Broaden only after the local change is understood.
- Run a package's tests with `npm run test --workspace=packages/<name>`.
- Root API and integration tests are for cross-package behavior that is awkward or less meaningful in one package's colocated unit tests. Prefer adding colocated unit tests first, then add API/integration coverage when the behavior crosses package boundaries, validates public SDK import paths, or demonstrates a complete user-facing flow.

## Packaging and Publishing

Packaging policy should be enforced by scripts and `npm run packages:check` rather than by memory. Treat this section as orientation for the current package shape, not as the source of truth.

- Packages currently publish `dist` plus colocated source `*.test.ts` files. Tests are intentionally included as examples and AI-readable documentation.
- Compiled test outputs are excluded from published packages.
- `prepack` cleans TypeScript state, removes package `dist` via `clean:dist`, and rebuilds so stale renamed files are not published.
- Prefer changing shared scripts and validation when package publishing policy changes, rather than hand-tuning individual package manifests.

## Package Map

- `@flighthq/types`: shared interfaces, kind symbols, and cross-package type contracts.
- `@flighthq/entity`: entity/runtime primitives used by higher-level packages.
- `@flighthq/geometry`: rectangles, vectors, matrices, typed-array capacity helpers, and pools.
- `@flighthq/scenegraph-core`: graph hierarchy, transforms, bounds, appearance, and invalidation.
- `@flighthq/scenegraph-display`: Flash/OpenFL-style display objects such as bitmaps, shapes, text, containers, masks, stages, and videos.
- `@flighthq/scenegraph-sprite`: sprite/tilemap/quad-batch graph for atlas-based batch rendering.
- `@flighthq/render-core`: renderer registration, render node data, update pipeline, transform/color propagation.
- `@flighthq/render-canvas`, `@flighthq/render-dom`, `@flighthq/render-webgl`: concrete renderers.
- `@flighthq/image-cache`: opt-in bitmap caching and opaque background hints, attached to display objects via `attachImageCache`. The `cacheAsBitmap`, `cacheAsBitmapMatrix`, and `opaqueBackground` properties were removed from `DisplayObjectTraits`; do not add them back.
- `@flighthq/interaction`: hit testing and pointer dispatch.
- `@flighthq/materials`: color transforms, filters, and material utilities.
- `@flighthq/signals`: strictly-typed signals and slots for event dispatching.
- `@flighthq/assets`, `@flighthq/spritesheet`, `@flighthq/timeline`, `@flighthq/timeline-spritesheet`: asset and animation helpers.
- `@flighthq/tween` and `@flighthq/tween-easing`: tween managers, tweens, timers, and easing families.
- `@flighthq/surface`: pixel-level image manipulation using browser image data.
- `@flighthq/sdk`: convenience barrel for applications and examples.

## Review Hints

- After any package-level change, run `npm run packages:check` and fix everything it reports. It catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- When adding or renaming exported functions, run `npm run coverage` to find missing test files and missing `describe` coverage.
- When adding or renaming exported functions or `describe` blocks, run `npm run order` to check the scan order. Prefer leaving touched files cleaner than you found them.
- When changing public APIs, check naming symmetry across packages and run `npm run api` to scan signatures.
- Before declaring a broad refactor complete, run `npm run ci`. For narrower changes, run the closest package tests plus `check`; use `ci` when examples, public API names, packaging, or tree-shaking may have been affected.
- Do not use broad test runs as a substitute for reading the nearby source and tests. Broad runs are confidence gates; focused tests are the normal editing loop.
- When changing an `out`-parameter function, test both a distinct output object and aliasing where `out` is also an input.
- When adding a new package, copy the package shape from a nearby package and then run `npm run packages:check`.
- Subsystem state belongs on the runtime object, not as new fields on the entity or as new casts in `internal.ts`.
