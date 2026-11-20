use std::sync::Arc;

use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer_from_bytes, create_array_buffer_view,
};
use flight_font::{
    FontFaceSource, FontFaceSourceData, GlyphRasterizeOptions, create_font_resource,
    load_font_resource_from_bytes,
};
use flight_glyphatlas::{
    GlyphAtlasOptions, create_glyph_atlas, get_glyph_atlas_bitmap, get_glyph_atlas_entry,
};
use flight_host_text::*;
use flight_textformat::{FontVariation, TextFormat};
use flight_textshaper::{ShapeRunOptions, TextDirection, TextFeature, TextShaperOptions};

use crate::support::*;

fn assert_send_sync<T: Send + Sync>() {}

fn format(family: &str, size: f32) -> TextFormat {
    return TextFormat {
        align: None,
        block_indent: None,
        bold: None,
        bullet: None,
        color: None,
        font: Some(family.to_string()),
        indent: None,
        italic: None,
        kerning: None,
        leading: None,
        left_margin: None,
        letter_spacing: None,
        list_marker: None,
        right_margin: None,
        size: Some(size),
        strikethrough: None,
        tab_stops: None,
        target: None,
        underline: None,
        url: None,
        variations: None,
    };
}

fn raster_options(family: &str, size: f32) -> GlyphRasterizeOptions {
    return GlyphRasterizeOptions {
        font_family: family.to_string(),
        font_size: size,
        font_style: None,
        font_weight: None,
    };
}

fn loaded_synthetic_host() -> TextHost {
    let host = create_text_host(None);
    assert!(load_font_bytes_with_text_host(&host, "synthetic", &synthetic_font(), None).is_some());
    return host;
}

mod create_text_host {
    use super::*;

    #[test]
    fn creates_sendable_plural_capability_groups_without_module_state() {
        assert_send_sync::<TextHost>();
        let host = create_text_host(None);
        assert!(get_text_host_font_capabilities(&host).loader.is_some());
        assert!(get_text_host_glyph_capabilities(&host).rasterizer.is_some());
        assert!(get_text_host_shaper_capabilities(&host).shaper.is_some());
        assert!(!is_text_host_disposed(&host));
    }
}

mod create_text_host_face_options {
    use super::*;

    #[test]
    fn selects_face_zero() {
        assert_eq!(create_text_host_face_options().face_index, 0);
    }
}

mod create_text_host_options {
    use super::*;

    #[test]
    fn returns_documented_finite_resource_bounds() {
        let options = create_text_host_options();
        assert_eq!(options.max_font_bytes, 32 * 1024 * 1024);
        assert_eq!(options.max_faces, 64);
        assert_eq!(options.max_discovery_files, 4_096);
        assert_eq!(options.max_font_size, 512.0);
        assert_eq!(options.max_glyph_pixels, 4 * 1024 * 1024);
    }
}

mod discover_system_font_with_text_host {
    use super::*;

    #[test]
    fn reports_unavailable_discovery_without_roots() {
        let mut options = create_text_host_options();
        options.font_directories.clear();
        let host = create_text_host(Some(&options));
        assert!(discover_system_font_with_text_host(&host, "missing").is_none());
        assert_reason(
            &explain_text_host_discover(&host, "missing"),
            TextHostOperationExplanationReason::DiscoveryUnavailable,
        );
    }
}

mod dispose_text_host {
    use super::*;

    #[test]
    fn is_idempotent_and_invalidates_retained_operations() {
        let mut host = loaded_synthetic_host();
        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper")
            .clone();
        let rasterizer = get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer")
            .clone();
        dispose_text_host(&mut host);
        dispose_text_host(&mut host);
        assert!(is_text_host_disposed(&host));
        assert_eq!((shaper.measure_text)("A", &format("synthetic", 20.0)), 0.0);
        assert!(rasterizer.rasterize(65, &raster_options("synthetic", 20.0)).is_none());
        assert_eq!(
            (shaper.shape_run.as_ref().expect("shape run"))(
                "A",
                &format("synthetic", 20.0),
                None,
            )
            .read()
            .expect("run")
            .glyph_count,
            0
        );
    }

    #[test]
    fn drop_invalidates_a_retained_callback() {
        let callback = {
            let host = loaded_synthetic_host();
            get_text_host_shaper_capabilities(&host)
                .shaper
                .as_ref()
                .expect("shaper")
                .measure_text
                .clone()
        };
        assert_eq!(callback("A", &format("synthetic", 20.0)), 0.0);
    }
}

mod explain_text_host_discover {
    use super::*;

    #[test]
    fn reports_the_same_unavailable_discovery_sentinel_without_mutation() {
        let mut options = create_text_host_options();
        options.font_directories.clear();
        let host = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_discover(&host, "missing"),
            TextHostOperationExplanationReason::DiscoveryUnavailable,
        );
        assert!(get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .is_some_and(|loader| !(loader.check_font_face)("1em 'missing'")));
    }
}

mod explain_text_host_load {
    use super::*;

    #[test]
    fn distinguishes_empty_large_malformed_unsupported_and_face_index_inputs() {
        let host = create_text_host(None);
        assert_reason(
            &explain_text_host_load(&host, "font", &[], None),
            TextHostOperationExplanationReason::EmptyInput,
        );
        let mut options = create_text_host_options();
        options.max_font_bytes = 4;
        let limited = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_load(&limited, "font", &[0; 5], None),
            TextHostOperationExplanationReason::InputTooLarge,
        );
        assert_reason(
            &explain_text_host_load(&host, "font", &[0, 1, 2, 3], None),
            TextHostOperationExplanationReason::UnsupportedFont,
        );
        let font = synthetic_font();
        assert_reason(
            &explain_text_host_load(&host, "font", &font[..font.len() / 2], None),
            TextHostOperationExplanationReason::MalformedFont,
        );
        assert_reason(
            &explain_text_host_load(
                &host,
                "font",
                &font,
                Some(&TextHostFaceOptions { face_index: 1 }),
            ),
            TextHostOperationExplanationReason::FaceIndexOutOfRange,
        );
        assert_reason(
            &explain_text_host_load(&host, "font", &font, None),
            TextHostOperationExplanationReason::Ready,
        );
    }
}

mod explain_text_host_metrics {
    use super::*;

    #[test]
    fn distinguishes_unloaded_and_ready_metrics() {
        let host = create_text_host(None);
        assert_reason(
            &explain_text_host_metrics(&host, &format("synthetic", 20.0)),
            TextHostOperationExplanationReason::FontFamilyNotLoaded,
        );
        assert!(load_font_bytes_with_text_host(&host, "synthetic", &synthetic_font(), None)
            .is_some());
        assert_reason(
            &explain_text_host_metrics(&host, &format("synthetic", 20.0)),
            TextHostOperationExplanationReason::Ready,
        );
    }
}

mod explain_text_host_rasterize {
    use super::*;

    #[test]
    fn distinguishes_invalid_code_points_and_ready_glyphs() {
        let host = loaded_synthetic_host();
        assert_reason(
            &explain_text_host_rasterize(
                &host,
                0x11_0000,
                &raster_options("synthetic", 20.0),
            ),
            TextHostOperationExplanationReason::InvalidCodePoint,
        );
        assert_reason(
            &explain_text_host_rasterize(
                &host,
                65,
                &raster_options("synthetic", 20.0),
            ),
            TextHostOperationExplanationReason::Ready,
        );
    }
}

mod explain_text_host_shape {
    use super::*;

    #[test]
    fn distinguishes_unloaded_and_ready_runs() {
        let host = create_text_host(None);
        assert_reason(
            &explain_text_host_shape(&host, "A", &format("synthetic", 20.0), None),
            TextHostOperationExplanationReason::FontFamilyNotLoaded,
        );
        assert!(load_font_bytes_with_text_host(&host, "synthetic", &synthetic_font(), None)
            .is_some());
        assert_reason(
            &explain_text_host_shape(&host, "A", &format("synthetic", 20.0), None),
            TextHostOperationExplanationReason::Ready,
        );
    }
}

mod get_text_host_font_capabilities {
    use super::*;

    #[test]
    fn loads_exact_bounded_array_buffer_windows_and_rejects_urls() {
        let host = create_text_host(None);
        let loader = get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .expect("font loader");
        let font = synthetic_font();
        let mut padded = vec![9; 7];
        padded.extend_from_slice(&font);
        padded.extend_from_slice(&[8; 5]);
        let buffer = create_array_buffer_from_bytes(padded.into_boxed_slice());
        let view = create_array_buffer_view(
            &buffer,
            7,
            font.len(),
            ArrayBufferViewKind::Uint8Array,
        )
        .expect("bounded view");
        let face = (loader.create_font_face)(
            "windowed",
            &FontFaceSource::Data(FontFaceSourceData { value: view }),
        );
        assert!(block_on((loader.load_font_face)(&face)).is_ok());
        (loader.add_font_face)(&face);
        assert!((loader.check_font_face)("1em 'windowed'"));
        assert_eq!(
            block_on((loader.load_font_faces)("1em 'windowed'"))
                .expect("registered faces")
                .len(),
            1
        );
        assert!(block_on((loader.when_ready)()).is_ok());

        let invalid = (loader.create_font_face)(
            "url",
            &FontFaceSource::Url(flight_font::FontFaceSourceUrl {
                value: "url(font.ttf)".to_string(),
            }),
        );
        assert!(block_on((loader.load_font_face)(&invalid)).is_err());
    }

    #[test]
    fn integrates_with_the_existing_font_resource_byte_loader() {
        let host = create_text_host(None);
        let loader = get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .expect("font loader");
        let font = synthetic_font();
        let buffer = create_array_buffer_from_bytes(font);
        let view = create_array_buffer_view(
            &buffer,
            0,
            flight_buffer::get_array_buffer_byte_length(&buffer),
            ArrayBufferViewKind::Uint8Array,
        )
        .expect("font view");
        let mut resource = create_font_resource();
        resource.family = "resource".to_string();
        block_on(load_font_resource_from_bytes(loader, &mut resource, &view))
            .expect("font resource");
        assert_eq!(resource.family, "resource");
        assert!(resource.face.is_some());
    }
}

mod get_text_host_font_variation_axes {
    use super::*;

    #[test]
    fn reports_static_faces_and_accepts_runtime_variable_selection_when_available() {
        let host = loaded_synthetic_host();
        let face = load_font_bytes_with_text_host(&host, "static", &synthetic_font(), None)
            .expect("static face");
        assert!(get_text_host_font_variation_axes(&face).is_empty());

        let Some(bytes) = variable_system_font() else {
            return;
        };
        let variable = create_text_host(None);
        let Some(face) = load_font_bytes_with_text_host(&variable, "variable", &bytes, None) else {
            return;
        };
        let axes = get_text_host_font_variation_axes(&face);
        assert!(!axes.is_empty());
        let mut selected = format("variable", 20.0);
        selected.variations = Some(Arc::new(vec![FontVariation {
            axis: axes[0].tag.clone(),
            value: axes[0].min,
        }]));
        assert!(measure_font_with_text_host(&variable, &selected).is_some());
        assert!(shape_text_with_text_host(&variable, "A", &selected, None).is_some());
    }
}

mod get_text_host_glyph_capabilities {
    use super::*;

    #[test]
    fn returns_the_host_owned_rasterizer_by_borrow() {
        let host = create_text_host(None);
        let first = get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer");
        let second = get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer");
        assert!(Arc::ptr_eq(&first.rasterize, &second.rasterize));
    }
}

mod get_text_host_shaper_capabilities {
    use super::*;

    #[test]
    fn returns_the_host_owned_shaper_by_borrow() {
        let host = create_text_host(None);
        let first = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        let second = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        assert!(Arc::ptr_eq(&first.measure_text, &second.measure_text));
    }
}

mod is_text_host_disposed {
    use super::*;

    #[test]
    fn changes_only_after_disposal() {
        let mut host = create_text_host(None);
        assert!(!is_text_host_disposed(&host));
        dispose_text_host(&mut host);
        assert!(is_text_host_disposed(&host));
    }
}

mod load_font_bytes_with_text_host {
    use super::*;

    #[test]
    fn enforces_face_caps_without_disabling_byte_loading_when_discovery_is_unavailable() {
        let mut options = create_text_host_options();
        options.font_directories.clear();
        options.max_faces = 1;
        let host = create_text_host(Some(&options));
        assert!(load_font_bytes_with_text_host(&host, "first", &synthetic_font(), None).is_some());
        assert!(load_font_bytes_with_text_host(&host, "second", &synthetic_font(), None).is_none());
        assert_reason(
            &explain_text_host_load(&host, "second", &synthetic_font(), None),
            TextHostOperationExplanationReason::FaceLimitExceeded,
        );
    }


    #[test]
    fn selects_a_nonzero_collection_face() {
        let host = create_text_host(None);
        let collection = synthetic_font_collection();
        assert!(load_font_bytes_with_text_host(
            &host,
            "second",
            &collection,
            Some(&TextHostFaceOptions { face_index: 1 }),
        )
        .is_some());
        let run = shape_text_with_text_host(&host, "A", &format("second", 10.0), None)
            .expect("second face run");
        assert_eq!(run.read().expect("run").advance_width, 9.0);
    }
}

mod measure_font_with_text_host {
    use super::*;

    #[test]
    fn returns_design_metrics_for_the_selected_family() {
        let host = loaded_synthetic_host();
        let metrics = measure_font_with_text_host(&host, &format("synthetic", 20.0))
            .expect("font metrics");
        assert_eq!(metrics.units_per_em, 1_000.0);
        assert!(metrics.ascent > 0.0);
        assert!(metrics.descent >= 0.0);
    }
}

mod rasterize_glyph_with_text_host {
    use super::*;

    #[test]
    fn returns_bounded_straight_alpha_rgba_with_dimensions_origin_and_stride() {
        let host = loaded_synthetic_host();
        let bitmap = rasterize_glyph_with_text_host(
            &host,
            65,
            &raster_options("synthetic", 20.0),
        )
        .expect("glyph bitmap");
        assert!(bitmap.width > 0);
        assert!(bitmap.height > 0);
        assert_eq!(
            bitmap.pixels.len(),
            bitmap.width as usize * bitmap.height as usize * 4
        );
        assert!(bitmap.bearing_y >= 0);
        assert!(bitmap.pixels.as_chunks::<4>().0.iter().any(|pixel| pixel[3] > 0));
        for pixel in bitmap.pixels.as_chunks::<4>().0 {
            if pixel[3] > 0 {
                assert_eq!(&pixel[..3], &[255, 255, 255]);
            }
        }
    }

    #[test]
    fn rejects_missing_scalars_sizes_and_resource_excesses() {
        let host = loaded_synthetic_host();
        assert!(rasterize_glyph_with_text_host(
            &host,
            66,
            &raster_options("synthetic", 20.0),
        )
        .is_none());
        assert_reason(
            &explain_text_host_rasterize(
                &host,
                0x11_0000,
                &raster_options("synthetic", 20.0),
            ),
            TextHostOperationExplanationReason::InvalidCodePoint,
        );
        assert_reason(
            &explain_text_host_rasterize(
                &host,
                65,
                &raster_options("synthetic", f32::NAN),
            ),
            TextHostOperationExplanationReason::InvalidSize,
        );
        assert_reason(
            &explain_text_host_rasterize(
                &host,
                65,
                &raster_options("synthetic", 513.0),
            ),
            TextHostOperationExplanationReason::InvalidSize,
        );

        let mut options = create_text_host_options();
        options.max_glyph_pixels = 1;
        let limited = create_text_host(Some(&options));
        assert!(load_font_bytes_with_text_host(
            &limited,
            "synthetic",
            &synthetic_font(),
            None,
        )
        .is_some());
        assert_reason(
            &explain_text_host_rasterize(
                &limited,
                65,
                &raster_options("synthetic", 20.0),
            ),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );
    }

    #[test]
    fn survives_parallel_calls_without_shared_module_state() {
        let host = Arc::new(loaded_synthetic_host());
        let mut threads = Vec::new();
        for _ in 0..8 {
            let host = host.clone();
            threads.push(std::thread::spawn(move || {
                return rasterize_glyph_with_text_host(
                    &host,
                    65,
                    &raster_options("synthetic", 20.0),
                )
                .expect("parallel raster")
                .pixels;
            }));
        }
        let expected = threads.remove(0).join().expect("first raster");
        for thread in threads {
            assert_eq!(thread.join().expect("parallel raster"), expected);
        }
    }
}

mod shape_text_with_text_host {
    use super::*;

    #[test]
    fn preserves_utf16_clusters_advances_offsets_and_missing_glyphs() {
        let host = loaded_synthetic_host();
        let run = shape_text_with_text_host(
            &host,
            "A😀A",
            &format("synthetic", 20.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                features: None,
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                variations: None,
            }),
        )
        .expect("shaped run");
        let run = run.read().expect("run");
        assert_eq!(run.direction, TextDirection::LeftToRight);
        assert_eq!(run.glyph_count, 3);
        assert_eq!(
            run.glyphs.iter().map(|glyph| glyph.cluster).collect::<Vec<_>>(),
            vec![0, 1, 3]
        );
        assert_eq!(run.glyphs[1].glyph_id, 0);
        assert!(run.glyphs.iter().all(|glyph| glyph.x_advance >= 0.0));
        assert!(run.glyphs.iter().all(|glyph| glyph.x_offset.is_finite()));
        assert!(run.advance_width > 0.0);
    }

    #[test]
    fn applies_features_script_language_direction_substitution_and_positioning_when_available() {
        let Some(bytes) = complex_system_font() else {
            return;
        };
        let host = create_text_host(None);
        assert!(load_font_bytes_with_text_host(&host, "complex", &bytes, None).is_some());
        let disabled = shape_text_with_text_host(
            &host,
            "ffi",
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                features: Some(vec![TextFeature {
                    end: None,
                    start: None,
                    tag: "liga".to_string(),
                    value: 0,
                }]),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                variations: None,
            }),
        )
        .expect("unligated run");
        let enabled = shape_text_with_text_host(
            &host,
            "ffi",
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                features: Some(vec![TextFeature {
                    end: None,
                    start: None,
                    tag: "liga".to_string(),
                    value: 1,
                }]),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                variations: None,
            }),
        )
        .expect("ligated run");
        assert!(
            enabled.read().expect("enabled").glyph_count
                <= disabled.read().expect("disabled").glyph_count
        );

        let unkerned = shape_text_with_text_host(
            &host,
            "AV",
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                features: Some(vec![TextFeature {
                    end: None,
                    start: None,
                    tag: "kern".to_string(),
                    value: 0,
                }]),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                variations: None,
            }),
        )
        .expect("unkerned run");
        let kerned = shape_text_with_text_host(
            &host,
            "AV",
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                features: Some(vec![TextFeature {
                    end: None,
                    start: None,
                    tag: "kern".to_string(),
                    value: 1,
                }]),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                variations: None,
            }),
        )
        .expect("kerned run");
        assert_ne!(
            kerned.read().expect("kerned").advance_width,
            unkerned.read().expect("unkerned").advance_width
        );

        let arabic = "سَلَام";
        let run = shape_text_with_text_host(
            &host,
            arabic,
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::RightToLeft),
                features: None,
                language: Some("ar".to_string()),
                script: Some("Arab".to_string()),
                variations: None,
            }),
        )
        .expect("Arabic run");
        let run = run.read().expect("Arabic run");
        assert_eq!(run.direction, TextDirection::RightToLeft);
        assert!(!run.glyphs.is_empty());
        assert!(run.glyphs.iter().all(|glyph| glyph.cluster >= 0));
        assert!(run.glyphs.iter().all(|glyph| glyph.cluster <= arabic.encode_utf16().count() as i32));
        assert!(run.glyphs.windows(2).any(|pair| pair[0].cluster >= pair[1].cluster));
        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        let nominal: Vec<i32> = arabic
            .chars()
            .map(|character| {
                (shaper.get_glyph_index_for_code_point.as_ref().expect("cmap"))(
                    character as i32,
                )
            })
            .collect();
        assert!(run.glyphs.iter().any(|glyph| !nominal.contains(&glyph.glyph_id)));
    }

    #[test]
    fn rejects_invalid_feature_ranges_without_panicking() {
        let host = loaded_synthetic_host();
        let options = TextShaperOptions {
            direction: None,
            features: Some(vec![TextFeature {
                end: Some(1),
                start: Some(1),
                tag: "bad".to_string(),
                value: 1,
            }]),
            language: None,
            script: None,
            variations: None,
        };
        assert!(shape_text_with_text_host(
            &host,
            "A",
            &format("synthetic", 20.0),
            Some(&options),
        )
        .is_none());
        assert_reason(
            &explain_text_host_shape(
                &host,
                "A",
                &format("synthetic", 20.0),
                Some(&options),
            ),
            TextHostOperationExplanationReason::InvalidFeature,
        );
    }

    #[test]
    fn feeds_the_existing_headless_glyph_atlas_and_matches_direct_rgba_readback() {
        let host = loaded_synthetic_host();
        let run = shape_text_with_text_host(&host, "A", &format("synthetic", 20.0), None)
            .expect("Latin run");
        assert_eq!(run.read().expect("run").glyph_count, 1);
        let direct = rasterize_glyph_with_text_host(
            &host,
            65,
            &raster_options("synthetic", 20.0),
        )
        .expect("direct raster");
        let backend = get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer")
            .clone();
        let atlas = create_glyph_atlas(&GlyphAtlasOptions {
            font_family: "synthetic".to_string(),
            font_size: 20.0,
            font_style: None,
            font_weight: None,
            height: 64,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: Some(1),
            rasterizer_backend: backend,
            width: 64,
        });
        let entry = get_glyph_atlas_entry(&atlas, 65).expect("atlas entry");
        let entry = entry.read().expect("entry");
        assert_eq!((entry.width, entry.height), (direct.width, direct.height));
        let bitmap = get_glyph_atlas_bitmap(&atlas);
        let bitmap = bitmap.read().expect("atlas bitmap");
        for y in 0..direct.height as usize {
            let source = y * direct.width as usize * 4;
            let target = ((entry.y as usize + y) * 64 + entry.x as usize) * 4;
            assert_eq!(
                &bitmap.data[target..target + direct.width as usize * 4],
                &direct.pixels[source..source + direct.width as usize * 4]
            );
        }
    }

    #[test]
    fn capability_shape_run_uses_rustybuzz_and_its_declared_option_subset() {
        let host = loaded_synthetic_host();
        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        let run = (shaper.shape_run.as_ref().expect("shape run"))(
            "A",
            &format("synthetic", 20.0),
            Some(&ShapeRunOptions {
                direction: Some(TextDirection::TopToBottom),
                script: Some("Latn".to_string()),
            }),
        );
        assert_eq!(run.read().expect("run").direction, TextDirection::TopToBottom);
    }
}
