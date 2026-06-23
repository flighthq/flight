use flighthq_node::revision::{
    NodeRevisions, get_node_appearance_revision, get_node_local_content_revision,
    invalidate_node_appearance, invalidate_node_local_bounds, invalidate_node_local_content,
};
use flighthq_textlayout::{
    TextBoundsSpec, compute_rich_text_content, compute_text_bounds_rectangle, get_rich_text_content,
};
use flighthq_types::{
    KindId, Rectangle, RichTextContent, RichTextData, TextAutoSize, TextFormat, TextFormatRange,
    TextInputState, TextLayoutParams, TextLayoutResult,
};

use crate::text_layout::{TextLayoutCache, ensure_text_layout, get_text_layout};

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

/// Returns the singleton `KindId` for `RichText` display objects.
pub fn rich_text_kind() -> KindId {
    flighthq_types::rich_text_kind()
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/// Internal per-node runtime state for a `RichText`.
pub struct RichTextRuntime {
    /// Cached layout and the content revision it was computed at.
    pub(crate) layout: TextLayoutCache,
    /// Parsed HTML/format-range content cache. `None` until first computed.
    pub(crate) rich_text_content: Option<RichTextContent>,
    /// Selection state for selectable (non-editable) viewing.
    pub selection_begin_index: usize,
    pub selection_end_index: usize,
    /// Editable-field state. `None` on a static RichText; allocated by
    /// `enable_text_input`.
    pub input: Option<TextInputState>,
    /// The node's full revision spine (a `flighthq-node` `NodeRevisions`).
    /// RichText is editable and has compositing appearance, so it needs the
    /// full counter set: content/bounds setters bump it via
    /// `invalidate_node_local_content`/`_local_bounds`, the editable-input
    /// subsystem bumps `appearance_id` via `invalidate_node_appearance`, and the
    /// layout cache compares against `get_node_local_content_revision`.
    pub(crate) revisions: NodeRevisions,
}

impl RichTextRuntime {
    fn new() -> Self {
        Self {
            layout: TextLayoutCache::new(),
            rich_text_content: None,
            selection_begin_index: 0,
            selection_end_index: 0,
            input: None,
            revisions: NodeRevisions::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// Public entity struct
// ---------------------------------------------------------------------------

/// A multi-format, optionally HTML-backed text display object.
pub struct RichText {
    pub data: RichTextData,
    pub(crate) runtime: RichTextRuntime,
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/// Per-kind layout params builder for the shared `ensure_text_layout` path.
/// Assembles RichText's multi-format/html content (cached on the runtime) plus
/// the wrap/multiline constraints. Password masking, when the editable-input
/// slot enables it, is applied by `compute_rich_text_content`.
pub fn build_rich_text_layout_params(source: &mut RichText) -> TextLayoutParams {
    let password = get_rich_text_password_character(source);
    let data = &source.data;
    let width = if data.word_wrap { data.width } else { 10000.0 };
    let multiline = data.multiline;
    let word_wrap = data.word_wrap;
    let height = data.height;

    let content = get_rich_text_content(&mut source.runtime.rich_text_content);
    compute_rich_text_content(content, &source.data, password);

    TextLayoutParams {
        format_ranges: content.format_ranges.clone(),
        height,
        multiline,
        text: content.text.clone(),
        width,
        word_wrap,
        ..TextLayoutParams::default()
    }
}

/// Clears all per-character format ranges from `source.data`, invalidating
/// the content cache.
pub fn clear_rich_text_format_ranges(source: &mut RichText) {
    source.data.text_format_ranges.clear();
    invalidate_rich_text_content(source);
}

/// Fills `out` with the local-bounds rectangle for `source`.
///
/// Under `auto_size = None` the box is the fixed `data.width` × `data.height`
/// at the origin. Under `auto_size` the box is the measured field size,
/// positioned by the left/right/center anchor relative to the declared width.
/// The layout is ensured on demand here. Before any measure provider is
/// registered it falls back to the fixed field box.
pub fn compute_rich_text_local_bounds_rectangle(out: &mut Rectangle, source: &mut RichText) {
    if source.data.auto_size == TextAutoSize::None {
        out.x = 0.0;
        out.y = 0.0;
        out.width = source.data.width;
        out.height = source.data.height;
        return;
    }

    ensure_rich_text_layout(source);

    let spec = TextBoundsSpec {
        auto_size: source.data.auto_size,
        height: source.data.height,
        width: source.data.width,
        word_wrap: source.data.word_wrap,
    };
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => compute_text_bounds_rectangle(out, &spec, layout),
        None => {
            out.x = 0.0;
            out.y = 0.0;
            out.width = source.data.width;
            out.height = source.data.height;
        }
    }
}

/// Allocates a new `RichText` with default field values, optionally overriding
/// them from `data`.
pub fn create_rich_text(data: Option<&RichTextData>) -> RichText {
    RichText {
        data: create_rich_text_data(data),
        runtime: RichTextRuntime::new(),
    }
}

/// Allocates a `RichTextData` with defaults, optionally overriding from `data`.
pub fn create_rich_text_data(data: Option<&RichTextData>) -> RichTextData {
    RichTextData {
        auto_size: data.map(|d| d.auto_size).unwrap_or_default(),
        background: data.map(|d| d.background).unwrap_or(false),
        background_color: data.map(|d| d.background_color).unwrap_or(0xffffff),
        border: data.map(|d| d.border).unwrap_or(false),
        border_color: data.map(|d| d.border_color).unwrap_or(0),
        condense_white: data.map(|d| d.condense_white).unwrap_or(false),
        default_text_format: data
            .map(|d| d.default_text_format.clone())
            .unwrap_or_default(),
        height: data.map(|d| d.height).unwrap_or(100.0),
        html_text: data.map(|d| d.html_text.clone()).unwrap_or_default(),
        max_chars: data.map(|d| d.max_chars).unwrap_or(0),
        mouse_wheel_enabled: data.map(|d| d.mouse_wheel_enabled).unwrap_or(true),
        multiline: data.map(|d| d.multiline).unwrap_or(true),
        scroll_h: data.map(|d| d.scroll_h).unwrap_or(0.0),
        scroll_v: data.map(|d| d.scroll_v).unwrap_or(1.0),
        selectable: data.map(|d| d.selectable).unwrap_or(true),
        style_sheet: data.and_then(|d| d.style_sheet.clone()),
        text: data.map(|d| d.text.clone()).unwrap_or_default(),
        text_color: data.map(|d| d.text_color).unwrap_or(0),
        text_format_ranges: data
            .map(|d| d.text_format_ranges.clone())
            .unwrap_or_default(),
        width: data.map(|d| d.width).unwrap_or(100.0),
        word_wrap: data.map(|d| d.word_wrap).unwrap_or(false),
    }
}

/// Scrolls `source` by `delta_lines` lines, clamped to the valid scroll range.
/// Accepts an optional precomputed `layout` to avoid redundant layout passes.
pub fn dispatch_rich_text_wheel(
    source: &mut RichText,
    delta_lines: i32,
    layout: Option<&TextLayoutResult>,
) {
    let next = source.data.scroll_v.round() as i64 + delta_lines as i64;
    let next = next.max(0) as u32;
    set_rich_text_scroll_v(source, next, layout);
}

/// Returns the appearance revision of `source`, mirroring
/// `getNodeAppearanceRevision(richText)` in TS. The public read seam the
/// `flighthq-textinput` subsystem uses to observe recomposite invalidations,
/// since the `RichText` runtime is package-private.
pub fn get_rich_text_appearance_revision(source: &RichText) -> u32 {
    get_node_appearance_revision(&source.runtime.revisions)
}

/// Returns a shared reference to the editable-field input state on `source`,
/// or `None` when the field is not in editing mode.
///
/// The `input` slot is runtime state owned by the `flighthq-textinput`
/// subsystem; these accessors are the public seam it reaches it through, since
/// the `RichText` runtime itself is package-private.
pub fn get_rich_text_input(source: &RichText) -> Option<&TextInputState> {
    source.runtime.input.as_ref()
}

/// Returns a mutable reference to the editable-field input state on `source`,
/// or `None` when the field is not in editing mode.
pub fn get_rich_text_input_mut(source: &mut RichText) -> Option<&mut TextInputState> {
    source.runtime.input.as_mut()
}

/// Returns a reference to the `RichTextRuntime` of `source`, mirroring the TS
/// `getRichTextRuntime` accessor.
pub fn get_rich_text_runtime(source: &RichText) -> &RichTextRuntime {
    &source.runtime
}

/// Returns the viewing-selection begin index on `source`. This is the
/// non-editable selection state used by selectable (read-only) rich text; the
/// `flighthq-textinput` subsystem reaches it through this public seam since the
/// runtime is package-private.
pub fn get_rich_text_selection_begin_index(source: &RichText) -> usize {
    source.runtime.selection_begin_index
}

/// Returns the viewing-selection end index on `source`.
pub fn get_rich_text_selection_end_index(source: &RichText) -> usize {
    source.runtime.selection_end_index
}

/// Returns the cached layout result on `source`, or `None` when no layout has
/// been computed yet (before a measure provider is registered). The seam
/// pointer/selection managers use for hit-testing without recomputing layout.
pub fn get_rich_text_text_layout(source: &RichText) -> Option<&TextLayoutResult> {
    get_text_layout(&source.runtime.layout)
}

/// Bumps the appearance revision of `source`, mirroring `invalidateNodeAppearance`
/// applied to a `RichText` in TS.
///
/// The public seam through which the `flighthq-textinput` subsystem signals that
/// selection/caret state changed and the field must recomposite, without
/// reaching into the package-private runtime.
pub fn invalidate_rich_text_appearance(source: &mut RichText) {
    invalidate_node_appearance(&mut source.runtime.revisions);
}

/// Sets the viewing-selection begin/end indices on `source`.
pub fn set_rich_text_selection_indices(
    source: &mut RichText,
    begin_index: usize,
    end_index: usize,
) {
    source.runtime.selection_begin_index = begin_index;
    source.runtime.selection_end_index = end_index;
}

/// Returns the character used to mask the text in password mode, or `None`
/// when the field is not in password mode. Password state lives on the
/// editable-input slot (`enable_text_input`), not on `RichTextData`, so a
/// static RichText is never masked.
pub fn get_rich_text_password_character(source: &RichText) -> Option<char> {
    match source.runtime.input.as_ref() {
        Some(input) if input.display_as_password => Some(input.password_character),
        _ => None,
    }
}

/// Appends a `TextFormatRange` to `source.data.text_format_ranges`, covering
/// `[start, end)`. Pass `end == 0` to default the range to the full text.
pub fn set_rich_text_format_range(
    source: &mut RichText,
    format: TextFormat,
    start: usize,
    end: usize,
) {
    let end = if end == 0 {
        source.data.text.chars().count()
    } else {
        end
    };
    source
        .data
        .text_format_ranges
        .push(TextFormatRange { end, format, start });
    invalidate_rich_text_content(source);
}

/// Sets (or clears, with `None`) the editable-field input state on `source`.
///
/// The public seam through which `flighthq-textinput` attaches and detaches
/// its runtime state.
pub fn set_rich_text_input(source: &mut RichText, input: Option<TextInputState>) {
    source.runtime.input = input;
}

/// Sets the horizontal scroll offset, clamped to the valid range.
/// Accepts an optional precomputed `layout` to derive the max scroll.
pub fn set_rich_text_scroll_h(
    source: &mut RichText,
    value: f32,
    layout: Option<&TextLayoutResult>,
) {
    let max = match layout {
        Some(l) => get_rich_text_max_scroll_h_from_layout(&source.data, l),
        None => f32::INFINITY,
    };
    let clamped = value.round().clamp(0.0, max);
    if source.data.scroll_h == clamped {
        return;
    }
    source.data.scroll_h = clamped;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets the 1-based vertical scroll position, clamped to the valid range.
/// Accepts an optional precomputed `layout` to derive the max scroll.
pub fn set_rich_text_scroll_v(
    source: &mut RichText,
    value: u32,
    layout: Option<&TextLayoutResult>,
) {
    let max = match layout {
        Some(l) => get_rich_text_max_scroll_v_from_layout(&source.data, l),
        None => f32::INFINITY,
    };
    let clamped = (value as f32).clamp(1.0, max);
    if source.data.scroll_v == clamped {
        return;
    }
    source.data.scroll_v = clamped;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Replaces the plain-text content, invalidating the content cache.
pub fn set_rich_text_string(source: &mut RichText, value: String) {
    source.data.text = value;
    invalidate_rich_text_content(source);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// Ensures the layout cache is current for the current content revision,
// rebuilding the RichText content + params under the active measure provider.
fn ensure_rich_text_layout(source: &mut RichText) {
    let revision = get_node_local_content_revision(&source.runtime.revisions) as i64;
    // The closure needs both `&mut runtime.layout` (via ensure) and the rest of
    // `source` to build params, so split the borrow: build params eagerly is not
    // possible without a provider check. Instead, snapshot the inputs ensure
    // needs by routing through a raw pointer-free split.
    let RichText { data, runtime } = source;
    let RichTextRuntime {
        layout,
        rich_text_content,
        input,
        ..
    } = runtime;
    ensure_text_layout(layout, revision, || {
        let password = match input.as_ref() {
            Some(i) if i.display_as_password => Some(i.password_character),
            _ => None,
        };
        let width = if data.word_wrap { data.width } else { 10000.0 };
        let content = get_rich_text_content(rich_text_content);
        compute_rich_text_content(content, data, password);
        TextLayoutParams {
            format_ranges: content.format_ranges.clone(),
            height: data.height,
            multiline: data.multiline,
            text: content.text.clone(),
            width,
            word_wrap: data.word_wrap,
            ..TextLayoutParams::default()
        }
    });
}

// A content change always re-rasterizes the field. It only changes the field's
// bounds when autoSize is active; a fixed field keeps its user-set size.
fn invalidate_rich_text_content(source: &mut RichText) {
    invalidate_node_local_content(&mut source.runtime.revisions);
    if source.data.auto_size != TextAutoSize::None {
        invalidate_node_local_bounds(&mut source.runtime.revisions);
    }
}

fn get_rich_text_max_scroll_h_from_layout(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    let field_w = if data.auto_size == TextAutoSize::None || data.word_wrap {
        data.width
    } else {
        layout.text_width + 4.0
    };
    (layout.text_width - (field_w - 4.0).max(0.0))
        .ceil()
        .max(0.0)
}

fn get_rich_text_max_scroll_v_from_layout(data: &RichTextData, layout: &TextLayoutResult) -> f32 {
    if layout.num_lines <= 1 {
        return 1.0;
    }
    let field_h = if data.auto_size == TextAutoSize::None {
        data.height
    } else {
        layout.text_height + 4.0
    };
    let visible_h = (field_h - 4.0).max(0.0);
    let mut total = 0.0_f32;
    let mut count: u32 = 0;
    for &h in &layout.line_heights {
        if count > 0 && total + h > visible_h {
            break;
        }
        total += h;
        count += 1;
    }
    (layout.num_lines as f32 - (count.max(1) as f32) + 1.0).max(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_node::revision::{get_node_appearance_revision, get_node_local_bounds_revision};
    use flighthq_textlayout::set_text_layout_measure_provider;
    use flighthq_types::TextMeasureFunction;
    use serial_test::serial;
    use std::sync::Arc;

    fn fixed_measure() -> Arc<TextMeasureFunction> {
        Arc::new(Box::new(|text: &str, _f: &TextFormat| {
            text.chars().count() as f32 * 7.0
        }))
    }

    fn appearance_revision(rich: &RichText) -> u32 {
        get_node_appearance_revision(&rich.runtime.revisions)
    }

    fn content_revision(rich: &RichText) -> u32 {
        get_node_local_content_revision(&rich.runtime.revisions)
    }

    fn bounds_revision(rich: &RichText) -> u32 {
        get_node_local_bounds_revision(&rich.runtime.revisions)
    }

    #[test]
    fn build_rich_text_layout_params_plain_text() {
        let mut rich = create_rich_text(Some(&RichTextData {
            multiline: true,
            width: 120.0,
            word_wrap: true,
            ..create_rich_text_data(None)
        }));
        set_rich_text_string(&mut rich, "hello".to_string());
        let params = build_rich_text_layout_params(&mut rich);
        assert_eq!(params.text, "hello");
        assert!(!params.format_ranges.is_empty());
        assert!(params.word_wrap);
        assert_eq!(params.width, 120.0);
    }

    #[test]
    fn clear_rich_text_format_ranges_empty() {
        let mut rich = create_rich_text(None);
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            0,
            1,
        );
        clear_rich_text_format_ranges(&mut rich);
        assert!(rich.data.text_format_ranges.is_empty());
    }

    #[test]
    fn compute_rich_text_local_bounds_rectangle_fixed() {
        let mut rich = create_rich_text(Some(&RichTextData {
            width: 200.0,
            height: 150.0,
            ..create_rich_text_data(None)
        }));
        let mut out = Rectangle::default();
        compute_rich_text_local_bounds_rectangle(&mut out, &mut rich);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 150.0);
    }

    #[test]
    #[serial]
    fn compute_rich_text_local_bounds_rectangle_falls_back_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(Some(&RichTextData {
            auto_size: TextAutoSize::Left,
            width: 200.0,
            height: 150.0,
            ..create_rich_text_data(None)
        }));
        set_rich_text_string(&mut rich, "hello".to_string());
        let mut out = Rectangle::default();
        compute_rich_text_local_bounds_rectangle(&mut out, &mut rich);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 150.0);
    }

    #[test]
    #[serial]
    fn compute_rich_text_local_bounds_rectangle_shrinks_under_auto_size_left() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut rich = create_rich_text(Some(&RichTextData {
            auto_size: TextAutoSize::Left,
            width: 200.0,
            height: 150.0,
            ..create_rich_text_data(None)
        }));
        set_rich_text_string(&mut rich, "hi".to_string());
        let mut out = Rectangle::default();
        compute_rich_text_local_bounds_rectangle(&mut out, &mut rich);
        assert_eq!(out.x, 0.0);
        assert!(out.width > 0.0);
        assert!(out.width < 200.0);
        set_text_layout_measure_provider(None);
    }

    #[test]
    #[serial]
    fn compute_rich_text_local_bounds_rectangle_anchors_right() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut rich = create_rich_text(Some(&RichTextData {
            auto_size: TextAutoSize::Right,
            width: 200.0,
            height: 150.0,
            ..create_rich_text_data(None)
        }));
        set_rich_text_string(&mut rich, "hi".to_string());
        let mut out = Rectangle::default();
        compute_rich_text_local_bounds_rectangle(&mut out, &mut rich);
        assert!((out.x - (200.0 - out.width)).abs() < 0.001);
        set_text_layout_measure_provider(None);
    }

    #[test]
    fn create_rich_text_data_defaults() {
        let data = create_rich_text_data(None);
        assert_eq!(data.width, 100.0);
        assert_eq!(data.height, 100.0);
        assert_eq!(data.background, false);
        assert_eq!(data.background_color, 0xffffff);
        assert_eq!(data.border, false);
        assert_eq!(data.html_text, "");
        assert_eq!(data.mouse_wheel_enabled, true);
        assert_eq!(data.multiline, true);
        assert_eq!(data.scroll_h, 0.0);
        assert_eq!(data.scroll_v, 1.0);
        assert_eq!(data.selectable, true);
        assert!(data.style_sheet.is_none());
        assert_eq!(data.text_color, 0);
        assert!(data.text_format_ranges.is_empty());
        assert_eq!(data.word_wrap, false);
    }

    #[test]
    fn create_rich_text_data_overrides() {
        let data = create_rich_text_data(Some(&RichTextData {
            width: 300.0,
            height: 200.0,
            html_text: "<b>hi</b>".to_string(),
            ..create_rich_text_data(None)
        }));
        assert_eq!(data.width, 300.0);
        assert_eq!(data.height, 200.0);
        assert_eq!(data.html_text, "<b>hi</b>");
    }

    #[test]
    fn create_rich_text_runtime_defaults() {
        let rich = create_rich_text(None);
        assert!(rich.runtime.layout.result.is_none());
        assert!(rich.runtime.rich_text_content.is_none());
        assert!(rich.runtime.input.is_none());
    }

    #[test]
    fn dispatch_rich_text_wheel_clamps() {
        let mut rich = create_rich_text(None);
        assert_eq!(rich.data.scroll_v, 1.0);
        dispatch_rich_text_wheel(&mut rich, 2, None);
        assert_eq!(rich.data.scroll_v, 3.0);
    }

    #[test]
    fn get_rich_text_appearance_revision_reflects_invalidation() {
        let mut rich = create_rich_text(None);
        let before = get_rich_text_appearance_revision(&rich);
        invalidate_rich_text_appearance(&mut rich);
        assert_ne!(get_rich_text_appearance_revision(&rich), before);
    }

    #[test]
    fn get_rich_text_password_character_none_when_no_input() {
        assert!(get_rich_text_password_character(&create_rich_text(None)).is_none());
    }

    #[test]
    fn get_rich_text_runtime_returns_runtime_for_a_rich_text() {
        let rich_text = create_rich_text(None);
        let runtime = get_rich_text_runtime(&rich_text);
        assert!(runtime.layout.result.is_none());
        assert_eq!(runtime.selection_begin_index, 0);
        assert!(runtime.input.is_none());
    }

    #[test]
    fn get_rich_text_password_character_some_when_enabled() {
        let mut rich = create_rich_text(None);
        set_rich_text_input(
            &mut rich,
            Some(TextInputState {
                display_as_password: true,
                password_character: '*',
                ..TextInputState::default()
            }),
        );
        assert_eq!(get_rich_text_password_character(&rich), Some('*'));
    }

    #[test]
    fn get_rich_text_password_character_none_when_off() {
        let mut rich = create_rich_text(None);
        set_rich_text_input(
            &mut rich,
            Some(TextInputState {
                display_as_password: false,
                password_character: '*',
                ..TextInputState::default()
            }),
        );
        assert!(get_rich_text_password_character(&rich).is_none());
    }

    #[test]
    fn set_rich_text_format_range_appends() {
        let mut rich = create_rich_text(Some(&RichTextData {
            text: "hello".to_string(),
            ..create_rich_text_data(None)
        }));
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                italic: Some(true),
                ..TextFormat::default()
            },
            1,
            4,
        );
        assert_eq!(rich.data.text_format_ranges.len(), 1);
        assert_eq!(rich.data.text_format_ranges[0].start, 1);
        assert_eq!(rich.data.text_format_ranges[0].end, 4);
    }

    #[test]
    fn get_rich_text_selection_indices_round_trip() {
        let mut rich = create_rich_text(None);
        assert_eq!(get_rich_text_selection_begin_index(&rich), 0);
        assert_eq!(get_rich_text_selection_end_index(&rich), 0);
        set_rich_text_selection_indices(&mut rich, 2, 5);
        assert_eq!(get_rich_text_selection_begin_index(&rich), 2);
        assert_eq!(get_rich_text_selection_end_index(&rich), 5);
    }

    #[test]
    #[serial]
    fn get_rich_text_text_layout_none_without_provider() {
        let rich = create_rich_text(None);
        assert!(get_rich_text_text_layout(&rich).is_none());
    }

    #[test]
    fn invalidate_rich_text_appearance_bumps_revision() {
        let mut rich = create_rich_text(None);
        let before = appearance_revision(&rich);
        invalidate_rich_text_appearance(&mut rich);
        assert_ne!(appearance_revision(&rich), before);
    }

    #[test]
    fn set_rich_text_scroll_h_clamps() {
        let mut rich = create_rich_text(None);
        set_rich_text_scroll_h(&mut rich, 10.0, None);
        assert_eq!(rich.data.scroll_h, 10.0);
        set_rich_text_scroll_h(&mut rich, -5.0, None);
        assert_eq!(rich.data.scroll_h, 0.0);
    }

    #[test]
    fn set_rich_text_scroll_v_clamps() {
        let mut rich = create_rich_text(None);
        set_rich_text_scroll_v(&mut rich, 4, None);
        assert_eq!(rich.data.scroll_v, 4.0);
        set_rich_text_scroll_v(&mut rich, 0, None);
        assert_eq!(rich.data.scroll_v, 1.0);
    }

    #[test]
    fn set_rich_text_string_updates_text() {
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(rich.data.text, "hello");
    }

    #[test]
    fn set_rich_text_string_invalidates_content() {
        let mut rich = create_rich_text(None);
        let before = content_revision(&rich);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_ne!(content_revision(&rich), before);
    }

    #[test]
    fn set_rich_text_string_no_bounds_when_fixed() {
        let mut rich = create_rich_text(Some(&RichTextData {
            auto_size: TextAutoSize::None,
            ..create_rich_text_data(None)
        }));
        let before = bounds_revision(&rich);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(bounds_revision(&rich), before);
    }

    #[test]
    fn set_rich_text_string_bounds_when_auto_size() {
        let mut rich = create_rich_text(Some(&RichTextData {
            auto_size: TextAutoSize::Left,
            ..create_rich_text_data(None)
        }));
        let before = bounds_revision(&rich);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_ne!(bounds_revision(&rich), before);
    }
}
