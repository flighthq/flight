use flighthq_node::revision::{
    NodeRevisions, get_node_appearance_revision, get_node_local_content_revision,
    invalidate_node_appearance, invalidate_node_local_bounds, invalidate_node_local_content,
};
use flighthq_signals::{create_signal, emit_signal};
use flighthq_textlayout::{
    TextBoundsSpec, compute_rich_text_content, compute_text_bounds_rectangle,
    get_rich_text_bottom_scroll_v, get_rich_text_char_index_at_point, get_rich_text_content,
    get_rich_text_line_count, get_rich_text_line_metrics, get_rich_text_link_at_point,
    get_rich_text_max_scroll_h, get_rich_text_max_scroll_v, get_rich_text_text_height,
    get_rich_text_text_width, merge_text_format,
};
use flighthq_types::{
    KindId, Rectangle, RichTextContent, RichTextData, RichTextStyleSheet, TextAutoSize,
    TextFieldChangeEvent, TextFieldLinkEvent, TextFieldScrollEvent, TextFieldSignals, TextFormat,
    TextFormatRange, TextInputState, TextLayoutParams, TextLayoutResult, TextLineMetrics,
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
    /// Opt-in text-field signals group. `None` until `enable_text_field_signals`;
    /// setters emit only when non-`None`.
    pub(crate) text_field_signals: Option<TextFieldSignals>,
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
            text_field_signals: None,
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

/// Appends `value` to `source.data.text`, invalidating the content cache and
/// emitting `on_text_field_change` (when enabled). A no-op when `value` is empty.
pub fn append_rich_text_string(source: &mut RichText, value: &str) {
    if value.is_empty() {
        return;
    }
    let previous_text = source.data.text.clone();
    source.data.text.push_str(value);
    invalidate_rich_text_content(source);
    emit_text_field_change(source, previous_text);
}

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

/// Allocates a fresh text-field signals group with the three field signals.
pub fn create_text_field_signals() -> TextFieldSignals {
    TextFieldSignals {
        on_text_field_change: create_signal(),
        on_text_field_link: create_signal(),
        on_text_field_scroll: create_signal(),
    }
}

/// Checks whether `(x, y)` (field-local) is over a hyperlink, and if so emits
/// `on_text_field_link` on the signals group (when enabled). Returns the link
/// URL or `None`. Ensures layout first.
pub fn dispatch_rich_text_link_at_point(source: &mut RichText, x: f32, y: f32) -> Option<String> {
    ensure_rich_text_layout(source);
    let url = match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_link_at_point(layout, x, y),
        None => return None,
    };
    if let Some(ref url) = url
        && let Some(signals) = source.runtime.text_field_signals.as_ref()
    {
        let event = TextFieldLinkEvent {
            url: url.clone(),
            x,
            y,
        };
        emit_signal(&signals.on_text_field_link, &event);
    }
    url
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

/// Enables the text-field signals group on `source`, allocating it lazily on
/// first call and returning a reference to it. Idempotent.
pub fn enable_text_field_signals(source: &mut RichText) -> &TextFieldSignals {
    source
        .runtime
        .text_field_signals
        .get_or_insert_with(create_text_field_signals)
}

/// Returns the appearance revision of `source`, mirroring
/// `getNodeAppearanceRevision(richText)` in TS. The public read seam the
/// `flighthq-textinput` subsystem uses to observe recomposite invalidations,
/// since the `RichText` runtime is package-private.
pub fn get_rich_text_appearance_revision(source: &RichText) -> u32 {
    get_node_appearance_revision(&source.runtime.revisions)
}

/// Returns the 1-based bottom visible scroll line, ensuring layout first.
/// Returns `1` when no layout is available.
pub fn get_rich_text_bottom_scroll_v_value(source: &mut RichText) -> u32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_bottom_scroll_v(&source.data, layout),
        None => 1,
    }
}

/// Returns the character index nearest `(x, y)` (field-local), ensuring layout
/// first. Returns `-1` when no layout is available.
pub fn get_rich_text_char_index_at_point_value(source: &mut RichText, x: f32, y: f32) -> i64 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_char_index_at_point(&source.data.text, layout, x, y) as i64,
        None => -1,
    }
}

/// Returns a reference to the default text format of `source`.
pub fn get_rich_text_default_text_format(source: &RichText) -> &TextFormat {
    &source.data.default_text_format
}

/// Fills `out` with the effective merged `TextFormat` at character `index`:
/// begins from `default_text_format` and overlays every format range whose span
/// covers the index.
pub fn get_rich_text_format_range_at(out: &mut TextFormat, source: &RichText, index: usize) {
    let mut merged = source.data.default_text_format.clone();
    for range in &source.data.text_format_ranges {
        if index >= range.start && index < range.end {
            merged = merge_text_format(&merged, &range.format);
        }
    }
    *out = merged;
}

/// Fills `out` with the start/end/format of the format range at list position
/// `i`, returning `false` when `i` is out of bounds.
pub fn get_rich_text_format_range_by_index(
    out: &mut TextFormatRange,
    source: &RichText,
    i: usize,
) -> bool {
    match source.data.text_format_ranges.get(i) {
        Some(range) => {
            out.start = range.start;
            out.end = range.end;
            out.format = range.format.clone();
            true
        }
        None => false,
    }
}

/// Returns the number of format ranges on `source`.
pub fn get_rich_text_format_range_count(source: &RichText) -> usize {
    source.data.text_format_ranges.len()
}

/// Returns a reference to the `html_text` field of `source`.
pub fn get_rich_text_html(source: &RichText) -> &str {
    &source.data.html_text
}

/// Returns the character count of the text content of `source`.
pub fn get_rich_text_length(source: &RichText) -> usize {
    source.data.text.chars().count()
}

/// Returns the number of laid-out lines, ensuring layout first. Returns `0`
/// when no layout is available.
pub fn get_rich_text_line_count_value(source: &mut RichText) -> u32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_line_count(layout),
        None => 0,
    }
}

/// Returns the metrics for line `line_index`, ensuring layout first. Returns
/// `None` when no layout is available or the line does not exist.
pub fn get_rich_text_line_metrics_value(
    source: &mut RichText,
    line_index: usize,
) -> Option<TextLineMetrics> {
    ensure_rich_text_layout(source);
    let layout = get_text_layout(&source.runtime.layout)?;
    get_rich_text_line_metrics(layout, line_index)
}

/// Returns the maximum horizontal scroll, ensuring layout first. Returns `0`
/// when no layout is available.
pub fn get_rich_text_max_scroll_h_value(source: &mut RichText) -> f32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_max_scroll_h(&source.data, layout),
        None => 0.0,
    }
}

/// Returns the maximum vertical scroll, ensuring layout first. Returns `1`
/// when no layout is available.
pub fn get_rich_text_max_scroll_v_value(source: &mut RichText) -> u32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_max_scroll_v(&source.data, layout),
        None => 1,
    }
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

/// Returns a reference to the plain-text content of `source`.
pub fn get_rich_text_string(source: &RichText) -> &str {
    &source.data.text
}

/// Returns the measured text height, ensuring layout first. Returns `0` when no
/// layout is available.
pub fn get_rich_text_text_height_value(source: &mut RichText) -> f32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_text_height(layout),
        None => 0.0,
    }
}

/// Returns the cached layout result on `source`, or `None` when no layout has
/// been computed yet (before a measure provider is registered). The seam
/// pointer/selection managers use for hit-testing without recomputing layout.
pub fn get_rich_text_text_layout(source: &RichText) -> Option<&TextLayoutResult> {
    get_text_layout(&source.runtime.layout)
}

/// Returns the measured text width, ensuring layout first. Returns `0` when no
/// layout is available.
pub fn get_rich_text_text_width_value(source: &mut RichText) -> f32 {
    ensure_rich_text_layout(source);
    match get_text_layout(&source.runtime.layout) {
        Some(layout) => get_rich_text_text_width(layout),
        None => 0.0,
    }
}

/// Returns a reference to the text-field signals group on `source`, or `None`
/// before `enable_text_field_signals` has been called.
pub fn get_text_field_signals(source: &RichText) -> Option<&TextFieldSignals> {
    source.runtime.text_field_signals.as_ref()
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

/// Inserts `value` at character `index` (clamped to `[0, len]`), shifting and
/// extending format ranges around the insertion point. Emits
/// `on_text_field_change` (when enabled). A no-op for an empty `value`.
pub fn insert_rich_text_string(source: &mut RichText, index: usize, value: &str) {
    if value.is_empty() {
        return;
    }
    let len = source.data.text.chars().count();
    let clamped_index = index.min(len);
    let previous_text = source.data.text.clone();
    let byte_at = char_byte_offset(&source.data.text, clamped_index);
    source.data.text.insert_str(byte_at, value);
    let delta = value.chars().count();
    for range in &mut source.data.text_format_ranges {
        if range.start >= clamped_index {
            range.start += delta;
            range.end += delta;
        } else if range.end > clamped_index {
            // Range straddles the insertion point: extend its end so it keeps
            // covering the same chars plus the newly-inserted text.
            range.end += delta;
        }
    }
    invalidate_rich_text_content(source);
    emit_text_field_change(source, previous_text);
}

/// Removes every format range overlapping `[begin, end)`, invalidating content
/// only when at least one range was removed.
pub fn remove_rich_text_format_ranges_in(source: &mut RichText, begin: usize, end: usize) {
    let before = source.data.text_format_ranges.len();
    source
        .data
        .text_format_ranges
        .retain(|r| !(r.start < end && r.end > begin));
    if source.data.text_format_ranges.len() != before {
        invalidate_rich_text_content(source);
    }
}

/// Replaces the substring `[begin_index, end_index)` with `value`. Indices are
/// clamped to `[0, len]`; when `begin_index >= end_index` after clamping this
/// degenerates to an insert. Format ranges are re-indexed, and
/// `on_text_field_change` is emitted (when enabled) only if the text changed.
pub fn replace_rich_text_string(
    source: &mut RichText,
    begin_index: usize,
    end_index: usize,
    value: &str,
) {
    let len = source.data.text.chars().count();
    let start = begin_index.min(len);
    let end = end_index.min(len).max(start);
    let previous_text = source.data.text.clone();
    let start_byte = char_byte_offset(&source.data.text, start);
    let end_byte = char_byte_offset(&source.data.text, end);
    let mut next = String::with_capacity(source.data.text.len());
    next.push_str(&source.data.text[..start_byte]);
    next.push_str(value);
    next.push_str(&source.data.text[end_byte..]);
    source.data.text = next;

    let removed_length = end - start;
    let inserted = value.chars().count();
    let delta = inserted as i64 - removed_length as i64;
    let mut i = source.data.text_format_ranges.len();
    while i > 0 {
        i -= 1;
        let r = &mut source.data.text_format_ranges[i];
        if r.start >= end {
            // Entirely after the replaced span: shift.
            r.start = (r.start as i64 + delta) as usize;
            r.end = (r.end as i64 + delta) as usize;
        } else if r.end <= start {
            // Entirely before: no change.
        } else if r.start >= start && r.end <= end {
            // Fully inside the replaced span: remove.
            source.data.text_format_ranges.remove(i);
        } else if r.start < start && r.end > end {
            // Spans both boundaries: shrink by the net delta.
            r.end = (r.end as i64 + delta) as usize;
        } else if r.start < start {
            // Left overlap: trim end to the start of the replaced region plus insert.
            r.end = start + inserted;
        } else {
            // Right overlap: trim start to after the inserted text.
            r.start = start + inserted;
            r.end = (r.end as i64 + delta) as usize;
        }
    }
    invalidate_rich_text_content(source);
    if previous_text != source.data.text {
        emit_text_field_change(source, previous_text);
    }
}

/// Sets `data.background`, bumping content only when changed.
pub fn set_rich_text_background(source: &mut RichText, value: bool) {
    if source.data.background == value {
        return;
    }
    source.data.background = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.background_color`, bumping content only when changed.
pub fn set_rich_text_background_color(source: &mut RichText, value: u32) {
    if source.data.background_color == value {
        return;
    }
    source.data.background_color = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.border`, bumping content only when changed.
pub fn set_rich_text_border(source: &mut RichText, value: bool) {
    if source.data.border == value {
        return;
    }
    source.data.border = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.border_color`, bumping content only when changed.
pub fn set_rich_text_border_color(source: &mut RichText, value: u32) {
    if source.data.border_color == value {
        return;
    }
    source.data.border_color = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.condense_white`, invalidating content only when changed.
pub fn set_rich_text_condense_white(source: &mut RichText, value: bool) {
    if source.data.condense_white == value {
        return;
    }
    source.data.condense_white = value;
    invalidate_rich_text_content(source);
}

/// Replaces `data.default_text_format` wholesale, invalidating content.
pub fn set_rich_text_default_text_format(source: &mut RichText, value: TextFormat) {
    source.data.default_text_format = value;
    invalidate_rich_text_content(source);
}

/// Sets `data.height`, bumping content and invalidating bounds, only when changed.
pub fn set_rich_text_height(source: &mut RichText, value: f32) {
    if source.data.height == value {
        return;
    }
    source.data.height = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
    invalidate_node_local_bounds(&mut source.runtime.revisions);
}

/// Sets `data.html_text`, invalidating content only when changed.
pub fn set_rich_text_html(source: &mut RichText, value: String) {
    if source.data.html_text == value {
        return;
    }
    source.data.html_text = value;
    invalidate_rich_text_content(source);
}

/// Sets (or clears, with `None`) the editable-field input state on `source`.
///
/// The public seam through which `flighthq-textinput` attaches and detaches
/// its runtime state.
pub fn set_rich_text_input(source: &mut RichText, input: Option<TextInputState>) {
    source.runtime.input = input;
}

/// Sets `data.max_chars`, bumping content only when changed.
pub fn set_rich_text_max_chars(source: &mut RichText, value: u32) {
    if source.data.max_chars == value {
        return;
    }
    source.data.max_chars = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.mouse_wheel_enabled`, bumping content only when changed.
pub fn set_rich_text_mouse_wheel_enabled(source: &mut RichText, value: bool) {
    if source.data.mouse_wheel_enabled == value {
        return;
    }
    source.data.mouse_wheel_enabled = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.multiline`, invalidating content and bounds, only when changed.
pub fn set_rich_text_multiline(source: &mut RichText, value: bool) {
    if source.data.multiline == value {
        return;
    }
    source.data.multiline = value;
    invalidate_rich_text_content(source);
    invalidate_node_local_bounds(&mut source.runtime.revisions);
}

/// Sets `data.selectable`, bumping content only when changed.
pub fn set_rich_text_selectable(source: &mut RichText, value: bool) {
    if source.data.selectable == value {
        return;
    }
    source.data.selectable = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets (or clears, with `None`) `data.style_sheet`, invalidating content.
pub fn set_rich_text_style_sheet(source: &mut RichText, value: Option<RichTextStyleSheet>) {
    source.data.style_sheet = value;
    invalidate_rich_text_content(source);
}

/// Sets `data.text_color`, bumping content only when changed.
pub fn set_rich_text_text_color(source: &mut RichText, value: u32) {
    if source.data.text_color == value {
        return;
    }
    source.data.text_color = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
}

/// Sets `data.width`, bumping content and invalidating bounds, only when changed.
pub fn set_rich_text_width(source: &mut RichText, value: f32) {
    if source.data.width == value {
        return;
    }
    source.data.width = value;
    invalidate_node_local_content(&mut source.runtime.revisions);
    invalidate_node_local_bounds(&mut source.runtime.revisions);
}

/// Sets `data.word_wrap`, invalidating content and bounds, only when changed.
pub fn set_rich_text_word_wrap(source: &mut RichText, value: bool) {
    if source.data.word_wrap == value {
        return;
    }
    source.data.word_wrap = value;
    invalidate_rich_text_content(source);
    invalidate_node_local_bounds(&mut source.runtime.revisions);
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
    let previous_scroll_h = source.data.scroll_h;
    let previous_scroll_v = source.data.scroll_v;
    source.data.scroll_h = clamped;
    invalidate_node_local_content(&mut source.runtime.revisions);
    emit_text_field_scroll(source, previous_scroll_h, previous_scroll_v);
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
    let previous_scroll_h = source.data.scroll_h;
    let previous_scroll_v = source.data.scroll_v;
    source.data.scroll_v = clamped;
    invalidate_node_local_content(&mut source.runtime.revisions);
    emit_text_field_scroll(source, previous_scroll_h, previous_scroll_v);
}

/// Replaces the plain-text content, invalidating the content cache and emitting
/// `on_text_field_change` (when enabled) only if the text actually changed.
pub fn set_rich_text_string(source: &mut RichText, value: String) {
    let previous_text = source.data.text.clone();
    let changed = previous_text != value;
    source.data.text = value;
    invalidate_rich_text_content(source);
    if changed {
        emit_text_field_change(source, previous_text);
    }
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

// Returns the byte offset of the `char_index`-th character (clamped to the end),
// so a `String` can be sliced/inserted on a char boundary.
fn char_byte_offset(text: &str, char_index: usize) -> usize {
    text.char_indices()
        .nth(char_index)
        .map(|(b, _)| b)
        .unwrap_or(text.len())
}

// Emits on_text_field_change when the signals group is enabled. `previous_text`
// is captured before the mutation; `source.data.text` is the new text.
fn emit_text_field_change(source: &RichText, previous_text: String) {
    if let Some(signals) = source.runtime.text_field_signals.as_ref() {
        let event = TextFieldChangeEvent {
            previous_text,
            text: source.data.text.clone(),
        };
        emit_signal(&signals.on_text_field_change, &event);
    }
}

// Emits on_text_field_scroll when the signals group is enabled. `previous_*` are
// captured before the mutation; `source.data.scroll_*` are the new offsets.
fn emit_text_field_scroll(source: &RichText, previous_scroll_h: f32, previous_scroll_v: f32) {
    if let Some(signals) = source.runtime.text_field_signals.as_ref() {
        let event = TextFieldScrollEvent {
            previous_scroll_h,
            previous_scroll_v,
            scroll_h: source.data.scroll_h,
            scroll_v: source.data.scroll_v,
        };
        emit_signal(&signals.on_text_field_scroll, &event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_node::revision::{get_node_appearance_revision, get_node_local_bounds_revision};
    use flighthq_signals::{SignalConnectOptions, connect_signal};
    use flighthq_textlayout::set_text_layout_measure_provider;
    use flighthq_types::TextMeasureFunction;
    use serial_test::serial;
    use std::sync::{Arc, Mutex};

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
        assert!(!data.background);
        assert_eq!(data.background_color, 0xffffff);
        assert!(!data.border);
        assert_eq!(data.html_text, "");
        assert!(data.mouse_wheel_enabled);
        assert!(data.multiline);
        assert_eq!(data.scroll_h, 0.0);
        assert_eq!(data.scroll_v, 1.0);
        assert!(data.selectable);
        assert!(data.style_sheet.is_none());
        assert_eq!(data.text_color, 0);
        assert!(data.text_format_ranges.is_empty());
        assert!(!data.word_wrap);
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

    fn rich_with_text(text: &str) -> RichText {
        create_rich_text(Some(&RichTextData {
            text: text.to_string(),
            ..create_rich_text_data(None)
        }))
    }

    #[test]
    fn append_rich_text_string_appends() {
        let mut rich = rich_with_text("hello");
        append_rich_text_string(&mut rich, " world");
        assert_eq!(rich.data.text, "hello world");
    }

    #[test]
    fn append_rich_text_string_invalidates_content() {
        let mut rich = rich_with_text("hi");
        let before = content_revision(&rich);
        append_rich_text_string(&mut rich, "!");
        assert_ne!(content_revision(&rich), before);
    }

    #[test]
    fn append_rich_text_string_no_op_when_empty() {
        let mut rich = rich_with_text("hi");
        let before = content_revision(&rich);
        append_rich_text_string(&mut rich, "");
        assert_eq!(content_revision(&rich), before);
    }

    #[test]
    fn create_text_field_signals_has_three_signals_and_is_distinct() {
        let a = create_text_field_signals();
        // The signals exist (no listeners yet).
        assert!(!a.on_text_field_change.has_listeners());
        assert!(!a.on_text_field_link.has_listeners());
        assert!(!a.on_text_field_scroll.has_listeners());
    }

    #[test]
    #[serial]
    fn dispatch_rich_text_link_at_point_none_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert!(dispatch_rich_text_link_at_point(&mut rich, 5.0, 5.0).is_none());
    }

    #[test]
    #[serial]
    fn dispatch_rich_text_link_at_point_no_emit_when_not_over_link() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut rich = create_rich_text(Some(&RichTextData {
            width: 200.0,
            height: 50.0,
            ..create_rich_text_data(None)
        }));
        set_rich_text_string(&mut rich, "no links here".to_string());
        let emitted = Arc::new(Mutex::new(false));
        {
            let signals = enable_text_field_signals(&mut rich);
            let e = Arc::clone(&emitted);
            std::mem::forget(connect_signal(
                &signals.on_text_field_link,
                Arc::new(move |_: &TextFieldLinkEvent| *e.lock().unwrap() = true),
                SignalConnectOptions::default(),
            ));
        }
        assert!(dispatch_rich_text_link_at_point(&mut rich, 5.0, 5.0).is_none());
        assert!(!*emitted.lock().unwrap());
        set_text_layout_measure_provider(None);
    }

    #[test]
    fn enable_text_field_signals_attaches_and_is_idempotent() {
        let mut rich = create_rich_text(None);
        assert!(get_text_field_signals(&rich).is_none());
        enable_text_field_signals(&mut rich);
        assert!(get_text_field_signals(&rich).is_some());
        // Idempotent: a second enable does not replace the group (listeners survive).
        let change = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let signals = enable_text_field_signals(&mut rich);
            let c = Arc::clone(&change);
            std::mem::forget(connect_signal(
                &signals.on_text_field_change,
                Arc::new(move |e: &TextFieldChangeEvent| {
                    c.lock().unwrap().push(e.previous_text.clone())
                }),
                SignalConnectOptions::default(),
            ));
        }
        enable_text_field_signals(&mut rich);
        set_rich_text_string(&mut rich, "b".to_string());
        assert_eq!(*change.lock().unwrap(), vec!["".to_string()]);
    }

    #[test]
    fn enable_text_field_signals_enables_change_emission() {
        let mut rich = rich_with_text("a");
        let changes = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let signals = enable_text_field_signals(&mut rich);
            let c = Arc::clone(&changes);
            std::mem::forget(connect_signal(
                &signals.on_text_field_change,
                Arc::new(move |e: &TextFieldChangeEvent| {
                    c.lock().unwrap().push(e.previous_text.clone())
                }),
                SignalConnectOptions::default(),
            ));
        }
        set_rich_text_string(&mut rich, "b".to_string());
        assert_eq!(*changes.lock().unwrap(), vec!["a".to_string()]);
    }

    #[test]
    #[serial]
    fn get_rich_text_bottom_scroll_v_value_one_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_bottom_scroll_v_value(&mut rich), 1);
    }

    #[test]
    #[serial]
    fn get_rich_text_char_index_at_point_value_minus_one_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(
            get_rich_text_char_index_at_point_value(&mut rich, 5.0, 5.0),
            -1
        );
    }

    #[test]
    fn get_rich_text_default_text_format_returns_format() {
        let rich = create_rich_text(Some(&RichTextData {
            default_text_format: TextFormat {
                size: Some(16.0),
                bold: Some(true),
                ..TextFormat::default()
            },
            ..create_rich_text_data(None)
        }));
        assert_eq!(get_rich_text_default_text_format(&rich).size, Some(16.0));
        assert_eq!(get_rich_text_default_text_format(&rich).bold, Some(true));
    }

    #[test]
    fn get_rich_text_format_range_at_empty_field() {
        let rich = create_rich_text(None);
        let mut out = TextFormat::default();
        get_rich_text_format_range_at(&mut out, &rich, 0);
        assert_eq!(out.size, None);
        assert_eq!(out.bold, None);
    }

    #[test]
    fn get_rich_text_format_range_at_merges_overlapping() {
        let mut rich = create_rich_text(Some(&RichTextData {
            default_text_format: TextFormat {
                size: Some(12.0),
                color: Some(0xff0000),
                ..TextFormat::default()
            },
            text: "hello world".to_string(),
            ..create_rich_text_data(None)
        }));
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            0,
            5,
        );
        let mut out = TextFormat::default();
        get_rich_text_format_range_at(&mut out, &rich, 2);
        assert_eq!(out.size, Some(12.0));
        assert_eq!(out.color, Some(0xff0000));
        assert_eq!(out.bold, Some(true));
    }

    #[test]
    fn get_rich_text_format_range_at_skips_uncovered_range() {
        let mut rich = rich_with_text("hello world");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            0,
            3,
        );
        let mut out = TextFormat::default();
        get_rich_text_format_range_at(&mut out, &rich, 5);
        assert_eq!(out.bold, None);
    }

    #[test]
    fn get_rich_text_format_range_by_index_out_of_bounds() {
        let rich = create_rich_text(None);
        let mut out = TextFormatRange {
            start: 0,
            end: 0,
            format: TextFormat::default(),
        };
        assert!(!get_rich_text_format_range_by_index(&mut out, &rich, 0));
    }

    #[test]
    fn get_rich_text_format_range_by_index_fills_out() {
        let mut rich = rich_with_text("hello");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                italic: Some(true),
                ..TextFormat::default()
            },
            1,
            4,
        );
        let mut out = TextFormatRange {
            start: 0,
            end: 0,
            format: TextFormat::default(),
        };
        assert!(get_rich_text_format_range_by_index(&mut out, &rich, 0));
        assert_eq!(out.start, 1);
        assert_eq!(out.end, 4);
        assert_eq!(out.format.italic, Some(true));
    }

    #[test]
    fn get_rich_text_format_range_count_reflects_pushes() {
        let mut rich = rich_with_text("hello");
        assert_eq!(get_rich_text_format_range_count(&rich), 0);
        set_rich_text_format_range(&mut rich, TextFormat::default(), 0, 2);
        set_rich_text_format_range(&mut rich, TextFormat::default(), 2, 5);
        assert_eq!(get_rich_text_format_range_count(&rich), 2);
    }

    #[test]
    fn get_rich_text_html_returns_html_text() {
        let rich = create_rich_text(Some(&RichTextData {
            html_text: "<b>hi</b>".to_string(),
            ..create_rich_text_data(None)
        }));
        assert_eq!(get_rich_text_html(&rich), "<b>hi</b>");
    }

    #[test]
    fn get_rich_text_length_counts_chars() {
        assert_eq!(get_rich_text_length(&create_rich_text(None)), 0);
        assert_eq!(get_rich_text_length(&rich_with_text("hello")), 5);
    }

    #[test]
    #[serial]
    fn get_rich_text_line_count_value_zero_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_line_count_value(&mut rich), 0);
    }

    #[test]
    #[serial]
    fn get_rich_text_line_metrics_value_none_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert!(get_rich_text_line_metrics_value(&mut rich, 0).is_none());
    }

    #[test]
    #[serial]
    fn get_rich_text_max_scroll_h_value_zero_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_max_scroll_h_value(&mut rich), 0.0);
    }

    #[test]
    #[serial]
    fn get_rich_text_max_scroll_v_value_one_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_max_scroll_v_value(&mut rich), 1);
    }

    #[test]
    fn get_rich_text_string_returns_text() {
        assert_eq!(get_rich_text_string(&rich_with_text("hello")), "hello");
    }

    #[test]
    #[serial]
    fn get_rich_text_text_height_value_zero_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_text_height_value(&mut rich), 0.0);
    }

    #[test]
    #[serial]
    fn get_rich_text_text_width_value_zero_without_provider() {
        set_text_layout_measure_provider(None);
        let mut rich = create_rich_text(None);
        set_rich_text_string(&mut rich, "hello".to_string());
        assert_eq!(get_rich_text_text_width_value(&mut rich), 0.0);
    }

    #[test]
    fn get_text_field_signals_none_before_enable() {
        assert!(get_text_field_signals(&create_rich_text(None)).is_none());
    }

    #[test]
    fn insert_rich_text_string_inserts_at_clamped_index() {
        let mut rich = rich_with_text("held");
        insert_rich_text_string(&mut rich, 2, "LLO wor");
        assert_eq!(rich.data.text, "heLLO world");
    }

    #[test]
    fn insert_rich_text_string_clamps_index() {
        let mut rich = rich_with_text("abc");
        insert_rich_text_string(&mut rich, 999, "XYZ");
        assert_eq!(rich.data.text, "abcXYZ");
        insert_rich_text_string(&mut rich, 0, "Q");
        assert_eq!(rich.data.text, "QabcXYZ");
    }

    #[test]
    fn insert_rich_text_string_no_op_for_empty() {
        let mut rich = rich_with_text("abc");
        let before = content_revision(&rich);
        insert_rich_text_string(&mut rich, 1, "");
        assert_eq!(rich.data.text, "abc");
        assert_eq!(content_revision(&rich), before);
    }

    #[test]
    fn insert_rich_text_string_shifts_ranges_after_insert() {
        let mut rich = rich_with_text("abcdef");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            3,
            5,
        );
        insert_rich_text_string(&mut rich, 0, "XX");
        assert_eq!(rich.data.text_format_ranges[0].start, 5);
        assert_eq!(rich.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn insert_rich_text_string_extends_straddling_range() {
        let mut rich = rich_with_text("abcdef");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            1,
            5,
        );
        insert_rich_text_string(&mut rich, 3, "XX");
        assert_eq!(rich.data.text_format_ranges[0].start, 1);
        assert_eq!(rich.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn insert_rich_text_string_emits_change() {
        let mut rich = rich_with_text("abc");
        let previous = Arc::new(Mutex::new(String::new()));
        {
            let signals = enable_text_field_signals(&mut rich);
            let p = Arc::clone(&previous);
            std::mem::forget(connect_signal(
                &signals.on_text_field_change,
                Arc::new(move |e: &TextFieldChangeEvent| {
                    *p.lock().unwrap() = e.previous_text.clone()
                }),
                SignalConnectOptions::default(),
            ));
        }
        insert_rich_text_string(&mut rich, 1, "Z");
        assert_eq!(*previous.lock().unwrap(), "abc");
        assert_eq!(rich.data.text, "aZbc");
    }

    #[test]
    fn remove_rich_text_format_ranges_in_removes_overlap() {
        let mut rich = rich_with_text("hello world");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            0,
            5,
        );
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                italic: Some(true),
                ..TextFormat::default()
            },
            6,
            11,
        );
        remove_rich_text_format_ranges_in(&mut rich, 0, 5);
        assert_eq!(rich.data.text_format_ranges.len(), 1);
        assert_eq!(rich.data.text_format_ranges[0].format.italic, Some(true));
    }

    #[test]
    fn remove_rich_text_format_ranges_in_no_invalidate_when_no_overlap() {
        let mut rich = rich_with_text("hello world");
        set_rich_text_format_range(
            &mut rich,
            TextFormat {
                bold: Some(true),
                ..TextFormat::default()
            },
            6,
            11,
        );
        let before = content_revision(&rich);
        remove_rich_text_format_ranges_in(&mut rich, 0, 5);
        assert_eq!(content_revision(&rich), before);
    }

    #[test]
    fn replace_rich_text_string_replaces_span() {
        let mut rich = rich_with_text("hello world");
        replace_rich_text_string(&mut rich, 0, 5, "goodbye");
        assert_eq!(rich.data.text, "goodbye world");
    }

    #[test]
    fn replace_rich_text_string_degenerates_to_insert() {
        let mut rich = rich_with_text("abc");
        replace_rich_text_string(&mut rich, 5, 1, "XYZ");
        assert_eq!(rich.data.text, "abcXYZ");
    }

    #[test]
    fn replace_rich_text_string_shifts_ranges_after() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 6, 8);
        replace_rich_text_string(&mut rich, 0, 2, "X");
        assert_eq!(rich.data.text_format_ranges[0].start, 5);
        assert_eq!(rich.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn replace_rich_text_string_leaves_ranges_before() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 0, 2);
        replace_rich_text_string(&mut rich, 4, 6, "XXXX");
        assert_eq!(rich.data.text_format_ranges[0].start, 0);
        assert_eq!(rich.data.text_format_ranges[0].end, 2);
    }

    #[test]
    fn replace_rich_text_string_removes_inside_ranges() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 2, 5);
        replace_rich_text_string(&mut rich, 1, 6, "X");
        assert_eq!(rich.data.text_format_ranges.len(), 0);
    }

    #[test]
    fn replace_rich_text_string_shrinks_spanning_range() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 0, 8);
        replace_rich_text_string(&mut rich, 2, 4, "X");
        assert_eq!(rich.data.text_format_ranges[0].start, 0);
        assert_eq!(rich.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn replace_rich_text_string_trims_left_overlap() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 0, 4);
        replace_rich_text_string(&mut rich, 2, 6, "XYZ");
        assert_eq!(rich.data.text_format_ranges[0].start, 0);
        assert_eq!(rich.data.text_format_ranges[0].end, 5);
    }

    #[test]
    fn replace_rich_text_string_trims_right_overlap() {
        let mut rich = rich_with_text("abcdefgh");
        set_rich_text_format_range(&mut rich, TextFormat::default(), 4, 8);
        replace_rich_text_string(&mut rich, 2, 6, "XYZ");
        assert_eq!(rich.data.text_format_ranges[0].start, 5);
        assert_eq!(rich.data.text_format_ranges[0].end, 7);
    }

    #[test]
    fn replace_rich_text_string_emits_change_only_when_changed() {
        let mut rich = rich_with_text("abc");
        let changes = Arc::new(Mutex::new(Vec::<String>::new()));
        {
            let signals = enable_text_field_signals(&mut rich);
            let c = Arc::clone(&changes);
            std::mem::forget(connect_signal(
                &signals.on_text_field_change,
                Arc::new(move |e: &TextFieldChangeEvent| {
                    c.lock().unwrap().push(e.previous_text.clone())
                }),
                SignalConnectOptions::default(),
            ));
        }
        replace_rich_text_string(&mut rich, 0, 3, "abc");
        assert!(changes.lock().unwrap().is_empty());
        replace_rich_text_string(&mut rich, 0, 3, "xyz");
        assert_eq!(*changes.lock().unwrap(), vec!["abc".to_string()]);
    }

    #[test]
    fn set_rich_text_background_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_background(&mut rich, true);
        assert!(rich.data.background);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_background(&mut rich, true);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_background_color_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_background_color(&mut rich, 0xff0000ff);
        assert_eq!(rich.data.background_color, 0xff0000ff);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_background_color(&mut rich, 0xff0000ff);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_border_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_border(&mut rich, true);
        assert!(rich.data.border);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_border(&mut rich, true);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_border_color_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_border_color(&mut rich, 0x000000ff);
        assert_eq!(rich.data.border_color, 0x000000ff);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_border_color(&mut rich, 0x000000ff);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_condense_white_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_condense_white(&mut rich, true);
        assert!(rich.data.condense_white);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_condense_white(&mut rich, true);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_default_text_format_sets_and_bumps() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_default_text_format(
            &mut rich,
            TextFormat {
                size: Some(18.0),
                bold: Some(true),
                ..TextFormat::default()
            },
        );
        assert_eq!(rich.data.default_text_format.size, Some(18.0));
        assert_eq!(content_revision(&rich), content + 1);
    }

    #[test]
    fn set_rich_text_height_sets_and_invalidates_bounds() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        let bounds = bounds_revision(&rich);
        set_rich_text_height(&mut rich, 250.0);
        assert_eq!(rich.data.height, 250.0);
        assert_eq!(content_revision(&rich), content + 1);
        assert_ne!(bounds_revision(&rich), bounds);
        let content = content_revision(&rich);
        set_rich_text_height(&mut rich, 250.0);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_html_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_html(&mut rich, "<b>bold</b>".to_string());
        assert_eq!(rich.data.html_text, "<b>bold</b>");
        assert_eq!(content_revision(&rich), content + 1);
        let mut same = create_rich_text(Some(&RichTextData {
            html_text: "<i>same</i>".to_string(),
            ..create_rich_text_data(None)
        }));
        let content = content_revision(&same);
        set_rich_text_html(&mut same, "<i>same</i>".to_string());
        assert_eq!(content_revision(&same), content);
    }

    #[test]
    fn set_rich_text_max_chars_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_max_chars(&mut rich, 50);
        assert_eq!(rich.data.max_chars, 50);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_max_chars(&mut rich, 50);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_mouse_wheel_enabled_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_mouse_wheel_enabled(&mut rich, false);
        assert!(!rich.data.mouse_wheel_enabled);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_mouse_wheel_enabled(&mut rich, false);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_multiline_sets_and_invalidates_bounds() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        let bounds = bounds_revision(&rich);
        set_rich_text_multiline(&mut rich, false);
        assert!(!rich.data.multiline);
        assert_eq!(content_revision(&rich), content + 1);
        assert_ne!(bounds_revision(&rich), bounds);
        let content = content_revision(&rich);
        set_rich_text_multiline(&mut rich, false);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_selectable_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_selectable(&mut rich, false);
        assert!(!rich.data.selectable);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_selectable(&mut rich, false);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_style_sheet_sets_and_clears() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        let mut sheet = RichTextStyleSheet::new();
        sheet.insert(
            "p".to_string(),
            TextFormat {
                color: Some(0xff0000),
                ..TextFormat::default()
            },
        );
        set_rich_text_style_sheet(&mut rich, Some(sheet));
        assert!(rich.data.style_sheet.is_some());
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_style_sheet(&mut rich, None);
        assert!(rich.data.style_sheet.is_none());
        assert_eq!(content_revision(&rich), content + 1);
    }

    #[test]
    fn set_rich_text_text_color_sets_and_no_ops() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        set_rich_text_text_color(&mut rich, 0xff0000ff);
        assert_eq!(rich.data.text_color, 0xff0000ff);
        assert_eq!(content_revision(&rich), content + 1);
        let content = content_revision(&rich);
        set_rich_text_text_color(&mut rich, 0xff0000ff);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_width_sets_and_invalidates_bounds() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        let bounds = bounds_revision(&rich);
        set_rich_text_width(&mut rich, 300.0);
        assert_eq!(rich.data.width, 300.0);
        assert_eq!(content_revision(&rich), content + 1);
        assert_ne!(bounds_revision(&rich), bounds);
        let content = content_revision(&rich);
        set_rich_text_width(&mut rich, 300.0);
        assert_eq!(content_revision(&rich), content);
    }

    #[test]
    fn set_rich_text_word_wrap_sets_and_invalidates_bounds() {
        let mut rich = create_rich_text(None);
        let content = content_revision(&rich);
        let bounds = bounds_revision(&rich);
        set_rich_text_word_wrap(&mut rich, true);
        assert!(rich.data.word_wrap);
        assert_eq!(content_revision(&rich), content + 1);
        assert_ne!(bounds_revision(&rich), bounds);
        let content = content_revision(&rich);
        set_rich_text_word_wrap(&mut rich, true);
        assert_eq!(content_revision(&rich), content);
    }
}
