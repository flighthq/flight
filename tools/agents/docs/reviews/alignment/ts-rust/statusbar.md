# TS↔Rust Alignment: @flighthq/statusbar

**Verdict:** Fully aligned — all 7 TS exports ported 1:1 with correct snake_case names, files track, and the one DOM-bound carve-out is documented in-source; the `7 ⚠️` conformance miss is a script false-negative (it reads leaf test names, not the `mod <fn>` wrapper), not a port gap.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createWebStatusBarBackend` (`statusbar.ts`) | `create_web_status_bar_backend` (`statusbar.rs`) | None — name + type words preserved. |
| `getStatusBarBackend` (`statusbar.ts`) | `get_status_bar_backend` (`statusbar.rs`) | None. |
| `setStatusBarBackend(backend: StatusBarBackend \| null)` (`statusbar.ts`) | `set_status_bar_backend(backend: Option<Arc<dyn StatusBarBackend>>)` (`statusbar.rs`) | None — `null` → `Option` sentinel convention carried correctly. |
| `setStatusBarColor` (`statusbar.ts`) | `set_status_bar_color` (`statusbar.rs`) | None. |
| `setStatusBarOverlaysContent` (`statusbar.ts`) | `set_status_bar_overlays_content` (`statusbar.rs`) | None. |
| `setStatusBarStyle` (`statusbar.ts`) | `set_status_bar_style` (`statusbar.rs`) | None. |
| `setStatusBarVisible` (`statusbar.ts`) | `set_status_bar_visible` (`statusbar.rs`) | None. |
| `createWebStatusBarBackend().setBackgroundColor` upserts `<meta theme-color>` (DOM) | `WebStatusBarBackend::set_background_color` is a pure no-op | **Intentional carve-out, documented in-source** (`TODO(align)` + module docs: DOM behavior is a `host-web` concern). Not in the divergence map — see note below. |
| `packedRgbaToHexColor` (private helper, `statusbar.ts`) | `packed_rgba_to_hex_color` (private, `statusbar.rs`, `#[cfg(test)]`-only) | None — color mapping preserved; gated dead-code on non-test since the DOM consumer lives in `host-web`. Correctly not a public export on either side. |

No missing ports, no renames-without-reason, no abbreviations, no extra public Rust functions. File basenames track (`statusbar.ts` ↔ `statusbar.rs`; `index.ts` barrel ↔ `lib.rs`). Shared `StatusBarStyle` / `StatusBarBackend` live in the type layer on both sides (`packages/types/src/StatusBar.ts` ↔ `crates/flighthq-types/src/platform.rs`).

## In sync

- All 7 public functions, the private color helper, and the always-a-backend / lazy-web-default / `Option`-clears-to-fallback semantics match the TS package exactly.
- Teardown/sentinel conventions carry: no `dispose_/destroy_` needed (pure command seam); `null`→`Option`; web backend no-ops rather than throwing, matching the platform-suite seam-plus-sentinel pattern.
- Tests mirror the TS suite (`describe` per function → `mod` per function), including the `afterEach(setStatusBarBackend(null))` reset.

## Divergence-map / script notes

- **Conformance script false-negative (not a real gap):** `npm run rust:conformance` reports statusbar as `7 covered=0 / 9 rust / 7 missing ⚠️`. Root cause: `rustTestNames` in `scripts/rust-conformance.ts:364` extracts only the **leaf** test name (`path.split('::').pop()`), discarding the `mod create_web_status_bar_backend` wrapper that carries the function name. This crate follows the Flight convention of grouping tests in a `mod <function_name>` block with behavior-named leaves (`falls_back_to_a_web_backend`), so `isCovered`'s token regex never sees the function name and marks all 7 as missing. `cargo test -p flighthq-statusbar -- --list` confirms 9 passing tests, one `mod` per function. Fix belongs in the script (match against the full `::` path, not just the leaf), and would clear the same false `⚠️` on every crate using the `mod <fn>` test layout. This is a script-judgment item the matrix cannot self-correct.
- **DOM theme-color carve-out not in the divergence map:** the TS `setBackgroundColor` `<meta theme-color>` upsert is the package's only observable web effect, and it is intentionally relocated to `host-web` in the Rust port (in-source `TODO(align)`). This is a legitimate "DOM substrate absent from the box" divergence consistent with the existence rule, but `conformance.md` only lists statusbar generically as a done seam-plus-sentinel crate (lines 100, 126, 144); the specific `set_background_color` behavioral divergence is recorded only in source comments, not the auditable map. Consider adding a one-line divergence-map entry so the relocation is auditable rather than living solely as a code comment.
