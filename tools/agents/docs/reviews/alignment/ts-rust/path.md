# TS↔Rust Alignment: @flighthq/path

**Verdict:** Near-perfect alignment — every TS export maps 1:1 by name and file, with correct camelCase→snake_case and out-param conventions; the only issue is one undocumented Rust-only function (`clear_path`) that the conformance script does not flag.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| _(none)_ | `clear_path` — `path.rs` | **Undocumented Rust-only function.** No `clearPath` exists in `@flighthq/path` (`packages/path/src/path.ts`). TS is authoritative, so this is silent drift: not in the divergence map and invisible to `npm run rust:conformance` (it reports path `7\|7\|31\|0`, counting only TS-derived functions; Rust extras are not surfaced in the "missing" column). Resolve by either adding `clearPath` upstream to TS (a natural mutable-`Path` reset helper — TS `Path` is a plain `{commands, data}` object) or recording the divergence with a rationale. Adding it upstream is the cleaner fix and keeps the crate a true conform. |
| `tessellatePath(path): PathMesh` — `tessellatePath.ts` | `tessellate_path(path, tolerance, out: &mut PathMesh)` — `tessellate_path.rs` | Not a defect — sanctioned mechanical mapping. TS allocates and returns `PathMesh`; Rust writes into an `out: &mut PathMesh`. The conformance map explicitly treats `&mut` out-params as an expected, review-surfaced (not gated) difference. No action. |

## In sync

- **Package→crate name:** `@flighthq/path` → `flighthq-path`. Identity, no rename needed.
- **Function names (7/7 TS exports ported, names exact):** `appendPathCubicCurveTo`→`append_path_cubic_curve_to`, `appendPathCurveTo`→`append_path_curve_to`, `appendPathLineTo`→`append_path_line_to`, `appendPathMoveTo`→`append_path_move_to`, `createPath`→`create_path`, `flattenPath`→`flatten_path`, `tessellatePath`→`tessellate_path`. Full type word preserved throughout (`Path`, `CubicCurveTo`, etc.); no abbreviations.
- **File names track 1:1:** `path.ts`→`path.rs`, `flattenPath.ts`→`flatten_path.rs`, `tessellatePath.ts`→`tessellate_path.rs`. Same domain/object basenames.
- **Mutation conventions carry across:** TS `append*`/`createPath` mutate-or-allocate semantics map to Rust `&mut Path` mutators and `create_path` allocator. `Readonly<Path>` on `flattenPath`/`tessellatePath` maps to `&Path` immutable borrows.
- **`PathWinding` default:** TS `createPath(winding = 'nonZero')` ↔ Rust `create_path(winding)` with documented `PathWinding::NonZero` default semantics. Type words `nonZero`/`evenOdd` ↔ `NonZero`/`EvenOdd` align.
- **Cargo description** matches the TS `package.json` description verbatim.

### Divergence-map note

Add a `path` row to the divergence map (`tools/agents/docs/rust/conformance.md`) only if `clear_path` is kept as Rust-only; preferred resolution is adding `clearPath` upstream so no map entry is needed. No stale path entries exist in the map today (the sole mention is a removed dead `render-wgpu → path` manifest dep, unrelated to this crate's API).
