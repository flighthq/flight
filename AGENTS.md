# Flight Codebase Map

This repository is a TypeScript monorepo for a tree-shakable graphics and application SDK. It spans a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), offscreen image processing, and a full application layer. The goal is a complete graphics-and-application feature set — reachable in full — exposed through explicit, side-effect-free APIs over plain data, without implicit, stateful runtime behavior. It is written with AI code agents and a future C/C++ port in mind, so names, module boundaries, allocation behavior, and grepability are part of the design surface.

This document should stay useful, not ornamental. Prefer making architecture and API behavior obvious in source, tests, manifests, and generated API output; use this file for project-level rules that are hard to infer from one or two files. Read it once at the start of each session, and revisit the relevant section when a task touches package shape, exports, examples, rendering, graph internals, or publishing.

**This file is read in full at the start of every agent session, and must stay under 30,000 characters** — enforced by `npm run docs:check`. Every line here is paid for by every session. Domain-specific content — architecture records, reference docs, trigger lists ("before touching X, read Y") — belongs in [`agents/index.md`](agents/index.md) and the docs it indexes, not here. Adding a line to this file requires removing an equivalent one; the test is: would an agent on an unrelated task violate this without knowing the domain existed?

## Pre-Release Status and API Philosophy

Flight has not shipped to public users. There are no published consumers, no migration paths, and no backwards-compatibility obligations. Every API decision is foundational, not incremental. When something is wrong, rename it, restructure it, or remove it — do not accumulate workarounds for past choices.

Agent sessions are a direct part of shaping this API. The goal is not to implement tickets against a fixed design, but to work toward a mature golden path where every exported name, parameter order, and module boundary is worth keeping. Treat naming, module shape, and API symmetry as first-class outputs of any task, not cosmetic concerns to defer.

The cellular architecture supports this directly: each package grows — more renderers, more filter types, more graph families — without coupling to the rest of the SDK. A well-bounded feature is one a user can import in isolation and understand in full, and the module graph and tree-shaking enforce that. If adding something forces a user to pull in unrelated weight, the boundary is wrong or the abstraction is premature. See [Composition and Complexity](#composition-and-complexity). Approach every feature as if it is the final shape.

Unless a task specifies otherwise, bring feature areas to AAA completeness — industry-recognized terms and patterns, canonical scope and naming. A partially built feature area is unfinished work, not a design choice. Gaps found during a task are addressed in-session by default; gaps that cross package boundaries or require a design decision are surfaced to the user.

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
- Dependencies are explicit: every function takes what it needs as arguments. No `set*Backend` singletons, no module-scoped mutable state that functions reach for, no `Object.defineProperty` indirection for shared state. The host is a value you pass; a missing capability is a compile-time type error. Entity is the base type for every SDK object — `create*` always returns Entity; descriptors, options bags, and type-only constructs are not. See [explicit dependency model](agents/explicit-dependency-model.md).
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

Run these at the points listed; skipping them causes cascading failures. Full details in [commands](agents/commands.md).

- **After any edit session, before committing** — `npm run fix`.
- **After package-level changes** (manifests, workspace references, exports, build targets) — `npm run packages:check`.
- **After adding, removing, or renaming an exported function** — `npm run exports:check` (every export needs a colocated test), `npm run order`, `npm run api:check`.
- **After an effect runner/registrar or backend renderer changes** — `npm run reachability:check`. Accept census changes with `npm run reachability:registrars:baseline`, lane drift with `npm run reachability:baseline`.
- **After changing imports or test `describe` blocks** — `npm run order`.
- **After adding or renaming an exported `register*` function** — `npm run backend-prefix:check`.
- **After adding source** — `npm run portable:check`.
- **After changes that may affect tree-shaking** — `npm run size`.
- **After changing functional scenes or baselines** — `npm run support` and `npm run evidence:check`.
- **While iterating** — closest meaningful tests, then `npm run check <package>` and `npm run test <package>`.
- **Before handoff** — `npm run check <package>` and `npm run test <package>` for every affected package. Add bare `npm run check` when changes cross package boundaries.
- **When your change touches rendering** — the relevant render gate, scoped to the affected scene. `test:functional:smoke` / `:parity` are environment-independent; `test:functional:regression` is only valid where its baselines were captured.
- **When adding a new package** — copy the shape from a nearby package, then `npm run packages:check`.
- **Before changing a subsystem's shape** — check [architecture records](agents/index.md#architecture-records) for governing decisions.

## Domain Conventions

Architecture records, reference docs, plans, and reviews live in [`agents/index.md`](agents/index.md) — consult the relevant entry when a task enters a domain. That index carries the "before touching X, read Y" triggers for every subsystem; records marked **unratified** are proposals an agent should read but not build on as settled.

This file carries only rules an agent could violate _without knowing it had entered the domain_. New domain-specific content goes in `agents/index.md` or the domain doc that owns it, not here.

**Package TODO index** — the index of actionable work, weakest first. Generated, never committed: run `node agents/packages/todo.mjs` to write `agents/packages/TODO.md`, then start there and read only the named cell (architecture in [packages/index.md](agents/packages/index.md)).

**Skills** (`.claude/skills/`) — procedures, _invoked to do_:

- [`functional-test`](.claude/skills/functional-test/SKILL.md) — author or modify a functional rendering test.
- [`visual-capture`](.claude/skills/visual-capture/SKILL.md) — capture screenshots and logs from examples and functional tests.

## Core Patterns

### Kind Identifiers

Kind roles, hierarchy-family enforcement, string identity, casing, vendor namespaces, override behavior, and internal-symbol exceptions are governed by [types layout & kind identity](agents/conventions/types-layout.md). Read it before adding a kind or kind-dispatched family.

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

Package names grouped by domain, `@flighthq/` prefix omitted. For boundaries and ownership, read the [package catalog](agents/packages/catalog.md); for API surface, the [package map](agents/packages/map.md). `npm run api <name>` queries signatures. [Feature lookup](agents/feature-lookup.md) maps a keyword to its owning package.

Core: `types`, `entity`, `geometry`, `math`, `color`, `compression`, `encoding` (portable UTF-8), `layout`, `abc`, `node`, `signals`.

Scene graph: `scene2d`, `text`, `quadbatch`, `tilemap`, `scene3d`, `clip`, `path`, `shape`, `interaction`, plus codecs `path-formats`, `path-boolean`, `shape-formats`, `scene2d-formats`, and `swf`.

Rendering: `render`, `render-gl` / `render-wgpu`, 2D renderers (`scene2d-canvas` / `-dom` / `-gl` / `-wgpu`), 3D renderers (`scene3d-gl` / `-wgpu`), image operations (`materials` + `shading` / `adjustments` / `effects` with `effects-gl` / `-wgpu` / `-canvas`), `velocity`, `bitmap`, `capture`.

3D data: `mesh`, `lighting`, `texture`, `camera` (3D and 2D), `camera-controls`, `animation`, `skeleton3d`, `picking`, `scene3d-formats`.

Resources: `image`, `image-codec`, `font`, `video`, `audio`, `binpack`, `textureatlas`, `loader`, `assets`, codecs (`texture-formats` / `textureatlas-formats` / `tilemap-formats`), `scene2d-resources` / `scene3d-resources`, `importdiagnostics`.

Animation and simulation: `spritesheet` / `spritesheet-formats`, `particles` / `particleemitter` / `particles-formats`, `timeline` / `movieclip`, `tween`, `motionpath`, `clock`, `easing`, `spring`, `skeleton2d` / `skeleton2d-formats`.

Game: `collision`, `physics2d` / `physics3d`, `physics2d-abi` / `physics3d-abi`, `spatial`, `flow`, `statechart`, `snapshot`.

Input and text: `input`, `textinput`, `textlayout`, `textshaper` / `textshaper-canvas`, `textsegment`, `textbidi`, `text-markup`, `glyphatlas`, `bitmapfont` / `bitmapfont-formats`, `bitmaptext`.

Application: `application` / `application-gl`, `intl`, `log`, `debug`, `useragent`, `xml`, `media`, `mediasession`, `sdk`.

Platform: `platform`, `screen`, `device`, `storage`, `net`, `socket`, `connectivity`, `permissions`, `midi`, `power`, `lifecycle`, `keyboard`, `sensors`, `accessibility`, `clipboard`, `dialog`, `filesystem`, `notification`, `shell`, `menu`, `tray`, `shortcut`, `share`, `haptics`, `geolocation`, `webcam`, `statusbar`, `app`, `protocol`, `updater`, `ipc`. Host backends (`host-web`, `host-electron`, `host-tauri`, `host-capacitor`) and dev tooling (`tool-capture`, `tool-registry`) are outside `@flighthq/sdk`. See [explicit dependency model](agents/explicit-dependency-model.md).
