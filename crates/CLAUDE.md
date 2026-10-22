# Flight SDK (Rust)

Rust-canonical IR for the Flight SDK. Rust is the authoritative source for transpilation to TypeScript, C++, and Haxe.

## Quick reference

- **Build**: `cargo check -p flight-geometry`
- **Test**: `cargo test -p flight-geometry` (test names read `flight_geometry_aabb_test::<function>::<case>`); `cargo nextest run --workspace` gives one total and skips doctests (run those with `cargo test --workspace --doc`). Long Physics3D stress simulations are opt-in: `--features flight-physics3d/stress-tests` (the gate runs them)
- **Lint**: `cargo run -p cargo-flight-lint -- check` (from workspace root)
- **Lint fix**: `cargo run -p cargo-flight-lint -- fix` (reorders file sections, free functions, impl methods and test modules, and regenerates each `tests/main.rs` and its `[[test]]` / `doctest` settings; run it instead of editing those by hand)
- **Conformance**: `cargo run -p cargo-flight-lint -- conform <ts-src-dir>`
- **TS reference**: `C:\Development\flight\packages\geometry\src\`

## Workspace conventions

- Explicit `return` statements everywhere (`needless_return = "allow"`)
- `too_many_arguments = "allow"` — out-parameter functions naturally have many args
- Edition 2024

## Agent conventions

See [AGENTS.md](AGENTS.md) for all conventions governing code generation and migration work.
