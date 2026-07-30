# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable graphics and application SDK. It spans a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), offscreen image processing, and a full application layer. The goal is a complete graphics-and-application feature set — reachable in full — exposed through explicit, side-effect-free APIs over plain data, without implicit, stateful runtime behavior. It is written with AI code agents and a future C/C++ port of this codebase in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, package manifests, and generated API output. Use this file for project-level rules and architecture that are hard to infer from one or two files. Read it once at the start of each session; revisit the relevant section when a task touches package shape, exports, examples, rendering, graph internals, or publishing.

**This file is read in full at the start of every agent session, and must stay under 40,000 characters.** That budget is what keeps it a map. Detail belongs in the linked docs under [`agents/`](agents/): when a section here grows past a trigger plus the rule it enforces, move the elaboration into the domain doc that owns it and leave the pointer. Prose added here is paid for by every session, whether or not the task touches that domain.

## Pre-Release Status and API Philosophy

Flight has not shipped to public users. There are no published consumers, no migration paths to maintain, and no backwards-compatibility obligations. Every API decision is foundational, not incremental. When something is wrong, rename it, restructure it, or remove it — do not accumulate workarounds for past choices.

Agent sessions are a direct part of shaping this API. The goal is not to implement tickets against a fixed design; it is to work toward a mature, deliberate golden path where every exported name, parameter order, and module boundary is something worth keeping. Treat naming, module shape, and API symmetry as first-class outputs of any task, not cosmetic concerns to defer.

The cellular architecture supports this directly. Each package and feature area is designed to grow — more renderers, more filter types, more graph families — without coupling to the rest of the SDK. A well-bounded feature is one a user can import in isolation and understand in full. The module graph and tree-shaking are not just performance concerns; they enforce that each feature stands on its own. If adding something forces a user to pull in unrelated weight, that is a design signal: the boundary is wrong or the abstraction is premature.

Approach every feature as if it is the final shape. Pre-release is the time to get this right.

Unless a task specifies otherwise, the goal when working on a feature area is to bring it to AAA completeness — implemented using industry-recognized terms and patterns, canonical in scope and naming. When a package is labeled `particles`, an agent should expect to find — and build toward — everything a developer would look for in a mature particles library: emitters, spawn rules, lifetime, forces, blending, pooling, and so on. This applies throughout the codebase. Packages are meant to be mature sub-libraries, not thin stubs. A feature area that is partially built is unfinished work, not a design choice.

When gaps in completeness are identified during a task, the default is to add them to the current task list and address them within the session. Gaps that cross package boundaries, require a design decision, or are too large for the current scope should be surfaced to the user as a suggestion rather than acted on autonomously.

## Design posture

The feature scope is broad — display objects, shapes, filters, blend modes, text, tilemaps, particle emitters, audio/video, and a full platform-integration layer — but the API is designed from scratch around Flight's own constraints, never by mirroring another framework's classes, property setters, or implicit runtime behavior. How a capability is exposed is as much a design output as whether it exists.

In practice:

- Prefer explicit data over runtime objects with hidden behavior. An effect or adjustment is a plain data descriptor applied by an explicit per-backend function (a Canvas/CSS filter string or a multi-pass WebGL shader), not an object assigned to a `displayObject.filters` property that the runtime quietly applies on the next frame. `displayObject.filters` is a **deliberate anti-goal** — before "wiring filters into rendering," read [anti-goals](agents/anti-goals.md).
- Prefer plain values over wrapper types and accessors. Colors are packed RGBA integers (for example `0xeeddccff`) with one consistent convention across the SDK, not a color type or a mix of RGB-with-separate-alpha conventions.
- Prefer small, side-effect-free functions with explicit inputs and `out` parameters over methods that mutate shared state. Nothing "magic" should happen internally that the caller did not ask for: rendering, allocation, and update passes are all things the caller invokes by name.
- Accept more verbose user code when it buys clarity. Spelling out renderer registration, the pre-render update pass, and allocation is preferred over convenience that hides where work and memory go. Examples demonstrate this verbosity on purpose.

When a feature's familiar API would require hidden state, eager side effects, or non-tree-shakable coupling, redesign it to fit Flight's rules and keep the feature. The feature is the goal; the API shape is ours to choose.

## Ground Rules

- Unless instructed otherwise, assume work is scoped to the current worktree and its primary package domain. Do not reach across package boundaries automatically. If a task appears to require changes in another package, raise it as a question or suggestion rather than proceeding.
- Use `npm`, not `pnpm` or `yarn`.
- After editing source files, run `npm run fix` to apply linting, ordering, and formatting in one step. This is not optional. Unformatted or unlinted code will fail CI.
- Keep modules tree-shakable, and expose each package through exactly **two blessed lanes**: the root `.` entry (`index.ts`) is the cultivated **public** API for end-user apps and the `@flighthq/sdk` barrel; `./contract` (`contract.ts`) is the **full** exported surface that other `@flighthq/*` packages consume. Intra-SDK imports always resolve to `@flighthq/x/contract`; `.` is the app boundary only. No _other_ subpath is allowed — file-mirroring subpaths (`@flighthq/x/renderProxy`) stay banned; because every package is `"sideEffects": false`, they buy no bundle savings and only couple the published API to internal file names. Full rules in [export lanes](agents/conventions/export-lanes.md).
- Packages are designed to be import side-effect-free and declare `"sideEffects": false`. Do not register renderers, patch globals, start listeners/timers, or mutate shared state at module top level. Expose explicit `register*`, `init*`, or `create*` functions instead, and let callers opt in.
- Packages must not import from `@flighthq/sdk`. Examples usually import from `@flighthq/sdk` when demonstrating application usage, but may import individual packages when intentionally demonstrating lower-level or tree-shaken usage.
- **All exported types belong in `@flighthq/types`** — every exported `interface`, `type`, and `enum` lives there, uniformly, with no exceptions (`host-*` and `*-formats` included); an implementation package exports functions only (`geometry` is the model — it exports zero types). This keeps the header the complete, navigable API surface, and keeps the file-name↔type mapping collision-free in the Haxe/C ports (a type is always `flighthq.types.*`, a function always `flighthq.<pkg>.*`, so they never share a package). Do not define exported types inline in individual package files; a `*Kind` string is a value, not a type, and a type used within a single file and never exported may stay local. `@flighthq/types` files may group related types (the entity-quartet pattern). The `types` package carries the same two lanes as every other package: public types at `.`, contract-only types (consumed only behind a cross-package barrier, e.g. `RenderProxy`) at `@flighthq/types/contract` — still physically in `types`, so the port mapping stays collision-free. When building a new feature, define its types in `@flighthq/types` first, then implement against them — the header is the design surface. Full rules in [file naming & type home](agents/conventions/file-naming.md) and [export lanes](agents/conventions/export-lanes.md).

## Design Constraints

- Exported function names include the full, unabbreviated name of the type they operate on. `getBitmapWidth` in isolation leads directly to the bitmap domain; `getNode2DBounds` to display objects. A function should be globally self-identifying without context. Never abbreviate type names in function names.
- Prefer globally unique exported function names, especially from package roots and the SDK barrel.
- Choose names — for packages, types, functions, and parameters — whose meaning transfers instantly and precisely. A word like `surface`, `timeline`, or `emitter` carries shared expectations; that shared understanding is a valid design signal. If a name requires explanation, look for a more precise word. Vocabulary should have an "obvious" quality to it: the right word is the one a reader would have reached for independently.
- Angles are **radians** in the math layer and **degrees** in the authoring layer, converted at the seam. Every `@flighthq/geometry` primitive that takes an angle — matrix (`rotateMatrix4`, `appendRotationMatrix4`, `rotateMatrix`, `rotateMatrix3`), quaternion (`setQuaternionFromAxisAngle`, Euler), and polar/vector-angle helpers — is radians. The designer-facing scene-graph transform is degrees: `node.rotation` (the display-object rotation property) is degrees, converted to radians internally via `DEG_TO_RAD` before any trig (mirrors Unity `transform`, Unreal `FRotator`). Rule of thumb: if it lives in `geometry`, pass radians; if it is a transform/authoring property, it is degrees and converts for you. Use `DEG_TO_RAD`/`RAD_TO_DEG` from `@flighthq/math` at the boundary.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `dispose*` and `destroy*` are distinct teardown verbs, not synonyms. `dispose*` releases what keeps an entity reachable — detaching listeners, clearing observer registries — so it becomes eligible for garbage collection; the entity is plain GC-managed memory with nothing to free. `destroy*` immediately and deterministically frees a non-GC resource the entity owns (GPU framebuffers/textures, native handles), leaving the entity invalid. Choose by what teardown does: detach-and-release-to-GC → `dispose*`; free-a-resource-now → `destroy*`. (`release*` stays reserved for pool/cache `acquire`/`capture` brackets.)
- Use `Readonly<T>` everywhere mutation is not intended — function parameters, intermediate bindings, return types, and stored references. Default to `Readonly<>` and opt out only when mutation is deliberate. This mirrors C++ `const`: if it does not need to change, it should be marked so. Applies to object types and references; primitive values (`number`, `string`, `boolean`) do not require it. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is the same object as one input unless the function documents otherwise. Read all input values into locals before writing any output fields to avoid clobbering a value you still need to read.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Prefer an open registry over a closed `switch (kind)` union for descriptor and handler families: register handlers by `kind` so users add their own (vendor-prefixed) kinds and unused ones tree-shake out — an assembly never costs more than its parts. Keep a closed union only for a tight loop within a closed system, and revisit on growth: a union that was fine while small flips to a registry as the family grows.
- Keep APIs portable to C/C++ idioms: prefer free functions over classes, explicit ownership over GC-reliant patterns, reusable value types over deep object hierarchies, and clear allocation boundaries over hidden allocation. Functions, not methods, as the default unit.
- Return sentinel values (`null`, `false`, or `-1`) for expected failure cases — missing results, invalid lookups. Throw only for programmer errors: precondition violations that represent API misuse and should never occur in correct code. Do not validate internal invariants that correct usage cannot reach, and do not introduce error-wrapping types.
- Diagnostics follow the inversion rule: core modules expose seams, never messages. Caller-facing warnings live in separately-importable guard modules (`enable*Guards`) emitting through `@flighthq/log`, and every silent sentinel gets a shakeable `explain*` query returning plain data. A comment that warns the caller about misuse is a missing guard, not a comment. Full rules in [diagnostics](agents/conventions/diagnostics.md).
- Use signals (`@flighthq/signals`) when an event may have multiple listeners, requires priority ordering, or supports cancellation — loose notification across the public API. Users opt into specific signal groups via `enable*` functions (for example `enableNode2DSignals`), which is when the associated cost is assumed. These functions live in the package that owns the entity, not in `@flighthq/signals`. Use direct callbacks for strict internal wiring where a single callsite is guaranteed and loose dispatch is unnecessary.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.
- Loose module variables, pools, constants, and scratch objects usually belong at the bottom of the file after exported functions. This keeps the public API surface easy to scan first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, or architecture. Do not comment obvious assignments. These are _durable semantic_ comments — they explain what the code **is**.
- Keep _transient_ notes about the **work** out of the code. `TODO`, "half-done", "revisit after X", and known-incomplete threads rot inline. Their home is the package's `status.md` continuity log (see [packages](agents/packages/index.md)). Code carries meaning that survives; work-in-progress state lives in status. Caller-facing warning comments ("must call X first", "do not release twice") are likewise banned inline — they become guard-layer runtime warnings (see [diagnostics](agents/conventions/diagnostics.md)).
- Accessor and getter functions use the `get*` prefix. Boolean-returning functions use `has*` or `is*`.
- Commit messages are single-line only — no body, no multi-paragraph descriptions, no `Co-Authored-By` trailers. If a change needs more explanation, split it into smaller commits whose subjects are self-explanatory. See [commit messages](agents/conventions/commits.md) for the `type(scope): subject` format.
- Leave touched files cleaner than you found them.

## Bundle Size Discipline

This SDK should behave like a hardware store: a user can import one small tool without pulling in the whole building. Do not add convenience exports, eager registration, shared top-level mutable state, or new dependencies that make small examples larger unless the size tradeoff is intentional and measured. Verify with `npm run size` after changes to examples, exports, barrels, renderer registration, or dependencies — the command surface (filters, JSON output, baselines) and the full rule are in [bundle size](agents/bundle-size.md).

The store sells both the screw and the lawnmower — granular primitives and assembled conveniences — and the invariant is that **an assembly never inflates the cost of a primitive**: buying a screw must never make you pay for the lawnmower. This is a _within_-unit rule, not only a cross-package one. If adding a feature grows the baseline for everyone who imports a function — a new branch in a hot loop, a new `case` in a shared `switch` — the feature is in the wrong place. Sell it as a separately-importable primitive or pass, so feature-growth never taxes the per-item baseline. A config flag that skips a branch removes the _runtime_ cost, not the _bundle_ cost; only separate importability does that.

## Composition and Complexity

**Complexity is a decomposition smell.** A primitive is simple; a larger thing should be _simple by composition_ of primitives — a 2×4 with a bolt and nut is still simple. When a unit feels complex or bloated, the cause is usually missing primitives _underneath_ that it is silently bundling. The fix is to **extract the missing primitive, not to manage the complexity**: a `scene` that packs mesh, texture, camera, and material is complex until those become their own primitives, after which `scene` is a simple composition of them. Before absorbing complexity into a unit, look for the layer that wants to be extracted. But decomposition has a floor: stop at **bedrock**, the irreducible primitive. Splitting something already simple — a screw into half-screws — is _blood from a stone_: more packages and surface for no gain. The craft is placing each cut between "decompose further" and "this is bedrock."

This is the same force as the cellular architecture (a feature you can import in isolation and understand in full) and the bundle invariant above (an assembly never costs more than its parts) — one principle seen from three sides. A monolithic function that bundles features as config-gated branches is the within-unit form of the smell: the branches are primitives that have not been extracted yet.

## Checkpoints

Run these at the points listed. Each check is fast; skipping them causes cascading failures that are slower to debug than the check itself. What each command actually does is in [commands](agents/commands.md).

- **After any edit session, before committing** — `npm run fix` (runs `lint:fix`, `order:fix`, `format`).
- **After package-level changes** (manifests, workspace references, exports, build targets, side-effect behavior) — `npm run packages:check`. Fix everything it reports before moving on.
- **After adding, removing, or renaming an exported function** — `npm run exports:check` (every export needs a colocated test), `npm run order` (`order:fix` rewrites), and `npm run api` (signatures and naming symmetry).
- **After changing imports or test `describe` blocks** — `npm run order`.
- **After adding source** — `npm run portable:check` (part of `npm run check`) gates the C++-lowerable subset: no `eval` / `new Function` / `new Proxy` / `Reflect.*` / `with` / `*.prototype` assignment / `structuredClone`. Closures, `async`, generics, `Map`/`Set`, and classes all lower fine and are not gated. An intentional, contained escape goes in the script's `ALLOW` with a reason. See [portability](agents/portability.md).
- **After changes that may affect tree-shaking** (examples, package exports, barrels, renderer registration, dependencies) — `npm run size`.
- **After adding, removing, or re-capturing functional baselines** — `npm run support` regenerates the backend support matrix from `functional/baselines/` ground truth. `support:check` fails if the committed matrix is stale.
- **While iterating** — the closest meaningful tests (a touched test file, a package workspace, a Vitest project filter), then `npm run check <package>` and `npm run test <package>` for the package you touched.
- **Before handoff** — the bare whole-repo `npm run check` and `npm run test`, both. `check` is the static/type/structural sweep; `test` is the unit tests. The full render matrix (`test:browser`, `capture:check`, the nightly/release jobs) is CI's job — do not run it to "verify broad work."
- **When your change touches rendering** — the render gate relevant to it, scoped to the affected scene. `test:functional:smoke` / `:parity` are environment-independent and yours to run; `test:functional:regression` is only valid where its baselines were captured.
- **When adding a new package** — copy the package shape from a nearby package, then `npm run packages:check`. A package may spawn focused neighbor packages with a `-subpackage` suffix (`@flighthq/spritesheet-formats` alongside `@flighthq/spritesheet`) when the scope is clearly bounded and the split keeps both tree-shakable.

Orientation while working: `npm run api <query>` filters exported signatures by package or `--function` name (`api:json` for tooling), and `npm run dev:functional` / `dev:examples` / `dev:gallery` launch the live browser servers for visual and behavioral checks jsdom cannot give you.

## Domain Conventions

Decisions and procedures that are easy to violate and only matter inside one domain live outside this map, so it stays a map. Each entry below names the moment to open it; the doc itself carries the content. Consult the relevant one when a task enters that domain, not every session.

**Reference docs** (`agents/`) — declarative knowledge, read to _know_:

- [anti-goals](agents/anti-goals.md) — before "completing" a seemingly-missing feature. Some features are absent on purpose (starting with `displayObject.filters`); this is the registry, the explicit path to use instead, and the test for when a convenience abstraction is allowed.
- [commit messages](agents/conventions/commits.md) — before writing a commit. The `type(scope): subject` format and which words are types versus scopes.
- [npm script naming](agents/conventions/npm-scripts.md) — before adding, renaming, or removing a `package.json` script. The `action:subject:modifier` grammar, collapse aliases, and the `smoke` / `parity` / `regression` render-test vocabulary.
- [commands](agents/commands.md) — the full npm-script reference behind the [Checkpoints](#checkpoints) triggers.
- [packaging & publishing](agents/packaging.md) — the published package shape. Policy is enforced by `npm run packages:check`, not memory.
- [bundle size](agents/bundle-size.md) — the `npm run size` command surface and the import-size rules.
- [testing conventions](agents/conventions/testing.md) — full testing rules: file/structure conventions, WebGL mock specifics, out-parameter aliasing, and when root-level integration tests are appropriate.
- [diagnostics](agents/conventions/diagnostics.md) — before adding a warning, a guard, an `explain*` query, or a comment that warns the caller about misuse. The inversion rule (core exposes seams, never messages) and the `enable*Guards` / `explain*` / `@flighthq/log` conventions.
- [types layout & kind identity](agents/conventions/types-layout.md) — before adding a type or touching kind registration. How `@flighthq/types` is organized, and the string-kind identity model (no `Symbol()` kinds).
- [export lanes](agents/conventions/export-lanes.md) — before adding a package export, wiring one package to another, or reasoning about the `@flighthq/sdk` barrel. The three lanes and the load-bearing "siblings import `/contract`, `.` is the app boundary" invariant.
- [file naming & type home](agents/conventions/file-naming.md) — before adding a source file, an exported type, or renaming files. File names and type placement are public API in the port: all exported types live in `@flighthq/types`, file names are verb-free concept nouns, and file names are globally unique SDK-wide.
- [portability substrate](agents/portability.md) — before proposing a port language or IR (especially "just use Haxe — it compiles to C++"). Why the substrate is the TS AST plus thin per-target backends, and what the lowerable-TS subset contract covers.
- [package catalog](agents/packages/catalog.md) — what each package owns and where its boundary sits, one paragraph per package. The tier below the [Package Map](#package-map) name list.
- [package map](agents/packages/map.md) — full per-package descriptions and API-surface detail, when a paragraph is not enough.
- [feature lookup](agents/feature-lookup.md) — feature keyword → owning package → supported backends.
- [package TODO index](agents/packages/TODO.md) — the generated index of actionable work, weakest first. Start here when looking for work, then read the named package's cell (`packages/<name>/`; architecture in [packages/index.md](agents/packages/index.md)). Regenerate with `node agents/packages/todo.mjs`.

**Architecture records** — the design decisions behind a subsystem, read before changing its shape:

- [effect / adjustment / material architecture](agents/effect-adjustment-architecture.md) — before adding an image operation or touching the adjustments/effects boundary. The three-tier model: Material (shading input) / Adjustment (pointwise remap that _fuses_ and _folds_ into the draw) / Effect (spatial-composite op that _chains_ as passes and _bounces_ through an offscreen).
- [material modifier model](agents/material-modifier-model.md) — **implemented**. Before touching how node color relates to materials, adding a color-remap op, or extending per-object tint. Color adjustment is a tree-shakable registered material _feature_ orthogonal to the shading family, not a family of its own.
- [texture source model](agents/texture-source-model.md) — **spec, not yet implemented**. Before touching `Texture`, `TextureStorage`, `ImageBacking`, or any `create*Texture` / `create*Image*` constructor. Six recorded defects and a 9-stage migration to the `TextureSource` family.
- [render backend support](agents/render-backend-support.md) — before assuming a feature works on a backend, or scoping a functional test's `renderers`. What actually renders on canvas/dom/gl/wgpu today and the known gaps from the [render architecture](agents/render-architecture.md) target.
- [wgpu 3D parity spec](agents/wgpu-3d-parity-spec.md) — before touching `scene3d-wgpu` / `effects-wgpu` 3D or scoping wgpu parity work. Each item cites the shipped GL file it mirrors.
- [morph-target animation](agents/morph-target-animation.md) — before adding vertex-deformation animation or touching the morph path. The blend-shape deformer charter, built on the GL path; GPU morph and composed skin+morph are deferred.

**Plans and reviews** — the current state of in-flight direction:

- [examples plan](agents/examples-plan.md) — the new example set: 10 reworked core examples, 17 Flight-specific feature examples, 3 integration demos, with implementation order and open questions.
- [quality plan](agents/quality-plan.md) — the direction for API maturity verification, and the unit-versus-functional test guidance.
- [test depth review](agents/test-depth-review.md) — completed unit-test-depth review across 78 packages, with the prioritized gap list and functional test candidates.
- [breadth synthesis](agents/breadth-synthesis.md) — cross-report convergences from the four breadth analyses: overlapping domains, genuinely missing primitives, and open design calls. Individual reports: [adjacent content](agents/breadth-adjacent-content.md), [platform variance](agents/breadth-platform-variance.md), [cloud/distributed](agents/breadth-cloud-distributed.md), [domain deepening](agents/breadth-domain-deepening.md).

**Skills** (`.claude/skills/`) — procedures, _invoked to do_. Claude Code surfaces these by intent; each `SKILL.md` doubles as a plain-markdown procedure for tools that do not load skills, so follow the link directly if needed.

- [`functional-test`](.claude/skills/functional-test/SKILL.md) — author or modify a functional rendering test: the current `createFunctionalTarget` single-`app.ts` pattern, the `kinds` declaration, the optional pixel oracle, and the capture→baseline loop.
- [`visual-capture`](.claude/skills/visual-capture/SKILL.md) — capture screenshots and logs from examples, functional tests, and the external reference examples (`npm run capture:reference -- --filter <name>`, which auto-clones `flight-reference`); watch mode; screenshot baselines; and reading the `screenshot.png` / `logs.jsonl` / `status.json` output.

## Core Patterns

### Kind Identifiers

A `*Kind` is the identifier for a scene graph primitive or descriptor type. Kinds serve two roles: they are the keys renderers register against (`registerRenderer(state, FooKind, renderer)`), and they enforce scene graph hierarchy — a hierarchy node only accepts children whose kind belongs to the same hierarchy family.

A kind is a plain **string** (`export const BitmapKind = 'Bitmap'`), not a `Symbol()`, so the registry key, the serialized form, and the user-facing vocabulary are one value and a scene round-trips with no symbol↔string seam. Define each kind once, in the package that owns the type, with a canonical PascalCase value; custom kinds carry a vendor prefix (`'acme.Foo'`). Registration is last-write-wins, so a user can override a built-in binding; collisions are avoided by the vendor-prefix convention, not by a guard. Internal `Symbol()` uses that are never serialized — runtime-slot keys, property-key brands, sentinels — stay symbols. Full rules in [types layout & kind identity](agents/conventions/types-layout.md).

### Entity and Runtime

Public objects are plain entities with data fields. Each entity has a paired, intentionally opaque runtime object holding package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, renderer data. Application code treats runtime state as internal.

Subsystems attach their own state to the runtime object rather than adding fields to the entity: a nullable property the subsystem owns, on the narrowest runtime tier that has the capability (`GraphNodeRuntime.imageCache`, `HasGraphHierarchyRuntime.graphSignals`), initialized to `null`, with a lazy accessor if convenience access is needed. The entity knows nothing about the subsystem. `NodeRuntime` is the base extension point but should stay empty until a subsystem truly applies to every node kind.

Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. This is legacy — do not extend it; prefer runtime slots.

### Scene Graph

Scene graph hierarchy is shared across graph kinds. `addNodeChild`, `removeNodeChild`, `getNodeParent`, `getNodeRoot`, `containsNodeChild`, and `swapNodeChildren` operate on `HierarchyNode`, which is why one hierarchy implementation serves display objects, sprite graphs, and future graph families.

Use the graph-feature aliases — `HierarchyNode`, `GraphAppearanceNode`, `Transform2DNode`, `BoundsNode`, `Spatial2DNode` — for reusable graph APIs, so an API depends on the feature it needs rather than on a concrete graph family.

### Renderer Registration

Rendering is opt-in and kind-based: concrete renderers are registered against a `*Kind` with `registerRenderer(state, FooKind, renderer)`. A renderer provides `createData(state, source)` (per-node renderer data, `null` if none is needed), `draw(state, renderNode)`, and `drawMask(state, renderNode)` (display objects only).

Before drawing, an update pass must propagate transforms, alpha, visibility, and blend mode from the scene graph into render nodes: call `prepareScene2DRender(state, source)` or `prepareSpriteRender(state, source)` before any draw call. Tests that skip this step see default or stale render node values.

Do not call `registerRenderer` at module top level; expose a `register*` function and let callers opt in.

### Geometry Ownership

Geometry types (rectangles, vectors, matrices) follow explicit allocation verbs: `create*` allocates a new value, `copy*` / `set*` mutates an existing one in place, and `acquire*` / `release*` are pool brackets — every `acquire*` needs its matching `release*`. No-allocation helpers write into an `out` parameter and are safe in hot loops.

## Testing

- One test file per source file, colocated in `src/`, named `*.test.ts`. `describe` blocks alphabetized, mirror exported names.
- Use constructors over literals for SDK entity types; use literals only for `*Like` inputs.
- Run `npm run test --workspace=packages/<name>` for a single package. Prefer the narrowest meaningful Vitest run while iterating.
- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.
- No standing API/integration test categories — cross-package wiring is covered by the functional/example suites and `npm run packages:check` / `npm run api`.

See [testing conventions](agents/conventions/testing.md) for the full rules, WebGL specifics, and when to use root-level integration tests.

## Package Map

Package names grouped by domain, `@flighthq/` prefix omitted. For what each package owns and where its boundary sits, read the [package catalog](agents/packages/catalog.md); for full per-package detail and API surface, the [package map](agents/packages/map.md). `npm run api <name>` queries exported signatures directly.

Core: `types` (the header layer — every exported type in the SDK), `entity`, `geometry` (rectangles, vectors, matrices, quaternions, bounding volumes, ray intersection, pools), `math` (scalar utilities), `node` (graph hierarchy, transforms, bounds, appearance), `signals`.

Scene graph: `scene2d` (`Node2D` nodes rooted at the `Scene2D` world), `text`, `sprite` (sprite/tilemap/quad-batch), `scene3d`, `clip`, `path` (vector-path geometry kernel), `shape` (retained vector command recorder), `interaction` (hit testing, pointer dispatch, overlap), plus the codec neighbors `path-formats` (SVG `d`), `path-boolean` (CSG + offset/simplify), `shape-formats`, `scene2d-formats` (SVG documents), and the standalone `swf` import domain.

Rendering: `render` (registration, state/queue, update pipeline), the backend cores `render-gl` / `render-wgpu`, the 2D leaf renderers `scene2d-canvas` / `scene2d-dom` / `scene2d-gl` / `scene2d-wgpu`, the 3D forward renderers `scene3d-gl` / `scene3d-wgpu`, the three image-operation tiers `materials` + `shading` (shading input) / `adjustments` (pointwise value remap that folds into the draw) / `effects` (spatial-composite passes) with `effects-gl` / `effects-wgpu` / `effects-canvas` execution, plus `velocity`, `bitmap` (offscreen pixel manipulation), and `capture` (render-verification policy and baselines).

3D data primitives: `mesh`, `lighting`, `texture`, `camera` (3D projection/frustum **and** the 2D `Camera2D` — the former `camera2d` package is absorbed here), `animation`, `skeleton3d`, `picking`, `scene3d-formats` (glTF/USD/OBJ/3DS/MD5/AWD2).

Resources: `image`, `image-codec`, `font`, `video`, `audio`, `binpack`, `textureatlas`, `tileset`, `loader`, `assets`, the codecs `texture-formats` / `textureatlas-formats` / `tilemap-formats`, and the staged scene acquisition layers `scene2d-resources` / `scene3d-resources`.

Animation and simulation: `spritesheet`, `spritesheet-formats`, `particles` (headless sim) with `particleemitter` (display node) and `particles-formats`, `timeline` with `movieclip`, `tween`, `motionpath`, `clock`, `easing`, `spring`.

Game: `collision` (2D narrow-phase SAT + contact manifolds), `spatial` (broadphase index), `flow` (mode/screen state stack), `snapshot` (frozen recoverable state).

Input and text: `input`, `textinput`, `textlayout`, `textshaper` with `textshaper-canvas`, `textsegment`, `glyphatlas` (dynamic) and `bitmapfont` + `bitmapfont-formats` (static) behind the shared `GlyphSource` seam, `bitmaptext`.

Application: `application` (main loop and windowing), `intl`, `log`, `debug`, `useragent`, `xml`, `media`, `sdk` (convenience barrel).

**Platform Integration Suite** — flat free functions over a swappable `*Backend`; the web backend is always available and native hosts replace it via `set*Backend`. Command capabilities expose `get*Backend` / `set*Backend` / `createWeb*Backend`; event capabilities expose a signal entity with `create*` / `attach*` / `detach*` / `dispose*`. Web backends return sentinels rather than throwing.

- OS and device: `platform`, `screen`, `device`, `storage`, `net` (HTTP), `socket` (persistent connections), `connectivity`, `permissions`, `power`, `lifecycle`, `keyboard`, `sensors`.
- UI and shell: `accessibility`, `clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu`, `tray`, `shortcut`, `share`, `haptics`, `geolocation`, `webcam`, `statusbar`.
- App and process: `app`, `protocol`, `updater`, `ipc`.

Two package families are deliberately outside the `@flighthq/sdk` barrel and are not tree-shakable: host backends (`host-<runtime>`, currently `host-electron`) and the dev/CI tooling suite (`tool-*`, currently `tool-capture`). `scripts/sdk-policy.ts` enforces the exclusion.

## Feature Lookup

[feature lookup](agents/feature-lookup.md) maps a feature keyword — shadows, bloom, blend modes, skinning, tilemap, glTF, collision, text input — to the package that owns it and the backends that carry it today. Start there when you know what you want but not where it lives.
