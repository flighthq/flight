# TS↔Rust Alignment: @flighthq/textshaper

**Verdict:** Fully in sync — all 3 exports port 1:1 with correct snake_case, sentinel, and `Option` conventions; no drift, no unrecorded divergence.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `getTextShaperBackend` (`src/textShaper.ts`) | `get_text_shaper_backend` (`src/text_shaper.rs`) | None — full type word preserved; `TextShaperBackend \| null` → `Option<Arc<dyn TextShaperBackend>>`, the correct sentinel-as-`Option` mapping. |
| `setTextShaperBackend` (`src/textShaper.ts`) | `set_text_shaper_backend` (`src/text_shaper.rs`) | None — last-write-wins, `null` → `None`, never-throws/never-panics preserved. |
| `shapeText` (`src/textShaper.ts`) | `shape_text` (`src/text_shaper.rs`) | None — `-1` sentinel → `-1.0` (`f32`), distinguishing unmeasurable from zero-width, preserved. |
| `src/textShaper.ts` (file) | `src/text_shaper.rs` (file) | None — basename tracks (`textShaper` → `text_shaper`). |
| `TextShaperBackend.measureText` (`packages/types/src/TextShaper.ts`) | `TextShaperBackend::measure_text` (`crates/flighthq-types/src/text.rs`) | None — trait method matches; Rust adds `Send + Sync` supertraits, the standard signals/host-seam thread-safety bound, not a behavioral divergence. |

No extra Rust functions, no missing ports, no abbreviations. The backend slot is a module-bottom `static Mutex<Option<...>>` mirroring the TS module-level `let _backend`, keeping import side-effect-free on both sides.

## In sync

- **Package→crate name:** identity (`@flighthq/textshaper` → `flighthq-textshaper`); no rename needed.
- **Export count:** 3/3 per `npm run rust:conformance` (3 expected, 3 found, 0 missing).
- **Conventions:** out/sentinel/teardown all carry. No `dispose_`/`destroy_`/`acquire_`/`release_` verbs apply here (pure seam getters/setters).
- **Doc comments:** the Rust comments are faithful adaptations of the TS ones, correctly updated for the native context (the native default backend is HarfBuzz/rustybuzz, not Canvas).

### Divergence map status

The recorded entries are accurate and not stale:

- `conformance.md` line 97 / 154: `textshaper-canvas` excluded (no browser substrate) while the `textshaper` seam IS ported — matches reality. The native full-glyph backend is `textshaper-harfbuzz` (planned, line 150), correctly noted as not-yet-built.
- `conformance.md` line 146 records the seam port as done (2026-06-23) with the exact three function names and the `-1.0` sentinel — accurate.
- `scripts/rust-conformance.ts` lines 72–81 exclude only `textshaper-canvas`, confirming the seam itself is expected to map 1:1.

Nothing to add to the divergence map; the existing entries already cover the only intentional difference (the excluded Canvas backend) and the `Send + Sync` bound is a workspace-wide trait-seam convention, not a textshaper-specific divergence.
