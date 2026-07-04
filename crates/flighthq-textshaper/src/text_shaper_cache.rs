//! Cached text shaping: stores shaped runs keyed by (text, format, options) so
//! repeated shaping of identical strings hits the cache instead of the backend.

use flighthq_types::{ShapeRunOptions, ShapedRun, TextFormat};

use crate::text_shaper_run::shape_text_run;

/// An opaque cache of previously shaped runs, keyed by (text, format, options).
pub struct TextShaperCache {
    entries: std::collections::HashMap<String, ShapedRun>,
}

/// Clears all cached `ShapedRun`s from `cache`, releasing their references. The
/// cache remains valid for continued use after clearing. Does not release the
/// cache object itself (use [`dispose_text_shaper_cache`] for that).
pub fn clear_text_shaper_cache(cache: &mut TextShaperCache) {
    cache.entries.clear();
}

/// Allocates a new, empty `TextShaperCache`.
pub fn create_text_shaper_cache() -> TextShaperCache {
    TextShaperCache {
        entries: std::collections::HashMap::new(),
    }
}

/// Releases the cache and all cached `ShapedRun`s. The cache must not be used
/// after this call. Prefer [`clear_text_shaper_cache`] when you want to reuse
/// the cache object; use this only when the cache lifetime is over.
pub fn dispose_text_shaper_cache(cache: &mut TextShaperCache) {
    cache.entries.clear();
}

/// Shapes `text` in `format` with `options`, returning a cached `ShapedRun` when
/// an equivalent call was made earlier in this cache's lifetime. Calls
/// [`shape_text_run`] on miss and stores the result. Returns `None` when no
/// backend is registered or the backend is advances-only (same as
/// `shape_text_run`); `None` results are NOT cached so a later backend
/// registration can succeed.
pub fn shape_text_run_cached(
    cache: &mut TextShaperCache,
    text: &str,
    format: &TextFormat,
    options: Option<&ShapeRunOptions>,
) -> Option<ShapedRun> {
    let key = make_cache_key(text, format, options);
    if let Some(existing) = cache.entries.get(&key) {
        return Some(existing.clone());
    }
    let result = shape_text_run(text, format, options)?;
    cache.entries.insert(key, result.clone());
    Some(result)
}

/// Builds a stable cache key from the shaping parameters. The key encodes all
/// fields that affect the shaped output so distinct inputs do not collide.
fn make_cache_key(text: &str, format: &TextFormat, options: Option<&ShapeRunOptions>) -> String {
    let font = format.font.as_deref().unwrap_or("");
    let size = format.size.unwrap_or(12.0);
    let bold = if format.bold == Some(true) { 1 } else { 0 };
    let italic = if format.italic == Some(true) { 1 } else { 0 };
    let kerning = if format.kerning != Some(false) { 1 } else { 0 };
    let letter_spacing = format.letter_spacing.unwrap_or(0.0);

    let mut key = format!(
        "{}\x00{}\x01{}\x01{}\x01{}\x01{}\x01{}",
        text, font, size, bold, italic, kerning, letter_spacing
    );

    if let Some(opts) = options {
        let dir = match opts.direction {
            Some(d) => format!("{:?}", d),
            None => String::new(),
        };
        let script = opts.script.as_deref().unwrap_or("");
        key.push('\x00');
        key.push_str(&dir);
        key.push('\x01');
        key.push_str(script);
    }

    key
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use flighthq_types::{ShapeDirection, ShapedGlyph, TextShaperBackend};
    use serial_test::serial;

    use super::*;
    use crate::set_text_shaper_backend;

    struct TestBackend;
    impl TextShaperBackend for TestBackend {
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            text.len() as f32 * 8.0
        }
        fn shape_run(
            &self,
            _text: &str,
            _format: &TextFormat,
            _options: Option<&ShapeRunOptions>,
        ) -> Option<ShapedRun> {
            Some(ShapedRun {
                advance_width: 10.0,
                direction: ShapeDirection::LeftToRight,
                font: None,
                glyph_count: 1,
                glyphs: vec![ShapedGlyph {
                    cluster: 0,
                    glyph_id: 1,
                    x_advance: 10.0,
                    x_offset: 0.0,
                    y_advance: 0.0,
                    y_offset: 0.0,
                }],
                script: "Latn".to_string(),
            })
        }
    }

    #[test]
    fn clear_text_shaper_cache_empties_entries() {
        let mut cache = create_text_shaper_cache();
        // Insert manually to test clear.
        cache
            .entries
            .insert("test".to_string(), ShapedRun::default());
        assert!(!cache.entries.is_empty());
        clear_text_shaper_cache(&mut cache);
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn create_text_shaper_cache_starts_empty() {
        let cache = create_text_shaper_cache();
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn dispose_text_shaper_cache_clears_entries() {
        let mut cache = create_text_shaper_cache();
        cache.entries.insert("x".to_string(), ShapedRun::default());
        dispose_text_shaper_cache(&mut cache);
        assert!(cache.entries.is_empty());
    }

    #[test]
    #[serial]
    fn shape_text_run_cached_returns_none_without_backend() {
        set_text_shaper_backend(None);
        let mut cache = create_text_shaper_cache();
        assert!(shape_text_run_cached(&mut cache, "hi", &TextFormat::default(), None).is_none());
        assert!(cache.entries.is_empty());
    }

    #[test]
    #[serial]
    fn shape_text_run_cached_caches_result() {
        set_text_shaper_backend(Some(Arc::new(TestBackend)));
        let mut cache = create_text_shaper_cache();
        let r1 = shape_text_run_cached(&mut cache, "hi", &TextFormat::default(), None);
        assert!(r1.is_some());
        assert_eq!(cache.entries.len(), 1);
        // Second call returns cached.
        let r2 = shape_text_run_cached(&mut cache, "hi", &TextFormat::default(), None);
        assert!(r2.is_some());
        assert_eq!(cache.entries.len(), 1);
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn shape_text_run_cached_different_text_distinct_entries() {
        set_text_shaper_backend(Some(Arc::new(TestBackend)));
        let mut cache = create_text_shaper_cache();
        shape_text_run_cached(&mut cache, "aa", &TextFormat::default(), None);
        shape_text_run_cached(&mut cache, "bb", &TextFormat::default(), None);
        assert_eq!(cache.entries.len(), 2);
        set_text_shaper_backend(None);
    }
}
