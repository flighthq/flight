# Flight SDK (Rust)

Rust-canonical IR for the Flight SDK. Rust is the authoritative source for transpilation to TypeScript, C++, and Haxe.

## Quick reference

- **Build**: `cargo check -p flight-geometry`
- **Test**: `cargo test -p flight-geometry`
- **Lint**: `cargo run -p cargo-flight-lint -- check` (from workspace root)
- **Lint fix**: `cargo run -p cargo-flight-lint -- fix`
- **Conformance**: `cargo run -p cargo-flight-lint -- conform <ts-src-dir>`
- **TS reference**: `C:\Development\flight\packages\geometry\src\`

## Workspace conventions

- Explicit `return` statements everywhere (`needless_return = "allow"`)
- `too_many_arguments = "allow"` — out-parameter functions naturally have many args
- Edition 2024

## Agent conventions

See [AGENTS.md](AGENTS.md) for all conventions governing code generation and migration work.
