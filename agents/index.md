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
- Angles are **radians** in the math layer and **degrees** in the authoring layer, converted at the seam. Every `@flighthq/geometry` primitive that takes an angle — matrix (`rotateMatrix4`, `appendRotationMatrix4`, `rotateMatrix`, `rotateMatrix3`), quaternion (`setQuaternionFromAxisAngle`, Euler), and polar/vector-angle helpers — is radians. The designer-facing scene-graph transform is degrees: `node.rotation` (and OpenFL-parallel display-object rotation) is degrees, converted to radians internally via `DEG_TO_RAD` before any trig (mirrors Unity `transform`, Unreal `FRotator`, Flash `DisplayObject.rotation`). Rule of thumb: if it lives in `geometry`, pass radians; if it is a transform/authoring property, it is degrees and converts for you. Use `DEG_TO_RAD`/`RAD_TO_DEG` from `@flighthq/math` at the boundary.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `dispose*` and `destroy*` are distinct teardown verbs, not synonyms. `dispose*` releases what keeps an entity reachable — detaching listeners, clearing observer registries — so it becomes eligible for garbage collection; the entity is plain GC-managed memory with nothing to free. `destroy*` immediately and deterministically frees a non-GC resource the entity owns (GPU framebuffers/textures, native handles), leaving the entity invalid. Choose by what teardown does: detach-and-release-to-GC → `dispose*`; free-a-resource-now → `destroy*`. (`release*` stays reserved for pool/cache `acquire`/`capture` brackets.)
- Use `Readonly<T>` everywhere mutation is not intended — function parameters, intermediate bindings, return types, and stored references. Default to `Readonly<>` and opt out only when mutation is deliberate. This mirrors C++ `const`: if it does not need to change, it should be marked so. Applies to object types and references; primitive values (`number`, `string`, `boolean`) do not require it. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is the same object as one input unless the function documents otherwise. Read all input values into locals before writing any output fields to avoid clobbering a value you still need to read.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Prefer an open registry over a closed `switch (kind)` union for descriptor and handler families: register handlers by `kind` so users add their own (vendor-prefixed) kinds and unused ones tree-shake out — an assembly never costs more than its parts. Keep a closed union only for a tight loop within a closed system, and revisit on growth: a union that was fine while small flips to a registry as the family grows.
- Keep APIs portable to C/C++ idioms: prefer free functions over classes, explicit ownership over GC-reliant patterns, reusable value types over deep object hierarchies, and clear allocation boundaries over hidden allocation. Functions, not methods, as the default unit.
- Return sentinel values (`null`, `false`, or `-1`) for expected failure cases — missing results, invalid lookups. Throw only for programmer errors: precondition violations that represent API misuse and should never occur in correct code. Do not validate internal invariants that correct usage cannot reach, and do not introduce error-wrapping types.
- Diagnostics follow the inversion rule: core modules expose seams, never messages. Caller-facing warnings live in separately-importable guard modules (`enable*Guards`) emitting through `@flighthq/log`, and every silent sentinel gets a shakeable `explain*` query returning plain data. A comment that warns the caller about misuse is a missing guard, not a comment. Full rules in [diagnostics](conventions/diagnostics.md).
- Use signals (`@flighthq/signals`) when an event may have multiple listeners, requires priority ordering, or supports cancellation — loose notification across the public API. Users opt into specific signal groups via `enable*` functions (for example `enableDisplayObjectSignals`), which is when the associated cost is assumed. These functions live in the package that owns the entity, not in `@flighthq/signals`. Use direct callbacks for strict internal wiring where a single callsite is guaranteed and loose dispatch is unnecessary.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.
- Loose module variables, pools, constants, and scratch objects usually belong at the bottom of the file after exported functions. This keeps the public API surface easy to scan first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, or architecture. Do not comment obvious assignments. These are _durable semantic_ comments — they explain what the code **is**.
- Keep _transient_ notes about the **work** out of the code. `TODO`, "half-done", "revisit after X", and known-incomplete threads rot inline. Their home is the package's `status.md` continuity log (see [packages](packages/index.md)). Code carries meaning that survives; work-in-progress state lives in status. Caller-facing warning comments ("must call X first", "do not release twice") are likewise banned inline — they become guard-layer runtime warnings (see [diagnostics](conventions/diagnostics.md)).
- Accessor and getter functions use the `get*` prefix. Boolean-returning functions use `has*` or `is*`.
- Leave touched files cleaner than you found them.

## Bundle Size Discipline

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger unless the size tradeoff is intentional and measured. Verify with `npm run size` after changes to examples, exports, barrels, renderer registration, or dependencies — the command surface (filters, JSON output, baselines) and the full rule are in [bundle size](bundle-size.md).

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Composition and Complexity

**Complexity is a decomposition smell.** A primitive is simple; a larger thing should be _simple by composition_ of primitives — a 2×4 with a bolt and nut is still simple. When a unit feels complex or bloated, the cause is usually missing primitives _underneath_ that it is silently bundling. The fix is to **extract the missing primitive, not to manage the complexity**: a `scene` that packs mesh, texture, camera, and material is complex until those become their own primitives, after which `scene` is a simple composition of them. Before absorbing complexity into a unit, look for the layer that wants to be extracted. But decomposition has a floor: stop at **bedrock**, the irreducible primitive. Splitting something already simple — a screw into half-screws — is _blood from a stone_: more packages and surface for no gain. The craft is placing each cut between "decompose further" and "this is bedrock."

This is the same force as the cellular architecture (a feature you can import in isolation and understand in full) and the bundle invariant above (an assembly never costs more than its parts) — one principle seen from three sides. A monolithic function that bundles features as config-gated branches is the within-unit form of the smell: the branches are primitives that have not been extracted yet.

## Checkpoints

Run these at the points listed. Each check is fast; skipping them causes cascading failures that are slower to debug than the check itself.

- Run `npm run packages:check` after package-level changes: manifests, workspace references, exports, build targets, or side-effect behavior. Fix everything it reports before moving on — it catches stale subpaths, missing `tsconfig.json` references, workspace dependency mismatches, packaging drift, and top-level side-effect statements.
- Run `npm run exports:check` after adding, removing, or renaming exported functions to confirm every export has a colocated test.
- Run `npm run order` after adding, removing, or renaming exported functions or test `describe` blocks, or after changing imports. Use `npm run order:fix` to rewrite order automatically. Import sorting lives here (not in the linter): `order` groups and sorts imports across all source, and alphabetizes exported functions and `describe` blocks in `packages/*/src`.
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
- `npm run order` reports import statements, exported functions, and test `describe` blocks that are not in canonical order. Imports are grouped (`node:` builtins, packages, other, then relative) with a blank line between groups and sorted within each group; exported functions and `describe` blocks are alphabetized in `packages/*/src`. `npm run order:check` runs the same check in failing mode once a package or area has been cleaned up. `npm run order:fix` rewrites files in place to apply the correct order; comments immediately preceding a declaration (with no blank line between them) are treated as attached and move with it.
- `npm run test` runs the normal root Vitest workspace, excluding the heavier `size` project. This is usually faster than chaining individual package test scripts separately.
- `npm run size` builds matching examples and reports gzip output size against the baseline. It supports filtered runs, JSON reporting, and output file paths.
- `npm run dev:functional` launches the functional test tool in `tools/functional`, a browser dev server that runs each functional test across its renderers (Canvas/DOM/WebGL) for visual and behavioral checks you cannot get from jsdom unit tests. (`dev:examples` and `dev:gallery` are the equivalent live servers for the other tools.)
- `npm run test:functional` is the headless render gate for those same tests, returning pass/fail. It is an umbrella over three checks, each runnable on its own: `test:functional:smoke` (builds, runs, no error, not blank), `test:functional:parity` (the raster backends agree with each other — consistency), and `test:functional:regression` (each backend matches its committed fingerprint baseline — `:regression:baseline` rewrites them). `test:examples:*` mirrors all of this for examples. The per-check collapse aliases `test:smoke` / `test:parity` / `test:regression` run that one check across both subjects. Smoke and parity are environment-independent (CI gates every PR); regression is coupled to where its baselines were captured.
- `npm run capture:check` is the visual regression gate: captures every tool, compares each screenshot against its committed baseline, and exits 1 if any has changed. Run after committing baselines. `capture:examples:check` and `capture:functional:check` run each tool independently.

## Domain Conventions

Decisions and procedures that are easy to violate and only matter inside one domain live outside this map, so it stays a map. Consult the relevant one when a task enters that domain, not every session.

**Reference docs** (`agents/`) — declarative knowledge, read to _know_:

- [commit messages](conventions/commits.md) — before writing a commit. The `type(scope):` split (type = what kind of change, from a closed set; scope = which package/crate or area), why `rust`/`wasm`/`script`/`tool` are scopes not types, and the `rust/`·`ts/` scope namespace for the shared-name TS↔Rust crates.
- [npm script naming](conventions/npm-scripts.md) — before adding, renaming, or removing a `package.json` script. The `action:subject:modifier` grammar, why no word may crowd the subject slot, collapse aliases (omit subject → fan over subjects; bare name → `dev:`), `:baseline` as write-mode, and the `smoke` / `parity` / `regression` render-test vocabulary.
- [packaging & publishing](packaging.md) — the published package shape. Policy is enforced by `npm run packages:check`, not memory.
- [bundle size](bundle-size.md) — the `npm run size` command surface and the import-size rules.
- [testing conventions](conventions/testing.md) — full testing rules: file/structure conventions, WebGL mock specifics, out-parameter aliasing, and when root-level integration tests are appropriate.
- [diagnostics](conventions/diagnostics.md) — before adding a warning, a guard, an `explain*` query, or a comment that warns the caller about misuse. The inversion rule (core exposes seams, never messages), the `enable*Guards`/`explain*` API conventions, `@flighthq/log` emission (`logOnce`, channels, memory-sink test assertions), the message convention (invariant + the exact fixing call), and why diagnostics cost production bundles nothing.
- [package map](packages/map.md) — full per-package descriptions and API surface detail. Consult when you need more than the compact summary in the Package Map section above.
- [package TODO index](packages/TODO.md) — the **generated one-file index of actionable work**: packages to create (chartered + ranked candidates) and each package's sweep-safe deepening items, weakest first. Start here when looking for work; then read only the named package's cell (`packages/<name>/` — charter, assessment, review, status; architecture in [packages/index.md](packages/index.md)). Regenerate with `node agents/packages/todo.mjs`.
- [types layout & kind identity](conventions/types-layout.md) — how `@flighthq/types` is organized (one concept per file, entity quartets, open contracts not closed unions, filename = type name) and the string-kind identity model (no `Symbol()` kinds; string registries; versioned scene migration). Read before adding types or touching kind registration.
- [render backend support](render-backend-support.md) — what actually renders on each backend (canvas/dom/gl/wgpu) **today** and the known gaps from the [render architecture](render-architecture.md) target: blend modes (gl = Normal+Add only, wgpu = none), stroke joins + per-bitmap smoothing + strikethrough not on gl/wgpu, per-instance tint gl/wgpu-only, orthographic blank on wgpu, punctual lights unwired. Read before assuming a feature works on a backend or before scoping a functional test's `renderers`.

**Skills** (`.claude/skills/`) — procedures, _invoked to do_. Claude Code surfaces these by intent; each `SKILL.md` doubles as a plain-markdown procedure for tools that do not load skills, so follow the link directly if needed.

- [`functional-test`](../.claude/skills/functional-test/SKILL.md) — author or modify a functional rendering test: the current `createFunctionalTarget` single-`app.ts` pattern, the `kinds` declaration, the optional pixel oracle, and the capture→baseline loop.
- [`visual-capture`](../.claude/skills/visual-capture/SKILL.md) — capture screenshots and logs from examples and functional tests; watch mode; screenshot baselines; and reading the `screenshot.png` / `logs.jsonl` / `status.json` output.

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

- One test file per source file, colocated in `src/`, named `*.test.ts`. `describe` blocks alphabetized, mirror exported names.
- Use constructors over literals for SDK entity types; use literals only for `*Like` inputs.
- Run `npm run test --workspace=packages/<name>` for a single package. Prefer the narrowest meaningful Vitest run while iterating.
- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.
- No standing API/integration test categories — cross-package wiring is covered by the functional/example suites and `npm run packages:check` / `npm run api`.

See [testing conventions](conventions/testing.md) for the full rules, WebGL specifics, and when to use root-level integration tests.

## Package Map

Core: `@flighthq/types` (header layer — all shared types), `@flighthq/entity` (entity/runtime primitives), `@flighthq/geometry` (rectangles, vectors, matrices, quaternion, bounding volumes (AABB, OBB, sphere, plane, frustum, capsule), Ray3D intersection, closest-point, pools), `@flighthq/math` (scalar utilities — interpolation, angles, random, hashing, statistics; pure free functions), `@flighthq/node` (graph hierarchy, transforms, bounds, appearance), `@flighthq/signals` (typed signals and slots with priority and cancellation).

Scene graph: `@flighthq/displayobject` (bitmaps, shapes, containers, masks, stages, videos), `@flighthq/text` (`TextLabel`, `RichText`, `NativeText`), `@flighthq/sprite` (sprite/tilemap/quad-batch for atlas rendering), `@flighthq/scene` (3D world graph; early stage), `@flighthq/clip` (geometric clip regions as plain data — constructors, composition, queries, transform, pool bracket), `@flighthq/path-formats` (tree-shakable codec neighbor of `@flighthq/path` — SVG path-data parse/serialize (`parseSvgPathData`/`formatSvgPathData`) over the `appendPath*` builders and `forEachPathSegment`), `@flighthq/path-boolean` (CSG boolean-operation neighbor of `@flighthq/path` — `unionPaths`/`intersectPaths`/`differencePaths`/`xorPaths`/`booleanPaths` over a swappable `PathBooleanBackend` seam, default from-scratch Martinez–Rueda sweep kernel, both fill rules, plus `offsetPath` polygon offsetting (miter/round/square/bevel joins, butt/round/square caps, miter limit, kernel self-union cleanup) and `simplifyPath` (resolve self-intersections into a clean region under a fill rule); Phases A–C of a phased AAA build, multi-path batch union + fuzz hardening to follow), `@flighthq/shape-formats` (tree-shakable codec neighbor of `@flighthq/shape` — lossless native command-stream JSON `formatShapeJson`/`parseShapeJson` over the `appendShape*` builders and the `shape.data.commands` buffer; bitmap-fill resources serialize as an ordinal `ShapeBitmapReference` resolved on parse via `resolveBitmap`, dropped without one), `@flighthq/interaction` (hit testing, pointer dispatch, overlap detection).

Rendering: `@flighthq/render` (registration, render state/queue, update pipeline, transform/color propagation), `@flighthq/render-canvas` / `@flighthq/render-dom` / `@flighthq/render-webgl` (concrete renderers), `@flighthq/filters` (14 filter-kind descriptors, color-matrix preset library, convolution-kernel builders, serialization/validation, and bounds-margin computation), `@flighthq/filters-math` (shared backend-agnostic filter math — shadow/bevel offsets, box-blur radius/sigma conversions, Gaussian kernel weights, linear-sampling bilinear-tap optimization, large-sigma downsample selection), `@flighthq/filters-gl` (GPU leaf shaders for WebGL 2; one `apply*FilterToGl` per descriptor), `@flighthq/effects` (substrate-agnostic post-process render effect descriptors, recipe math, defaults, validation, and interpolation), `@flighthq/effects-gl` / `@flighthq/effects-wgpu` / `@flighthq/effects-canvas` (per-backend effect execution), `@flighthq/materials` (PBR material taxonomy — unlit, Blinn-Phong, metallic-roughness, depth, color-transform), `@flighthq/velocity` (per-frame per-object 2D motion tracking for velocity-buffer writers), `@flighthq/surface` (pixel-level `ImageSource` manipulation — lifecycle, pixel access, compositing, geometric transforms, blur/sharpen, convolution/median/morphological/displacement filters, color matrix/threshold/curves/levels, alpha/channel/format ops, noise/gradient fill, crop/extend/trim, histogram/coverage/comparison/fingerprinting), `@flighthq/capture` (render-verification policy/format layer — tolerant fingerprint comparison (`compareCaptureFingerprints`, `evaluateCaptureRegression`/`evaluateCaptureParity`), default tolerances, the `regression`/`parity`/`smoke` tier vocabulary, and the committed baseline-store record shape with pure serialize/parse; consumes `@flighthq/surface` fingerprint math, no Playwright/Node I/O).

Resources: `@flighthq/image` (ImageResource entity lifecycle — create, clone, dispose, invalidate, DOM-based loading (URL/bytes/Base64/Blob), same-origin check; re-exports `detectImageMimeType` from image-codec), `@flighthq/image-codec` (DOM-free byte↔pixel seam — MIME-keyed decoder/encoder registry, `decodeImage`/`decodeImagePremultiplied`/`encodeImage` dispatchers, `detectImageMimeType` MIME sniffing, opt-in web `createImageBitmap`/`OffscreenCanvas` registrars), `@flighthq/font`, `@flighthq/video`, `@flighthq/audio`, `@flighthq/textureatlas` (TextureAtlas entity lifecycle — create from image sources, region queries by id/name/prefix, UV computation, byte-size reporting), `@flighthq/tileset` (Tileset entity — uniform grid over a TextureAtlas, region building from grid parameters), `@flighthq/loader` (type-agnostic batch load orchestrator — queues `() => Promise<T>` factories with bounded concurrency, priority, pause/resume, cancellation, and progress signals).

Animation/simulation: `@flighthq/spritesheet` (sprite-based animation), `@flighthq/particles` (emitter simulation — spawn, lifetime, forces, colliders, curves), `@flighthq/particles-formats` (Particle Designer / Spine / Unity Shuriken import-export), `@flighthq/timeline` (MovieClip-style keyframes), `@flighthq/timeline-spritesheet`, `@flighthq/tween`, `@flighthq/clock` (hierarchical, pausable, scalable time primitive — a `Clock` tree driven by the app loop via `advanceClock`; consumers read scaled `deltaTime`/`elapsed`; opt-in `onTick` signal), `@flighthq/easing` (timing curves: Penner/CSS/shader families, combinators, parametric factories, piecewise splicing, LUT sampling, numerical derivative).

Input/text: `@flighthq/input` (full input library — keyboard/pointer/wheel/gamepad/text normalization over 15 typed signals, held-state snapshots, per-frame edge queries, gamepad semantic naming with dead-zone math, key-repeat synthesis, pointer lock/capture, coalesced pointer events), `@flighthq/textinput` (editable-text-field behavior — caret/selection model, text insertion/deletion/replacement, keyboard commands, input restrictions, password masking, undo/redo, word/line selection, focus managers (editable + read-only selectable)), `@flighthq/textlayout` (renderer-agnostic glyph layout — line breaking, alignment, justification, wrapping, rich text composition), `@flighthq/textshaper` (text-shaping seam — `measureText`, `shapeTextRun`/`shapeTextRuns` over a swappable `TextShaperBackend`; glyph extents, font metrics, caret positions, itemization, caching), `@flighthq/textshaper-canvas` (Canvas 2D text-shaper backend — advances-only shaping via `measureText`).

Application: `@flighthq/application` (main loop — start/stop/pause/resume/step, frame-rate control, fixed-timestep, FPS metrics over a swappable `LoopBackend`; plus windowing — `ApplicationWindow` state/control, multi-window registry, pointer-lock, fullscreen over a swappable `WindowBackend`), `@flighthq/log` (leveled structured logging — `log(level, data, channel?)` with severity wrappers, multi-sink fan-out (console/memory/file/buffered/rate-limited/sampled/filtered/fanout), text/JSON formatters, timing/spans, groups, assertions, redaction), `@flighthq/media` (runtime playback layer — Web Audio channels, an audio mixer with a bus graph (master gain, per-bus gain/pan/mute, routing), and HTMLVideoElement video channels), `@flighthq/sdk` (convenience barrel).

**Platform Integration Suite** — flat free functions over a swappable `*Backend`; web backend is always available, native hosts replace via `set*Backend`. Command capabilities: `get*Backend`/`set*Backend`/`createWeb*Backend`. Event capabilities: signal entity with `create*`/`attach*`/`detach*`/`dispose*`. Web backends return sentinels rather than throwing.

OS/device: `@flighthq/platform` (OS identity), `@flighthq/screen` (displays), `@flighthq/device` (device info), `@flighthq/storage` (persistent KV), `@flighthq/network`, `@flighthq/power`, `@flighthq/lifecycle`, `@flighthq/keyboard`, `@flighthq/sensors`.

UI/shell: `@flighthq/clipboard`, `@flighthq/dialog`, `@flighthq/filesystem`, `@flighthq/notification`, `@flighthq/shell`, `@flighthq/menu`, `@flighthq/tray`, `@flighthq/shortcut`, `@flighthq/share`, `@flighthq/haptics`, `@flighthq/geolocation`, `@flighthq/webcam`, `@flighthq/statusbar`.

App/process: `@flighthq/app` (identity, badge, dock), `@flighthq/protocol` (deep links), `@flighthq/updater`, `@flighthq/ipc`.

Host backends (`host-<runtime>` — not tree-shakable, not re-exported from `@flighthq/sdk`): `@flighthq/host-electron` (passes `electron` explicitly via `registerElectronBackends(electron)`; typed against a local `ElectronApi` interface).

See [package map](packages/map.md) for full per-package detail and API surface.
