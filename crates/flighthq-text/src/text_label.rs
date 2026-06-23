use flighthq_node::{
    BoundsNode, get_bounds_node_local_content_revision, invalidate_bounds_node_local_bounds,
    invalidate_bounds_node_local_content,
};
use flighthq_textlayout::{
    TextBoundsSpec, compute_text_bounds_rectangle, create_text_format_range,
};
use flighthq_types::{
    KindId, Rectangle, TextAutoSize, TextFormat, TextLabelData, TextLayoutParams,
};

use crate::text_layout::{TextLayoutCache, ensure_text_layout, get_text_layout};

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

/// Returns the singleton `KindId` for `TextLabel` display objects.
pub fn text_label_kind() -> KindId {
    flighthq_types::text_label_kind()
}

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

/// Internal per-node runtime state for a `TextLabel`.
///
/// In TS the cache lives on the display-object runtime attached to the node and
/// the content/bounds revisions live on the node's `BoundsNode`
/// (`invalidateNodeLocalContent`/`getNodeLocalContentRevision`). The Rust port
/// folds runtime state onto the entity, so the layout cache and a real
/// [`BoundsNode`] (the same revision spine `flighthq-node` exposes) live here.
pub struct TextLabelRuntime {
    /// Cached layout and the content revision it was computed at.
    pub(crate) layout: TextLayoutCache,
    /// The node's bounds/content revision spine. Setters bump it via
    /// `invalidate_bounds_node_local_content`/`_bounds`; the layout cache
    /// compares against `get_bounds_node_local_content_revision`.
    pub(crate) bounds: BoundsNode,
}

impl TextLabelRuntime {
    fn new() -> Self {
        create_text_label_runtime()
    }
}

// ---------------------------------------------------------------------------
// Public entity struct
// ---------------------------------------------------------------------------

/// A single-format text display object (no HTML, no per-run format ranges).
///
/// `TextLabel` feeds the shared `ensure_text_layout` path with a single
/// `TextFormatRange` spanning the entire string.
pub struct TextLabel {
    pub data: TextLabelData,
    pub(crate) runtime: TextLabelRuntime,
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/// Per-kind layout params builder for the shared `ensure_text_layout` path.
/// A `TextLabel` produces a single format run with no wrap or multiline — the
/// lean path that skips RichText's range/html assembly.
pub fn build_text_label_layout_params(data: &TextLabelData) -> TextLayoutParams {
    TextLayoutParams {
        format_ranges: vec![create_text_format_range(
            data.text_format.clone(),
            0,
            data.text.chars().count(),
        )],
        height: data.height,
        text: data.text.clone(),
        width: data.width,
        ..TextLayoutParams::default()
    }
}

/// Fills `out` with the local-bounds rectangle for `source`.
///
/// Under `auto_size = None` the box is the fixed `data.width` × `data.height`
/// at the origin. Under `auto_size` the box is the measured content positioned
/// by the left/right/center anchor; the layout is ensured on demand here, so a
/// `TextLabel`'s autoSize bounds are queryable before it is ever rendered.
/// Falls back to the fixed box until a measure provider is registered.
pub fn compute_text_label_local_bounds_rectangle(out: &mut Rectangle, source: &mut TextLabel) {
    let data = &source.data;
    if data.auto_size == TextAutoSize::None {
        out.x = 0.0;
        out.y = 0.0;
        out.width = data.width;
        out.height = data.height;
        return;
    }

    let revision = get_bounds_node_local_content_revision(&source.runtime.bounds) as i64;
    let params_data = TextLabelData {
        text_format: data.text_format.clone(),
        text: data.text.clone(),
        width: data.width,
        height: data.height,
        auto_size: data.auto_size,
    };
    ensure_text_layout(&mut source.runtime.layout, revision, || {
        build_text_label_layout_params(&params_data)
    });

    let spec = TextBoundsSpec {
        auto_size: source.data.auto_size,
        height: source.data.height,
        width: source.data.width,
        word_wrap: false,
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

/// Allocates a new `TextLabel` with default field values, optionally
/// overriding them from `data`.
pub fn create_text_label(data: Option<&TextLabelData>) -> TextLabel {
    TextLabel {
        data: create_text_label_data(data),
        runtime: TextLabelRuntime::new(),
    }
}

/// Allocates a `TextLabelData` with defaults, optionally overriding from
/// `data`.
pub fn create_text_label_data(data: Option<&TextLabelData>) -> TextLabelData {
    TextLabelData {
        auto_size: data.map(|d| d.auto_size).unwrap_or_default(),
        height: data.map(|d| d.height).unwrap_or(100.0),
        text: data.map(|d| d.text.clone()).unwrap_or_default(),
        text_format: data.map(|d| d.text_format.clone()).unwrap_or_default(),
        width: data.map(|d| d.width).unwrap_or(100.0),
    }
}

/// Allocates a `TextLabelRuntime` with default values, mirroring the TS
/// `createTextLabelRuntime`: an empty layout cache (`textLayout = null`,
/// `textLayoutUsingContentID = -1`) and a fresh `BoundsNode` revision spine.
pub fn create_text_label_runtime() -> TextLabelRuntime {
    TextLabelRuntime {
        layout: TextLayoutCache::new(),
        bounds: BoundsNode::default(),
    }
}

/// Returns a reference to the `TextLabelRuntime` of `source`.
pub fn get_text_label_runtime(source: &TextLabel) -> &TextLabelRuntime {
    &source.runtime
}

/// Sets `auto_size` on `source.data`, invalidating local content and bounds.
pub fn set_text_label_auto_size(source: &mut TextLabel, value: TextAutoSize) {
    if source.data.auto_size == value {
        return;
    }
    source.data.auto_size = value;
    invalidate_bounds_node_local_content(&mut source.runtime.bounds);
    invalidate_bounds_node_local_bounds(&mut source.runtime.bounds);
}

/// Replaces the `TextFormat` wholesale, invalidating local content. The content
/// revision bumps unconditionally because field-level equality is not tracked.
pub fn set_text_label_format(source: &mut TextLabel, value: TextFormat) {
    source.data.text_format = value;
    invalidate_bounds_node_local_content(&mut source.runtime.bounds);
}

/// Sets `data.height` on `source`, invalidating local content and bounds.
pub fn set_text_label_height(source: &mut TextLabel, value: f32) {
    if source.data.height == value {
        return;
    }
    source.data.height = value;
    invalidate_bounds_node_local_content(&mut source.runtime.bounds);
    invalidate_bounds_node_local_bounds(&mut source.runtime.bounds);
}

/// Sets `data.text` on `source`, invalidating local content.
pub fn set_text_label_string(source: &mut TextLabel, value: String) {
    if source.data.text == value {
        return;
    }
    source.data.text = value;
    invalidate_bounds_node_local_content(&mut source.runtime.bounds);
}

/// Sets `data.width` on `source`, invalidating local content and bounds.
pub fn set_text_label_width(source: &mut TextLabel, value: f32) {
    if source.data.width == value {
        return;
    }
    source.data.width = value;
    invalidate_bounds_node_local_content(&mut source.runtime.bounds);
    invalidate_bounds_node_local_bounds(&mut source.runtime.bounds);
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_node::get_bounds_node_local_bounds_revision;
    use flighthq_textlayout::set_text_layout_measure_provider;
    use flighthq_types::TextMeasureFunction;
    use serial_test::serial;
    use std::sync::Arc;

    fn fixed_measure() -> Arc<TextMeasureFunction> {
        Arc::new(Box::new(|text: &str, _f: &TextFormat| {
            text.chars().count() as f32 * 7.0
        }))
    }

    fn label(auto: TextAutoSize, w: f32, h: f32) -> TextLabel {
        create_text_label(Some(&TextLabelData {
            auto_size: auto,
            width: w,
            height: h,
            ..TextLabelData::default()
        }))
    }

    fn content_revision(text: &TextLabel) -> u32 {
        get_bounds_node_local_content_revision(&text.runtime.bounds)
    }

    fn bounds_revision(text: &TextLabel) -> u32 {
        get_bounds_node_local_bounds_revision(&text.runtime.bounds)
    }

    #[test]
    fn build_text_label_layout_params_single_range() {
        let data = TextLabelData {
            text: "hello".to_string(),
            width: 120.0,
            height: 40.0,
            ..TextLabelData::default()
        };
        let params = build_text_label_layout_params(&data);
        assert_eq!(params.text, "hello");
        assert_eq!(params.format_ranges.len(), 1);
        assert_eq!(params.format_ranges[0].start, 0);
        assert_eq!(params.format_ranges[0].end, 5);
        assert_eq!(params.width, 120.0);
        assert!(!params.word_wrap);
    }

    #[test]
    fn compute_text_label_local_bounds_rectangle_fixed() {
        let mut text = label(TextAutoSize::None, 200.0, 50.0);
        let mut out = Rectangle::default();
        compute_text_label_local_bounds_rectangle(&mut out, &mut text);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    #[serial]
    fn compute_text_label_local_bounds_rectangle_grows_under_auto_size() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut text = label(TextAutoSize::Left, 200.0, 50.0);
        set_text_label_string(&mut text, "hi".to_string());
        let mut out = Rectangle::default();
        compute_text_label_local_bounds_rectangle(&mut out, &mut text);
        assert_eq!(out.x, 0.0);
        assert!(out.width > 0.0);
        assert!(out.width < 200.0);
        set_text_layout_measure_provider(None);
    }

    #[test]
    #[serial]
    fn compute_text_label_local_bounds_rectangle_falls_back_without_provider() {
        set_text_layout_measure_provider(None);
        let mut text = label(TextAutoSize::Left, 200.0, 50.0);
        set_text_label_string(&mut text, "hi".to_string());
        let mut out = Rectangle::default();
        compute_text_label_local_bounds_rectangle(&mut out, &mut text);
        assert_eq!(out.width, 200.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn create_text_label_data_defaults() {
        let d = create_text_label_data(None);
        assert_eq!(d.width, 100.0);
        assert_eq!(d.height, 100.0);
        assert!(d.text.is_empty());
        assert_eq!(d.auto_size, TextAutoSize::None);
    }

    #[test]
    fn create_text_label_data_overrides() {
        let d = create_text_label_data(Some(&TextLabelData {
            auto_size: TextAutoSize::Left,
            text: "hello".to_string(),
            width: 250.0,
            height: 30.0,
            ..TextLabelData::default()
        }));
        assert_eq!(d.auto_size, TextAutoSize::Left);
        assert_eq!(d.text, "hello");
        assert_eq!(d.width, 250.0);
        assert_eq!(d.height, 30.0);
    }

    #[test]
    fn create_text_label_defaults() {
        let text = create_text_label(None);
        assert_eq!(text.data.text, "");
        assert_eq!(text.data.auto_size, TextAutoSize::None);
        assert_eq!(text.data.width, 100.0);
        assert_eq!(text.data.height, 100.0);
        assert!(text.runtime.layout.result.is_none());
    }

    #[test]
    fn create_text_label_runtime_initializes_empty_layout_cache() {
        let runtime = create_text_label_runtime();
        assert!(runtime.layout.result.is_none());
        assert_eq!(runtime.layout.content_id, -1);
        assert_eq!(get_bounds_node_local_content_revision(&runtime.bounds), 0);
    }

    #[test]
    fn get_text_label_runtime_returns_runtime() {
        let text = create_text_label(None);
        let runtime = get_text_label_runtime(&text);
        assert!(runtime.layout.result.is_none());
        assert_eq!(runtime.layout.content_id, -1);
    }

    #[test]
    fn set_text_label_auto_size_no_op_when_same() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        set_text_label_auto_size(&mut text, TextAutoSize::None);
        assert_eq!(content_revision(&text), content);
    }

    #[test]
    fn set_text_label_auto_size_invalidates_bounds() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        let bounds = bounds_revision(&text);
        set_text_label_auto_size(&mut text, TextAutoSize::Left);
        assert_eq!(text.data.auto_size, TextAutoSize::Left);
        assert_ne!(content_revision(&text), content);
        assert_ne!(bounds_revision(&text), bounds);
    }

    #[test]
    fn set_text_label_format_replaces() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        let bounds = bounds_revision(&text);
        set_text_label_format(
            &mut text,
            TextFormat {
                size: Some(24.0),
                ..TextFormat::default()
            },
        );
        assert_eq!(text.data.text_format.size, Some(24.0));
        assert_ne!(content_revision(&text), content);
        // Format does not touch bounds.
        assert_eq!(bounds_revision(&text), bounds);
    }

    #[test]
    fn set_text_label_height_updates_data() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        let bounds = bounds_revision(&text);
        set_text_label_height(&mut text, 250.0);
        assert_eq!(text.data.height, 250.0);
        assert_ne!(content_revision(&text), content);
        assert_ne!(bounds_revision(&text), bounds);
    }

    #[test]
    fn set_text_label_string_updates_data() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        let bounds = bounds_revision(&text);
        set_text_label_string(&mut text, "hello".to_string());
        assert_eq!(text.data.text, "hello");
        assert_ne!(content_revision(&text), content);
        // Text does not touch bounds.
        assert_eq!(bounds_revision(&text), bounds);
    }

    #[test]
    fn set_text_label_string_no_op_when_same() {
        let mut text = create_text_label(Some(&TextLabelData {
            text: "same".to_string(),
            ..TextLabelData::default()
        }));
        let content = content_revision(&text);
        set_text_label_string(&mut text, "same".to_string());
        assert_eq!(content_revision(&text), content);
    }

    #[test]
    fn set_text_label_width_updates_data() {
        let mut text = create_text_label(None);
        let content = content_revision(&text);
        let bounds = bounds_revision(&text);
        set_text_label_width(&mut text, 300.0);
        assert_eq!(text.data.width, 300.0);
        assert_ne!(content_revision(&text), content);
        assert_ne!(bounds_revision(&text), bounds);
    }
}
