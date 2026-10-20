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

See [agents/free-functions.md](agents/free-functions.md) for the full pattern reference.

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

- `create_*` — allocates and initializes, returns by value
- `initialize_*` — writes to pre-allocated `&mut T`

```rust
pub fn create_vector2(x: f32, y: f32) -> Vector2 {
    let mut out = Vector2::default();
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

All enforced by `cargo-flight-lint`:

| Rule | Scope | Description |
|------|-------|-------------|
| `fn-order` | Source | Free functions ordered: constructors first, then alphabetical |
| `impl-order` | Source | Impl methods ordered: `new` first, then alphabetical |
| `file-structure` | Source | Sections in order: use/mod, struct, fn, impl |
| `missing-test-file` | Source | Every module with free functions needs a `tests/{name}_test.rs` |
| `test-coverage` | Tests | Every free function must be called in its test file |
| `test-module-coverage` | Tests | Every free function must have a `mod` block in the test file |
| `test-module-empty` | Tests | Test modules must contain at least one `#[test]` |
| `test-module-order` | Tests | Test modules must be alphabetically ordered |
| `test-method-call` | Tests | Tests must not call impl methods |
| `test-default-call` | Tests | Tests must not use `::default()` |

## TS conformance

Run `cargo run -p cargo-flight-lint -- conform <ts-src-dir>` to verify that every exported TS function has a corresponding Rust free function (and vice versa). The tool handles camelCase-to-snake_case conversion.

## Reference

- [agents/free-functions.md](agents/free-functions.md) — detailed free function patterns and examples
- [agents/type-stubs.md](agents/type-stubs.md) — how to write type stubs for cross-module references
