# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable graphics and application SDK. It spans a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), offscreen image processing, and a full application layer. The goal is a complete graphics-and-application feature set — reachable in full — exposed through explicit, side-effect-free APIs over plain data, without implicit, stateful runtime behavior. It is written with AI code agents and a future C/C++ port in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, manifests, and generated API output; use this file for project-level rules that are hard to infer from one or two files. Read it once at the start of each session, and revisit the relevant section when a task touches package shape, exports, examples, rendering, graph internals, or publishing.

**This file is read in full at the start of every agent session, and must stay under 40,000 characters** — enforced by `npm run docs:check`, which warns within 2% of the limit. That budget is what keeps it a map. Detail belongs in the linked docs under [`agents/`](agents/): when a section here grows past a trigger plus the rule it enforces, move the elaboration into the domain doc that owns it and leave the pointer. Prose added here is paid for by every session, whether or not the task touches that domain.

## Pre-Release Status and API Philosophy

Flight has not shipped to public users. There are no published consumers, no migration paths, and no backwards-compatibility obligations. Every API decision is foundational, not incremental. When something is wrong, rename it, restructure it, or remove it — do not accumulate workarounds for past choices.

Agent sessions are a direct part of shaping this API. The goal is not to implement tickets against a fixed design, but to work toward a mature golden path where every exported name, parameter order, and module boundary is worth keeping. Treat naming, module shape, and API symmetry as first-class outputs of any task, not cosmetic concerns to defer.

The cellular architecture supports this directly: each package grows — more renderers, more filter types, more graph families — without coupling to the rest of the SDK. A well-bounded feature is one a user can import in isolation and understand in full, and the module graph and tree-shaking enforce that. If adding something forces a user to pull in unrelated weight, the boundary is wrong or the abstraction is premature. See [Composition and Complexity](#composition-and-complexity). Approach every feature as if it is the final shape.

Unless a task specifies otherwise, the goal when working on a feature area is to bring it to AAA completeness — implemented using industry-recognized terms and patterns, canonical in scope and naming. When a package is labeled `particles`, an agent should expect to find — and build toward — everything a developer would look for in a mature particles library: emitters, spawn rules, lifetime, forces, blending, pooling. Packages are mature sub-libraries throughout, not thin stubs. A feature area that is partially built is unfinished work, not a design choice.

Gaps in completeness found during a task are added to the current task list and addressed in-session by default. Gaps that cross package boundaries, require a design decision, or are too large for the current scope are surfaced to the user as a suggestion rather than acted on autonomously.

## Design posture

The feature scope is broad, but the API is designed from scratch around Flight's own constraints, never by mirroring another framework's classes, property setters, or implicit runtime behavior. How a capability is exposed is as much a design output as whether it exists.

In practice:

- Prefer explicit data over runtime objects with hidden behavior. An effect or adjustment is a plain data descriptor applied by an explicit per-backend function (a Canvas/CSS filter string or a multi-pass WebGL shader), not an object assigned to a `displayObject.filters` property that the runtime quietly applies on the next frame. `displayObject.filters` is a **deliberate anti-goal** — before "wiring filters into rendering," read [anti-goals](agents/anti-goals.md).
- Prefer plain values over wrapper types and accessors. Colors are packed RGBA integers (`0xeeddccff`) with one convention across the SDK, not a color type or a mix of RGB-with-separate-alpha conventions.
- Prefer small, side-effect-free functions with explicit inputs and `out` parameters over methods that mutate shared state. Nothing "magic" should happen internally that the caller did not ask for: rendering, allocation, and update passes are all things the caller invokes by name.
- Accept more verbose user code when it buys clarity: spelling out renderer registration, the pre-render update pass, and allocation beats convenience that hides where work and memory go. Examples demonstrate this verbosity on purpose.

When a feature's familiar API would require hidden state, eager side effects, or non-tree-shakable coupling, redesign it to fit Flight's rules and keep the feature. The feature is the goal; the API shape is ours to choose.

## Ground Rules

- Unless instructed otherwise, assume work is scoped to the current worktree and its primary package domain. Do not reach across package boundaries automatically; if a task appears to require changes in another package, raise it as a question or suggestion rather than proceeding.
- Use `npm`, not `pnpm` or `yarn`.
- After editing source files, run `npm run fix` to apply linting, ordering, and formatting in one step. This is not optional — unformatted or unlinted code fails CI.
- Keep modules tree-shakable, and expose each package through exactly **two blessed lanes**: the root `.` entry (`index.ts`) is the cultivated **public** API for end-user apps and the `@flighthq/sdk` barrel; `./contract` (`contract.ts`) is the **full** exported surface that other `@flighthq/*` packages consume. Intra-SDK imports always resolve to `@flighthq/x/contract`; `.` is the app boundary only. No _other_ subpath is allowed; file-mirroring subpaths (`@flighthq/x/renderProxy`) stay banned. Full rules in [export lanes](agents/conventions/export-lanes.md).
- Packages are import side-effect-free and declare `"sideEffects": false`. Do not register renderers, patch globals, start listeners/timers, or mutate shared state at module top level; expose explicit `register*`, `init*`, or `create*` functions and let callers opt in.
- Packages must not import from `@flighthq/sdk`. Examples usually import from `@flighthq/sdk` when demonstrating application usage, but may import individual packages when intentionally demonstrating lower-level or tree-shaken usage.
- **All exported types belong in `@flighthq/types`** — every exported `interface`, `type`, and `enum` lives there, with no exceptions (`host-*` and `*-formats` included); an implementation package exports functions only. Never define an exported type inline in a package file. `types` carries the same two lanes as every other: public types at `.`, contract-only at `@flighthq/types/contract`. When building a new feature, define its types there first, then implement against them — the header is the design surface. Full rules, and the port mapping they protect, in [file naming & type home](agents/conventions/file-naming.md) and [export lanes](agents/conventions/export-lanes.md).

## License Provenance

Flight is MIT, copyright as stated in the root `LICENSE.md` — the operative text, and the only place the holder is named. **No work may attach an attribution obligation to any outside party.** This outranks any feature, unblock, or deadline. If you think you need third-party material for anything, stop and ask.

- **Never vendor** third-party source, specification documents, definition files, corpora, or fixtures into this repo — not `packages/`, not `agents/`, not a scratch file under the repo root.
- **Testing against licensed material is fine.** A DVD player may use a licensed DVD to test playback without taking its contents: verifying our implementation against someone's real file is use, not incorporation. Fetch on demand, keep it outside the repo, commit nothing.
- **Record how to obtain and verify a file. Never record whose license it carries.** Reciting another party's terms — or electing between them — reads as accepting a grant and implies an obligation that otherwise does not exist. Keep the fetch recipe and the hash; drop the terms.
- **State format facts as facts about the format, not as excerpts from a document.** "PNG's magic bytes are `89 50 4E 47`" needs no attribution; "derived from `<url>` at `<sha>`, MIT" manufactures one.
- **Interface facts and implementation are different.** Key numbers, enum values, and field names needed to read a format are what a published format is _for_. An algorithm is not: build from the specification, in Flight's own architecture, never transcribed from a reference implementation.

## Design Constraints

- Exported function names include the full, unabbreviated name of the type they operate on: `getBitmapWidth` leads directly to the bitmap domain, `getNode2DBounds` to display objects. A function should be globally self-identifying without context. Never abbreviate type names in function names.
- Prefer globally unique exported function names, especially from package roots and the SDK barrel.
- Choose names — for packages, types, functions, and parameters — whose meaning transfers instantly and precisely. A word like `surface`, `timeline`, or `emitter` carries shared expectations, and that shared understanding is a valid design signal. If a name requires explanation, look for a more precise word: the right word is the one a reader would have reached for independently.
- Angles are **radians** in the math layer and **degrees** in the authoring layer, converted at the seam. Every `@flighthq/geometry` primitive that takes an angle — matrix, quaternion, polar/vector-angle helpers alike — is radians. `node.rotation` is degrees, converted internally via `DEG_TO_RAD` before any trig (mirrors Unity `transform`, Unreal `FRotator`). Rule of thumb: if it lives in `geometry`, pass radians; if it is a transform/authoring property, it is degrees and converts for you. Use `DEG_TO_RAD`/`RAD_TO_DEG` from `@flighthq/math` at the boundary.
- Allocation should be explicit. `create*`, `clone*`, and pool `acquire*` functions may allocate; math, transform, bounds, and update functions generally write to an `out` parameter.
- `dispose*` and `destroy*` are distinct teardown verbs, not synonyms. `dispose*` releases what keeps an entity reachable — detaching listeners, clearing observer registries — so it becomes GC-eligible; there is nothing to free. `destroy*` immediately frees a non-GC resource the entity owns (GPU framebuffers/textures, native handles), leaving the entity invalid. Choose by what teardown does: detach-and-release-to-GC → `dispose*`; free-a-resource-now → `destroy*`. (`release*` stays reserved for pool/cache `acquire`/`capture` brackets.)
- Use `Readonly<T>` everywhere mutation is not intended — parameters, intermediate bindings, return types, stored references — and opt out only when mutation is deliberate. This mirrors C++ `const`. Applies to object types and references; primitives (`number`, `string`, `boolean`) do not require it. Mutable outputs are usually named `out` or `target`.
- Out-parameter functions should be safe when `out` is also an input unless documented otherwise: read all inputs into locals before writing any output field, to avoid clobbering a value you still need.
- Prefer small functions over large abstractions. Users and agents can choose the layer they need.
- Prefer an open registry over a closed `switch (kind)` union for descriptor and handler families: register handlers by `kind` so users add their own (vendor-prefixed) kinds and unused ones tree-shake out — an assembly never costs more than its parts. Keep a closed union only for a tight loop within a closed system, and revisit on growth: a union that was fine while small flips to a registry as the family grows.
- Keep APIs portable to C/C++ idioms: prefer free functions over classes, explicit ownership over GC-reliant patterns, reusable value types over deep object hierarchies, and clear allocation boundaries over hidden allocation. Functions, not methods, as the default unit.
- Return sentinel values (`null`, `false`, or `-1`) for expected failure cases — missing results, invalid lookups. Throw only for programmer errors: precondition violations that represent API misuse and should never occur in correct code. Do not validate internal invariants that correct usage cannot reach, and do not introduce error-wrapping types.
- Diagnostics follow the inversion rule: core modules expose seams, never messages. Caller-facing warnings live in separately-importable guard modules (`enable*Guards`) emitting through `@flighthq/log`, and every silent sentinel gets a shakeable `explain*` query returning plain data. A comment that warns the caller about misuse is a missing guard, not a comment. Full rules in [diagnostics](agents/conventions/diagnostics.md).
- Mutation visibility follows the invalidation doctrine: **identities are compared** (reference-shaped fields are re-read at kind-dispatched or pull seams — bare assignment is the API), **payloads are versioned** (`version` fields bumped by `invalidate<Type>` verbs, fan-out to all sharers), and **intermediate renders are invalidated** (`invalidateNodeLocalContent` for kinds that rasterize their own payload). Transforms recompute by default — no invalidation needed for motion; dirty-tracking is opt-in. Full rules, including when a `set*` export earns its existence, in [invalidation](agents/conventions/invalidation.md).
- Use signals (`@flighthq/signals`) when an event may have multiple listeners, requires priority ordering, or supports cancellation — loose notification across the public API. Users opt into specific signal groups via `enable*` functions (for example `enableNode2DSignals`), which is when the associated cost is assumed. These functions live in the package that owns the entity, not in `@flighthq/signals`. Use direct callbacks for strict internal wiring where a single callsite is guaranteed and loose dispatch is unnecessary.

## Source Style

- Keep exported functions alphabetized within a file unless local readability strongly requires a different order.
- Keep tests aligned with source order. `describe` blocks should be alphabetized and mirror exported function or object names.
- Prefer constructors and package helpers over object literals for SDK entity types. For example, use `createMatrix(...)`, `createRectangle(...)`, or `createDisplayObject(...)` instead of plain literals that only happen to match public fields.
- Use structural literals only for `*Like` inputs. Entity-backed types such as `Matrix`, `Rectangle`, and display objects carry runtime/binding identity beyond their public fields. A literal may match the fields but will not participate in runtime attachment or OOP binding behavior.
- `import type { Foo }` must be on its own `import type { }` line. Never mix type imports inline with value imports as `import { type Foo, bar }`.
- **`as unknown as X` is not a stronger `as X`, it is the absence of a claim.** `as X` asserts something a reader can argue with; the double cast asserts nothing and hides the constraint that forced it. Use it only where no narrower assertion exists, and name that constraint in a comment.
- Loose module variables, pools, constants, and scratch objects belong at the bottom of the file, after exported functions, so the public API surface scans first.
- Avoid structural divider comments such as `// ---- setup ----`. Use names, file boundaries, and package boundaries instead.
- Add comments when a name cannot carry the full rule: ownership, aliasing, allocation, coordinate-space semantics, C/C++ portability, architecture. Do not comment obvious assignments. These are _durable semantic_ comments — they explain what the code **is**.
- Keep _transient_ notes about the **work** out of the code. `TODO`, "half-done", "revisit after X", and known-incomplete threads rot inline; their home is the `## Open` section of the package's `status.md` — present tense, rewritten in place, under 6,000 characters, session narration left in git (see [packages](agents/packages/index.md)). Code carries meaning that survives; work-in-progress lives in status. Caller-facing warning comments ("must call X first", "do not release twice") are likewise banned inline — they become guard-layer runtime warnings (see [diagnostics](agents/conventions/diagnostics.md)).
- Accessor and getter functions use the `get*` prefix. Boolean-returning functions use `has*` or `is*`.
- Commit messages are single-line only — no body, no `Co-Authored-By` trailers. If a change needs more explanation, split it into smaller commits whose subjects are self-explanatory. See [commit messages](agents/conventions/commits.md) for the `type(scope): subject` format.
- **A commit SHA is not a durable handle for whether work landed.** Rebasing rewrites it legitimately, so `git merge-base --is-ancestor` returning false is not evidence the work is absent, and a reported SHA may name no revision you can reach. Verify by **content** — grep a distinctive phrase from the change. See [commit messages](agents/conventions/commits.md).
- Leave touched files cleaner than you found them.

## Bundle Size Discipline

An assembly never inflates the bundle cost of a primitive. Keep optional features separately importable, and run `npm run size` after changes that may affect tree-shaking. The full rule, rationale, and command surface are in [bundle size](agents/bundle-size.md).

## Composition and Complexity

**Complexity is a decomposition smell.** A primitive is simple; a larger thing should be _simple by composition_ of primitives — a 2×4 with a bolt and nut is still simple. When a unit feels complex or bloated, the cause is usually missing primitives _underneath_ that it is silently bundling. The fix is to **extract the missing primitive, not to manage the complexity**: a `scene` that packs mesh, texture, camera, and material is complex until those become their own primitives, after which `scene` is a simple composition of them. But decomposition has a floor: stop at **bedrock**, the irreducible primitive. Splitting something already simple — a screw into half-screws — is _blood from a stone_: more packages and surface for no gain. The craft is placing each cut between "decompose further" and "this is bedrock."

This is the same force as the cellular architecture and the bundle invariant above, seen from three sides. A monolithic function that bundles features as config-gated branches is the within-unit form: the branches are primitives not yet extracted.

## Checkpoints

Run these at the points listed; skipping them causes cascading failures slower to debug than the check itself. What each command actually does is in [commands](agents/commands.md).

- **After any edit session, before committing** — `npm run fix` (runs `lint:fix`, `order:fix`, `format`).
- **After package-level changes** (manifests, workspace references, exports, build targets, side-effect behavior) — `npm run packages:check`. Fix everything it reports before moving on.
- **After adding, removing, or renaming an exported function** — `npm run exports:check` (every export needs a colocated test), `npm run order` (`order:fix` rewrites), and `npm run api:check` (signatures and naming symmetry — plain `npm run api` only prints and enforces nothing).
- **After an effect runner/registrar or backend renderer changes** — `npm run reachability:check` gates the effects inverse and registrar identities, and reports lane drift. Accept census changes with `npm run reachability:registrars:baseline`, lane drift with `npm run reachability:baseline`.
- **After changing imports or test `describe` blocks** — `npm run order`.
- **After adding or renaming an exported `register*` function** — `npm run backend-prefix:check`. The backend token prefixes the type; see [file naming](agents/conventions/file-naming.md).
- **After adding source** — `npm run portable:check`; see the lowerable subset and escape process in [commands](agents/commands.md#checkpoints-in-detail) and [portability](agents/portability.md).
- **After changes that may affect tree-shaking** (examples, package exports, barrels, renderer registration, dependencies) — `npm run size`.
- **After changing functional scenes or adding, removing, or re-capturing functional baselines** — `npm run support` regenerates the backend support matrix from current scene realizations plus committed fingerprints; `support:check` fails if the committed matrix is stale. Run `npm run evidence:check` alongside it so a changed fingerprint, screenshot hash, or pixel-oracle export cannot drift from the evidence manifest. A baseline is capture evidence, not by itself a support claim.
- **While iterating** — the closest meaningful tests (a touched test file, a package workspace, a Vitest project filter), then `npm run check <package>` and `npm run test <package>` for the package you touched. A selector that runs no test files or tests is unconfigured, not clean, and fails loudly.
- **Before handoff** — `npm run check <package>` and `npm run test <package>` for every affected package on the final tree. Add the bare whole-repo `npm run check` when a change crosses package boundaries or affects shared contracts, manifests, exports, build structure, or repository-wide tooling. Run the bare whole-repo `npm run test` only for broadly cross-cutting behavior or when explicitly requested; integration/CI runs it once for the combined tree, and the full render matrix is likewise CI's job (see [commands](agents/commands.md#checkpoints-in-detail)).
- **When your change touches rendering** — the render gate relevant to it, scoped to the affected scene. `test:functional:smoke` / `:parity` are environment-independent and yours to run; `test:functional:regression` is only valid where its baselines were captured.
- **When adding a new package** — copy the shape from a nearby package, then `npm run packages:check`. A package may spawn focused neighbours with a `-subpackage` suffix (`@flighthq/spritesheet-formats` beside `@flighthq/spritesheet`) when the scope is clearly bounded and both stay tree-shakable.

The API-query and live-server command surface is in [commands](agents/commands.md#orientation-commands).

## Domain Conventions

Decisions and procedures that are easy to violate and only matter inside one domain live outside this map, so it stays a map. Each entry below names the moment to open it; the doc itself carries the content. Consult the relevant one when a task enters that domain, not every session.

**What earns a place in this file.** Every agent reads it in full, so an entry must be something an agent could violate _without knowing it had entered the domain_. Three consequences, and they are the rules for editing this file:

- A rule stated above carries its own pointer at the point of the rule. That placement beats a second copy in a list, so rules are **not** repeated down here.
- Anything whose audience is one role — plans, reviews, in-flight direction, open questions — goes in [`agents/index.md`](agents/index.md), not here.
- **How far along a piece of work is never belongs here.** A status copy in this file is a second source that goes stale silently and is then trusted by every session; progress lives in the linked doc's own header, the package cell's `status.md`, or the generated work index. `unratified` is the one allowed marker, because it changes what an agent may do rather than reporting how far along the work is.

**Reference docs** (`agents/`) — declarative knowledge, read to _know_:

- [functional cell rules](functional/README.md) — before adding a functional scene, adding a backend variant, declaring a backend unsupported, or changing a scene's antialiasing. A scene's cells must all show the SAME THING; controls are baked into the scene, never given a cell of their own.
- [registration model](agents/registration-model.md) — before answering a consumer question about registration or backend capability. The two public doors, the register-means-real-implementation rule, and the DOM batch-kind exclusions.
- [npm script naming](agents/conventions/npm-scripts.md) — before adding, renaming, or removing a `package.json` script. The `action:subject:modifier` grammar, collapse aliases, and the `smoke`/`parity`/`regression` vocabulary.
- [packaging & publishing](agents/packaging.md) — the published package shape, enforced by `npm run packages:check`, not memory.
- **package TODO index** — the index of actionable work, weakest first. Generated, never committed: run `node agents/packages/todo.mjs` to write `agents/packages/TODO.md`, then start there and read only the named cell (architecture in [packages/index.md](agents/packages/index.md)).

**Architecture records** — the design decisions behind a subsystem, read before changing its shape. Each doc states its own status in its header; the trigger below is the durable part. An entry marked **unratified** is a proposal awaiting a ruling — read it before working in that area, but do not build on it as settled.

- [effect / adjustment / material architecture](agents/effect-adjustment-architecture.md) — before adding an image operation or touching the adjustments/effects boundary. The three-tier Material / Adjustment / Effect model.
- [material modifier model](agents/material-modifier-model.md) — before touching how node color relates to materials, adding a color-remap op, or extending per-object tint. Color adjustment is a material _feature_, not a shading family.
- [effect recipe model](agents/effect-recipe-model.md) — **unratified.** Before adding a field to an effect descriptor, changing how a chain sequences passes, or adding an effect runner. Who turns an effect intent into passes, and the `strength` definition.
- [texture source model](agents/texture-source-model.md) — before touching `Texture`, `TextureSource`, `ImageBacking`, or `TextureAtlas` internals, or any `create*Texture` / `create*Image*` constructor. The flat `Texture`-over-`TextureSource` model.
- [render backend support](agents/render-backend-support.md) — before assuming a feature works on a backend, or scoping a functional test's `renderers`. The narrative behind the generated [support matrix](agents/support-matrix.md) and the [render architecture](agents/render-architecture.md) gaps.
- [timeline cue model](agents/timeline-cue-model.md) — before adding anything that fires on frame entry, giving an importer a `FrameScript`, or touching `swfFrameAction.ts`. Authored cues are plain kind-dispatched data on the source; importers emit zero closures.
- [loader progress currencies](agents/loader-progress-currencies.md) — **unratified.** Before touching `onProgress`, `getResourceLoadProgress`, `weight`, or `bytesHint`. The three currencies, and where two of them contradict each other.
- [render view model](agents/render-view-model.md) — **unratified.** Before touching `ApplicationRenderView`, `application-gl`, or the `render` sub-target Directed item. Extracting a windowless `RenderView` into `render`.
- [draw order model](agents/draw-order-model.md) — before adding an ordering field to a node, giving a format importer its own child-reordering pass, or deciding where a draw-order timeline binds. Child order is the only order; ordering is a caller-owned `NodeOrderList`.
- [collision support registry](agents/collision-support-registry.md) — before adding a collision shape, touching a dispatcher, or renaming for 3D. The support-function core and the 2D/3D boundary.
- [spatial dimension seams](agents/spatial-dimension-seams.md) — before adding a 3D broadphase backend or widening `SpatialAabb2D`. Two suffixed seams, one policy layer.
- [texture color space](agents/texture-color-space-model.md) — **unratified.** Before touching `Texture.colorSpace`, the `resolveGl*/resolveWgpu*Texture` resolvers, or adding a color-space-aware op to the 2D path. Where Flight decodes and where it encodes.
- [host-web architecture](agents/host-web-architecture.md) — before touching `enableHostWeb*`, `createWeb*Backend` factories, the capability/host boundary, or the precedence model. The 38-row census, extraction plan, and types spine.

The full `agents/` library — plans, reviews, breadth analyses, and every record not triggered by a rule above — is indexed in [`agents/index.md`](agents/index.md). Read it when you need a doc you could not reach from this map.

**Skills** (`.claude/skills/`) — procedures, _invoked to do_. Each `SKILL.md` doubles as a plain-markdown procedure for tools that do not load skills, so follow the link directly if needed.

- [`functional-test`](.claude/skills/functional-test/SKILL.md) — author or modify a functional rendering test: the `createFunctionalTarget` single-`app.ts` pattern, the `kinds` declaration, and the capture→baseline loop.
- [`visual-capture`](.claude/skills/visual-capture/SKILL.md) — capture screenshots and logs from examples and functional tests.

## Core Patterns

### Kind Identifiers

A `*Kind` is the identifier for a scene graph primitive or descriptor type. Kinds serve two roles: they are the keys renderers register against (`registerRenderer(state, FooKind, renderer)`), and they enforce scene graph hierarchy — a hierarchy node only accepts children whose kind belongs to the same hierarchy family.

A kind is a plain **string** (`export const BitmapKind = 'Bitmap'`), not a `Symbol()`, so the registry key, the serialized form, and the user-facing vocabulary are one value and a scene round-trips with no symbol↔string seam. Define each kind once, in the package that owns the type, with a canonical PascalCase value; custom kinds carry a vendor prefix (`'acme.Foo'`). Registration is last-write-wins, so a user can override a built-in binding, and collisions are avoided by the vendor-prefix convention rather than a guard. Internal `Symbol()` uses that are never serialized stay symbols. Full rules in [types layout & kind identity](agents/conventions/types-layout.md).

### Entity and Runtime

Public objects are plain entities with data fields. Each has a paired, intentionally opaque runtime object holding package-private state: graph state, caches, invalidation IDs, render nodes, child arrays, renderer data. Application code treats runtime state as internal.

Subsystems attach their own state to the runtime object rather than adding fields to the entity: a nullable property the subsystem owns, on the narrowest runtime tier with the capability (`GraphNodeRuntime.imageCache`, `HasGraphHierarchyRuntime.graphSignals`), initialized to `null`, with a lazy accessor if needed. The entity knows nothing about the subsystem. `NodeRuntime` is the base extension point but stays empty until a subsystem truly applies to every node kind.

Some render packages use an `internal.ts` cast (`state as RenderStateInternal`) to expose writable versions of read-only properties. Legacy — do not extend it; prefer runtime slots.

### Scene Graph

Scene graph hierarchy is shared across graph kinds: `addNodeChild`, `removeNodeChild`, `getNodeParent`, `getNodeRoot`, `containsNodeChild`, and `swapNodeChildren` all operate on `HierarchyNode`, which is why one hierarchy implementation serves display objects, sprite graphs, and future graph families.

Use the graph-feature aliases — `HierarchyNode`, `GraphAppearanceNode`, `Transform2DNode`, `BoundsNode`, `Spatial2DNode` — for reusable graph APIs, so an API depends on the feature it needs rather than on a concrete graph family.

### Renderer Registration

Rendering is opt-in and kind-based: renderers are registered against a `*Kind` with `registerRenderer(state, FooKind, renderer)`. A renderer provides `createData(state, source)` (per-node data, `null` if none is needed) and `submit(state, renderProxy)`, plus optional `format`, `destroyData`, and `isDirty`. Masking is not a renderer member — it resolves through `clip`/`path`.

Before drawing, an update pass must propagate transforms, alpha, visibility, and blend mode from the scene graph into render nodes: call `prepareScene2DRender(state, source)` or `prepareScene3DRender(state, source)` before any draw call. Tests that skip it see default or stale render node values.

Do not call `registerRenderer` at module top level; expose a `register*` function and let callers opt in.

### Geometry Ownership

Geometry types (rectangles, vectors, matrices) follow explicit allocation verbs: `create*` allocates, `copy*` / `set*` mutates in place, and `acquire*` / `release*` are pool brackets — every `acquire*` needs its matching `release*`. No-allocation helpers write into an `out` parameter and are safe in hot loops.

## Testing

- One test file per source file, colocated in `src/`, named `*.test.ts`. `describe` blocks alphabetized, mirror exported names.
- Use constructors over literals for SDK entity types; use literals only for `*Like` inputs.
- Run `npm run test --workspace=packages/<name>` for a single package. Prefer the narrowest meaningful Vitest run while iterating.
- When changing an `out`-parameter function, test both a distinct output object and the aliased case where `out` is also an input.
- No standing API/integration test categories — cross-package wiring is covered by the functional/example suites and `npm run packages:check` / `npm run api:check`.
- Coverage is not depth: an arm a test _took_ may still be one no assertion would catch breaking. `npm run untested <package>` lists the arms nothing took; `npm run unchecked <file>` mutates one token at a time to find the ones nothing checks. Neither gates — see [the test-depth pair](agents/commands.md#npm-run-untested--npm-run-unchecked--the-test-depth-pair).

See [testing conventions](agents/conventions/testing.md) for the full rules, WebGL specifics, and when to use root-level integration tests.

## Package Map

Package names grouped by domain, `@flighthq/` prefix omitted. For what each package owns and where its boundary sits, read the [package catalog](agents/packages/catalog.md); for per-package detail and API surface, the [package map](agents/packages/map.md). `npm run api <name>` queries exported signatures directly.

Core: `types` (the header layer — every exported type in the SDK), `entity`, `geometry` (rectangles, vectors, matrices, quaternions, bounding volumes, ray intersection, pools), `math` (scalar utilities), `color` (packed-RGBA, sRGB↔linear, HSL/HSV/OkLab), `compression` (the one decompressor registry every container format resolves through), `layout` (headless anchor/flex/grid resolution), `abc` (AVM2 bytecode container parsing — carried by SWF, never executed), `node` (graph hierarchy, transforms, bounds, appearance), `signals`.

Scene graph: `scene2d` (`Node2D` nodes rooted at the `Scene2D` world, including `Sprite`), `text`, `quadbatch` (packed instanced-quad buffer), `tilemap` (tile-id grid over a tileset), `scene3d`, `clip`, `path` (vector-path geometry kernel), `shape` (retained vector command recorder), `interaction` (hit testing, pointer dispatch, overlap), plus the codec neighbors `path-formats` (SVG `d`), `path-boolean` (CSG + offset/simplify), `shape-formats`, `scene2d-formats` (SVG documents), and the standalone `swf` import domain.

Rendering: `render` (registration, state/queue, update pipeline), the backend cores `render-gl` / `render-wgpu`, the 2D leaf renderers `scene2d-canvas` / `scene2d-dom` / `scene2d-gl` / `scene2d-wgpu`, the 3D forward renderers `scene3d-gl` / `scene3d-wgpu`, the three image-operation tiers `materials` + `shading` / `adjustments` / `effects` with `effects-gl` / `effects-wgpu` / `effects-canvas` execution, plus `velocity`, `bitmap` (offscreen pixel manipulation), and `capture` (render-verification policy and baselines).

3D data primitives: `mesh`, `lighting`, `texture`, `camera` (3D projection/frustum **and** the 2D `Camera2D` — the former `camera2d` package is absorbed here) with `camera-controls` (2D follow, 3D orbit/fly), `animation`, `skeleton3d`, `picking`, `scene3d-formats` (glTF/USD/OBJ/3DS/MD5/AWD2).

Resources: `image`, `image-codec`, `font`, `video`, `audio`, `binpack`, `textureatlas`, `loader`, `assets`, the codecs `texture-formats` / `textureatlas-formats` / `tilemap-formats`, the staged scene acquisition layers `scene2d-resources` / `scene3d-resources`, and `importdiagnostics` (the shared structured-diagnostics seam for every `*-formats` importer).

Animation and simulation: `spritesheet`, `spritesheet-formats`, `particles` (headless sim) with `particleemitter` (display node) and `particles-formats`, `timeline` with `movieclip`, `tween`, `motionpath`, `clock`, `easing`, `spring`, plus `skeleton2d` + `skeleton2d-formats` (2D bone rigs, alongside the 3D `skeleton3d`).

Game: `collision` (2D narrow-phase SAT + contact manifolds), `physics2d` (2D rigid-body dynamics), `spatial` (broadphase index), `flow` (mode/screen state stack), `statechart` (concurrent data-only guarded state graphs), `snapshot` (frozen recoverable state).

Input and text: `input`, `textinput`, `textlayout`, `textshaper` with `textshaper-canvas`, `textsegment`, `textbidi` (bidi itemization), `text-markup` (markup → rich text), `glyphatlas` (dynamic) and `bitmapfont` + `bitmapfont-formats` (static) behind the shared `GlyphSource` seam, `bitmaptext`.

Application: `application` (main loop and windowing) with `application-gl` (the WebGL `ApplicationRenderView` assembly), `intl`, `log`, `debug`, `useragent`, `xml`, `media`, `mediasession` (OS now-playing/transport), `sdk` (convenience barrel).

**Platform Integration Suite** — flat free functions over a swappable `*Backend`; web backends are installed explicitly via `enableHostWeb()` (or per-capability `enableHostWeb*()`) from `@flighthq/host-web`, and native hosts replace via `set*Backend`. Three ambient-language capabilities (net, socket, textsegment) stay inline with a lazy-install default. Precedence: custom (`set*Backend`) > host (`enableHostWeb*`) > sentinel. Command capabilities expose `get*Backend` / `set*Backend`; event capabilities expose a signal entity with `create*` / `attach*` / `detach*` / `dispose*`. Sentinels serve when no backend is installed, never throw.

- OS and device: `platform`, `screen`, `device`, `storage`, `net` (HTTP), `socket` (persistent connections), `connectivity`, `permissions`, `power`, `lifecycle`, `keyboard`, `sensors`.
- UI and shell: `accessibility`, `clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu`, `tray`, `shortcut`, `share`, `haptics`, `geolocation`, `webcam`, `statusbar`.
- App and process: `app`, `protocol`, `updater`, `ipc`.

Two package families are deliberately outside the `@flighthq/sdk` barrel and not tree-shakable: host backends (`host-<runtime>`: `host-electron`, `host-tauri`, `host-capacitor`) and the dev/CI tooling suite (`tool-*`: `tool-capture`, `tool-registry`). `scripts/sdk-policy.ts` enforces the exclusion.

## Feature Lookup

[feature lookup](agents/feature-lookup.md) maps a feature keyword — shadows, bloom, blend modes, skinning, tilemap, glTF, collision, text input — to the package that owns it and the backends carrying it. Start there when you know what you want but not where it lives.
