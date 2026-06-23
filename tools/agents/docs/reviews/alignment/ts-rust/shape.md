# TS↔Rust Alignment: @flighthq/shape

**Verdict:** Fully aligned — all 33 TS exports port 1:1 to `flighthq-shape` with identity names and tracking filenames; the only Rust-only artifact (`command_buffer.rs`) is internal plumbing, not a public-API divergence, so nothing needs a divergence-map entry.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| (all 33 exported functions) | snake_case equivalents | None — `npm run rust:conformance` reports `shape  33  33  …  0`; every TS export has a same-named Rust function, full type word preserved (e.g. `appendShapeBeginGradientFill` → `append_shape_begin_gradient_fill`, `computeShapeLocalBoundsRectangle` → `compute_shape_local_bounds_rectangle`). |
| `shapeHitTestRegistry.ts` → `hitTestShapeCommandPoint(): boolean \| null` | `shape_hit_test_registry.rs` → `hit_test_shape_command_point() -> Option<bool>` | None — sentinel convention preserved (`null` → `Option`). |
| `shapeFill.ts` → `hasNonSolidShapeFill(commands)`, `getShapeFillRegions(commands)` | `shape_fill.rs` → `has_non_solid_shape_fill(arena, source)`, `get_shape_fill_regions(arena, source)` | Mechanical-only: Rust reads from `(&DisplayObjectArena, NodeId)` instead of a raw `unknown[]` buffer. This is the documented arena substitution (conformance.md §"What can and cannot be encoded"), not a naming divergence. |
| `computeShapeLocalBoundsRectangle(out, source)` | `compute_shape_local_bounds_rectangle(...)` | None — `out`-param convention carries across. |
| — (no TS counterpart) | `command_buffer.rs` (`clone_command_buffer`, `read_bool`, `read_f32`, `read_key`, `read_u8_vec`, `read_u32`, `AnyBox`) | Rust-only internal module. It models the heterogeneous JS command array (`unknown[]`) as `Vec<Box<dyn Any + Send + Sync>>` with typed readers — pure implementation plumbing with no upstream symbol. Not exported as a counted public API symbol (conformance count is 33 == 33) and not a behavioral divergence, so **no divergence-map entry is required**. Worth a one-line mention only if a future audit wants the Rust-only-helper set documented. |

## In sync

- **Package→crate name:** identity (`@flighthq/shape` → `flighthq-shape`); not in any rename set, correctly so.
- **Export coverage:** 33/33, zero missing, zero unexpected public extras (`rust:conformance` clean for this crate).
- **Filenames track 1:1:** `scale9Shape.ts`↔`scale9_shape.rs`, `shape.ts`↔`shape.rs`, `shapeCommands.ts`↔`shape_commands.rs`, `shapeFill.ts`↔`shape_fill.rs`, `shapeHitTestRegistry.ts`↔`shape_hit_test_registry.rs`. camelCase→snake_case basenames match in every case.
- **Conventions:** sentinel (`null`→`Option`), out-param (`out`→`&mut`/explicit out), and `create_*` allocation verbs all preserved. No abbreviated type words, no renamed-without-reason exports.
- **Divergence map:** no stale `shape` entry, and none needed — every difference observed is a standard mechanical Rust substitution already covered by the general conformance-map language.
