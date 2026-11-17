# Dissolve `*Like` Geometry Aliases

_2026-11-17. Architecture record — dissolving `*Like` structural input aliases from geometry and all consumers._

**Status: RATIFIED 2026-11-17.**

## Decision

Remove `Vector2Like`, `RectangleLike`, `MatrixLike`, and all other `*Like` type aliases from both Rust and TypeScript. Functions that currently accept `&RectangleLike` accept `&Rectangle`; TS functions that accept `RectangleLike` accept `Rectangle`. No structural-input escape hatch.

Callers use `createVector2(x, y)`, `createRectangle(x, y, w, h)`, etc. everywhere a geometry value is needed. Plain object literals (`{ x: 0, y: 0 }`) are not accepted where a typed geometry value is expected.

## Rationale

1. **No prior art.** Flash, Unity, Unreal, Godot, Three.js, and PixiJS all require the canonical type — no framework offers a parallel structural-input alias. Flight's `*Like` is unique complexity with no ecosystem precedent.

2. **Entity stays on geometry.** Geometry types retain `EntityRuntimeSlot` to support the future OOP class/object API layer. With the entity runtime key present, a plain `{ x, y }` literal cannot structurally match `Vector2` in TypeScript without the `*Like` alias. Removing `*Like` enforces the single-model rule: one type, one construction path.

3. **AI legibility.** `createVector2(1, 2)` is unambiguous — greppable, self-identifying, and impossible for an AI agent or human reader to confuse with an untyped object literal. This aligns with AGENTS.md: "names, module boundaries, allocation behavior, and grepability are part of the design surface."

4. **FFI simplification.** `*Like` aliases in Rust caused 7 FFI skip entries (`skip_type_param(&RectangleLike)`, `skip_type_param(&mut RectangleLike)`). Dissolving them removes a category of unmapped types from the FFI generator.

5. **Rust IR fidelity.** In Rust, `pub type RectangleLike = Rectangle` is a no-op alias — same type, no structural distinction. The alias exists only to name a role that Rust's type system cannot express. Removing it aligns Rust with what it actually means.

## Scope

- **Rust:** Delete `pub type Vector2Like = Vector2`, `pub type RectangleLike = Rectangle`, `pub type MatrixLike = Matrix`, and all other `*Like` aliases in `flight-geometry`. Replace all usages in function signatures across all crates with the base type.
- **TypeScript:** Delete `*Like` type aliases (`EntityWithoutRuntime<T>` forms) from geometry `types.ts`. Replace all usages in function signatures and call sites. Remove from package exports.
- **Compiler:** Remove any `*Like` emission logic. The compiler emits the base type for both input and output positions.
- **FFI:** Remove `*Like` from SKIP_TYPES if present. Functions previously skipped for `&RectangleLike` params become generable.

## What this does NOT change

- **Entity on geometry** — `Vector2`, `Rectangle`, `Matrix`, etc. remain entities with `EntityRuntimeSlot`. The entity layering refactor (separating identity from storage, potentially making geometry plain value types in Rust) is a separate future arc.
- **`equalsVector2` / `.equals()`** — the equality story is unchanged. TS `===` remains reference equality; structural comparison uses the free function or future class method.
- **f64 migration** — sequenced separately per existing decision. This dissolution simplifies it (fewer aliases to update) but does not depend on or block it.

## Related decisions

- [Entity construction model](entity-construction-model.md) — `create*` is the construction path; `*Like` was the only way to bypass it.
- [f64 geometry direction](../memory: project-f64-geometry) — geometry field widths are a separate arc.
- FFI public-lane rule — `initialize_*` stays skipped; FFI exposes the public API lane only.
