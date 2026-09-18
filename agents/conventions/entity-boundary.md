# Entity Boundary

Entity is the base type for **domain objects** — things in the problem space that Flight defines and allocates. A domain object carries meaning in the domain, benefits from consistent construction (`allocateEntity` → initializers → `finishEntity`), predictable field layout, and OOP binding (mapping to a C++ class of the same name). A domain object may be complex (a scene graph node with lifecycle and runtime state) or simple (an effect descriptor with a kind and parameters) — the criterion is that it describes something in the domain, not that it exercises every Entity feature.

**Dispatch infrastructure** — function tables, containers that map kinds to handlers, and bundles of these — is not a domain object. It is the plumbing that connects domain objects to each other: a renderer maps a node kind to draw calls, a registry table maps kinds to handlers, a pipeline bundles registry tables, a host capability maps platform operations to functions. Dispatch infrastructure does not extend Entity, is not allocated via `allocateEntity`/`finishEntity`, and is formed as an object literal or returned from an ordinary factory.

## The test

The question is not "does this type use `EntityRuntimeKey`?" — many simple domain objects don't. The question is: **is this a thing in the domain, or is it plumbing that connects things?**

Domain object (Entity) — **any** of:

1. **It describes something in the problem space.** A shadow, a spring, a sampler, a projection, a collision result, a particle emitter config. You would naturally name a C++ class after it. `createDropShadowEffect()` signals what you're making.
2. **It has a meaningful construction chain.** Base-to-derived initialization that establishes shared invariants (e.g., `initializeNode` → `initializeNode2D` → `initializeSprite`).
3. **Identity or lifecycle is consumed.** Something compares it by reference, uses it as a WeakMap key, reads its `EntityId`, attaches runtime state, or tears it down via `dispose*`/`destroy*`.

Dispatch infrastructure (plain data) — **all** of:

1. **It connects, dispatches, or maps.** It is a function table, a kind-to-handler lookup, or a bundle of these. Its purpose is to wire domain objects to behavior, not to describe something in the domain.
2. **You would not name a C++ class after it.** You would not say "create a renderer" or "create a registry table" the way you say "create a sprite" or "create a blur effect." In C++ it is a `struct` of function pointers, an `unordered_map`, or a plain aggregate — not a class with a constructor.
3. **It is formed as a literal.** Construction is assigning fields or inserting map entries, not an initialization chain. `allocateEntity`/`finishEntity` would be boilerplate around what is already an object literal.

## Why this boundary holds

The prior "everything is Entity" rule retired semantic exceptions ("just a descriptor", "just wiring") because those categories were unstable — whether something is "just a descriptor" depends on how callers use it. This boundary is different:

Dispatch infrastructure is structurally distinct. Function tables and kind-to-handler maps are recognizable by shape, not by judgment about importance. A `{ submit, createData, isDirty }` bag of function pointers does not evolve into a scene graph node. A `Map<Kind, Renderer>` container does not grow lifecycle or identity. The earlier exceptions failed because "descriptor" is a continuum — a descriptor can gain fields, gain a kind, gain domain meaning, until the label no longer fits. Dispatch infrastructure is not a continuum. A function table stays a function table.

## What is dispatch infrastructure

Types that do not extend Entity and are not allocated via `allocateEntity`/`finishEntity`:

- **Registry tables** (`KeyedTable`, `SlotTable`, `OrdinalTable`) — containers with copy-on-write semantics mapping kinds to handlers. Plain frozen objects.
- **Render registries** (`GlRenderRegistries`, `WgpuRenderRegistries`, `CanvasRenderRegistries`) — bags of registry tables. Destructured into the render state runtime on use.
- **Pipelines** (`GlPipeline`, `WgpuPipeline`, `CanvasPipeline`) — bundles of registries. Read once, identity discarded. Factory return values.
- **Host capabilities** (`HostFileOpenDialogCapability`, `HostWindowLifecycleCapability`, etc.) — function tables mapping platform operations.
- **Renderers** (`Scene2DRenderer`, etc.) — already plain data; confirms the pattern.

## What remains Entity

Domain objects (non-exhaustive):

- **Scene graph**: Node2D, Node3D, Sprite, Text, Shape, Mesh, Scene2D, Scene3D
- **Geometry/math**: Vector2, Matrix, Rectangle, Quaternion
- **Resources**: Image, Texture, Font, Bitmap, AudioChannel, VideoChannel
- **Rendering**: RenderState (GL/WGPU/Canvas/DOM), RenderTexture, RenderTarget
- **Application**: Application, ApplicationWindow, Screen
- **Spatial**: Camera2D, Camera3D, Light, Skeleton
- **Physics**: RigidBody2D, Physics2DWorld, Collider, Joint
- **Animation**: Tween, Timeline, MovieClip, SpritesheetPlayer, Clock
- **Input**: InputManager, Interaction
- **Effects/adjustments/modifiers**: DropShadowEffect, BlurEffect, BrightnessContrastAdjustment, ToonModifier — domain descriptors with kinds and named parameters
- **Configs**: SpringConfig, ParticleEmitterConfig — domain parameter objects
- **Data**: SpritesheetData, Projection, Sampler, TextFormatRange, BitmapFingerprint
- **Collision results**: CollisionRaycastHit2D, CollisionContactManifold3D
- **Signals**: Signal, SignalScope

## Naming convention

`create*` remains reserved for functions that return Entity — it signals "this allocates a domain object." Dispatch infrastructure factories use a different verb or none at all. Host capabilities are plain `const` object literals or are returned from a host initialization function.

## C++ mapping

- **Entity (domain object)** → C++ class with constructor, identity (pointer stability, ref counting or ownership semantics). Simple domain objects (descriptors, configs) are value types with named constructors.
- **Dispatch infrastructure** → C++ `struct` (possibly `constexpr`). Function tables are structs of function pointers. Registry tables are `std::unordered_map` or similar. Pipelines are plain aggregates.

## Side-effect implications

Removing Entity from dispatch infrastructure eliminates module-level `allocateEntity` calls, making infrastructure modules genuinely side-effect-free. Pipeline modules become pure factories; host capability modules export plain objects or deferred initialization functions. Tree-shaking and `"sideEffects": false` become honest for these modules. Domain objects are unaffected.
