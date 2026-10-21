use std::sync::{Arc, Mutex};

use flight_textshaper::contract::*;

use crate::text_shaper_fixture::*;

fn test_glyphs() -> Vec<ShapedGlyph> {
    return vec![glyph(0, 10, 8.0, 0.0), glyph(1, 20, 7.0, 0.0)];
}

fn test_metrics() -> FontMetrics {
    return FontMetrics {
        ascent: 10.0,
        cap_height: 8.0,
        descent: 3.0,
        line_gap: 1.0,
        underline_position: -2.0,
        underline_thickness: 1.0,
        units_per_em: 1000.0,
        x_height: 5.0,
    };
}

fn test_extents() -> GlyphExtents {
    return GlyphExtents {
        height: 10.0,
        width: 6.0,
        x_bearing: 0.0,
        y_bearing: -8.0,
    };
}

/// The source's full backend: every member present.
fn full_backend() -> HostTextShaperCapability {
    let mut host = advances_only(|text| text.len() as f32 * 8.0);
    host.get_code_point_for_glyph = Some(Arc::new(|id| if id == 10 { 65 } else { -1 }));
    host.get_font_metrics = Some(Arc::new(|_| Some(test_metrics())));
    host.get_glyph_extents = Some(Arc::new(
        |id| if id == 10 { Some(test_extents()) } else { None },
    ));
    host.get_glyph_index_for_code_point = Some(Arc::new(|cp| if cp == 65 { 10 } else { -1 }));
    host.get_glyph_name = Some(Arc::new(|id| {
        if id == 10 {
            "A".to_string()
        } else {
            String::new()
        }
    }));
    host.shape_run = Some(Arc::new(|_, _, _| run(15.0, test_glyphs(), "Latn")));
    return host;
}

fn advances() -> HostTextShaperCapability {
    return advances_only(|text| text.len() as f32);
}

type Captured = Arc<Mutex<Vec<(String, Option<ShapeRunOptions>)>>>;

fn capturing_backend() -> (HostTextShaperCapability, Captured) {
    let captured: Captured = Arc::new(Mutex::new(Vec::new()));
    let record = captured.clone();
    let mut host = advances_only(|_| 0.0);
    host.shape_run = Some(Arc::new(move |text, _format, options| {
        record
            .lock()
            .unwrap()
            .push((text.to_string(), options.cloned()));
        return run(15.0, test_glyphs(), "Latn");
    }));
    return (host, captured);
}

fn rtl_arab() -> ShapeRunOptions {
    return ShapeRunOptions {
        direction: Some(TextDirection::RightToLeft),
        script: Some("Arab".to_string()),
    };
}

mod clear_shaped_run {
    use super::*;

    #[test]
    fn resets_all_fields_and_empties_the_glyphs_buffer() {
        let shared = create_shaped_run();
        let mut run = shared.write().unwrap();
        run.advance_width = 42.0;
        run.glyphs.push(test_glyphs()[0]);
        run.glyph_count = 1;
        run.direction = TextDirection::RightToLeft;
        run.script = "Arab".to_string();
        clear_shaped_run(&mut run);
        assert_eq!(
            (run.advance_width, run.glyph_count, run.glyphs.len()),
            (0.0, 0, 0)
        );
        assert_eq!(run.direction, TextDirection::LeftToRight);
        assert_eq!(run.script, "");
        assert!(run.font.is_none());
    }

    #[test]
    fn retains_the_same_glyphs_buffer_after_clearing() {
        let shared = create_shaped_run();
        let mut run = shared.write().unwrap();
        run.glyphs.reserve(16);
        let buffer = run.glyphs.as_ptr();
        clear_shaped_run(&mut run);
        assert_eq!(run.glyphs.as_ptr(), buffer);
    }
}

mod create_shaped_run {
    use super::*;

    #[test]
    fn returns_an_empty_run_with_zero_advance_width() {
        let shared = create_shaped_run();
        let run = shared.read().unwrap();
        assert_eq!(
            (run.advance_width, run.glyph_count, run.glyphs.len()),
            (0.0, 0, 0)
        );
        assert_eq!(run.direction, TextDirection::LeftToRight);
        assert!(run.font.is_none());
        assert_eq!(run.script, "");
    }

    #[test]
    fn allocates_a_new_run_on_each_call() {
        assert!(!Arc::ptr_eq(&create_shaped_run(), &create_shaped_run()));
    }
}

mod get_code_point_for_glyph {
    use super::*;

    #[test]
    fn returns_minus_one_without_the_operation_and_delegates_otherwise() {
        assert_eq!(get_code_point_for_glyph(&advances(), 10, &format()), -1);
        assert_eq!(get_code_point_for_glyph(&full_backend(), 10, &format()), 65);
        assert_eq!(
            get_code_point_for_glyph(&full_backend(), 999, &format()),
            -1
        );
    }
}

mod get_font_metrics {
    use super::*;

    #[test]
    fn returns_null_when_the_backend_is_advances_only() {
        assert!(get_font_metrics(&advances(), &format()).is_none());
    }

    #[test]
    fn delegates_to_the_backend_with_the_format() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let record = seen.clone();
        let mut host = full_backend();
        host.get_font_metrics = Some(Arc::new(move |format| {
            record.lock().unwrap().push(format.size);
            return Some(test_metrics());
        }));
        let metrics = get_font_metrics(&host, &sized(16.0)).unwrap();
        assert_eq!((metrics.ascent, metrics.units_per_em), (10.0, 1000.0));
        assert_eq!(*seen.lock().unwrap(), vec![Some(16.0)]);
    }
}

mod get_font_metrics_into {
    use super::*;

    #[test]
    fn returns_false_and_leaves_out_without_metrics() {
        let mut out = test_metrics();
        out.ascent = 99.0;
        assert!(!get_font_metrics_into(&mut out, &advances(), &format()));
        assert_eq!(out.ascent, 99.0);
    }

    #[test]
    fn writes_all_fields_into_out_and_returns_true() {
        let mut out = FontMetrics {
            ascent: 0.0,
            cap_height: 0.0,
            descent: 0.0,
            line_gap: 0.0,
            underline_position: 0.0,
            underline_thickness: 0.0,
            units_per_em: 0.0,
            x_height: 0.0,
        };
        assert!(get_font_metrics_into(&mut out, &full_backend(), &format()));
        assert_eq!(out, test_metrics());
    }
}

mod get_font_unit_scale {
    use super::*;

    #[test]
    fn returns_minus_one_without_metrics() {
        assert_eq!(get_font_unit_scale(&advances(), &format()), -1.0);
    }

    #[test]
    fn returns_size_over_units_per_em_with_the_12_default() {
        assert!((get_font_unit_scale(&full_backend(), &format()) - 12.0 / 1000.0).abs() < 1e-7);
        assert!((get_font_unit_scale(&full_backend(), &sized(20.0)) - 20.0 / 1000.0).abs() < 1e-7);
    }
}

mod get_glyph_extents {
    use super::*;

    #[test]
    fn returns_null_without_the_operation_or_for_unknown_glyphs() {
        assert!(get_glyph_extents(&advances(), 10, &format()).is_none());
        assert!(get_glyph_extents(&full_backend(), 999, &format()).is_none());
    }

    #[test]
    fn delegates_to_the_backend() {
        assert_eq!(
            get_glyph_extents(&full_backend(), 10, &format())
                .unwrap()
                .width,
            6.0
        );
    }
}

mod get_glyph_extents_batch {
    use super::*;

    #[test]
    fn returns_0_when_the_backend_is_advances_only() {
        let mut out = Vec::new();
        assert_eq!(
            get_glyph_extents_batch(&mut out, &advances(), &[10], &format()),
            0
        );
        assert!(out.is_empty());
    }

    #[test]
    fn resolves_known_glyphs_and_counts_only_those_that_resolved() {
        let mut out = Vec::new();
        assert_eq!(
            get_glyph_extents_batch(&mut out, &full_backend(), &[10, 999], &format()),
            1
        );
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].width, 6.0);
    }

    #[test]
    fn writes_zeroed_extents_for_unknown_glyphs_so_out_is_fully_populated() {
        let mut out = Vec::new();
        get_glyph_extents_batch(&mut out, &full_backend(), &[999, 10], &format());
        assert_eq!(
            out[0],
            GlyphExtents {
                height: 0.0,
                width: 0.0,
                x_bearing: 0.0,
                y_bearing: 0.0
            }
        );
        assert_eq!(out[1].height, 10.0);
    }

    #[test]
    fn returns_0_for_an_empty_id_list_without_touching_the_backend() {
        let calls = Arc::new(Mutex::new(0));
        let count = calls.clone();
        let mut host = full_backend();
        host.get_glyph_extents = Some(Arc::new(move |_| {
            *count.lock().unwrap() += 1;
            return None;
        }));
        let mut out = Vec::new();
        assert_eq!(get_glyph_extents_batch(&mut out, &host, &[], &format()), 0);
        assert!(out.is_empty());
        assert_eq!(*calls.lock().unwrap(), 0);
    }

    #[test]
    fn overwrites_by_index_and_keeps_trailing_entries() {
        let stale = GlyphExtents {
            height: 1.0,
            width: 1.0,
            x_bearing: 1.0,
            y_bearing: 1.0,
        };
        let mut out = vec![stale; 3];
        assert_eq!(
            get_glyph_extents_batch(&mut out, &full_backend(), &[10], &format()),
            1
        );
        assert_eq!(out.len(), 3);
        assert_eq!(out[0], test_extents());
        assert_eq!(out[2], stale);
    }
}

mod get_glyph_extents_into {
    use super::*;

    #[test]
    fn returns_false_and_leaves_out_without_the_operation() {
        let mut out = GlyphExtents {
            height: 1.0,
            width: 1.0,
            x_bearing: 1.0,
            y_bearing: 1.0,
        };
        assert!(!get_glyph_extents_into(
            &mut out,
            &advances(),
            10,
            &format()
        ));
        assert_eq!(out.width, 1.0);
    }

    #[test]
    fn writes_all_fields_into_out_and_returns_true() {
        let mut out = GlyphExtents {
            height: 0.0,
            width: 0.0,
            x_bearing: 0.0,
            y_bearing: 0.0,
        };
        assert!(get_glyph_extents_into(
            &mut out,
            &full_backend(),
            10,
            &format()
        ));
        assert_eq!(out, test_extents());
    }
}

mod get_glyph_index_for_code_point {
    use super::*;

    #[test]
    fn returns_minus_one_without_the_operation_or_a_glyph_and_delegates_otherwise() {
        assert_eq!(
            get_glyph_index_for_code_point(&advances(), 65, &format()),
            -1
        );
        assert_eq!(
            get_glyph_index_for_code_point(&full_backend(), 65, &format()),
            10
        );
        assert_eq!(
            get_glyph_index_for_code_point(&full_backend(), 0x2603, &format()),
            -1
        );
    }
}

mod get_glyph_name {
    use super::*;

    #[test]
    fn returns_empty_without_the_operation_or_a_name_and_delegates_otherwise() {
        assert_eq!(get_glyph_name(&advances(), 10, &format()), "");
        assert_eq!(get_glyph_name(&full_backend(), 10, &format()), "A");
        assert_eq!(get_glyph_name(&full_backend(), 999, &format()), "");
    }
}

mod initialize_shaped_run {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_shaped_run() {
        let shared = run(9.0, test_glyphs(), "Latn");
        let mut out = shared.write().unwrap();
        initialize_shaped_run(&mut out);
        assert_eq!(
            (
                out.advance_width,
                out.glyph_count,
                out.glyphs.len(),
                out.script.as_str()
            ),
            (0.0, 0, 0, "")
        );
    }
}

mod shape_text_run {
    use super::*;

    #[test]
    fn returns_null_when_the_backend_is_advances_only() {
        assert!(shape_text_run(&advances(), "hi", &format(), None).is_none());
    }

    #[test]
    fn delegates_to_the_backend_and_returns_its_run() {
        let produced = run(15.0, test_glyphs(), "Latn");
        let handed = produced.clone();
        let mut host = advances();
        host.shape_run = Some(Arc::new(move |_, _, _| handed.clone()));
        let shaped = shape_text_run(&host, "ab", &format(), None).unwrap();
        assert!(Arc::ptr_eq(&shaped, &produced));
        assert_eq!(shaped.read().unwrap().glyph_count, 2);
        assert_eq!(shaped.read().unwrap().direction, TextDirection::LeftToRight);
    }

    #[test]
    fn passes_the_text_and_options_to_the_backend() {
        let (host, captured) = capturing_backend();
        shape_text_run(&host, "x", &format(), Some(&rtl_arab()));
        shape_text_run(&host, "y", &format(), None);
        assert_eq!(
            *captured.lock().unwrap(),
            vec![("x".to_string(), Some(rtl_arab())), ("y".to_string(), None)]
        );
    }
}

mod shape_text_run_into {
    use super::*;

    #[test]
    fn returns_false_and_leaves_out_without_the_operation() {
        let shared = create_shaped_run();
        let mut out = shared.write().unwrap();
        assert!(!shape_text_run_into(
            &mut out,
            &advances(),
            "hi",
            &format(),
            None
        ));
        assert_eq!(out.glyph_count, 0);
    }

    #[test]
    fn writes_run_fields_and_glyphs_into_out_and_returns_true() {
        let shared = create_shaped_run();
        let mut out = shared.write().unwrap();
        assert!(shape_text_run_into(
            &mut out,
            &full_backend(),
            "ab",
            &format(),
            None
        ));
        assert_eq!(
            (out.advance_width, out.glyph_count, out.glyphs.len()),
            (15.0, 2, 2)
        );
        assert_eq!(out.glyphs[0].glyph_id, 10);
        assert_eq!(out.script, "Latn");
    }

    #[test]
    fn forwards_options_to_the_backend() {
        let (host, captured) = capturing_backend();
        let shared = create_shaped_run();
        shape_text_run_into(
            &mut shared.write().unwrap(),
            &host,
            "x",
            &format(),
            Some(&rtl_arab()),
        );
        assert_eq!(captured.lock().unwrap()[0].1, Some(rtl_arab()));
    }

    #[test]
    fn retains_the_existing_glyphs_buffer_and_drops_stale_glyphs() {
        let shared = create_shaped_run();
        let mut out = shared.write().unwrap();
        out.glyphs = vec![glyph(9, 99, 1.0, 0.0); 3];
        out.glyphs.reserve(16);
        let buffer = out.glyphs.as_ptr();
        shape_text_run_into(&mut out, &full_backend(), "ab", &format(), None);
        assert_eq!(out.glyphs.as_ptr(), buffer);
        assert_eq!(out.glyphs, test_glyphs());
    }
}
