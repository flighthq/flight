# Portability Substrate

**Direction revised 2026-11-16.** Rust is the authoritative IR for the Flight SDK. TypeScript, Haxe, and future C++ targets are generated from Rust by `flight-compiler` and `flight-bindgen`. Hand-written target code is a migration backlog, not a port strategy.

## One source of truth

The failure mode is parallel hand-maintenance: Rust and TS (and Haxe, and C++) all hand-edited, drifting across 160+ packages. That is untenable. **Rust is the canonical source; every other target is generated.** A second hand-authored codebase is a bug, not a port.

## The explicit-over-implicit rule

Rust's type system enforces constraints (ownership, borrowing, mutability) that are invisible to other languages. When a constraint matters across language targets, **it must be an explicit type in Rust, not an implicit guarantee of Rust's type system.** The compiler reads what Rust expresses; it does not infer what Rust implies.

In practice:

- A construction-phase entity is a distinct type (`EntityConstruction<T>`), not a bare `&mut T` whose safety relies on Rust's borrow checker. The newtype costs nothing at runtime and gives every backend a concrete type to map.
- A type hierarchy is expressed through macros and patterns the compiler recognizes (`impl_adjustment!`, `Deref` chains), not left as trait impls the compiler must reverse-engineer.
- A typed array mapping is an annotation (`conform-array`), not an implicit rule about `[f32; N]`.

The test: *could a backend targeting a language with no borrow checker generate correct, safe code from this Rust source without special-casing?* If not, the Rust source is under-specified.

## Why Rust

The substrate must be **known** (to humans and models), **foundation-neutral** (emits plain idiomatic target code, imposes nothing at the surface), and **cellular** (per-package units, tree-shaking preserved). Rust meets all three: it is widely known, imposes nothing on target surfaces, and its crate structure maps directly to Flight's cellular package architecture. Its ownership model makes allocation and lifetime explicit in the source — data the compiler uses, not magic it must reverse-engineer.

## Why not Haxe as the substrate

The original objections still hold — Haxe is a *capstone* (opinionated at the surface, compiling downward), Flight is a *foundation* (neutral primitives, composed upward):

1. **Obscurity.** Models and contributors are fluent in TS/C/C++/Rust and barely in Haxe.
2. **Capstone-down vs foundation-up.** Haxe imposes opinion at the packaging/tooling layer — exactly where Flight's value lives.
3. **Monolithic compilation.** Haxe's whole-program compilation fights per-cell granularity.

Haxe remains a **target** (via `flight-bindgen` and the C FFI), not the substrate.

## Target-specific code

Some code is legitimately target-specific: host backends (`host-web`, `host-electron`, `host-tauri`, `host-capacitor`), renderer implementations (`scene2d-canvas`, `scene2d-dom`, `effects-canvas`), and platform-level type guards. These are hand-written per target by design.

Target-specific *tests* (identity checks, prototype-chain guards, structural duck-typing) are overlays that coexist with generated tests. They test the target platform's runtime, not the domain logic.

## Migration state: `target-native`

`//! flight-compiler: target-native` marks a Rust file whose hand-written TS counterpart has not yet been replaced by compiler output. It is a migration marker, not a capability flag. `--audit-native` on the generate script classifies each file as `compiler-clean`, `partial`, or `blocked`. The backlog shrinks as the compiler's coverage grows and files are migrated.

## The portable subset

Flight source stays inside a lowerable subset. The existing conventions enforce this: explicit allocation (`create*`/`dispose*`/`destroy*`, out-params), free functions over classes, kinds as strings, open registries, `Readonly<>` for immutability. `npm run portable:check` gates non-lowerable dynamic escapes in shipped source.

It is a **C++-family subset, not C99**. Closures, `async`/`await`, generics, and `Map`/`Set` are pervasive and intentional — all lower to C++/Rust/Haxe. C99 is the outlier; the "C-family" target is C++.

## Memory is the crux

GC (TS) → manual (C) → ownership/borrow (Rust) is the real design work, and it is the same problem under any IR. Flight's explicit-allocation discipline exists so that this lowering is expressible. Hot, ownership-heavy paths are hand-written per target as native crates behind registered seams; the codegen carries the cellular, portable bulk.

## Byte layout is a lowering hazard

A class of defect is inert in TS and load-bearing after the port: anywhere the source reaches the same buffer through two different access models. `Float32Array[i]` (element-indexed, host-endian) and `DataView.setFloat32(byteOffset, v, true)` (byte-addressed, little-endian) agree in JS only because current formats are 4-byte-aligned and hosts are little-endian. Neither is a guarantee the source states. A lowered target must pin one access model per buffer, or make endianness and alignment explicit at the seam.

## The convergence

The port substrate is the same machine behind three threads:

- **Ports** — Rust source → TS/C++/C#.
- **Language bindings** — a target emit riding the C ABI that `flight-ffi` produces.
- **ActionScript migration** — AVM2 disassembly → the same pipe, run backwards, as a transpile-to-read aid.

Build the substrate once; "port," "bind," and "migrate" are all backends over the same IR.
