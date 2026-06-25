use flighthq_types::{
    FontMetrics, GlyphExtents, ShapeDirection, ShapeRunOptions, ShapedRun, TextFormat,
};

use crate::get_text_shaper_backend;

/// Resets `run` to an empty left-to-right run in place, reusing its `glyphs` allocation, and
/// returns it. Mirrors the TS `clearShapedRun` — the glyphs `Vec` is `clear`ed (not reallocated)
/// so a hot loop can reuse one `ShapedRun`.
pub fn clear_shaped_run(run: &mut ShapedRun) -> &mut ShapedRun {
    run.advance_width = 0.0;
    run.direction = ShapeDirection::LeftToRight;
    run.font = None;
    run.glyph_count = 0;
    run.glyphs.clear();
    run.script.clear();
    run
}

/// Allocates a new empty left-to-right `ShapedRun`. Mirrors the TS `createShapedRun`.
pub fn create_shaped_run() -> ShapedRun {
    ShapedRun::default()
}

/// Returns the unicode code point that produced `glyph_id` via the active backend, or `-1` when no
/// backend is registered or the backend does not reverse-map glyphs. Mirrors `getCodePointForGlyph`.
pub fn get_code_point_for_glyph(glyph_id: u32, _format: &TextFormat) -> i32 {
    match get_text_shaper_backend() {
        Some(backend) => backend.get_code_point_for_glyph(glyph_id),
        None => -1,
    }
}

/// Returns font-level metrics for `format` via the active backend, or `None` when no backend is
/// registered or the backend cannot provide them. Mirrors `getFontMetrics`.
pub fn get_font_metrics(format: &TextFormat) -> Option<FontMetrics> {
    get_text_shaper_backend().and_then(|backend| backend.get_font_metrics(format))
}

/// Writes font metrics for `format` into `out`, returning `true` on success and `false` (leaving
/// `out` untouched) when no metrics are available. Mirrors `getFontMetricsInto`.
pub fn get_font_metrics_into(format: &TextFormat, out: &mut FontMetrics) -> bool {
    match get_font_metrics(format) {
        Some(metrics) => {
            *out = metrics;
            true
        }
        None => false,
    }
}

/// Returns `size / units_per_em` for `format` (the design-units-to-pixels scale), or `-1.0` when no
/// metrics are available. The default size is `12.0` when `format` has no explicit size. Mirrors
/// `getFontUnitScale`.
pub fn get_font_unit_scale(format: &TextFormat) -> f32 {
    match get_font_metrics(format) {
        Some(metrics) => {
            let size = format.size.unwrap_or(12.0);
            size / metrics.units_per_em
        }
        None => -1.0,
    }
}

/// Returns the ink bounding box for `glyph_id` via the active backend, or `None` when no backend is
/// registered or the glyph is unknown. Mirrors `getGlyphExtents`.
pub fn get_glyph_extents(glyph_id: u32, _format: &TextFormat) -> Option<GlyphExtents> {
    get_text_shaper_backend().and_then(|backend| backend.get_glyph_extents(glyph_id))
}

/// Resolves the ink box of each glyph in `glyph_ids` into `out`, returning the count that resolved.
/// `out` is fully populated index-for-index: unknown glyphs get a zeroed `GlyphExtents`. Returns `0`
/// (writing nothing) when no backend is registered. Mirrors `getGlyphExtentsBatch`.
pub fn get_glyph_extents_batch(
    glyph_ids: &[u32],
    _format: &TextFormat,
    out: &mut Vec<GlyphExtents>,
) -> usize {
    let backend = match get_text_shaper_backend() {
        Some(backend) => backend,
        None => return 0,
    };
    out.clear();
    let mut resolved = 0;
    for &glyph_id in glyph_ids {
        match backend.get_glyph_extents(glyph_id) {
            Some(extents) => {
                out.push(extents);
                resolved += 1;
            }
            None => out.push(GlyphExtents::default()),
        }
    }
    resolved
}

/// Writes the ink box of `glyph_id` into `out`, returning `true` on success and `false` (leaving
/// `out` untouched) when the glyph is unknown or no backend is registered. Mirrors
/// `getGlyphExtentsInto`.
pub fn get_glyph_extents_into(glyph_id: u32, format: &TextFormat, out: &mut GlyphExtents) -> bool {
    match get_glyph_extents(glyph_id, format) {
        Some(extents) => {
            *out = extents;
            true
        }
        None => false,
    }
}

/// Returns the glyph index for `code_point` via the active backend, or `-1` when no backend is
/// registered or the font has no glyph for it. Mirrors `getGlyphIndexForCodePoint`.
pub fn get_glyph_index_for_code_point(code_point: u32, _format: &TextFormat) -> i32 {
    match get_text_shaper_backend() {
        Some(backend) => backend.get_glyph_index_for_code_point(code_point),
        None => -1,
    }
}

/// Returns the PostScript name for `glyph_id` via the active backend, or an empty string when no
/// backend is registered or the backend cannot name it. Mirrors `getGlyphName`.
pub fn get_glyph_name(glyph_id: u32, _format: &TextFormat) -> String {
    match get_text_shaper_backend() {
        Some(backend) => backend.get_glyph_name(glyph_id),
        None => String::new(),
    }
}

/// Shapes a text run via the active backend, returning the `ShapedRun` or `None` when no backend is
/// registered or the backend does not implement run shaping. Mirrors `shapeTextRun`.
pub fn shape_text_run(
    text: &str,
    format: &TextFormat,
    options: Option<&ShapeRunOptions>,
) -> Option<ShapedRun> {
    get_text_shaper_backend().and_then(|backend| backend.shape_run(text, format, options))
}

/// Shapes a text run via the active backend into `out`, reusing its `glyphs` allocation, returning
/// `true` on success and `false` (leaving `out` untouched) when no backend is registered or the
/// backend does not implement run shaping. Mirrors `shapeTextRunInto`.
pub fn shape_text_run_into(text: &str, format: &TextFormat, out: &mut ShapedRun) -> bool {
    let backend = match get_text_shaper_backend() {
        Some(backend) => backend,
        None => return false,
    };
    let result = match backend.shape_run(text, format, None) {
        Some(result) => result,
        None => return false,
    };
    out.advance_width = result.advance_width;
    out.direction = result.direction;
    out.font = result.font;
    out.glyph_count = result.glyph_count;
    out.script = result.script;
    out.glyphs.clear();
    out.glyphs.extend(result.glyphs);
    true
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use flighthq_types::{ShapedGlyph, TextShaperBackend};
    use serial_test::serial;

    use super::*;
    use crate::set_text_shaper_backend;

    fn test_glyphs() -> Vec<ShapedGlyph> {
        vec![
            ShapedGlyph {
                cluster: 0,
                glyph_id: 10,
                x_advance: 8.0,
                x_offset: 0.0,
                y_advance: 0.0,
                y_offset: 0.0,
            },
            ShapedGlyph {
                cluster: 1,
                glyph_id: 20,
                x_advance: 7.0,
                x_offset: 0.0,
                y_advance: 0.0,
                y_offset: 0.0,
            },
        ]
    }

    fn test_run() -> ShapedRun {
        ShapedRun {
            advance_width: 15.0,
            direction: ShapeDirection::LeftToRight,
            font: None,
            glyph_count: 2,
            glyphs: test_glyphs(),
            script: "Latn".to_string(),
        }
    }

    fn test_metrics() -> FontMetrics {
        FontMetrics {
            ascent: 10.0,
            cap_height: 8.0,
            descent: 3.0,
            line_gap: 1.0,
            underline_position: -2.0,
            underline_thickness: 1.0,
            units_per_em: 1000.0,
            x_height: 5.0,
        }
    }

    fn test_extents() -> GlyphExtents {
        GlyphExtents {
            height: 10.0,
            width: 6.0,
            x_bearing: 0.0,
            y_bearing: -8.0,
        }
    }

    /// An advances-only backend (canvas-shaped): leaves every glyph/metrics method at its default.
    struct AdvancesOnlyBackend;
    impl TextShaperBackend for AdvancesOnlyBackend {
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            text.len() as f32
        }
    }

    /// A full backend: code point 65 ('A') maps to glyph 10 and back; everything else is unknown.
    struct FullBackend;
    impl TextShaperBackend for FullBackend {
        fn get_code_point_for_glyph(&self, glyph_id: u32) -> i32 {
            if glyph_id == 10 { 65 } else { -1 }
        }
        fn get_font_metrics(&self, _format: &TextFormat) -> Option<FontMetrics> {
            Some(test_metrics())
        }
        fn get_glyph_extents(&self, glyph_id: u32) -> Option<GlyphExtents> {
            if glyph_id == 10 {
                Some(test_extents())
            } else {
                None
            }
        }
        fn get_glyph_index_for_code_point(&self, code_point: u32) -> i32 {
            if code_point == 65 { 10 } else { -1 }
        }
        fn get_glyph_name(&self, glyph_id: u32) -> String {
            if glyph_id == 10 {
                "A".to_string()
            } else {
                String::new()
            }
        }
        fn measure_text(&self, text: &str, _format: &TextFormat) -> f32 {
            (text.len() * 8) as f32
        }
        fn shape_run(
            &self,
            _text: &str,
            _format: &TextFormat,
            _options: Option<&ShapeRunOptions>,
        ) -> Option<ShapedRun> {
            Some(test_run())
        }
    }

    fn clear_backend() {
        set_text_shaper_backend(None);
    }

    #[test]
    #[serial]
    fn clear_shaped_run_resets_all_fields_and_empties_glyphs() {
        let mut run = create_shaped_run();
        run.advance_width = 42.0;
        run.glyphs.push(test_glyphs()[0]);
        clear_shaped_run(&mut run);
        assert_eq!(run.advance_width, 0.0);
        assert_eq!(run.glyph_count, 0);
        assert!(run.glyphs.is_empty());
        assert_eq!(run.direction, ShapeDirection::LeftToRight);
        assert_eq!(run.script, "");
        assert!(run.font.is_none());
    }

    #[test]
    #[serial]
    fn clear_shaped_run_retains_glyphs_capacity() {
        let mut run = create_shaped_run();
        run.glyphs.reserve(8);
        let cap = run.glyphs.capacity();
        clear_shaped_run(&mut run);
        // `clear` reuses the allocation; capacity is retained.
        assert_eq!(run.glyphs.capacity(), cap);
    }

    #[test]
    #[serial]
    fn create_shaped_run_returns_empty_run() {
        let run = create_shaped_run();
        assert_eq!(run.advance_width, 0.0);
        assert_eq!(run.glyph_count, 0);
        assert!(run.glyphs.is_empty());
        assert_eq!(run.direction, ShapeDirection::LeftToRight);
        assert!(run.font.is_none());
        assert_eq!(run.script, "");
    }

    #[test]
    #[serial]
    fn get_code_point_for_glyph_returns_sentinel_without_backend() {
        clear_backend();
        assert_eq!(get_code_point_for_glyph(10, &TextFormat::default()), -1);
    }

    #[test]
    #[serial]
    fn get_code_point_for_glyph_returns_sentinel_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert_eq!(get_code_point_for_glyph(10, &TextFormat::default()), -1);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_code_point_for_glyph_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        assert_eq!(get_code_point_for_glyph(10, &TextFormat::default()), 65);
        assert_eq!(get_code_point_for_glyph(999, &TextFormat::default()), -1);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_font_metrics_returns_none_without_backend() {
        clear_backend();
        assert_eq!(get_font_metrics(&TextFormat::default()), None);
    }

    #[test]
    #[serial]
    fn get_font_metrics_returns_none_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert_eq!(get_font_metrics(&TextFormat::default()), None);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_font_metrics_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let m = get_font_metrics(&TextFormat {
            size: Some(16.0),
            ..Default::default()
        });
        assert!(m.is_some());
        let m = m.unwrap();
        assert_eq!(m.ascent, 10.0);
        assert_eq!(m.units_per_em, 1000.0);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_font_metrics_into_returns_false_and_leaves_out_without_backend() {
        clear_backend();
        let mut out = FontMetrics {
            ascent: 99.0,
            ..test_metrics()
        };
        assert!(!get_font_metrics_into(&TextFormat::default(), &mut out));
        assert_eq!(out.ascent, 99.0);
    }

    #[test]
    #[serial]
    fn get_font_metrics_into_writes_all_fields_on_success() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = test_metrics();
        out.ascent = 0.0;
        assert!(get_font_metrics_into(&TextFormat::default(), &mut out));
        assert_eq!(out.ascent, test_metrics().ascent);
        assert_eq!(out.cap_height, test_metrics().cap_height);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_font_unit_scale_returns_sentinel_without_backend() {
        clear_backend();
        assert_eq!(get_font_unit_scale(&TextFormat::default()), -1.0);
    }

    #[test]
    #[serial]
    fn get_font_unit_scale_returns_size_over_units_per_em() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        assert!((get_font_unit_scale(&TextFormat::default()) - 12.0 / 1000.0).abs() < 1e-6);
        assert!(
            (get_font_unit_scale(&TextFormat {
                size: Some(20.0),
                ..Default::default()
            }) - 20.0 / 1000.0)
                .abs()
                < 1e-6
        );
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_returns_none_without_backend() {
        clear_backend();
        assert_eq!(get_glyph_extents(10, &TextFormat::default()), None);
    }

    #[test]
    #[serial]
    fn get_glyph_extents_returns_none_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert_eq!(get_glyph_extents(10, &TextFormat::default()), None);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_delegates_and_returns_none_for_unknown() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let e = get_glyph_extents(10, &TextFormat::default());
        assert!(e.is_some());
        assert_eq!(e.unwrap().width, 6.0);
        assert_eq!(get_glyph_extents(999, &TextFormat::default()), None);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_batch_returns_zero_without_backend() {
        clear_backend();
        let mut out = Vec::new();
        assert_eq!(
            get_glyph_extents_batch(&[10, 20], &TextFormat::default(), &mut out),
            0
        );
    }

    #[test]
    #[serial]
    fn get_glyph_extents_batch_returns_zero_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        let mut out = Vec::new();
        assert_eq!(
            get_glyph_extents_batch(&[10], &TextFormat::default(), &mut out),
            0
        );
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_batch_resolves_known_and_counts_them() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = Vec::new();
        let resolved = get_glyph_extents_batch(&[10, 999], &TextFormat::default(), &mut out);
        assert_eq!(resolved, 1);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].width, test_extents().width);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_batch_zeroes_unknown_glyphs() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = Vec::new();
        get_glyph_extents_batch(&[999, 10], &TextFormat::default(), &mut out);
        assert_eq!(out[0], GlyphExtents::default());
        assert_eq!(out[1].height, test_extents().height);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_batch_empty_list_returns_zero() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = Vec::new();
        assert_eq!(
            get_glyph_extents_batch(&[], &TextFormat::default(), &mut out),
            0
        );
        assert!(out.is_empty());
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_extents_into_returns_false_and_leaves_out_without_backend() {
        clear_backend();
        let mut out = GlyphExtents {
            height: 1.0,
            width: 1.0,
            x_bearing: 1.0,
            y_bearing: 1.0,
        };
        assert!(!get_glyph_extents_into(
            10,
            &TextFormat::default(),
            &mut out
        ));
        assert_eq!(out.width, 1.0);
    }

    #[test]
    #[serial]
    fn get_glyph_extents_into_writes_all_fields_on_success() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = GlyphExtents::default();
        assert!(get_glyph_extents_into(10, &TextFormat::default(), &mut out));
        assert_eq!(out.width, test_extents().width);
        assert_eq!(out.height, test_extents().height);
        assert_eq!(out.y_bearing, test_extents().y_bearing);
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_index_for_code_point_returns_sentinel_without_backend() {
        clear_backend();
        assert_eq!(
            get_glyph_index_for_code_point(65, &TextFormat::default()),
            -1
        );
    }

    #[test]
    #[serial]
    fn get_glyph_index_for_code_point_returns_sentinel_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert_eq!(
            get_glyph_index_for_code_point(65, &TextFormat::default()),
            -1
        );
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_index_for_code_point_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        assert_eq!(
            get_glyph_index_for_code_point(65, &TextFormat::default()),
            10
        );
        assert_eq!(
            get_glyph_index_for_code_point(0x2603, &TextFormat::default()),
            -1
        );
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_name_returns_empty_without_backend() {
        clear_backend();
        assert_eq!(get_glyph_name(10, &TextFormat::default()), "");
    }

    #[test]
    #[serial]
    fn get_glyph_name_returns_empty_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert_eq!(get_glyph_name(10, &TextFormat::default()), "");
        clear_backend();
    }

    #[test]
    #[serial]
    fn get_glyph_name_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        assert_eq!(get_glyph_name(10, &TextFormat::default()), "A");
        assert_eq!(get_glyph_name(999, &TextFormat::default()), "");
        clear_backend();
    }

    #[test]
    #[serial]
    fn shape_text_run_returns_none_without_backend() {
        clear_backend();
        assert!(shape_text_run("hi", &TextFormat::default(), None).is_none());
    }

    #[test]
    #[serial]
    fn shape_text_run_returns_none_for_advances_only_backend() {
        set_text_shaper_backend(Some(Arc::new(AdvancesOnlyBackend)));
        assert!(shape_text_run("hi", &TextFormat::default(), None).is_none());
        clear_backend();
    }

    #[test]
    #[serial]
    fn shape_text_run_delegates_to_backend() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let run = shape_text_run("ab", &TextFormat::default(), None);
        assert!(run.is_some());
        let run = run.unwrap();
        assert_eq!(run.glyph_count, 2);
        assert_eq!(run.direction, ShapeDirection::LeftToRight);
        clear_backend();
    }

    #[test]
    #[serial]
    fn shape_text_run_into_returns_false_and_leaves_out_without_backend() {
        clear_backend();
        let mut out = create_shaped_run();
        assert!(!shape_text_run_into("hi", &TextFormat::default(), &mut out));
        assert_eq!(out.glyph_count, 0);
    }

    #[test]
    #[serial]
    fn shape_text_run_into_writes_fields_and_glyphs() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = create_shaped_run();
        assert!(shape_text_run_into("ab", &TextFormat::default(), &mut out));
        assert_eq!(out.advance_width, 15.0);
        assert_eq!(out.glyph_count, 2);
        assert_eq!(out.glyphs.len(), 2);
        assert_eq!(out.glyphs[0].glyph_id, 10);
        assert_eq!(out.script, "Latn");
        clear_backend();
    }

    #[test]
    #[serial]
    fn shape_text_run_into_reuses_glyphs_allocation() {
        set_text_shaper_backend(Some(Arc::new(FullBackend)));
        let mut out = create_shaped_run();
        out.glyphs.reserve(16);
        let cap = out.glyphs.capacity();
        shape_text_run_into("ab", &TextFormat::default(), &mut out);
        // The existing `Vec` allocation is reused (cleared + extended), not reassigned.
        assert!(out.glyphs.capacity() >= cap);
        assert_eq!(out.glyphs.len(), 2);
        clear_backend();
    }
}
