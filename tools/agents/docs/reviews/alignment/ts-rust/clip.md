# TS↔Rust Alignment: @flighthq/clip

**Verdict:** Closely aligned — all three TS exports port 1:1 with correct snake_case names, but the Rust crate carries one extra public function (`intersect_clip_regions`) that has no TS upstream and is not in the divergence map; this is undocumented drift that must be recorded or removed.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `@flighthq/clip` | `flighthq-clip` | Package→crate name is identity. OK. |
| `createClipRegionFromPath` (`clipRegion.ts`) | `create_clip_region_from_path` (`lib.rs`) | Name ports 1:1, full type word preserved. TS has a default `tolerance = 0.25`; Rust takes an explicit `tolerance: f32` with no default (Rust has no default params) — idiomatic, expected difference, callers must pass `0.25`. Not drift. |
| `createClipRegionFromRectangle` (`clipRegion.ts`) | `create_clip_region_from_rectangle` (`lib.rs`) | Name ports 1:1. TS copies via `cloneRectangle`; Rust copies via `*rectangle` (`Rectangle: Copy`) — semantically equivalent (source-independence test present in both). OK. |
| `invalidateClipRegion` (`clipRegion.ts`) | `invalidate_clip_region` (`lib.rs`) | Name ports 1:1. TS `(version + 1) >>> 0` ↔ Rust `wrapping_add(1)` on `u32` — equivalent wrap-on-overflow; both tested. OK. |
| — (no TS counterpart) | `intersect_clip_regions` (`lib.rs`) | **Extra Rust function with no TS upstream.** `grep` confirms no `intersectClipRegions`/`intersectClip` anywhere in `packages/`. Not present in the divergence map (`conformance.md` has no `intersect`/`clip`-function entry). This is silent drift: per the conformance rule every TS↔Rust difference must be a recorded entry with a rationale. Either remove it (and let backends compute the conservative bounding-box intersection where needed) or, if the intersect operation is genuinely wanted, add it upstream to `@flighthq/clip` as `intersectClipRegions(a, b, out)` first so TS stays authoritative — then it is a port, not an extra. As-is it should at minimum be a documented Rust-only entry. |
| `clipRegion.ts` / `clipRegion.test.ts` | `lib.rs` (single-file crate, `#[cfg(test)] mod tests`) | Filename does not track (`clip_region.rs` would mirror the TS basename). Acceptable for a tiny single-file crate where `lib.rs` is the standard Rust shape; flagged only as the nice-to-have it is. |

Out-param / sentinel / teardown conventions: the one out-param function (`intersect_clip_regions`) uses `&mut out` and is alias-safe (reads inputs into locals first, with an aliased-`out` test) — correct, even though the function itself is the drift item above. No teardown verbs apply (plain-data leaf crate). No sentinels needed. The private helpers `compute_contours_bounds` / `rectangle_intersection` correctly mirror TS-internal `setRectangleToContoursBounds` and are not exported, so they are not public-surface drift.

## In sync

- Package→crate name identity (`@flighthq/clip` → `flighthq-clip`).
- All three TS public exports ported with correct camelCase→snake_case and full type words preserved.
- `ClipRegion` shape (`contours` `null`→`Option`, `rect`, `version: u32`, `winding`) consistent; path-form (`Some`) vs rectangle-form (`None`) distinction matches TS (`null` contours).
- Shared `flatten_path` reused from `flighthq-path` rather than duplicated, matching the TS import from `@flighthq/path`.
- Bounding-box computation and empty-contour zero-rect behavior match the TS `setRectangleToContoursBounds` private helper (including the `min_x > max_x` empty guard).
- Version-bump wrap semantics match across `invalidate_clip_region` and the post-intersect bump.

**Divergence-map action:** add an entry for the Rust-only `intersect_clip_regions` (or remove the function). No existing clip map entries appear stale — there simply are none yet for this crate.
