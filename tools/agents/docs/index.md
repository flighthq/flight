# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable graphics and application SDK. It spans a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), offscreen image processing, and a full application layer. The goal is to cover the full feature set of OpenFL and Lime — every capability they offer should be reachable here — without adopting their API shape or their reliance on implicit, stateful runtime behavior. It is written with AI code agents and a future C/C++ port of this codebase in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

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

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger unless the size tradeoff is intentional and measured. Verify with `npm run size` after changes to examples, exports, barrels, renderer registration, or dependencies — the command surface (filters, JSON output, baselines) and the full rule are in [bundle size](bundle-size.md).

## Checkpoints

Run these at the points listed. Each check is fast; skipping them causes cascading failures that are slower to debug than the check itself.

- Run `npm run packages:check` after package-level changes: manifests, workspace references, exports, build targets, or side-effect behavior. Fix everything it reports before moving on — it catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- Run `npm run exports:check` after adding, removing, or renaming exported functions to confirm every export has a colocated test.
- Run `npm run order` after adding, removing, or renaming exported functions or test `describe` blocks. Use `npm run order:fix` to rewrite order automatically.
- Run `npm run api` after public API changes to scan signatures and naming symmetry across packages.
- Run `npm run size` after changes to examples, package exports, barrel files, renderer registration, dependencies, or anything that may affect tree-shaking.
- Run the closest meaningful tests while iterating: a touched test file, a package workspace, or a Vitest project filter. Broaden once the local behavior is understood.
- Run `npm run check` for narrower completed changes. Run `npm run ci` before calling broad refactors, public API reshapes, example changes, packaging changes, or tree-shaking-sensitive work done.
- When adding a new package, copy the package shape from a nearby package, then run `npm run packages:check`. A package may spawn focused neighbor packages using a `-subpackage` suffix (for example `@flighthq/spritesheet-formats` alongside `@flighthq/spritesheet`) when the scope is clearly bounded and the split keeps both packages tree-shakable.

## Orientation Commands

- `npm run fix` runs all auto-fixers in sequence: `lint:fix`, `order:fix`, then `format`. Run this after any edit session before committing.
- `npm run api` prints compact exported function signatures for all packages.
- `npm run api <query>` filters packages and exported functions by the given query. Example: `npm run api application` or `npm run api --function register`.
- `npm run api:json` prints the same API data as JSON for tools and agents.
- `npm run check` is the default non-fixing quality sweep for agents and contributors. It runs `packages:check`, `typecheck`, `lint`, `format:check`, `order:check`, and `exports:check`.
- `npm run packages:check` checks monorepo shape, package references, workspace dependency conventions, package export targets, packaging shape, and side-effect-free source invariants.
- `npm run exports:check` checks for missing test files and missing tests for exported functions.
- `npm run order` reports exported functions and test `describe` blocks that are not alphabetized. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up. `npm run order:fix` rewrites files in place to apply the correct order; comments immediately preceding a declaration (with no blank line between them) are treated as attached and move with it.
- `npm run test` runs the normal root Vitest workspace, excluding the heavier `size` project. This is usually faster than chaining individual package test scripts separately.
- `npm run size` builds matching examples and reports gzip output size against the baseline. It supports filtered runs, JSON reporting, and output file paths.
- `npm run dev:functional` launches the functional test tool in `tools/functional`, a browser dev server that runs each functional test across its renderers (Canvas/DOM/WebGL) for visual and behavioral checks you cannot get from jsdom unit tests. (`dev:examples` and `dev:landing` are the equivalent live servers for the other tools.)
- `npm run test:functional` is the headless render gate for those same tests, returning pass/fail. It is an umbrella over three checks, each runnable on its own: `test:functional:smoke` (builds, runs, no error, not blank), `test:functional:parity` (the raster backends agree with each other — consistency), and `test:functional:regression` (each backend matches its committed fingerprint baseline — `:regression:baseline` rewrites them). `test:examples:*` mirrors all of this for examples. The per-check collapse aliases `test:smoke` / `test:parity` / `test:regression` run that one check across both subjects. Smoke and parity are environment-independent (CI gates every PR); regression is coupled to where its baselines were captured.
- `npm run capture:check` is the visual regression gate: captures every tool, compares each screenshot against its committed baseline, and exits 1 if any has changed. Run after committing baselines. `capture:examples:check`, `capture:functional:check`, and `capture:site:check` run each tool independently.

## Domain Conventions

Decisions and procedures that are easy to violate and only matter inside one domain live outside this map, so it stays a map. Consult the relevant one when a task enters that domain, not every session.

**Reference docs** (`tools/agents/docs/`) — declarative knowledge, read to _know_:

- [commit messages](conventions/commits.md) — before writing a commit. The `type(scope):` split (type = what kind of change, from a closed set; scope = which package/crate or area), why `rust`/`wasm`/`script`/`tool` are scopes not types, and the `rust/`·`ts/` scope namespace for the shared-name TS↔Rust crates.
- [npm script naming](conventions/npm-scripts.md) — before adding, renaming, or removing a `package.json` script. The `action:subject:modifier` grammar, why no word may crowd the subject slot, collapse aliases (omit subject → fan over subjects; bare name → `dev:`), `:baseline` as write-mode, and the `smoke` / `parity` / `regression` render-test vocabulary.
- [packaging & publishing](packaging.md) — the published package shape. Policy is enforced by `npm run packages:check`, not memory.
- [bundle size](bundle-size.md) — the `npm run size` command surface and the import-size rules.
- [Rust port](rust/index.md) — the Rust port of the SDK (the `rust` worktree): how TS maps to Rust, the port-specific decisions, and the parity / conformance / mixing vocabulary. Start here for any Rust task. Sub-docs: [parity](rust/parity.md) (the matrix differ) and [conformance](rust/conformance.md) (Rust↔TS fidelity + the divergence map).
- [types layout & kind identity](conventions/types-layout.md) — how `@flighthq/types` is organized (one concept per file, entity quartets, open contracts not closed unions, filename = type name) and the string-kind identity model (no `Symbol()` kinds; string registries; versioned scene migration). Read before adding types or touching kind registration.
- [render backend support](render-backend-support.md) — what actually renders on each backend (canvas/dom/gl/wgpu) **today** and the known gaps from the [render architecture](render-architecture.md) target: blend modes (gl = Normal+Add only, wgpu = none), stroke joins + per-bitmap smoothing + strikethrough not on gl/wgpu, per-instance tint gl/wgpu-only, orthographic blank on wgpu, punctual lights unwired. Read before assuming a feature works on a backend or before scoping a functional test's `renderers`.

**Skills** (`.claude/skills/`) — procedures, _invoked to do_. Claude Code surfaces these by intent; each `SKILL.md` doubles as a plain-markdown procedure for tools that do not load skills, so follow the link directly if needed.

- [`functional-test`](../../../.claude/skills/functional-test/SKILL.md) — author or modify a functional rendering test: the current `createFunctionalTarget` single-`app.ts` pattern, the `kinds` declaration, the optional pixel oracle, and the capture→baseline loop.
- [`visual-capture`](../../../.claude/skills/visual-capture/SKILL.md) — capture screenshots and logs from examples, functional tests, and the landing page; watch mode; screenshot baselines; and reading the `screenshot.png` / `logs.jsonl` / `status.json` output.

## Core Patterns

### Kind Identifiers

A `*Kind` is the identifier for a scene graph primitive or descriptor type. Kinds serve two roles: they are the keys against which renderers are registered (`registerRenderer(state, FooKind, renderer)`), and they enforce scene graph hierarchy — a hierarchy node only accepts children whose kind belongs to the same hierarchy family.

A kind is a plain **string** (`export const BitmapKind = 'Bitmap'`), not a `Symbol()`. One model spans the whole SDK — entity kinds, descriptor kinds, and render registration are all strings keyed in string registries (`Map<Kind, …>`). The string is simultaneously the registry key, the serialized form, and the user-facing intent vocabulary, so a scene round-trips with no symbol↔string seam. Define each kind once, in the package that owns the type, with a canonical PascalCase value; users introducing custom kinds namespace them with a vendor prefix (`'acme.Foo'`). Registration is last-write-wins so a user can override a built-in binding with their own — collisions are avoided by the vendor-prefix convention (bare names reserved for built-ins), not by a registration guard. Internal `Symbol()` uses that are never serialized — runtime-slot keys, property-key brands, sentinels — stay symbols. Full rules in [types layout & kind identity](conventions/types-layout.md).

### Entity and Runtime

Public objects are plain entities with data fields. Each entity has a paired, intentionally opaque runtime object that stores package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, and renderer-specific data. Application code should treat runtime state as internal.

Subsystems attach their own state directly to the runtime object. A subsystem reads or writes a nullable property it owns on the narrowest runtime tier that has the capability — for example `GraphNodeRuntime.imageCache` or `HasGraphHierarchyRuntime.graphSignals`. The entity itself knows nothing about the subsystem. This keeps entities lean and decouples subsystems from each other. `NodeRuntime` is the base extension point, but it should stay empty until a subsystem truly applies to every node kind. Subsystem state belongs on the runtime object, not as new fields on the entity.

Use runtime slots for any internal mutable state that should not be part of the public API. Prefer adding nullable slots on the narrowest runtime tier that owns the capability, initializing them to `null`, and exposing lazy accessors if a subsystem needs convenience access. Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. This is a legacy approach — do not extend it; prefer runtime slots instead.

### Scene Graph

Scene graph hierarchy is shared across graph kinds. Functions such as `addNodeChild`, `removeNodeChild`, `getNodeParent`, `getNodeRoot`, `containsNodeChild`, and `swapNodeChildren` operate on `HierarchyNode` nodes, which is why the same hierarchy code supports display objects, sprite graphs, and future graph families.

Use graph-feature aliases for reusable graph APIs: `HierarchyNode`, `GraphAppearanceNode`, `Transform2DNode`, `BoundsNode`, and `Spatial2DNode`. These preserve graph-kind compatibility while making APIs depend on features rather than concrete graph families.

### Renderer Registration

Rendering is opt-in and kind-based. Each renderable node type is identified by a `*Kind` string identifier, such as `DisplayObjectKind` or `SpriteKind`. Concrete renderers are registered with `registerRenderer(state, FooKind, renderer)`.

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
- There are no standing "API" or "integration" test categories. Cross-package wiring, the SDK barrel, and public import paths are already exercised far more thoroughly by the functional/example/reference visual suites — every scene builds and renders through `@flighthq/sdk` — and by `npm run packages:check` / `npm run api`, which police export shape directly. A barrel smoke test is a strictly weaker version of work CI already does on every PR.
- Put unit behavior in a colocated `*.test.ts` in the package that owns it, where `exports:check` binds it to an exported function and a developer changing that code will see it. A compiler-enforced property (e.g. the `Node<Traits>` invariance law) belongs in a colocated test too, asserted with `// @ts-expect-error` — `tsc -b` typechecks `src/*.test.ts`, so the failing-compile case is the assertion.
- Reserve a root-level integration test only for a headless, logic-only flow that spans packages and produces no visual output (loader orchestration, resource lifecycle, serialization round-trips) — something the visual suites genuinely cannot reach. Do not recreate a generic api/integration bucket; if a test only proves "the surface compiles" or restates a single package's unit behavior, delete it.

## Package Map

- `@flighthq/types`: shared interfaces, kind symbols, and cross-package type contracts. This is the codebase's header layer — all public API shapes live here.
- `@flighthq/entity`: entity/runtime primitives used by higher-level packages.
- `@flighthq/geometry`: rectangles, vectors, matrices, typed-array capacity helpers, and pools.
- `@flighthq/math`: scalar math utilities — constants (EPSILON, TAU, DEG_TO_RAD), clamping/saturation, interpolation (lerp, inverseLerp, remap, smoothStep, smootherStep, damp, moveTowards, pingPong, repeat, lerpAngle), angles (degToRad, radToDeg, normalizeAngle, deltaAngle), rounding/quantization (roundTo, floorTo, ceilTo, fract, euclideanMod), comparison (approxEqual, approxEqualRelative, approxZero), power-of-two family (nextPowerOfTwo, previousPowerOfTwo, isPowerOfTwo, ceilPowerOfTwo, floorPowerOfTwo, nextMultipleOf), number theory (gcd, lcm, factorial, isEven, isOdd, hypot2, sign, quantize), seeded random and convenience helpers (randomRange, randomInt, randomBool, randomSign), random distributions (randomGaussian, randomGaussianPair, randomOnUnitCircle, randomInsideUnitDisc, randomOnUnitSphere, pick, shuffle, shuffleInPlace, randomWeighted), deterministic hashing (hashUint32, hashCombine, hash2D, hash3D, createRandomSourceFromHash), and statistics (mean, median, variance, standardDeviation, weightedAverage). Pure free functions, no allocation, tree-shakable.
- `@flighthq/node`: graph hierarchy, transforms, bounds, appearance, and invalidation.
- `@flighthq/displayobject`: Flash/OpenFL-style display objects such as bitmaps, shapes, containers, masks, stages, and videos.
- `@flighthq/text`: text display objects — single-format `TextLabel` and multi-format `RichText` (built on the text-layout spine, with a lazily-ensured layout cache), plus `NativeText`, the platform-rendered text field measured outside the spine by the host engine. ("native-rendered text" is a property of the display object, not a package boundary — the `native` namespace is reserved for the platform/OS-integration suite below.)
- `@flighthq/sprite`: sprite/tilemap/quad-batch graph for atlas-based batch rendering.
- `@flighthq/scene`: 3D world graph for spatial scene management. A doorway for future development; the road is mostly untaken and the package is not yet built out.
- `@flighthq/render`: renderer registration, render state/queue, render node data, update pipeline, transform/color propagation. Image render caching lives in the renderer packages (`imageRenderCache`, `canvasRenderCache`, `webglRenderCache`, `domRenderCache`), not in a standalone package.
- `@flighthq/render-canvas`, `@flighthq/render-dom`, `@flighthq/render-webgl`: concrete renderers.
- `@flighthq/clip`: hard geometric clip regions as plain data — constructors (`createClipRegionFrom*` for rectangles, paths, rounded rectangles, ellipses, circles, and raw contours), composition (`intersectClipRegions`, `unionClipRegions`), queries (`clipRegionContainsPoint`, `clipRegionIntersectsRectangle`, `clipRegionContainsRectangle`), transform (`transformClipRegion`; axis-aligned matrices preserve scissor-eligibility, rotation/skew promotes to a quad contour), utilities (`cloneClipRegion`, `copyClipRegion`, `getClipRegionBounds`, `isClipRegionEmpty`, `isClipRegionRectangular`, `clipRegionsEqual`, `normalizeClipRegion`, `invalidateClipRegion`), and a pool bracket (`acquireClipRegion`/`releaseClipRegion`). No rendering; rendering is provided by the `displayobject-<backend>` clip modules.
- `@flighthq/filters`: blur, glow, bevel, drop-shadow, color-matrix, and convolution filters as plain data descriptors with explicit Canvas/CSS and multi-pass WebGL backends. Not OpenFL-style filter objects.
- `@flighthq/filters-gl`: GPU leaf-shader set for WebGL 2 — one `apply*FilterToGl` per filter descriptor, shared `applyGlBlitPass`/`applyGlTintPass` compositing primitives, and `clearGlFilterProgramCache` for deterministic GPU-resource release. This package is a collection of leaf shaders, not a chain applier; orchestration and scratch-target allocation belong to the caller (see `get*FilterGlScratchCount` helpers). Kernels are bounded: convolution ≤ `GL_CONVOLUTION_MAX_KERNEL_SIZE × GL_CONVOLUTION_MAX_KERNEL_SIZE` (7×7), median ≤ `GL_MEDIAN_MAX_RADIUS` (2). A chain dispatcher (`applyFiltersToGl`) is out of scope here by the tree-shaking rule; if needed, it belongs in `render-gl` or a `filters-gl-chain` neighbor.
- `@flighthq/interaction`: hit testing, pointer dispatch, and object overlap detection.
- `@flighthq/materials`: color transform and shader-related utilities. A logical home for these concepts; 3D material support is planned as a future direction.
- `@flighthq/signals`: strictly-typed signals and slots for event dispatching. Signals support multiple listeners, priority, and cancellation. The package is effectively always present in the SDK; specific signal groups are opt-in via `enable*` functions defined in the owning package. Signals is fundamental infrastructure and should have few dependencies.
- `@flighthq/resources`: resource primitives and loading (image/audio/video/font resources, texture atlases, tilesets).
- `@flighthq/loader`: batch queue for loading multiple resources in sequence or parallel.
- `@flighthq/spritesheet`: animation layer built on raw resources — a logical package providing sprite-based animation, analogous in structure to `particles`.
- `@flighthq/particles`: particle emitter simulation — `ParticleEmitter`, `ParticleEmitterConfig`, `createParticleEmitterConfig`, `updateParticleEmitter`, `emitParticleBurst`, `prewarmParticleEmitter`, force fields (`applyParticleForces`), colliders (`applyParticleCollisions`), and curve helpers (`particleColorCurveFromKeyframes`, `particleCurveFromKeyframes`, `sampleParticleCurve`).
- `@flighthq/particles-formats`: import/export of particle emitter configs to and from industry-standard authoring-tool formats — Particle Designer plist, Spine 4.x particle JSON, Unity Shuriken JSON. Full round-trip via `*Document` models, honest `warnings[]` channel, curve baking, and unified auto-detection via `detectParticleFormat`/`parseParticleConfig`. Neighbor of `@flighthq/particles` (same relationship as `@flighthq/spritesheet-formats` to `@flighthq/spritesheet`).
- `@flighthq/timeline`: MovieClip-style keyframe and timeline support.
- `@flighthq/timeline-spritesheet`: timeline implementation backed by spritesheet animation internally.
- `@flighthq/tween`: tween managers, tweens, and timers.
- `@flighthq/easing`: easing functions for use with tween or any animation system.
- `@flighthq/input`: maps raw system inputs to a normalized internal representation, feeding into interactions, signals, and other consumers.
- `@flighthq/textinput`: supports user input editing within a text primitive.
- `@flighthq/textlayout`: renderer-agnostic glyph layout for rich text composition.
- `@flighthq/text-shaping` _(designed, not yet built — 2026-06-22)_: the text **shaper seam** — `registerTextShaper` over a swappable `TextShaper` backend that turns a text run into shaped glyphs (ids, advances, offsets, clusters). Generalizes (and replaces) the string→width measure provider `text-layout` consumes today: width is `Σ advances`. Two backend tiers — a measure-only default (`measureText`) that supports layout + Canvas-rendered text, and a full-glyph shaper (HarfBuzz, opt-in as a ~1MB wasm backend so it stays off the default bundle) required for any GPU/WebGPU text. Correct international text (Arabic/Indic/kerning/ligatures) needs the full-glyph tier. This seam is what lets every non-Canvas backend render text, in TS and in the Rust port alike; the Rust port mirrors it with `flighthq-text-shaping` (rustybuzz backend). See [rust/text](rust/text.md) for the full stack design.
- `@flighthq/application`: optional package providing a main loop, application lifecycle events, and the **windowing API** — `ApplicationWindow` (size/position/state + signals), web event wiring (`attach*`/`detach*`), and window-control commands (title, position, size, minimize/maximize/restore, fullscreen, always-on-top, constraints, `openWindow`, close-with-veto via `onCloseRequest`) over a swappable `WindowBackend` (web default; native hosts register their own), matching the platform suite's backend-seam pattern.
- `@flighthq/log`: leveled, structured, capture-aware logging. Emit side (`log`, `logError/Warn/Info/Debug/Verbose`, `logWith` context variants, `logAssert`, `logOnce`) plus a full listener side: multi-sink fan-out (`addLogSink`/`removeLogSink`/`clearLogSinks`), global and per-channel level gates, `LogContext`-bound contextual loggers, pluggable formatters (`createJsonLogFormatter`/`createTextLogFormatter`), a console-capture sink, an in-memory ring-buffer sink, and sink combinators (buffered/filter/fanout/rate-limited/sampled). Not Canvas/DOM-coupled. Tree-shakes: the emit-only import carries only the gate check and the `LogLevel` enum.
- `@flighthq/media`: audio and video playback channels.
- `@flighthq/surface`: pixel-level manipulation of `ImageSource` values — read from or generate image data. Not used internally by renderers; user-facing.
- `@flighthq/sdk`: convenience barrel for applications and examples.

### Platform Integration Suite

Host/OS integration so applications need no escape hatch out of the SDK. Each capability is a self-contained cell: flat free functions over a swappable `*Backend` (defined in `@flighthq/types`). A web/DOM backend is always lazily available, so every function works on the web; a native host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via the capability's `set*Backend`. "Electron support" is one backend, not a coupling. Two shapes: **command** capabilities expose flat functions + `get*Backend`/`set*Backend`/`createWeb*Backend`; **event** capabilities expose an entity of signals with `create*`/`attach*`/`detach*`/`dispose*` (mirroring `@flighthq/application`'s window wiring). Web backends guard every API and return sentinels (`null`/`false`/`-1`/`''`/`[]`/no-op) when unavailable rather than throwing.

- `@flighthq/platform`: root identification seam — OS name, desktop/mobile/web kind, arch, locale, touch.
- `@flighthq/clipboard`: system clipboard read/write (text, HTML).
- `@flighthq/dialog`: file open/save and message/confirm/prompt dialogs.
- `@flighthq/filesystem`: file read/write/list/stat and standard directory paths (web backend over OPFS).
- `@flighthq/notification`: OS notifications and permission.
- `@flighthq/shell`: open external URLs/paths, reveal in folder, move to trash, beep.
- `@flighthq/menu`: native application-menu and context-menu descriptors (native host required to realize).
- `@flighthq/tray`: system tray / menu-bar icon (icon, tooltip, title, context menu, click events). The application/dock badge lives in `@flighthq/app`, not here.
- `@flighthq/shortcut`: global OS hotkeys (native host required).
- `@flighthq/screen`: display enumeration, work area, scale factor.
- `@flighthq/storage`: synchronous persistent key/value (web backend over localStorage).
- `@flighthq/device`: static device/OS identity — model, manufacturer, OS, memory, safe-area insets. Battery is _not_ here; it is a live concern owned by `@flighthq/power`.
- `@flighthq/share`: native share sheet.
- `@flighthq/haptics`: vibration and impact/notification/selection feedback.
- `@flighthq/geolocation`: current position and position watches.
- `@flighthq/webcam`: take photo / pick image.
- `@flighthq/statusbar`: mobile status-bar style, visibility, color.
- `@flighthq/network` (event): connectivity status and online/offline signals.
- `@flighthq/power` (event): battery/charging status, low-power and keep-awake.
- `@flighthq/lifecycle` (event): app active/inactive/background, resume/pause, back button.
- `@flighthq/keyboard` (event): on-screen keyboard visibility/height (type `SoftKeyboard`, avoiding the DOM `Keyboard`).
- `@flighthq/sensors` (event): accelerometer, gyroscope, device orientation.

Application/process layer (host shell integration beyond a single window):

- `@flighthq/app`: application identity (name/version/locale), control (quit/relaunch/focus), single-instance lock + `onSecondInstance`, the canonical app badge (`setAppBadgeCount`) + dock badge/menu/bounce, and app events (`onActivate`, `onOpenFile`).
- `@flighthq/protocol`: custom URI-scheme / deep-link registration plus an `onOpenURL` handler entity.
- `@flighthq/updater` (event): auto-update lifecycle — checking/available/progress/downloaded/error signals plus check/download/quit-and-install commands.
- `@flighthq/ipc`: inter-process messaging — `sendIpcMessage`, `invokeIpc`, `onIpcMessage` over a host channel backend (for split-process hosts like Electron main↔renderer).

Inbound host events are delivered through the same seam: command-style capabilities that also receive events expose a flat `on*(listener): () => void` over a backend `subscribe*` method — `onMenuSelect`, `onTrayEvent` (+ `setTrayContextMenu`), `onNotificationClick`/`onNotificationAction`, `onScreenChange`, power `onSuspend`/`onResume`. The window backend delivers OS-originated changes by mutating the `ApplicationWindow` and emitting its signals directly (it owns the `win`↔OS-window mapping from `openWindow`); native window backends additionally implement icon/opacity/progress/attention/skip-taskbar/menu-bar/parent controls.

Host backends (the concrete adapters that fill the seams) are a distinct package class — they carry a host dependency, are not tree-shakable, and are named `host-<runtime>`:

- `@flighthq/host-electron`: Electron main-process implementation of the window/app/dialog/clipboard/menu/tray/shortcut/screen/power/notification/shell/protocol/updater/ipc seams. The consumer passes the `electron` module explicitly — `registerElectronBackends(electron)` — typed against a local `ElectronApi` interface (the exact Electron surface Flight depends on), so the package needs no `electron` dependency and is unit-testable with a fake. Each `createElectron*Backend(electron)` is also exported for granular use. **Not** re-exported from `@flighthq/sdk` (it is an adapter you install in the host process, not app-facing API). Mobile seams and `filesystem` (node `fs`) are out of scope here — a future `host-capacitor` / a node-fs injection covers those. Future siblings: `host-tauri`, `host-capacitor`.
