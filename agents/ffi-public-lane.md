# FFI Exposes the Public API Lane

_2026-11-17. Architecture record — the C ABI surface matches the public export lane, not the contract lane._

**Status: RATIFIED 2026-11-17.**

## Decision

The FFI (`flight-ffi`) generates bindings for functions in the **public lane** (`index.ts` / root `.` entry point) only. Functions exported exclusively through the **contract lane** (`contract.ts` / `./contract`) are not exposed through the C ABI.

## Consequence: `initialize_*` stays internal

The 122 `initialize_*` functions are contract-lane exports (169 in `contract.ts`, only 2 in `index.ts`). They exist for the allocate-initialize entity construction model — used by `create_*`, `clone_*`, and pool `acquire_*` internally. FFI consumers use `create_*` to construct and field setters to customize ("create and decorate"), not the allocate-initialize split.

The FFI generator's current `prefix_skip(initialize_)` rule produces the right result but for the wrong reason. The skip should check export-lane membership, not prefix-match the name. The two public-lane `initialize*` functions (`initializeFontResource`, `initializeGlyphRasterizerBackendFromGlyphOutlineSource`) are subsystem initializers — different sense of the word — and should be generated.

## Rationale

1. **Smaller, stable surface.** The public lane is the app-developer API — what end users see. Contract-lane changes (inter-package wiring, internal construction) don't break FFI consumers.

2. **No custom entity extension from C.** A Haxe consumer building a custom `Node2D` subkind through `allocateEntity` + `initialize_node2d` + their own init would be reimplementing the entity hierarchy outside the SDK. That is not a supported pattern. Consumers compose from the SDK's factories.

3. **"Create and decorate" is sufficient.** `create_sprite()` + set fields covers all consumer construction needs. The allocate-initialize split is an internal optimization for pool reuse and clone paths.

## Consequence: extension points are out of scope

FFI exposes the **consumption** API — create, configure, query, render — not the **extension** API. Extension points are functions where the consumer provides behavior _back_ to the SDK: custom node kinds, import pipeline handlers, custom renderers, runtime-method tables. These require lifetime-scoped mutable contexts, trait-object callbacks, or vtable construction that the C ABI cannot enforce safely.

Concretely excluded:

- **Import context handlers** (Lottie/SVG/Rive `&mut Ctx<'_, '_>` params) — C consumers parse a file and get a scene graph; they don't hook individual shape/layer handlers.
- **Closure/callback extension params** (`Arc<dyn Fn(...)>` construction) — C consumers call into Rust; they don't provide Rust-callable behavior objects.
- **Runtime-method tables** (`BoundsRectangleRuntimeMethods`, `Transform2DRuntimeMethods`) — internal dispatch tables, not consumer-facing.

This is an alpha-level policy. Extension-point FFI (C vtable adapters, callback bridges) is future work once the consumption surface is complete.

## Implementation

Replace the prefix-based skip with an export-lane check: a function is generated if and only if it appears in its package's public exports (the root `.` entry). The generator already knows the crate-to-package mapping; it needs an additional input of which functions are public-lane.
