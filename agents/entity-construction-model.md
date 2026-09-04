# Entity Construction Model

_2026-09-04. Architecture record — the allocate-initialize construction discipline for all Entity types._

**Status: UNRATIFIED.** Read before adding a `create*` factory, changing how a hierarchical entity is
constructed, or adding a base type or trait initializer.

## The problem

`createEntity({ ...allFields })` erases field ownership and constructor order. For a hierarchical
entity like `Sprite`, the current construction chain builds inside-out:

```
createSprite(obj)
  -> createNode2D(SpriteKind, obj, createSpriteData, createSpriteRuntime)
    -> createNode(kind, obj, createSpriteData, runtimeFactory)
      -> { data, name, kind, [EntityRuntimeKey]: runtimeFactory() }
    <- initTransform2DTrait(out, obj)
    <- initAppearanceTrait(out, obj)
    <- ...
```

`createNode` builds the base entity as an object literal and returns it; `createNode2D` then mutates
it with trait initializers. Three consequences:

1. **Field ownership is invisible.** No static or structural signal identifies which layer owns which
   field. A derived type can overwrite a base-owned field after base initialization with no warning.

2. **Construction order is encoded in the wrong direction.** The innermost call (`createNode`)
   allocates and initializes first; the outermost (`createSprite`) runs last. This is the inverse of
   constructor chaining, where the most-derived constructor calls `super()` first and the base
   initializes first.

3. **`createEntity` is bypassed for the most important case.** `createNode` builds its object literal
   directly rather than calling `createEntity`, because `createEntity` takes a fully-constructed
   object — but the runtime must be allocated as part of construction, not stamped onto a finished
   object. The factory that exists for flat entities cannot serve hierarchical ones.

The runtime side already follows the correct pattern: `createSpriteRuntime` ->
`createNode2DRuntime` -> `createNodeRuntime` -> `createEntityRuntime`, where each layer calls its
base first and then assigns its own fields. The entity side does not.

## The model

One allocation. Base-to-derived initialization. Strict field ownership.

### Source shape

Initializers call their own base — the inheritance chain is encoded in the initializers, not repeated
at every `create*` call site:

```typescript
function initializeNode<T extends Node>(
  out: EntityConstruction<T>,
  options: Readonly<NodeOptions>,
): void {
  out.enabled = options.enabled ?? true;
  out.name = options.name ?? null;
}

function initializeNode2D<T extends Node2D>(
  out: EntityConstruction<T>,
  options: Readonly<Node2DOptions>,
): void {
  initializeNode(out, options);
  initializeTransform2D(out, options);
  initializeBoundsRectangle(out, options);
}

function initializeSprite(
  out: EntityConstruction<Sprite>,
  options: Readonly<SpriteOptions>,
): void {
  initializeNode2D(out, options);
  out.data = createSpriteData(options.data);
}
```

Each public constructor allocates its own concrete type exactly once:

```typescript
export function createNode2D(options?: Readonly<Node2DOptions>): Node2D {
  const out = allocateEntity<Node2D>();
  initializeNode2D(out, options ?? {});
  return finishEntity(out);
}

export function createSprite(options?: Readonly<SpriteOptions>): Sprite {
  const out = allocateEntity<Sprite>();
  initializeSprite(out, options ?? {});
  return finishEntity(out);
}
```

`createSprite` never calls `createNode2D`, because that would allocate a `Node2D` and then attempt
to promote it into a `Sprite`. It calls the `Node2D` *initializer* instead.

### `allocateEntity<T>()`

Replaces `createEntity` as the low-level construction primitive. Returns
`EntityConstruction<T>` — a writable variant of `T` for the under-construction window. Assigns only
`[EntityRuntimeKey] = undefined`. Called exactly once, at the most-derived `create*` function.

### `EntityConstruction<T>`

The construction type removes `readonly` from all fields, making them writable during initialization.
It serves two purposes:

- **Parameter constraint on initializers.** `initializeNode2D<T extends Node2D>(out: EntityConstruction<T>)`
  makes the under-construction state visible in the type signature. An initializer cannot accept a
  finished entity, and a finished entity cannot be passed to an initializer.
- **Writable window.** The public `Sprite` type has `readonly` fields. The construction type permits
  assignment during the initialization window without a cast.

TypeScript cannot enforce definite initialization across separate function calls, so
`EntityConstruction<T>` does not guarantee all fields are assigned — that is a script-level check
(see [Enforcement](#enforcement)). What it does guarantee is that the *construction* and *finished*
states are distinct types that cannot be confused at call sites.

### `finishEntity(out)`

A zero-cost cast from `EntityConstruction<T>` to `T`. At runtime it returns the same object. Its
purpose is to mark the boundary where construction ends and the public readonly contract begins.
Every `allocateEntity` has a matching `finishEntity` — grep-able and enforceable by a lint rule.

### Initializers

Each initializer calls its base first, then writes only the fields its own layer introduced:

- `allocateEntity` assigns `[EntityRuntimeKey]`.
- `initializeNode` assigns `kind`, `name`, `enabled`, `data`, and allocates the `NodeRuntime`.
- `initializeNode2D` calls `initializeNode`, then assigns the transform, bounds, appearance, blend,
  material, and clip fields via trait initializers (`initializeTransform2D`,
  `initializeBoundsRectangle`, etc.), and extends the runtime to `Node2DRuntime`.
- `initializeSprite` calls `initializeNode2D`, then assigns only Sprite-specific fields.

An interface such as `HasTransform2D` declares fields but does not assign them; its designated
initializer (`initializeTransform2D`) owns the assignment, called from within the layer that
introduces the trait.

### Base-field customization

When a derived type supplies the value of a base field, it passes that value down through the options
to the base initializer:

```typescript
// SpriteOptions extends Node2DOptions extends NodeOptions
// kind is a NodeOptions field; the derived type supplies it
initializeSprite(out, { ...userOptions, kind: SpriteKind });
```

It must not do this:

```typescript
initializeNode(out, options);
out.kind = SpriteKind;  // derived layer overwrites base-owned storage
```

For an interface-declared field with no concrete base storage — such as a platform Host narrowing an
abstract capability — the concrete platform layer owns the assignment.

## Properties

1. **Exactly one allocation**, at the most-derived `create*` function.
2. **Initializers call their base first**, then write their own fields — canonical base-to-derived
   order with the chain encoded in the initializers, not the caller.
3. **Each initializer writes only fields owned by its layer.**
4. **Every required field is assigned exactly once before `finishEntity`.**
5. **The under-construction value does not escape**, is not registered, and is not returned early.
6. **No object spreads or `Object.assign` across inheritance layers** (options structs may spread;
   entity field assignment must not).
7. **Base-field customization is passed through options to the base initializer**, never overwritten
   afterward.

## Flat entities

For completely flat, non-inherited entities (a `Matrix`, a `Rectangle`, a `SpriteData`), the model
is the same but trivial: `allocateEntity` + one initializer + `finishEntity`.

```typescript
export function createMatrix(): Matrix {
  const out = allocateEntity<Matrix>();
  initializeMatrix(out);
  return finishEntity(out);
}
```

One uniform model avoids the refactoring cliff where a formerly flat type must be rewritten when it
gains a base or trait initializer. A flat entity that uses `createEntity({...})` today works, but
when it becomes hierarchical it changes construction dialect entirely. One dialect prevents that.

## `createEntity` disposition

`createEntity({ fields })` is deprecated for new code. Existing call sites migrate to
`allocateEntity` + initializer(s) + `finishEntity` as they are touched. A file that adopts
`allocateEntity` removes its `createEntity` calls in the same commit — no dual dialect within a file.

`createEntity` remains available during the migration.

## Runtime construction alignment

The runtime side (`createEntityRuntime` -> `createNodeRuntime` -> `createNode2DRuntime` ->
`createSpriteRuntime`) already follows allocate-then-initialize semantics: the base allocates, each
layer calls its base first, and each assigns only its own fields. This model extends the same
discipline to the entity side, making both halves symmetric.

The runtime allocation verb becomes `allocateEntityRuntime` for consistency.

## Structural change to factory inheritance

The current pattern constructs a base object and progressively "promotes" it:

```
createSprite()
  -> createNode2D()
    -> createNode()
      -> createEntity(...)  // allocate + base fields
    <- trait mutations       // derived fields
  <- sprite mutations        // leaf fields
```

The new pattern allocates once. Each `create*` calls one initializer; the initializer calls its base:

```
createSprite()
  -> allocateEntity<Sprite>()
  -> initializeSprite()
    -> initializeNode2D()
      -> initializeNode()    // base fields first
    <- Node2D fields         // derived fields
  <- Sprite fields           // leaf fields
  -> finishEntity()
```

This is mechanically equivalent to:

```cpp
class Sprite : public Node2D {
  Sprite(const SpriteOptions& opts) : Node2D(opts) {
    // Sprite-only fields
  }
};
```

without requiring ESM classes. The allocation is one `malloc`; each initializer writes to known
offsets; no vtable, no hidden `this` binding.

## Enforcement

Property 4 (every required field assigned exactly once) is a documentation contract, not a
compile-time guarantee. `EntityConstruction<T>` makes the construction window type-visible but cannot
prove all fields were written. This is the cost of staying in free-function land, accepted because
tree-shaking, the absence of prototype chains, and C portability outweigh the constructor's built-in
definite-assignment check.

A script-level check (`construction:check`) can validate:

- Every `allocateEntity` call has a matching `finishEntity` without the value escaping between them.
- Each initializer writes only fields declared by its layer's type (ownership derived from type
  declarations in `@flighthq/types`).
- No field is assigned by two construction layers.

Deferred until the first hierarchical factory is migrated, since a check with nothing to observe
cannot be tested (same deferral pattern as explicit-dependency-model R4).

## `NodeDataFactory` pattern

`createNode` currently takes a `createData` factory parameter that allocates the node's data payload
and threads it through the base. Under the new model, data initialization belongs in the leaf
initializer (`initializeSprite` assigns `out.data = createSpriteData(options.data)`), not as a
factory parameter threaded through the base — the base has no reason to know about derived data
shapes.

## Relationship to existing work

- **Explicit dependency model** — the Entity boundary section ("Entity is the base type for every
  object Flight defines and allocates") is unchanged. What changes is how entities are constructed,
  not what qualifies as one. `create*` always returns Entity.
- **C/C++ port readiness** — the allocate-initialize model maps directly to C-style struct
  construction (`malloc` + per-layer init functions) and to C++ constructor chaining. Field ownership
  properties translate to "each initializer writes only its own struct members."
- **Runtime slots** — the subsystem-attached-state pattern (nullable property on the narrowest
  runtime tier, lazy accessor) is orthogonal. The construction model governs the initial allocation
  and field assignment; runtime slots are post-construction extensions.
