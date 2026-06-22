use flighthq_text_layout::{
    compute_text_layout, create_text_layout_result, get_text_layout_measure_provider,
    get_text_metrics,
};
use flighthq_types::{TextLayoutParams, TextLayoutResult, TextMetrics};

// ---------------------------------------------------------------------------
// TextLayoutCache
// ---------------------------------------------------------------------------

/// Per-node cache that tracks both the computed layout result and the content
/// revision it was computed at, mirroring the TS `TextLabelRuntime.textLayout`
/// + `textLayoutUsingContentID` pair.
pub struct TextLayoutCache {
    /// `None` until first computed, or when explicitly cleared.
    pub(crate) result: Option<TextLayoutResult>,
    /// The local-content revision at the time `result` was last computed.
    /// `-1` until first computed.
    pub(crate) content_id: i64,
}

impl TextLayoutCache {
    pub(crate) fn new() -> Self {
        Self {
            result: None,
            content_id: -1,
        }
    }
}

impl Default for TextLayoutCache {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Shared ensure/get path (covers TextLabel and RichText)
// ---------------------------------------------------------------------------

/// Lazily refreshes the cached text layout for a `TextLabel` or `RichText`.
///
/// If the local-content revision has changed since the layout was last
/// computed, calls `build_params` to assemble the params, runs the layout
/// engine, and re-stamps the revision. Cheap and idempotent when already
/// current. If no measure provider is registered the layout is left
/// as-is (stale or absent) until one is set.
///
/// `content_revision` is the value of `get_node_local_content_revision`.
/// `build_params` is the per-kind hook (`build_text_label_layout_params` or
/// `build_rich_text_layout_params`). It is only invoked once a measure provider
/// exists, so the caller's content assembly is skipped on the no-provider path.
pub fn ensure_text_layout<F>(cache: &mut TextLayoutCache, content_revision: i64, build_params: F)
where
    F: FnOnce() -> TextLayoutParams,
{
    if cache.result.is_some() && cache.content_id == content_revision {
        return;
    }

    let Some(measure) = get_text_layout_measure_provider() else {
        return;
    };

    let params = build_params();
    if cache.result.is_none() {
        cache.result = Some(create_text_layout_result());
    }
    let result = cache.result.as_mut().expect("cache was just initialized");
    compute_text_layout(result, &params, measure.as_ref().as_ref());
    cache.content_id = content_revision;
}

/// Returns the cached layout from `cache` if current (after calling
/// `ensure_text_layout`), or `None` when no measure provider is registered.
pub fn get_text_layout(cache: &TextLayoutCache) -> Option<&TextLayoutResult> {
    cache.result.as_ref()
}

/// Ensures the layout is current and fills `out` with the measured content
/// size (content width/height, number of lines). Zeroes `out` when no layout
/// is available.
pub fn get_text_layout_metrics<F>(
    out: &mut TextMetrics,
    cache: &mut TextLayoutCache,
    content_revision: i64,
    build_params: F,
) where
    F: FnOnce() -> TextLayoutParams,
{
    ensure_text_layout(cache, content_revision, build_params);
    match cache.result {
        Some(ref layout) => get_text_metrics(out, layout),
        None => {
            out.height = 0.0;
            out.num_lines = 0;
            out.width = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_text_layout::set_text_layout_measure_provider;
    use flighthq_types::{TextFormat, TextFormatRange, TextMeasureFunction};
    use serial_test::serial;
    use std::sync::Arc;

    fn fixed_measure() -> Arc<TextMeasureFunction> {
        Arc::new(Box::new(|text: &str, _f: &TextFormat| {
            text.chars().count() as f32 * 7.0
        }))
    }

    fn params(text: &str) -> TextLayoutParams {
        TextLayoutParams {
            format_ranges: vec![TextFormatRange {
                start: 0,
                end: text.chars().count(),
                format: TextFormat::default(),
            }],
            text: text.to_string(),
            width: 100.0,
            height: 100.0,
            ..TextLayoutParams::default()
        }
    }

    #[test]
    fn text_layout_cache_defaults() {
        let cache = TextLayoutCache::new();
        assert!(cache.result.is_none());
        assert_eq!(cache.content_id, -1);
    }

    #[test]
    fn get_text_layout_none_when_empty() {
        let cache = TextLayoutCache::new();
        assert!(get_text_layout(&cache).is_none());
    }

    #[test]
    #[serial]
    fn ensure_text_layout_no_op_without_measure_provider() {
        set_text_layout_measure_provider(None);
        let mut cache = TextLayoutCache::new();
        ensure_text_layout(&mut cache, 0, || params("hello"));
        assert!(get_text_layout(&cache).is_none());
    }

    #[test]
    #[serial]
    fn ensure_text_layout_computes_with_provider() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut cache = TextLayoutCache::new();
        ensure_text_layout(&mut cache, 1, || params("hello"));
        assert!(get_text_layout(&cache).is_some());
        assert_eq!(cache.content_id, 1);
        set_text_layout_measure_provider(None);
    }

    #[test]
    #[serial]
    fn get_text_layout_metrics_zeroes_without_provider() {
        set_text_layout_measure_provider(None);
        let mut cache = TextLayoutCache::new();
        let mut out = TextMetrics {
            width: 99.0,
            height: 99.0,
            num_lines: 9,
        };
        get_text_layout_metrics(&mut out, &mut cache, 0, || params("hello"));
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
        assert_eq!(out.num_lines, 0);
    }

    #[test]
    #[serial]
    fn get_text_layout_metrics_measures_with_provider() {
        set_text_layout_measure_provider(Some(fixed_measure()));
        let mut cache = TextLayoutCache::new();
        let mut out = TextMetrics::default();
        get_text_layout_metrics(&mut out, &mut cache, 1, || params("hello"));
        assert!(out.width > 0.0);
        assert!(out.num_lines >= 1);
        set_text_layout_measure_provider(None);
    }
}
