# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable 2D rendering SDK inspired by OpenFL and Lime. It is written with AI code agents and a future C/C++ port in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, package manifests, and generated API output. Use this file for project-level rules and architecture that are hard to infer from one or two files.

## Environment

- Use `npm`, not `pnpm` or `yarn`.
- On Windows, prefer Bash (Git Bash or WSL) over PowerShell when running shell commands. If Bash is unavailable, `cmd.exe` is preferred over PowerShell.
- After editing source files, run `npm run lint:fix` then `npm run format` to apply linting and formatting. These are not optional. Unformatted or unlinted code will fail CI.

## Design Constraints

- Prefer globally unique exported function names, especially from package roots and the SDK barrel.
- Keep modules tree-shakable. Packages expose small subpaths and avoid forcing convenience APIs into low-level users' bundles.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `Readonly<T>` marks inputs that should not be modified. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is the same object as one input unless the function documents otherwise. Read all input values into locals before writing any output fields to avoid clobbering a value you still need to read.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Keep APIs portable to C/C++ style ownership and memory rules.
- Packages are designed to be import side-effect-free and declare `"sideEffects": false`. Do not register renderers, patch globals, start listeners/timers, or mutate shared state at module top level. Expose explicit `register*`, `init*`, or `create*` functions instead, and let callers opt in.
- Shared types — interfaces, type aliases, and kind symbols that cross package boundaries — belong in `@flighthq/types`. Do not define cross-package types inline in individual package files.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.
- Packages must not import from `@flighthq/sdk`. Examples usually import from `@flighthq/sdk` when demonstrating application usage, but may import individual packages when intentionally demonstrating lower-level or tree-shaken usage.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- Loose module variables, pools, constants, and scratch objects usually belong at the bottom of the file after exported functions. This keeps the public API surface easy to scan first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, or architecture. Do not comment obvious assignments.

## Orientation Commands

- `npm run overview` regenerates `OVERVIEW.md`, a package/export bird's-eye view.
- `npm run api` prints compact exported function signatures for all packages.
- `npm run api:json` prints the same API data as JSON for tools and agents.
- `npm run check` is the default non-fixing quality sweep for agents and contributors. It runs `validate`, `coverage`, and the non-failing `order` report.
- `npm run check:strict` runs the same sweep with `order:check` in failing mode. Use this for cleaned-up areas or future CI ratcheting.
- `npm run validate` checks monorepo shape, package references, workspace dependency conventions, package export targets, packaging shape, and side-effect-free source invariants. Run this after any package-level change and fix everything it reports before moving on.
- `npm run coverage` checks for missing test files and missing tests for exported functions.
- `npm run order` reports exported functions and test `describe` blocks that are not alphabetized. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up.

## Core Patterns

### Entity and Runtime

Public objects are plain entities with data fields. Each entity has a paired, intentionally opaque runtime object that stores package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, and renderer-specific data. Application code should treat runtime state as internal.

Subsystems attach their own state directly to the runtime object. A subsystem calls `getEntityRuntime(source)` and reads or writes a property it owns on that object, for example `getEntityRuntime(source).imageCacheRecord`. The entity itself knows nothing about the subsystem. This keeps entities lean and decouples subsystems from each other. `@flighthq/image-cache` is the clearest example: it stores an `ImageCacheRecord` on the runtime and exposes `attachImageCache`, `detachImageCache`, and `getImageCache` rather than adding fields to the display object.

Use runtime slots for any internal mutable state that should not be part of the public API. Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. This is a legacy approach. Do not extend it; prefer runtime slots instead.

### Scene Graph

Scene graph hierarchy is shared across graph kinds. Functions such as `addChild`, `removeChild`, `getParent`, `getRoot`, `contains`, and `swapChildren` operate on generic graph nodes, which is why the same hierarchy code supports display objects, sprite graphs, and future graph families.

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
- Run a package's tests with `npm run test:run --workspace=packages/<name>`.

## Packaging and Publishing

Packaging policy should be enforced by scripts and `npm run validate` rather than by memory. Treat this section as orientation for the current package shape, not as the source of truth.

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

- After any package-level change, run `npm run validate` and fix everything it reports. It catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- When adding or renaming exported functions, run `npm run coverage` to find missing test files and missing `describe` coverage.
- When adding or renaming exported functions or `describe` blocks, run `npm run order` to check the scan order. Prefer leaving touched files cleaner than you found them.
- When changing public APIs, check naming symmetry across packages and run `npm run api` to scan signatures.
- When changing an `out`-parameter function, test both a distinct output object and aliasing where `out` is also an input.
- When adding a new package, copy the package shape from a nearby package and then run `npm run validate`.
- Subsystem state belongs on the runtime object, not as new fields on the entity or as new casts in `internal.ts`.
