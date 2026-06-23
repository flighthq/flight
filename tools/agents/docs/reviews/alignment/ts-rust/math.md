# TS↔Rust Alignment: @flighthq/math

**Verdict:** Strong alignment — both TS exports map 1:1 by name; the only gap is the `RandomSource` closure→struct reshape (forced by Rust) and its four extra `random_next_*` accessors, which are correct but not yet recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createRandomSource` (`random.ts`) | `create_random_source` (`lib.rs`) | Aligned. Signature differs by host idiom: TS `seed: number`, Rust `seed: u64` (docs both coerce to low 32 bits). Fine. |
| `nextPowerOfTwo` (`nextPowerOfTwo.ts`) | `next_power_of_two` (`lib.rs`) | Aligned 1:1. TS `n: number`, Rust `n: u32`; both return 1 for inputs ≤ 1. Behavior documented as matching. |
| `RandomSource` (closure `() => number`, type from `@flighthq/types`) | `RandomSource` (struct with `state: u32`) (`lib.rs`) | **Reshape, undocumented.** TS `RandomSource` is a callable closure; calling it yields the next `[0,1)` value. Rust models it as a value-typed struct advanced by free functions. Necessary (free-functions-over-closures + value-type rules), but not in the divergence map. |
| `random()` (calling the returned closure) | `random_next_f64` (`lib.rs`) | **Renamed, undocumented.** This is the direct port of "call the source to get `[0,1)`". The name is good and matches the free-function convention, but the closure→named-call mapping should be recorded. |
| — (no TS equivalent) | `random_next_u32` (`lib.rs`) | **Rust-only.** Raw 32-bit output before the `/2^32` divide. Reasonable building block; not in TS, not in map. |
| — (no TS equivalent) | `random_next_f32` (`lib.rs`) | **Rust-only.** `f32` convenience over `random_next_f64`. Not in TS, not in map. |
| — (no TS equivalent) | `random_next_in_range` (`lib.rs`) | **Rust-only.** `[min, max)` convenience. Not in TS, not in map. |
| `random.ts` + `nextPowerOfTwo.ts` (two files) | `lib.rs` (single file) | **File-name drift (minor).** The two TS source files collapse into one `lib.rs`; the per-object basenames (`random`, `next_power_of_two`) are not tracked as `random.rs` / `next_power_of_two.rs`. Acceptable for a 6-function crate, but worth a note since the convention prefers tracking. |

## Notes for the divergence map

The math crate is **not** mentioned anywhere in `tools/agents/docs/rust/conformance.md`, yet it carries a real (if small and idiomatic) reshape. Add a short entry so it is recorded drift, not silent:

- **`math` — `RandomSource` is a value-typed struct, not a closure.** TS exposes `RandomSource` as a callable `() => number` returned by `createRandomSource`; calling it advances and returns `[0,1)`. Rust cannot return an ergonomic mutable-state closure as a plain value type, so it ports `RandomSource` as a `struct { state: u32 }` advanced by free functions. `random_next_f64` is the 1:1 port of "call the source" (the TS `random()` return value). `random_next_u32` (raw output), `random_next_f32`, and `random_next_in_range` are Rust-only conveniences with no TS counterpart. Rationale: free-functions-over-methods + value-type rules; the underlying mulberry32 sequence is bit-identical to TS.

This pairs naturally with the existing line-66 note that `particles` "inlines its RNG instead of using `flighthq-math`'s `create_random_source`" — that note already assumes this API exists, so documenting the shape here closes the loop.

No stale map entries found (there are none for `math`).

## In sync

- **Crate name** `flighthq-math` ↔ `@flighthq/math` — identity, correct.
- **Both TS exports ported**, snake_cased correctly, full type words preserved (`createRandomSource`→`create_random_source`, `nextPowerOfTwo`→`next_power_of_two`). `npm run rust:conformance` reports `math | 2 | 2 | 14 | 0` (both TS exports matched, zero missing, no warning).
- **Algorithm fidelity:** mulberry32 is ported step-for-step with `wrapping_*` ops mirroring `Math.imul`/`| 0` semantics, and the `/4_294_967_296.0` divide matches TS `>>> 0 / 4294967296` — the sequence is deterministic and cross-platform-identical, which is the whole point of this util.
- **`nextPowerOfTwo` edge cases** (`≤1 → 1`, exact powers unchanged, round-up) match and are explicitly tested on both sides.
- **No abbreviations, no missing ports, no renamed-without-reason** among the mapped exports. The extra Rust functions are additive accessors, not divergent renames.
- **Conventions:** out/sentinel/teardown verbs are not applicable here (pure value math, no allocation lifecycle, no nullable lookups); nothing to carry across.
