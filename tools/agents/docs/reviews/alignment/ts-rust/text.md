# TS↔Rust Alignment: @flighthq/text

**Verdict:** Strongly aligned (`rust:conformance` reports 36/36, 0 warnings); two real gaps the script cannot see — `createRichTextRuntime` is missing from the Rust public surface (the `*Runtime` constructor quartet is asymmetric across the three text types), and the crate carries 8 undocumented `pub` rich-text runtime accessors plus a file-name drift, none recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createRichTextRuntime` (richText.ts) | _(none public)_ — `RichTextRuntime::new()` inlined in `create_rich_text` (rich_text.rs) | **Missing port of an exported TS function.** TS exports a `create*Runtime` for all three text types; Rust re-exports `create_native_text_runtime` and `create_text_label_runtime` but **not** `create_rich_text_runtime`. The constructor quartet is asymmetric. Either expose `pub fn create_rich_text_runtime` for parity, or record the omission as a deliberate divergence with rationale. |
| `textLabelLayout.ts` | `text_layout.rs` | **File-name drift.** Rust basename does not track its TS counterpart; should be `text_label_layout.rs`. The three exports inside (`ensure_text_layout`, `get_text_layout`, `get_text_layout_metrics`) keep their TS names and are 1:1 — only the filename diverges. |
| _(none in `@flighthq/text`; runtime fields read directly off `RichTextRuntime` by `@flighthq/textinput`)_ | `get_rich_text_input`, `get_rich_text_input_mut`, `set_rich_text_input`, `get_rich_text_selection_begin_index`, `get_rich_text_selection_end_index`, `set_rich_text_selection_indices`, `get_rich_text_appearance_revision`, `invalidate_rich_text_appearance`, `get_rich_text_text_layout` (rich_text.rs) | **8–9 extra `pub fn` with no TS export.** Legitimate Rust-port pattern: TS lets `@flighthq/textinput` read/write `RichTextRuntime` fields directly across the package seam (no JS field privacy); Rust's runtime fields are private, so the crate must expose accessors. Code comments call this "the public seam the `flighthq-textinput` subsystem uses." **Not recorded in the divergence map** — should be added (or covered by a general "Rust exposes `pub` accessors where TS reads runtime fields directly" rule). |
| `NativeTextKind` / `RichTextKind` / `TextLabelKind` (string consts in `@flighthq/types`) | `native_text_kind()` / `rich_text_kind()` / `text_label_kind()` (`pub fn -> KindId`, rich_text/text_label/native_text.rs) | Acceptable — the standard documented `*Kind` Symbol/string → `KindId::of` port pattern, consistent across all crates. Noted only because the kind lives in `@flighthq/types` in TS but in the text crate in Rust. |

## In sync

- **Crate name is identity:** `@flighthq/text` → `flighthq-text`. No rename; not in (and not needing) the divergence map.
- **Dependencies match:** TS `displayobject`/`entity`/`geometry`/`node`/`textlayout`/`types` ↔ Rust `flighthq-displayobject`/`-node`/`-textlayout`/`-types` (entity/geometry folded as expected on the Rust side).
- **All 36 TS `@flighthq/text` exports have a 1:1 snake_case Rust counterpart** with the full type word preserved: the `nativeText` (10), `textLabel` (10), and `textLabelLayout` (3) sets are complete and correctly named; `richText` matches except for the `createRichTextRuntime` gap above.
- **Convention carry-over is clean:** out-params → `&mut` (`compute_*_local_bounds_rectangle(out: &mut Rectangle, …)`, `get_text_layout_metrics(out…)`); sentinels → `Option` (`get_rich_text_password_character -> Option<char>`, `get_text_layout -> Option<&TextLayoutResult>`); no teardown-verb misuse (none of these functions are `dispose`/`destroy`/`acquire`/`release`).
- **File-name tracking otherwise holds:** `nativeText.ts` ↔ `native_text.rs`, `richText.ts` ↔ `rich_text.rs`, `textLabel.ts` ↔ `text_label.rs`. Only `textLabelLayout.ts` ↔ `text_layout.rs` drifts.
- TS `internal.ts` (`RichTextDataInternal` cast helper) has no Rust file — expected; it is a TS-only structural-typing escape hatch with no Rust equivalent.

### Suggested divergence-map additions

1. **Rust runtime accessors with no TS export** — a general entry: where TS subsystems (e.g. `textinput`) read/write another package's `*Runtime` fields directly, the Rust crate exposes `pub fn get_*`/`set_*` accessors instead, because Rust runtime fields are crate-private. Applies to the 8 `rich_text` accessors here and likely recurs in other entity crates.
2. **`create_rich_text_runtime` omission** — if intentional (runtime built inline by `create_rich_text`), record it; the asymmetry with the native/label runtime constructors otherwise reads as accidental drift.
