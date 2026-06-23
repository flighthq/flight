# Breadth Review: Text & Typography / i18n Engineer

**Lens:** I render correct international text — layout, shaping (HarfBuzz-class GSUB/GPOS), bidi, rich/multi-format text, single-format labels, native fields, text input/editing, font resources, measurement, line breaking, and per-backend text rendering — and I judge whether the package breadth supports correct Latin _and_ complex-script typography.

**Coverage: 58/100**

## What a complete SDK owes this perspective

A typography-complete SDK needs, end to end:

- A **layout spine** that turns a styled string into lines, runs, and glyph positions: line breaking (Unicode UAX #14), wrapping, alignment (incl. justify), tab stops, indents, leading, vertical metrics.
- A **shaping seam** with two real tiers: a fast advances-only measure tier (Latin / Canvas) and a **full-glyph shaper** (HarfBuzz-class) producing glyph IDs, advances, offsets, and clusters — the only thing that makes GSUB/GPOS, kerning, ligatures, and Arabic/Indic correct.
- **Bidi/itemization** (UAX #9): resolve embedding levels, reorder runs, mirror brackets, segment by script/direction/font.
- **Font resources**: loading, font families, weights/styles, fallback chains, font matching, and ideally variable-font axes and OpenType feature selection.
- **Display objects** for text: single-format label, multi-format rich text, and a native/OS-rendered field.
- **Text input/editing**: caret, selection, IME/composition, restriction, password, clipboard, word/line selection.
- **Per-backend rendering**: text drawn correctly on Canvas, DOM, and GPU (GL/WGPU) backends — the GPU path needs the glyph tier plus an atlas.
- **i18n surface**: locale awareness, emoji (grapheme clusters / ZWJ / skin tones), and ideally number/date formatting hooks.

## Well covered

- **Layout spine is mature.** `@flighthq/textlayout` is the standout: `computeTextLayout`, line metrics, line breaks (`getTextLineBreaks`/`getTextLineBreakIndex`), per-line text/offset/length, hit-testing (`getRichTextCharIndexAtPoint`, `getRichTextLineIndexAtPoint`, `getRichTextLinkAtPoint`), selection rectangles, scroll H/V, char boundaries, bounds computation, and full `TextFormat` metrics (ascent/descent/leading/height). This is AAA-depth for the layout layer.
- **Rich/multi-format and single-format split is clean.** `@flighthq/text` cleanly separates `TextLabel` (single-format), `RichText` (multi-format via `setRichTextFormatRange`/`RichTextStyleSheet`), and `NativeText` (OS-rendered field) as distinct entity quartets. This matches OpenFL's `TextField` ambitions without the stateful baggage.
- **Text input/editing is genuinely deep.** `@flighthq/textinput` covers caret movement, selection (set/word/line/all), insert/append/replace, backward/forward delete, restriction (`applyTextInputRestriction`), password display (`getTextInputDisplayText`), pointer/keyboard/wheel dispatch, click-count multi-select, and a `SelectableRichTextManager` for read-only selectable text. This is a complete editing layer.
- **The shaper seam exists and is designed correctly in principle.** `@flighthq/textshaper` (`TextShaperBackend`, `setTextShaperBackend`, `shapeText`) plus `@flighthq/textshaper-canvas` establishes the swappable backend pattern, and `TextShaper.ts` explicitly documents the intended HarfBuzz tier. The seam is the right shape.
- **Per-backend text drawing is wired** across `displayobject-canvas`/`-dom`/`-gl` (text input overlays, GL text draw), and the Rust port mirrors the whole stack (`flighthq-textlayout`, `-textshaper`, `-text`, `-textinput`).
- **Basic font resources** exist in `@flighthq/resources` (`loadFontFrom*`, `FontResource`, `FontUrl` with `format`).

## Gaps & missing capabilities

These are the things that block _correct international text_, which is the whole point of this lens:

- **No full-glyph shaper backend exists.** The seam is real but only the advances-only Canvas tier is implemented. `TextShaperBackend` is `{ measureText }` — no glyph IDs, no advances/offsets arrays, no clusters. The docs name `@flighthq/textshaper-harfbuzz` and the Rust `rustybuzz` backend as designed-not-built. **Without this, every non-Canvas backend (GL/WGPU) cannot render correct text, and Arabic/Indic/kerning/ligatures are broken everywhere.** This is the single largest gap.
- **No bidi / itemization package.** Nothing covers UAX #9 (bidirectional reordering), bracket mirroring, or script/direction segmentation. `TextFormat` has alignment but no `direction`/RTL concept. RTL and mixed-direction text is unsupported end to end.
- **No font fallback / font matching.** `Font` is `{ name }` and `FontResource` loads a single family by name/URL. There is no fallback chain, no "find a font that covers this codepoint," no weight/style/stretch matching, and no variable-font axes. Missing-glyph (tofu) handling and CJK/emoji fallback have no home.
- **No OpenType feature control.** `TextFormat` exposes `kerning` (boolean) and `letterSpacing` but no general feature flags (ligatures, small-caps, stylistic sets, `font-feature-settings`-equivalent). The shaper would need this once it lands.
- **No emoji / grapheme-cluster handling.** No grapheme segmentation (UAX #29), ZWJ sequences, skin-tone modifiers, or color-emoji (COLR/CBDT) path. Caret movement and selection in `textinput` operate on what looks like char indices, which will split graphemes.
- **GPU glyph atlas is absent.** GL text currently draws via a Canvas 2D context overlay (`drawGlTextInputOverlay(context: CanvasRenderingContext2D, ...)`), which is a fallback, not real GPU text. No glyph-atlas / SDF text package exists for `render-gl`/`render-wgpu`, so true GPU/WGPU text rendering has no substrate.
- **No locale layer.** No locale-aware line breaking (CJK rules, Thai dictionary breaking), no locale identity feeding text, and nothing for number/date/currency formatting (even as host-backed hooks alongside `platform`'s locale).
- **HTML/markup ingestion is thin.** `RichTextStyleSheet` is `Record<string, TextFormat>` but there is no HTML-to-rich-text parser (OpenFL's `htmlText`), so the common "set styled text from markup" path is unbuilt.
- **IME / composition not visible.** `textinput` dispatches keyboard/pointer but I see no composition/preedit handling, which is mandatory for CJK input. The mobile `@flighthq/keyboard` (soft-keyboard) capability is separate and not obviously wired to composition.

## Missing or too-thin packages I would expect

- **`@flighthq/textshaper-harfbuzz`** (and Rust `flighthq-textshaper-rustybuzz`) — the full-glyph shaper tier. Designed, not built. Highest priority: it unblocks GPU text and all complex scripts.
- **`@flighthq/textbidi`** (or fold UAX #9 into `textlayout`) — bidi resolution, reordering, mirroring, and script/font itemization. Currently absent.
- **`@flighthq/font`** — a real font subsystem: family/weight/style/stretch matching, fallback chains, codepoint coverage, variable-font axes, and missing-glyph handling. Today this is one `Font {name}` interface plus loaders bolted onto `resources`; it deserves its own mature cell.
- **`@flighthq/text-gl` / `@flighthq/text-wgpu`** (or a shared `glyph-atlas`) — GPU glyph atlas + SDF/MSDF rendering so GL/WGPU draw real text instead of a Canvas2D overlay.
- **`@flighthq/text-shaping` expansion of `TextShaperBackend`** — extend the interface beyond `measureText` to return glyph runs (ids/advances/offsets/clusters); the type is currently too thin to carry complex shaping.
- **`@flighthq/textsegment`** (or grapheme utilities in `textlayout`) — UAX #29 grapheme/word segmentation, used by both line breaking and caret/selection, with emoji-cluster awareness.
- **`@flighthq/i18n` / locale-format hooks** — locale-aware breaking and number/date/currency formatting. Even a thin host-backed seam (matching the platform suite pattern) would close the i18n gap.
- **An HTML/markup parser** for rich text (`htmlText`-equivalent) feeding `setRichTextFormatRange`.

## Verdict

The **layout and editing layers are excellent** — `textlayout` and `textinput` are AAA-deep, the label/rich/native split is well designed, and the shaper _seam_ is architecturally correct. But the lens that matters here is _correct international text_, and on that axis the set is **only half built**: the full-glyph shaper, bidi, font fallback/matching, emoji/grapheme handling, OpenType features, GPU glyph rendering, and any locale layer are all missing or stubbed. As shipped today the SDK can do good Latin text on Canvas/DOM; it cannot do correct Arabic/Indic/CJK text, cannot render real text on GPU backends, and has no RTL or emoji story. The architecture clearly anticipates these (the docs name the harfbuzz/rustybuzz backends and the text stack design), so the bones are right — but the breadth gap between "designed" and "built" is large enough that an i18n engineer cannot ship complex-script content on this SDK yet. 58/100: a strong layout spine on top of a typographically incomplete foundation.
