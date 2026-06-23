# TS↔Rust Alignment: @flighthq/textlayout

**Verdict:** Fully aligned — all 44 exported functions map 1:1 (camelCase→snake_case), every source file basename tracks its TS counterpart, conventions carry across cleanly, and both the package rename and the textshaper interplay are recorded in the divergence map. No drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `@flighthq/textlayout` (`packages/textlayout`) | `flighthq-textlayout` (`crates/flighthq-textlayout`) | None — rename `text-layout` → `textlayout` is recorded in the divergence map (conformance.md line 41, dated 2026-06-23). |
| 44 exported functions | 44 `pub fn` | None — exact set match. `comm` diff shows zero TS-only and zero Rust-only names. Full type words preserved (`get_rich_text_selection_rectangles`, `compute_text_bounds_offset_x`, etc.). |
| all 13 `*.ts` source files | all 13 `*.rs` source files | None — every basename tracks (`richTextContent.ts`↔`rich_text_content.rs`, `textLayoutMeasure.ts`↔`text_layout_measure.rs`, …). One file per concept on both sides. |
| `clearRichTextContent(runtime: RichTextRuntime)` | `clear_rich_text_content(content: &mut Option<RichTextContent>)` | Minor: TS clears a runtime slot via the runtime object; Rust takes `&mut Option<...>` directly. Idiomatic Rust adaptation of the slot, same intent (`clear_*` verb preserved). Cosmetic — not worth a divergence-map entry, but noted. |
| `clearTextLayoutResult(runtime: TextLabelRuntime)` | `clear_text_layout_result(slot: &mut Option<TextLayoutResult>)` | Same minor runtime-slot adaptation as above. Verb preserved. |

## In sync

- **Function set:** 44/44 matched, 0 unmatched (confirmed by `npm run rust:conformance` and a direct `comm` diff of snake-cased TS names vs Rust `pub fn`s). 107 Rust tests, no coverage gaps reported.
- **Naming:** every Rust name is the snake_case of its TS counterpart with the full, unabbreviated type word retained.
- **File names:** all 13 source basenames track 1:1 (TS camelCase ↔ Rust snake_case).
- **`out`-param convention:** `out` → `&mut` carried across (`get_text_line_breaks(out: &mut Vec<usize>, …)`, `get_text_metrics(out: &mut TextMetrics, …)`, `compute_text_bounds_rectangle(out, …)`).
- **Sentinel convention:** `T | null` → `Option<T>` carried across (`get_rich_text_link_at_point → Option<String>`, `get_rich_text_line_metrics → Option<...>`, `get_text_layout_measure_provider → Option<Arc<TextMeasureFunction>>`).
- **Teardown verbs:** `create_*` / `clear_*` / `compute_*` / `get_*` / `merge_*` / `set_*` prefixes all preserved.
- **Divergence map:** the `text-layout`→`textlayout` rename and the `get_text_layout_measure_provider` → `shape_text` fallback (textshaper seam) are both recorded with rationale and dates; no stale entries.

Nothing needs adding to the divergence map. The only sub-finding (the two `clear_*` functions taking `&mut Option<...>` instead of a runtime entity) is a routine Rust idiom for runtime slots and does not rise to a recorded divergence.
