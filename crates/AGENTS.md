# Agent Conventions

This document defines the conventions for code generation and migration in the Flight Rust SDK. Agents porting TS modules, writing tests, or adding new geometry types must follow these rules.

## Core principle

Rust is not idiomatic Rust here — it is an IR that expresses the contract for transpilation to TS, C++, and Haxe. Every design decision serves portability across targets.

## Source file structure

Each module file follows this order, enforced by `cargo-flight-lint`:

1. `use` / `mod` statements
2. Struct and enum definitions
3. Free functions — constructor-first (`create_*`, `initialize_*`), then alphabetical
4. `impl Default` (when needed)
5. `impl` block with method sugar

### Free functions

Every public API must exist as a free function. The impl block is Rust-side sugar only — it is NOT transpiled. Each target language writes its own class/method layer.

See [agents/rust/free-functions.md](../agents/rust/free-functions.md) for the full pattern reference.

### Ordering

- **Source files**: `create_*` and `initialize_*` sort before other functions, then alphabetical
- **Impl blocks**: `new` sorts first, then alphabetical
- **Test modules**: purely alphabetical (no constructor priority — they are test groups, not constructors)

## Test file structure

Test files live in `tests/{module}_test.rs` and use `use flight_geometry::*;`.

### Module-per-function pattern

Each free function gets its own `mod` block. This mirrors TS `describe()` blocks and is enforced by lint rules `test-module-coverage`, `test-module-empty`, and `test-module-order`.

```rust
use flight_geometry::*;

mod add_vector2 {
    use super::*;

    #[test]
    fn returns_sum_of_two_vectors() {
        let a = create_vector2(1.0, 2.0);
        let b = create_vector2(3.0, 4.0);
        let mut out = create_vector2(0.0, 0.0);
        add_vector2(&mut out, &a, &b);
        assert_eq!(out.x, 4.0);
        assert_eq!(out.y, 6.0);
    }

    #[test]
    fn supports_aliased_out_and_a() {
        let mut a = create_vector2(1.0, 2.0);
        let b = create_vector2(3.0, 4.0);
        let a_copy = clone_vector2(&a);
        add_vector2(&mut a, &a_copy, &b);
        assert_eq!(a.x, 4.0);
        assert_eq!(a.y, 6.0);
    }
}
```

### Test naming

Test function names should read as behavioral specifications, matching the spirit of the TS `it(...)` strings:

- **Good**: `fn returns_true_if_rectangle_is_fully_inside()`
- **Good**: `fn returns_empty_rectangle_when_no_intersection()`
- **Bad**: `fn overlap()`
- **Bad**: `fn basic()`

### What tests must cover

- The core behavior of each function
- Aliasing cases (`out === a`, `out === b`) for every out-parameter function — these validate the contract that callers can reuse buffers
- Edge cases from the TS originals (zero vectors, NaN identity, empty rectangles, etc.)

### What tests must NOT do

- Use `::default()` — always use `create_*` functions (enforced by `test-default-call`)
- Call impl methods like `.add()` — always use free functions (enforced by `test-method-call`)
- Use shorthand helper aliases like `r()` or `v()` — use `create_rectangle(...)` and `create_vector2(...)` directly so tests are self-explanatory
- Add section separator comments (`// ── section ──`) or editorial comments

### What tests should skip from TS

- `*Like` object tests (TS-specific structural typing)
- `instanceof` checks
- Tests that mutate fields directly (TS `r.width = -10`) when the Rust equivalent would bypass the free-function contract

## Out-parameter pattern

Functions that compute a result write it to an `out: &mut T` parameter. This matches TS signatures and supports garbage-collection-friendly buffer reuse.

```rust
pub fn add_vector2(out: &mut Vector2, a: &Vector2, b: &Vector2) {
    let ax = a.x;
    let ay = a.y;
    let bx = b.x;
    let by = b.y;
    out.x = ax + bx;
    out.y = ay + by;
}
```

**Alias safety**: Free functions must capture all inputs into locals before writing to `out`. This is required for correctness when `out` aliases an input (extern C boundary semantics).

## Create / Initialize separation

- `create_*` allocates and initializes, and returns by value. Only domain objects (Entities) use `create_*` (D12).
- `initialize_*` writes to pre-allocated `&mut T`. It chains base to derived and supports reuse.
- Every entity struct has a **private** `runtime: EntityRuntimeSlot` field and invokes `flight_entity::impl_entity!(Type)`. Code outside the crate constructs it only through `create_*`. Dispatch infrastructure (renderers, registries, host capabilities) has no runtime.

```rust
pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    let mut out: Vector2 = allocate_entity();
    initialize_vector2(&mut out, x, y);
    return out;
}
```

## Equals pattern

`equals_*` functions take `Option<&T>` to map to nullable in TS (`| null`) and C (`const T*`). They use `std::ptr::eq` for identity (handles NaN-containing structs).

```rust
pub fn equals_vector2(a: Option<&Vector2>, b: Option<&Vector2>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}
```

## Types not defined in Rust

- **`*Like` types**: NOT in Rust. Rust concrete types ARE the contract. TS may widen them to `*Like` or `*Raw`.
- **Pools**: Exist in the free function layer. May not need Rust impl sugar.
- **Open enums**: TBD. Simple closed enums (like `EulerOrder`) are fine for now.

## Lint rules

All enforced by `cargo-flight-lint` (`cargo run -p cargo-flight-lint -- rules` prints this table). `warn` rules track directions still under discussion in [agents/rust/design-decisions.md](../agents/rust/design-decisions.md); they are promoted to `error` when the ruling is approved.

| Rule | Level | Scope | Description |
|------|-------|-------|-------------|
| `parse-error` | error | Source | File failed to parse |
| `fn-order` | error | Source | Free functions ordered: constructors first, then alphabetical |
| `impl-order` | error | Source | Impl methods ordered: `new` first, then alphabetical |
| `file-structure` | error | Source | Sections in order: use/mod, struct, fn, impl |
| `missing-test-file` | error | Source | Every module with pub free functions needs a `tests/{name}_test.rs` |
| `test-coverage` | error | Tests | Every pub free function must be called in its test file |
| `test-module-coverage` | error | Tests | Every pub free function must have a `mod` block in the test file |
| `test-module-empty` | error | Tests | Test modules must contain at least one `#[test]` |
| `test-module-order` | error | Tests | Test modules must be alphabetically ordered |
| `test-method-call` | error | Tests | Tests must not call impl methods |
| `test-default-call` | error | Tests | Tests must not use `::default()` |
| `f64` | error | Source | f64 only in items declared with `allow(f64) <reason>` (D1) |
| `hidden-state` | error | Source | No thread_local!, interior-mutable statics, or clock reads without `allow(hidden-state) <reason>` (D5) |
| `sugar-delegates` | error | Source | Impl methods delegate to a free function and contain no loops (D6) |
| `hashmap-iteration` | error | Source | Maps are for lookup: no iteration over HashMap/HashSet bindings (use a Vec) unless marked `allow(hashmap-iteration) <reason>` (D3) |
| `contract-vocabulary` | warn | Source | Pub signatures, fields, aliases, and constants use only IR vocabulary types (agents/rust/ir-vocabulary.md) |
| `enum-payload-named` | warn | Source | Data-carrying variants hold exactly one named struct (D2) |
| `allow-reason` | error | Source | Every `flight-lint: allow(...)` marker states a reason |
| `allow-unknown-rule` | error | Source | Allow markers name rules that exist |
| `conform-missing` | error | Conform | Every exported TS function has a Rust pub free function |
| `conform-extra` | error | Conform | Every Rust pub free function exists in TS, or is marked `allow(conform-extra)` |
| `conform-array` | error | Conform | Numeric array types match TS under the vocabulary mapping, or are marked `allow(conform-array)` after negotiation |
| `conform-params` | error | Conform | Parameter names and order match TS, or are marked `allow(conform-params)` |

Test-coverage rules apply to plain `pub` free functions only; private and `pub(crate)` helpers are exempt.

### Allow markers

A rule is waived for one item with a comment in the comment/attribute block directly above it (or trailing on its first line). A reason is required:

```rust
// flight-lint: allow(f64) robust orientation predicate needs double precision
pub fn orient2d(...) -> f64 { ... }
```

`// flight-lint: allow-file(rule) <reason>` waives a rule for a whole file. `// flight-lint: conform-skip(tsName, ...) <reason>` in a crate's source records TS exports intentionally absent from Rust. `cargo run -p cargo-flight-lint -- allows [--rule f64]` lists every marker and its reason; that list is the declared-precision inventory for D1.

### Baselines (ratchet)

Existing debt is recorded in `agents/rust/baselines/check.txt` and `agents/rust/baselines/conform.txt`. Gate new work against them:

```
cargo run -p cargo-flight-lint -- check --baseline agents/rust/baselines/check.txt [--crate flight-x]
cargo run -p cargo-flight-lint -- conform <ts-packages-dir> --baseline agents/rust/baselines/conform.txt [--crate flight-x]
```

Only violations beyond the baseline fail. When work removes debt, regenerate with `--write-baseline <file>` so the ratchet tightens; never regenerate to absorb new violations without approval.

### Frozen manifests

`agents/rust/manifests/<crate>.api` (public signatures, type shapes, derives) and `<crate>.tests` (every `#[test]`) are user-owned. `manifest --check [--crate C]` fails on any difference; `manifest --write` regenerates and is reserved for approved contract changes.

## IR vocabulary

Contract types are restricted to the closed vocabulary in [agents/rust/ir-vocabulary.md](../agents/rust/ir-vocabulary.md), so that TS/C++/Haxe output can be produced mechanically. The table is generated from `crates/cargo-flight-lint/src/vocabulary.rs` and enforced by `contract-vocabulary`.

## TS conformance

`cargo run -p cargo-flight-lint -- conform <ts-packages-dir> [--crate flight-x]` compares each crate `flight-<name>` with `<ts-packages-dir>/<name>/src` (in this repository, `packages`). It matches pub free functions to exported TS functions (`export function` and `export const f = (...) =>`) by name, ignoring case and underscores (so `createRay3D` ↔ `create_ray3d`), checks parameter names and order, and checks numeric array types against the vocabulary mapping (`conform-array`; a changed TS array type is negotiated, then marked `allow(conform-array) <reason>`). Missing functions are tagged `public` (re-exported by the package's `index.ts`) or `contract-only` (only via `contract.ts`). Rust-only pub functions need `allow(conform-extra) <reason>`; deliberate signature differences need `allow(conform-params) <reason>`.

## Reference

- [agents/rust/free-functions.md](../agents/rust/free-functions.md) — detailed free function patterns and examples
- [agents/rust/type-stubs.md](../agents/rust/type-stubs.md) — how to write type stubs for cross-module references
