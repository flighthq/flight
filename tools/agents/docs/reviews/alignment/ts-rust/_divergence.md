# TS↔Rust Divergence Map — Audit

Scope: the structural divergence map only — the TS-only (no crate), Rust-only (no package), and rename sets. Compares the actual workspace (`packages/` vs `crates/flighthq-*`) against the documented map in [`tools/agents/docs/rust/conformance.md`](../../../rust/conformance.md) and the hardcoded sets in [`scripts/rust-conformance.ts`](../../../../../scripts/rust-conformance.ts). Per-function/per-file name alignment is covered by the per-package `ts-rust/<name>.md` reviews.

Empirical ground truth (filesystem diff of `packages/` vs `crates/`):

- **84 TS packages, 85 Rust crates.** 78 map by identical name.
- **TS-only (package, no crate), 8:** `displayobject-canvas`, `displayobject-dom`, `effects-canvas`, `filters-canvas`, `filters-css`, `host-electron`, `surface-rs`, `textshaper-canvas`.
- **Rust-only (crate, no package), 7:** `capture`, `displayobject-skia`, `functional`, `host-sdl`, `host-web`, `host-winit`, `surface-wasm`.

`npm run rust:conformance` structural gate: **FAIL — 2 violations** (`surface-rs` reported missing, `surface-wasm` reported unexpected). Both trace to the single drift below; the other 13 entries are documented and correct.

## Documented & correct

Every excluded/Rust-only entry except the surface pair is documented with a rationale and matches the filesystem exactly — no stale entries, no undocumented additions.

**TS-only, all in conformance.md "Excluded — no substrate in the box" + script `TS_ONLY` (7/7 match):**

| TS package | Documented rationale | Verdict |
| --- | --- | --- |
| `displayobject-canvas` | Canvas2D context is a browser substrate; software render covered by `displayobject-skia`. | Correct |
| `displayobject-dom` | DOM tree absent from the box; genuinely N/A. | Correct |
| `effects-canvas` | Canvas2D context; CPU effects covered by `effects`/`filters-surface`. | Correct |
| `filters-canvas` | Canvas2D context; CPU filters covered by `filters-surface`. | Correct |
| `filters-css` | CSS filter strings = browser-applied style; no CSS engine in box. | Correct |
| `host-electron` | Electron main process; every capability it backed is its own crate seam; hosts are `host-winit`/`host-sdl`/`host-web`. | Correct |
| `textshaper-canvas` | Canvas `measureText` backend; the shaper _seam_ (`textshaper`) is ported, native backend is rustybuzz. | Correct |

**Rust-only, all in conformance.md "Rust-only (no TS counterpart)" + script `RUST_ONLY` (6/6 match):**

| Rust crate | Documented role | Verdict |
| --- | --- | --- |
| `host-winit` | Primary native host (winit + wgpu). | Correct |
| `host-sdl` | Alternative native host (SDL3 + wgpu). | Correct |
| `host-web` | Wasm conformance instrument (canvas + wgpu + web backends). | Correct |
| `capture` | Headless offscreen render → PNG/fingerprint; native conformance gate. | Correct |
| `functional` | Conformance scene registry; Rust analogue of `tests/functional/`. | Correct |
| `displayobject-skia` | Portable software display-object renderer (tiny-skia); in-box substitute for the Canvas2D capability. | Correct |

**Renames:** the `RENAMES` map is empty in both the doc and the script, and that is correct for the 78 identity-mapped pairs. The `world→scene`, `tween-easing→easing`, `resources-loader→loader`, `text-input→textinput`, `text-layout→textlayout`, `surface-filters→filters-surface` renames listed in conformance.md "Renames (Rust catching up)" have all landed on both sides — the table is an audit trail, not pending work, and the filesystem confirms every target name exists as both package and crate. The `camera`/`webcam` semantic split (old photo-capture `camera` → `webcam`; new `camera` = 3D camera) is correctly realized: both `webcam` and `camera` exist as both package and crate, and `WEB_PACKAGES` lists `webcam` (not the 3D `camera`).

## Undocumented drift

One pair, and it is the only structural-gate failure in the whole map.

### `@flighthq/surface-rs` (package) ↔ `flighthq-surface-wasm` (crate) — undocumented name divergence

A **real TS package** `@flighthq/surface-rs` exists (`packages/surface-rs/package.json`, `version 1.0.0`) — the wasm-mixing shim that re-exports `@flighthq/surface` with wasm-accelerated overrides (`packages/surface-rs/src/surfaceWasm.ts`). It is backed by the Rust crate `flighthq-surface-wasm`, whose own manifest is explicit about the pairing: `description = "wasm-bindgen bindings for flighthq-surface; backs the @flighthq/surface-rs npm shim"`.

This is a genuine package↔crate pair, but the names diverge from the identity rule (`@flighthq/<name>` → `flighthq-<name>` would require `flighthq-surface-rs`), and the divergence is **recorded nowhere**:

- Not in `RENAMES` (the script's `RENAMES` is `{}`).
- Not in `TS_ONLY` (surface-rs is _not_ excluded — it has a crate).
- Not in `RUST_ONLY` (surface-wasm is _not_ counterpart-less — it backs surface-rs).
- Not in any conformance.md table (neither "Excluded", "Rust-only", nor "Renames").

Consequence: the structural gate sees `surface-rs` as a TS package with no `flighthq-surface-rs` crate (**missing crate**) and `surface-wasm` as a crate with no `surface-wasm` package (**unexpected crate**) → the 2 reported violations and a RED gate. The drift is purely the unreconciled name; the implementations are aligned (the sibling per-package reviews `ts-rust/surface.md` and `deps/surface-rs.md` confirm the function/file/dep alignment is sound).

**Fix (one of):**

1. **Rename the crate** `flighthq-surface-wasm` → `flighthq-surface-rs` (and its `[lib]`/wasm-pack `--out-name` references). Restores identity, empties the divergence cleanly, no map entry needed. Cleaner choice — it removes the special case rather than recording it.
2. **Record the rename**: add `'surface-rs': 'surface-wasm'` to `RENAMES` in `scripts/rust-conformance.ts` **and** a row in conformance.md "Renames" with the rationale (the `-rs` suffix is the NPM mixing-shim convention; `-wasm` names the wasm-bindgen crate). This keeps both names but makes the divergence a reviewed entry instead of drift.

Option 1 is preferred: the surface-rs depth/maturation reviews already treat `flighthq-surface-wasm` as the surface-rs crate, so identity is the lowest-friction end state. If the `-wasm` crate name is deliberately kept (to read as "the wasm-bindgen layer, distinct from a hypothetical native `-rs` crate"), option 2 is acceptable but must include the conformance.md row.

## Stale / questionable entries

- **`index.md` "Mixing" calls surface-rs a _future_ package — now stale.** Both `tools/agents/docs/rust/index.md` line 19 ("e.g. a **future** `surface-rs` NPM package") and line 102 ("A `surface-rs` NPM package **would be**…") are written in the conditional/future tense, but `@flighthq/surface-rs` ships today (`version 1.0.0`, with tests, build scripts, and a backing crate). Update both to present tense and point at the package as the realized mixing exemplar. The "Mixable set is the best first conformance target" note then reads as advice that has been taken, not a prospect.

- **conformance.md line 156 "`RENAMES` is empty (every mapped package is identity post-reorg)" is inaccurate as long as the surface pair exists.** `surface-rs`/`surface-wasm` is a mapped, non- identity pair; the sentence is only true if option 1 above is applied (rename to identity). If option 2 is chosen, this line must change to reflect the one remaining rename. Either way the line is currently a false invariant.

- **conformance.md "Excluded" closing line (line 154) and "Crate alignment status" both omit the surface pair from any list.** The excluded set is complete and correct _as an excluded set_, but because surface-rs is neither excluded nor a clean rename today, the map has no slot describing it at all — the gap that lets it be drift. Whichever fix is chosen, the surface family deserves one explicit sentence in conformance.md so a reader knows the `surface-rs`↔`surface-wasm` mapping is intentional, not an oversight.

- **No other stale entries.** All 6 documented excluded packages and 6 documented Rust-only crates resolve to real filesystem entries; no documented entry points at a package/crate that no longer exists. The rename table's targets all exist. The 3D-pipeline crates the map claims are "done" (`mesh`, `lighting`, `texture`, `camera`, `scene-gl`, `scene-wgpu`) all exist as crates.

## Recommendations

1. **Resolve the surface pair (the only hard gate failure).** Prefer renaming the crate `flighthq-surface-wasm` → `flighthq-surface-rs` to restore identity; otherwise add a `RENAMES` entry **and** a conformance.md "Renames" row with rationale. Either makes `npm run rust:conformance`'s structural gate green.
2. **De-future the Mixing section** in `tools/agents/docs/rust/index.md` (lines 19, 102): surface-rs exists; describe it in present tense as the realized value-leaf mixing package.
3. **Fix the "RENAMES is empty" invariant** in conformance.md line 156 to match whichever fix is applied to recommendation 1.
4. **Add one sentence to conformance.md** naming the `surface-rs`↔`surface-wasm` relationship so the surface mixing family is no longer absent from every map table.
5. **Keep the map and script as the dual source of truth.** Once the surface pair is reconciled, every one of the 84 packages and 85 crates is accounted for by an identity map, a documented exclusion, a documented Rust-only role, or a documented rename — no remaining structural drift.
