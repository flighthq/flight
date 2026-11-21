#[cfg(feature = "system-discovery")]
use std::fs;
use std::sync::Arc;
use std::time::{Duration, Instant};

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

fn font_source(bytes: Box<[u8]>) -> FontFaceSource {
    let length = bytes.len();
    let buffer = create_array_buffer_from_bytes(bytes);
    let value = create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array)
        .expect("font view");
    return FontFaceSource::Data(FontFaceSourceData { value });
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

fn shaper_options() -> TextShaperOptions {
    return TextShaperOptions {
        direction: None,
        features: None,
        language: None,
        script: None,
        variations: None,
    };
}

mod bounded_reverse_cmap {
    use super::*;

    #[test]
    fn caches_grouped_mappings_and_rejects_unbounded_or_overlapping_ranges_promptly() {
        let font = synthetic_format_12_font(&[(0x10000, 0x10000, 1)]);
        let host = create_text_host(None);
        load_font_bytes_with_text_host(&host, "grouped", &font, None).expect("grouped cmap");
        let reverse = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper")
            .get_code_point_for_glyph
            .as_ref()
            .expect("reverse cmap");
        for _ in 0..1_000 {
            assert_eq!(reverse(1), 0x10000);
        }

        for malformed in [
            synthetic_format_12_font(&[(0, u32::MAX, 0)]),
            synthetic_format_12_font(&[(65, 65, 1), (65, 65, 1)]),
            synthetic_format_12_font(&[(65, 65, u32::MAX)]),
        ] {
            let started = Instant::now();
            let host = create_text_host(None);
            assert!(load_font_bytes_with_text_host(&host, "malicious", &malformed, None).is_none());
            assert!(started.elapsed() < Duration::from_millis(250));
        }
    }

    #[test]
    fn enforces_group_and_total_operation_caps() {
        let two_groups = synthetic_format_12_font(&[(65, 65, 1), (66, 66, 1)]);
        let mut group_options = create_text_host_options();
        group_options.max_cmap_groups = 1;
        let group_limited = create_text_host(Some(&group_options));
        assert!(
            load_font_bytes_with_text_host(&group_limited, "groups", &two_groups, None).is_none()
        );

        let mut work_options = create_text_host_options();
        work_options.max_cmap_operations = 0;
        let work_limited = create_text_host(Some(&work_options));
        assert!(
            load_font_bytes_with_text_host(
                &work_limited,
                "work",
                &synthetic_format_12_font(&[(65, 65, 1)]),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn bounds_high_byte_and_trimmed_mappings_at_the_exact_work_limit() {
        for font in [synthetic_format_2_font(), synthetic_format_6_font()] {
            let mut options = create_text_host_options();
            options.max_cmap_operations = 2;
            let exact = create_text_host(Some(&options));
            load_font_bytes_with_text_host(&exact, "bmp", &font, None)
                .expect("font at the mapping limit");
            let shaper = get_text_host_shaper_capabilities(&exact)
                .shaper
                .as_ref()
                .expect("shaper");
            assert_eq!(
                shaper
                    .get_code_point_for_glyph
                    .as_ref()
                    .expect("reverse cmap")(1),
                65
            );
            options.max_cmap_operations = 1;
            assert!(
                load_font_bytes_with_text_host(
                    &create_text_host(Some(&options)),
                    "bmp",
                    &font,
                    None
                )
                .is_none()
            );
        }
    }

    #[test]
    fn preaccounts_format_4_segments_and_preserves_both_mapping_forms() {
        let overlap = synthetic_format_4_font(&[(65, 66, -64), (66, 67, -65)]);
        assert!(
            load_font_bytes_with_text_host(&create_text_host(None), "overlap", &overlap, None)
                .is_none()
        );

        let direct = synthetic_format_4_font(&[(65, 68, -64)]);
        let mut exact_options = create_text_host_options();
        exact_options.max_cmap_operations = 4;
        let exact = create_text_host(Some(&exact_options));
        load_font_bytes_with_text_host(&exact, "direct", &direct, None).expect("exact work cap");
        let reverse = get_text_host_shaper_capabilities(&exact)
            .shaper
            .as_ref()
            .expect("shaper")
            .get_code_point_for_glyph
            .as_ref()
            .expect("reverse cmap");
        assert_eq!(reverse(1), 65);

        exact_options.max_cmap_operations = 3;
        assert!(
            load_font_bytes_with_text_host(
                &create_text_host(Some(&exact_options)),
                "short",
                &direct,
                None,
            )
            .is_none()
        );

        let ranged = synthetic_format_4_range_font(4);
        let ranged_host = create_text_host(None);
        load_font_bytes_with_text_host(&ranged_host, "ranged", &ranged, None)
            .expect("idRangeOffset mapping");
        let reverse = get_text_host_shaper_capabilities(&ranged_host)
            .shaper
            .as_ref()
            .expect("shaper")
            .get_code_point_for_glyph
            .as_ref()
            .expect("reverse cmap");
        assert_eq!(reverse(1), 65);
        assert!(
            load_font_bytes_with_text_host(
                &create_text_host(None),
                "overflow",
                &synthetic_format_4_range_font(u16::MAX),
                None,
            )
            .is_none()
        );
    }

    #[test]
    fn handles_format_13_unicode_limits_and_lowest_reverse_mapping() {
        let host = create_text_host(None);
        load_font_bytes_with_text_host(
            &host,
            "many-to-one",
            &synthetic_format_13_font(&[(65, 66, 1), (90, 91, 1)]),
            None,
        )
        .expect("format 13 cmap");
        let reverse = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper")
            .get_code_point_for_glyph
            .as_ref()
            .expect("reverse cmap");
        assert_eq!(reverse(1), 65);

        for format in [12, 13] {
            let invalid = if format == 12 {
                synthetic_format_12_font(&[(0x11_0000, 0x11_0000, 1)])
            } else {
                synthetic_format_13_font(&[(0x11_0000, 0x11_0000, 1)])
            };
            assert!(
                load_font_bytes_with_text_host(
                    &create_text_host(None),
                    "outside-unicode",
                    &invalid,
                    None,
                )
                .is_none()
            );
        }
    }
}

#[cfg(feature = "system-discovery")]
mod bounded_system_discovery {
    use super::*;

    #[test]
    fn sorts_candidates_and_enforces_traversal_and_byte_caps() {
        let directory = TestDirectory::create();
        fs::write(
            directory.path().join("a.ttf"),
            synthetic_named_font("Ordered", 600.0),
        )
        .expect("write a");
        fs::write(
            directory.path().join("b.ttf"),
            synthetic_named_font("Ordered", 900.0),
        )
        .expect("write b");
        let mut options = create_text_host_options();
        options.font_directories = vec![directory.path().to_string_lossy().into_owned()];
        options.max_discovery_files = 3;
        let host = create_text_host(Some(&options));
        discover_system_font_with_text_host(&host, "ordered").expect("sorted discovery");
        assert_eq!(
            shape_text_with_text_host(&host, "A", &format("Ordered", 20.0), None)
                .expect("discovered run")
                .read()
                .expect("run")
                .advance_width,
            12.0
        );

        options.max_discovery_files = 2;
        let traversal_limited = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_discover(&traversal_limited, "Ordered"),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );

        options.max_discovery_files = 3;
        options.max_font_bytes = 1;
        let byte_limited = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_discover(&byte_limited, "Ordered"),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );
    }

    #[test]
    fn sorts_configured_roots_and_filters_nonmatching_families() {
        let first = TestDirectory::create();
        let second = TestDirectory::create();
        let mut roots = [first.path(), second.path()];
        roots.sort();
        fs::write(
            roots[0].join("font.ttf"),
            synthetic_named_font("RootOrder", 600.0),
        )
        .expect("write first root");
        fs::write(
            roots[1].join("font.ttf"),
            synthetic_named_font("RootOrder", 900.0),
        )
        .expect("write second root");
        let mut options = create_text_host_options();
        options.font_directories = roots
            .iter()
            .rev()
            .map(|root| root.to_string_lossy().into_owned())
            .collect();
        options.max_discovery_files = 4;
        let host = create_text_host(Some(&options));
        discover_system_font_with_text_host(&host, "rootorder").expect("sorted root discovery");
        assert_eq!(
            shape_text_with_text_host(&host, "A", &format("RootOrder", 20.0), None)
                .expect("root ordered run")
                .read()
                .expect("run")
                .advance_width,
            12.0
        );

        options.font_directories = roots
            .iter()
            .map(|root| root.join("font.ttf").to_string_lossy().into_owned())
            .collect();
        options.max_discovery_files = 1;
        assert_reason(
            &explain_text_host_discover(&create_text_host(Some(&options)), "RootOrder"),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );

        let families = TestDirectory::create();
        fs::write(
            families.path().join("a-wrong.ttf"),
            synthetic_named_font("Other", 900.0),
        )
        .expect("write nonmatching family");
        fs::write(
            families.path().join("b-target.ttf"),
            synthetic_named_font("Target", 600.0),
        )
        .expect("write matching family");
        options.font_directories = vec![families.path().to_string_lossy().into_owned()];
        options.max_discovery_files = 3;
        let host = create_text_host(Some(&options));
        discover_system_font_with_text_host(&host, "target").expect("family-filtered discovery");
        assert_eq!(
            shape_text_with_text_host(&host, "A", &format("Target", 20.0), None)
                .expect("family-filtered run")
                .read()
                .expect("run")
                .advance_width,
            12.0
        );
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_symbolic_links() {
        let directory = TestDirectory::create();
        let target = directory.path().join("target.bin");
        fs::write(&target, synthetic_named_font("Linked", 600.0)).expect("write target");
        std::os::unix::fs::symlink(&target, directory.path().join("linked.ttf"))
            .expect("create symlink");
        let mut options = create_text_host_options();
        options.font_directories = vec![directory.path().to_string_lossy().into_owned()];
        options.max_discovery_files = 3;
        let host = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_discover(&host, "Linked"),
            TextHostOperationExplanationReason::FontNotFound,
        );
    }
}

mod bounded_woff_loading {
    use super::*;

    #[test]
    fn loads_a_generated_woff_and_enforces_exact_encoded_and_decoded_boundaries() {
        let plain = synthetic_font();
        let woff = synthetic_woff();
        let mut exact = create_text_host_options();
        exact.max_font_bytes = woff.len();
        exact.max_woff_decoded_bytes = plain.len();
        let host = create_text_host(Some(&exact));
        assert_reason(
            &explain_text_host_load(&host, "woff", &woff, None),
            TextHostOperationExplanationReason::Ready,
        );
        assert!(load_font_bytes_with_text_host(&host, "woff", &woff, None).is_some());
        assert_eq!(
            shape_text_with_text_host(&host, "A", &format("woff", 20.0), None)
                .expect("WOFF shaped run")
                .read()
                .expect("run")
                .advance_width,
            12.0
        );

        let mut encoded_short = exact.clone();
        encoded_short.max_font_bytes -= 1;
        assert_reason(
            &explain_text_host_load(&create_text_host(Some(&encoded_short)), "woff", &woff, None),
            TextHostOperationExplanationReason::InputTooLarge,
        );

        let mut decoded_short = exact;
        decoded_short.max_woff_decoded_bytes -= 1;
        assert_reason(
            &explain_text_host_load(&create_text_host(Some(&decoded_short)), "woff", &woff, None),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );
    }

    #[test]
    fn rejects_bombs_many_records_overlaps_and_arithmetic_mismatches_before_inflation() {
        let mut bomb = declared_woff(1, 256 * 1024 * 1024).into_vec();
        bomb.resize(255 * 1024, 0);
        let bomb_length = bomb.len() as u32;
        bomb[8..12].copy_from_slice(&bomb_length.to_be_bytes());
        let compressed_length = bomb.len() as u32 - 64;
        bomb[52..56].copy_from_slice(&compressed_length.to_be_bytes());
        let host = create_text_host(None);
        let started = Instant::now();
        assert_reason(
            &explain_text_host_load(&host, "bomb", &bomb, None),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );
        assert!(started.elapsed() < Duration::from_millis(250));

        let mut table_options = create_text_host_options();
        table_options.max_woff_tables = 1;
        assert_reason(
            &explain_text_host_load(
                &create_text_host(Some(&table_options)),
                "many",
                &declared_woff(2, 8),
                None,
            ),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );

        let mut overlap = declared_woff(2, 8).into_vec();
        overlap[68..72].copy_from_slice(&86_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "overlap", &overlap, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut wrong_total = declared_woff(1, 8).into_vec();
        wrong_total[16..20].copy_from_slice(&u32::MAX.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "overflow", &wrong_total, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut inconsistent_metadata = declared_woff(1, 8).into_vec();
        inconsistent_metadata[28..32].copy_from_slice(&1_u32.to_be_bytes());
        inconsistent_metadata[32..36].copy_from_slice(&1_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "metadata", &inconsistent_metadata, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut overlapping_private_data = declared_woff(1, 8).into_vec();
        overlapping_private_data[36..40].copy_from_slice(&64_u32.to_be_bytes());
        overlapping_private_data[40..44].copy_from_slice(&4_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "private", &overlapping_private_data, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut compressed_longer = declared_woff(1, 4).into_vec();
        compressed_longer[56..60].copy_from_slice(&3_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "compressed-length", &compressed_longer, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut conflicting_shared_stream = declared_woff(2, 8).into_vec();
        conflicting_shared_stream[76..80].copy_from_slice(&4_u32.to_be_bytes());
        conflicting_shared_stream[16..20].copy_from_slice(&56_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "shared-length", &conflicting_shared_stream, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut incomplete_metadata = declared_woff(1, 8).into_vec();
        incomplete_metadata[24..28].copy_from_slice(&68_u32.to_be_bytes());
        incomplete_metadata[32..36].copy_from_slice(&4_u32.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "metadata-pair", &incomplete_metadata, None),
            TextHostOperationExplanationReason::MalformedFont,
        );

        let mut wrong_length = synthetic_woff().into_vec();
        let declared = u32::try_from(wrong_length.len()).expect("WOFF length") + 1;
        wrong_length[8..12].copy_from_slice(&declared.to_be_bytes());
        assert_reason(
            &explain_text_host_load(&host, "header-length", &wrong_length, None),
            TextHostOperationExplanationReason::MalformedFont,
        );
    }

    #[test]
    fn explanation_preflights_without_inflating_the_payload() {
        let invalid_zlib = declared_woff(1, 8);
        let host = create_text_host(None);
        assert_reason(
            &explain_text_host_load(&host, "preflight", &invalid_zlib, None),
            TextHostOperationExplanationReason::Ready,
        );
        assert!(load_font_bytes_with_text_host(&host, "preflight", &invalid_zlib, None).is_none());
    }
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
        assert_eq!(options.max_woff_decoded_bytes, 32 * 1024 * 1024);
        assert_eq!(options.max_woff_tables, 4_096);
        assert_eq!(options.max_cmap_groups, 4_096);
        assert_eq!(options.max_cmap_operations, 262_144);
        assert_eq!(options.max_faces, 64);
        assert_eq!(options.max_discovery_files, 4_096);
        assert_eq!(options.max_font_size, 512.0);
        assert_eq!(options.max_glyph_pixels, 4 * 1024 * 1024);
    }
}

#[cfg(not(feature = "system-discovery"))]
mod disabled_system_discovery {
    use super::*;

    #[test]
    fn reports_unavailable_even_with_configured_roots() {
        let directory = TestDirectory::create();
        let mut options = create_text_host_options();
        options.font_directories = vec![directory.path().to_string_lossy().into_owned()];
        let host = create_text_host(Some(&options));
        assert_reason(
            &explain_text_host_discover(&host, "Anything"),
            TextHostOperationExplanationReason::DiscoveryUnavailable,
        );
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
        assert!(
            rasterizer
                .rasterize(65, &raster_options("synthetic", 20.0))
                .is_none()
        );
        assert_eq!(
            (shaper.shape_run.as_ref().expect("shape run"))("A", &format("synthetic", 20.0), None,)
                .read()
                .expect("run")
                .glyph_count,
            0
        );
        assert_eq!(
            (shaper
                .get_code_point_for_glyph
                .as_ref()
                .expect("reverse cmap"))(1),
            -1
        );
        assert_eq!(
            (shaper
                .get_glyph_index_for_code_point
                .as_ref()
                .expect("cmap"))(65),
            -1
        );
        assert!(
            (shaper.get_font_metrics.as_ref().expect("font metrics"))(&format("synthetic", 20.0,))
                .is_none()
        );
        assert!((shaper.get_glyph_extents.as_ref().expect("extents"))(1).is_none());
        assert_eq!((shaper.get_glyph_name.as_ref().expect("glyph name"))(1), "");
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

mod empty_outline_rasterization {
    use super::*;

    #[test]
    fn preserves_space_advance_and_distinguishes_empty_missing_and_rejected_glyphs() {
        let host = create_text_host(None);
        load_font_bytes_with_text_host(&host, "space", &synthetic_space_font(), None)
            .expect("space face");
        let space =
            rasterize_glyph_with_text_host(&host, ' ' as u32, &raster_options("space", 20.0))
                .expect("empty outline raster");
        assert_eq!((space.width, space.height, space.pixels.len()), (0, 0, 0));
        assert_eq!(space.advance, 6.0);
        let atlas = create_glyph_atlas(&GlyphAtlasOptions {
            font_family: "space".to_string(),
            font_size: 20.0,
            font_style: None,
            font_weight: None,
            height: 32,
            max_area: None,
            max_bytes: None,
            max_glyphs: None,
            padding: Some(1),
            rasterizer_backend: get_text_host_glyph_capabilities(&host)
                .rasterizer
                .as_ref()
                .expect("rasterizer")
                .clone(),
            width: 32,
        });
        let entry = get_glyph_atlas_entry(&atlas, ' ' as u32).expect("space atlas entry");
        let entry = entry.read().expect("entry");
        assert_eq!((entry.width, entry.height, entry.advance), (0, 0, 6.0));
        assert!(
            rasterize_glyph_with_text_host(&host, 'B' as u32, &raster_options("space", 20.0),)
                .is_none()
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 'B' as u32, &raster_options("space", 20.0)),
            TextHostOperationExplanationReason::GlyphNotFound,
        );

        let run = shape_text_with_text_host(&host, "A A", &format("space", 20.0), None)
            .expect("spaced run");
        assert_eq!(run.read().expect("run").glyph_count, 3);

        let mut limited_options = create_text_host_options();
        limited_options.max_glyph_pixels = 1;
        let limited = create_text_host(Some(&limited_options));
        load_font_bytes_with_text_host(&limited, "space", &synthetic_space_font(), None)
            .expect("limited face");
        assert_reason(
            &explain_text_host_rasterize(&limited, 'A' as u32, &raster_options("space", 20.0)),
            TextHostOperationExplanationReason::ResourceLimitExceeded,
        );
        assert!(
            rasterize_glyph_with_text_host(&limited, ' ' as u32, &raster_options("space", 20.0),)
                .is_some()
        );
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
        assert!(
            get_text_host_font_capabilities(&host)
                .loader
                .as_ref()
                .is_some_and(|loader| !(loader.check_font_face)("1em 'missing'"))
        );
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
        assert!(
            load_font_bytes_with_text_host(&host, "synthetic", &synthetic_font(), None).is_some()
        );
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
            &explain_text_host_rasterize(&host, 0x11_0000, &raster_options("synthetic", 20.0)),
            TextHostOperationExplanationReason::InvalidCodePoint,
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 65, &raster_options("synthetic", 20.0)),
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
        assert!(
            load_font_bytes_with_text_host(&host, "synthetic", &synthetic_font(), None).is_some()
        );
        assert_reason(
            &explain_text_host_shape(&host, "A", &format("synthetic", 20.0), None),
            TextHostOperationExplanationReason::Ready,
        );
    }
}

mod face_selection_and_lifecycle_contracts {
    use super::*;

    #[test]
    fn enforces_loader_create_add_and_validation_boundaries() {
        let mut options = create_text_host_options();
        options.max_faces = 1;
        let host = create_text_host(Some(&options));
        let loader = get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .expect("loader");
        let first = (loader.create_font_face)("first", &font_source(synthetic_font()));
        let second = (loader.create_font_face)("second", &font_source(synthetic_font()));
        assert!(block_on((loader.load_font_face)(&first)).is_ok());
        assert!(block_on((loader.load_font_face)(&second)).is_ok());
        (loader.add_font_face)(&first);
        (loader.add_font_face)(&second);
        assert_eq!(
            block_on((loader.load_font_faces)("1em 'first'"))
                .expect("first face")
                .len(),
            1
        );
        assert!(
            block_on((loader.load_font_faces)("1em 'second'"))
                .expect("second face")
                .is_empty()
        );

        let at_cap = (loader.create_font_face)("third", &font_source(synthetic_font()));
        assert!(block_on((loader.load_font_face)(&at_cap)).is_err());

        let invalid_host = create_text_host(None);
        let invalid_loader = get_text_host_font_capabilities(&invalid_host)
            .loader
            .as_ref()
            .expect("invalid loader");
        let invalid = (invalid_loader.create_font_face)(
            "invalid",
            &FontFaceSource::Url(flight_font::FontFaceSourceUrl {
                value: "url(invalid.ttf)".to_string(),
            }),
        );
        (invalid_loader.add_font_face)(&invalid);
        assert!(!(invalid_loader.check_font_face)("1em 'invalid'"));
    }

    #[test]
    fn selects_the_newest_case_insensitive_family_and_shares_provider_identity() {
        let host = create_text_host(None);
        load_font_bytes_with_text_host(&host, "Family", &synthetic_font_with_advance(600.0), None)
            .expect("first face");
        load_font_bytes_with_text_host(&host, "family", &synthetic_font_with_advance(900.0), None)
            .expect("second face");
        let run = shape_text_with_text_host(&host, "A", &format("FAMILY", 20.0), None)
            .expect("fallback run");
        assert_eq!(run.read().expect("run").advance_width, 18.0);

        let loader = get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .expect("loader");
        let rasterizer = get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer");
        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        assert!(Arc::ptr_eq(&loader.provider, &rasterizer.provider));
        assert!(Arc::ptr_eq(&loader.provider, &shaper.provider));
    }

    #[test]
    fn disposed_loader_rejects_create_add_and_load_before_font_work() {
        let mut host = create_text_host(None);
        let loader = get_text_host_font_capabilities(&host)
            .loader
            .as_ref()
            .expect("loader")
            .clone();
        dispose_text_host(&mut host);
        let malicious = synthetic_format_12_font(&[(0, u32::MAX, 0)]);
        let length = malicious.len();
        let buffer = create_array_buffer_from_bytes(malicious);
        let view = create_array_buffer_view(&buffer, 0, length, ArrayBufferViewKind::Uint8Array)
            .expect("font view");
        let started = Instant::now();
        let face = (loader.create_font_face)(
            "disposed",
            &FontFaceSource::Data(FontFaceSourceData { value: view }),
        );
        assert!(started.elapsed() < Duration::from_millis(100));
        assert!(block_on((loader.load_font_face)(&face)).is_err());
        (loader.add_font_face)(&face);
        assert!(!(loader.check_font_face)("1em 'disposed'"));
        assert!(block_on((loader.load_font_faces)("1em 'disposed'")).is_err());
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
        let view =
            create_array_buffer_view(&buffer, 7, font.len(), ArrayBufferViewKind::Uint8Array)
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
    fn applies_generated_axis_coordinates_to_shaping_and_metrics() {
        let host = loaded_synthetic_host();
        let face = load_font_bytes_with_text_host(&host, "static", &synthetic_font(), None)
            .expect("static face");
        assert!(get_text_host_font_variation_axes(&face).is_empty());

        let variable = create_text_host(None);
        let face =
            load_font_bytes_with_text_host(&variable, "variable", &synthetic_variable_font(), None)
                .expect("generated variable face");
        let axes = get_text_host_font_variation_axes(&face);
        assert_eq!(axes.len(), 1);
        assert_eq!(axes[0].tag, "wght");
        assert_eq!(
            (axes[0].min, axes[0].default_value, axes[0].max),
            (1.0, 2.0, 3.0)
        );

        let mut minimum = format("variable", 20.0);
        minimum.variations = Some(Arc::new(vec![FontVariation {
            axis: axes[0].tag.clone(),
            value: axes[0].min,
        }]));
        let mut maximum = minimum.clone();
        maximum.variations = Some(Arc::new(vec![FontVariation {
            axis: axes[0].tag.clone(),
            value: axes[0].max,
        }]));
        let minimum_run =
            shape_text_with_text_host(&variable, "A", &minimum, None).expect("minimum run");
        let maximum_run =
            shape_text_with_text_host(&variable, "A", &maximum, None).expect("maximum run");
        assert_eq!(minimum_run.read().expect("minimum").advance_width, 12.0);
        assert_eq!(maximum_run.read().expect("maximum").advance_width, 18.0);
        let minimum_metrics =
            measure_font_with_text_host(&variable, &minimum).expect("minimum metrics");
        let maximum_metrics =
            measure_font_with_text_host(&variable, &maximum).expect("maximum metrics");
        assert_eq!(minimum_metrics.underline_position, -100.0);
        assert_eq!(maximum_metrics.underline_position, 100.0);

        let overridden = shape_text_with_text_host(
            &variable,
            "A",
            &minimum,
            Some(&TextShaperOptions {
                variations: maximum.variations.as_deref().cloned(),
                ..shaper_options()
            }),
        )
        .expect("option variation override");
        assert_eq!(overridden.read().expect("override").advance_width, 18.0);
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
        assert!(
            load_font_bytes_with_text_host(
                &host,
                "second",
                &collection,
                Some(&TextHostFaceOptions { face_index: 1 }),
            )
            .is_some()
        );
        let run = shape_text_with_text_host(&host, "A", &format("second", 10.0), None)
            .expect("second face run");
        assert_eq!(run.read().expect("run").advance_width, 9.0);
    }

    #[test]
    fn accepts_the_exact_byte_limit_and_rejects_one_byte_less() {
        let font = synthetic_font();
        let mut options = create_text_host_options();
        options.max_font_bytes = font.len();
        let exact = create_text_host(Some(&options));
        assert!(load_font_bytes_with_text_host(&exact, "exact", &font, None).is_some());

        options.max_font_bytes -= 1;
        let short = create_text_host(Some(&options));
        assert!(load_font_bytes_with_text_host(&short, "short", &font, None).is_none());
        assert_reason(
            &explain_text_host_load(&short, "short", &font, None),
            TextHostOperationExplanationReason::InputTooLarge,
        );
    }
}

mod measure_font_with_text_host {
    use super::*;

    #[test]
    fn returns_design_metrics_for_the_selected_family() {
        let host = loaded_synthetic_host();
        let metrics =
            measure_font_with_text_host(&host, &format("synthetic", 20.0)).expect("font metrics");
        assert_eq!(metrics.units_per_em, 1_000.0);
        assert!(metrics.ascent > 0.0);
        assert!(metrics.descent >= 0.0);
    }
}

mod raster_coordinate_and_limit_contracts {
    use super::*;

    #[test]
    fn keeps_rows_top_first_bearings_y_down_metrics_scaled_and_caps_exact() {
        let host = create_text_host(None);
        load_font_bytes_with_text_host(&host, "asymmetric", &synthetic_asymmetric_font(), None)
            .expect("asymmetric face");
        let bitmap =
            rasterize_glyph_with_text_host(&host, 'L' as u32, &raster_options("asymmetric", 100.0))
                .expect("asymmetric raster");
        let width = bitmap.width as usize;
        let row_ink = |row: usize| {
            bitmap.pixels[row * width * 4..(row + 1) * width * 4]
                .as_chunks::<4>()
                .0
                .iter()
                .filter(|pixel| pixel[3] > 128)
                .count()
        };
        assert!(row_ink(bitmap.height as usize - 2) > row_ink(1) * 2);
        assert!(bitmap.bearing_y > 0);

        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        let extents =
            (shaper.get_glyph_extents.as_ref().expect("extents"))(1).expect("glyph extents");
        assert_eq!(extents.x_bearing, 0.0);
        assert_eq!(extents.y_bearing, -7.8);
        assert_eq!((extents.width, extents.height), (6.0, 7.8));

        let metrics = (get_text_host_glyph_capabilities(&host)
            .rasterizer
            .as_ref()
            .expect("rasterizer")
            .measure_metrics
            .as_ref()
            .expect("metrics"))(&raster_options("asymmetric", 20.0))
        .expect("scaled metrics");
        assert_eq!((metrics.ascent, metrics.descent), (16.0, 4.0));

        let pixel_count = bitmap.width as usize * bitmap.height as usize;
        let mut exact_options = create_text_host_options();
        exact_options.max_glyph_pixels = pixel_count;
        let exact = create_text_host(Some(&exact_options));
        load_font_bytes_with_text_host(&exact, "asymmetric", &synthetic_asymmetric_font(), None)
            .expect("exact face");
        assert!(
            rasterize_glyph_with_text_host(
                &exact,
                'L' as u32,
                &raster_options("asymmetric", 100.0),
            )
            .is_some()
        );
        exact_options.max_glyph_pixels -= 1;
        let short = create_text_host(Some(&exact_options));
        load_font_bytes_with_text_host(&short, "asymmetric", &synthetic_asymmetric_font(), None)
            .expect("short face");
        assert!(
            rasterize_glyph_with_text_host(
                &short,
                'L' as u32,
                &raster_options("asymmetric", 100.0),
            )
            .is_none()
        );
    }
}

mod rasterize_glyph_with_text_host {
    use super::*;

    #[test]
    fn returns_bounded_straight_alpha_rgba_with_dimensions_origin_and_stride() {
        let host = loaded_synthetic_host();
        let bitmap = rasterize_glyph_with_text_host(&host, 65, &raster_options("synthetic", 20.0))
            .expect("glyph bitmap");
        assert!(bitmap.width > 0);
        assert!(bitmap.height > 0);
        assert_eq!(
            bitmap.pixels.len(),
            bitmap.width as usize * bitmap.height as usize * 4
        );
        assert!(bitmap.bearing_y >= 0);
        assert!(
            bitmap
                .pixels
                .as_chunks::<4>()
                .0
                .iter()
                .any(|pixel| pixel[3] > 0)
        );
        for pixel in bitmap.pixels.as_chunks::<4>().0 {
            if pixel[3] > 0 {
                assert_eq!(&pixel[..3], &[255, 255, 255]);
            }
        }
    }

    #[test]
    fn rejects_missing_scalars_sizes_and_resource_excesses() {
        let host = loaded_synthetic_host();
        assert!(
            rasterize_glyph_with_text_host(&host, 66, &raster_options("synthetic", 20.0),)
                .is_none()
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 0x11_0000, &raster_options("synthetic", 20.0)),
            TextHostOperationExplanationReason::InvalidCodePoint,
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 65, &raster_options("synthetic", 0.0)),
            TextHostOperationExplanationReason::InvalidSize,
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 65, &raster_options("synthetic", f32::NAN)),
            TextHostOperationExplanationReason::InvalidSize,
        );
        assert_reason(
            &explain_text_host_rasterize(&host, 65, &raster_options("synthetic", 513.0)),
            TextHostOperationExplanationReason::InvalidSize,
        );

        let mut options = create_text_host_options();
        options.max_glyph_pixels = 1;
        let limited = create_text_host(Some(&options));
        assert!(
            load_font_bytes_with_text_host(&limited, "synthetic", &synthetic_font(), None,)
                .is_some()
        );
        assert_reason(
            &explain_text_host_rasterize(&limited, 65, &raster_options("synthetic", 20.0)),
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
                script: Some("Cyrl".to_string()),
                variations: None,
            }),
        )
        .expect("shaped run");
        let run = run.read().expect("run");
        assert_eq!(run.direction, TextDirection::LeftToRight);
        assert_eq!(run.glyph_count, 3);
        assert_eq!(
            run.glyphs
                .iter()
                .map(|glyph| glyph.cluster)
                .collect::<Vec<_>>(),
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
            eprintln!("SKIP: no system font with complex OpenType shaping tables is available");
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
                < disabled.read().expect("disabled").glyph_count
        );
        let ranged = shape_text_with_text_host(
            &host,
            "fifi",
            &format("complex", 28.0),
            Some(&TextShaperOptions {
                features: Some(vec![TextFeature {
                    end: Some(2),
                    start: Some(0),
                    tag: "liga".to_string(),
                    value: 0,
                }]),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                ..shaper_options()
            }),
        )
        .expect("ranged ligature run");
        assert_eq!(ranged.read().expect("ranged").glyph_count, 3);

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
        assert_eq!(run.script, "Arab");
        assert!(!run.glyphs.is_empty());
        assert!(run.glyphs.iter().all(|glyph| glyph.cluster >= 0));
        assert!(
            run.glyphs
                .iter()
                .all(|glyph| glyph.cluster <= arabic.encode_utf16().count() as i32)
        );
        assert!(
            run.glyphs
                .windows(2)
                .any(|pair| pair[0].cluster >= pair[1].cluster)
        );
        let shaper = get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper");
        let nominal: Vec<i32> = arabic
            .chars()
            .map(|character| {
                (shaper
                    .get_glyph_index_for_code_point
                    .as_ref()
                    .expect("cmap"))(character as i32)
            })
            .collect();
        assert!(
            run.glyphs
                .iter()
                .any(|glyph| !nominal.contains(&glyph.glyph_id))
        );

        let automatic = shape_text_with_text_host(&host, "سلام", &format("complex", 28.0), None)
            .expect("auto-detected Arabic run");
        let automatic = automatic.read().expect("automatic run");
        assert_eq!(automatic.direction, TextDirection::RightToLeft);
        assert_eq!(automatic.script, "Arab");
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
        assert!(
            shape_text_with_text_host(&host, "A", &format("synthetic", 20.0), Some(&options),)
                .is_none()
        );
        assert_reason(
            &explain_text_host_shape(&host, "A", &format("synthetic", 20.0), Some(&options)),
            TextHostOperationExplanationReason::InvalidFeature,
        );
    }

    #[test]
    fn feeds_the_existing_headless_glyph_atlas_and_matches_direct_rgba_readback() {
        let host = loaded_synthetic_host();
        let run = shape_text_with_text_host(&host, "A", &format("synthetic", 20.0), None)
            .expect("Latin run");
        assert_eq!(run.read().expect("run").glyph_count, 1);
        let direct = rasterize_glyph_with_text_host(&host, 65, &raster_options("synthetic", 20.0))
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
    fn capability_shape_run_uses_its_declared_option_subset() {
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
                script: Some("Cyrl".to_string()),
            }),
        );
        let run = run.read().expect("run");
        assert_eq!(run.direction, TextDirection::TopToBottom);
        assert_eq!(run.script, "Cyrl");
        assert!(run.glyphs[0].y_advance > 0.0);
    }
}

mod shaping_coordinate_and_hint_contracts {
    use super::*;

    #[test]
    fn converts_vertical_coordinates_and_applies_spacing_on_the_advance_axis() {
        let host = loaded_synthetic_host();
        let mut spaced = format("synthetic", 20.0);
        spaced.letter_spacing = Some(2.0);
        let horizontal =
            shape_text_with_text_host(&host, "AA", &spaced, None).expect("horizontal run");
        let horizontal = horizontal.read().expect("horizontal");
        assert_eq!(horizontal.advance_width, 28.0);
        assert_eq!(
            horizontal
                .glyphs
                .iter()
                .map(|glyph| glyph.x_advance)
                .sum::<f32>(),
            horizontal.advance_width
        );
        let measure = (get_text_host_shaper_capabilities(&host)
            .shaper
            .as_ref()
            .expect("shaper")
            .measure_text)("AA", &spaced);
        assert_eq!(measure, horizontal.advance_width);

        let vertical = shape_text_with_text_host(
            &host,
            "AA",
            &spaced,
            Some(&TextShaperOptions {
                direction: Some(TextDirection::TopToBottom),
                script: Some("Cyrl".to_string()),
                ..shaper_options()
            }),
        )
        .expect("vertical run");
        let vertical = vertical.read().expect("vertical");
        assert_eq!(vertical.direction, TextDirection::TopToBottom);
        assert_eq!(vertical.script, "Cyrl");
        assert!(vertical.glyphs.iter().all(|glyph| glyph.y_advance > 0.0));
        assert_eq!(
            vertical
                .glyphs
                .iter()
                .map(|glyph| glyph.y_advance)
                .sum::<f32>(),
            vertical.advance_width
        );
        let unspaced_vertical = shape_text_with_text_host(
            &host,
            "AA",
            &format("synthetic", 20.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::TopToBottom),
                script: Some("Cyrl".to_string()),
                ..shaper_options()
            }),
        )
        .expect("unspaced vertical run");
        let unspaced_vertical = unspaced_vertical.read().expect("unspaced vertical");
        assert_eq!(
            vertical.advance_width - unspaced_vertical.advance_width,
            4.0
        );
        for (spaced_glyph, unspaced_glyph) in vertical.glyphs.iter().zip(&unspaced_vertical.glyphs)
        {
            assert_eq!(spaced_glyph.x_advance, unspaced_glyph.x_advance);
            assert_eq!(spaced_glyph.y_advance - unspaced_glyph.y_advance, 2.0);
        }
    }

    #[test]
    fn reports_resolved_script_and_rejects_an_invalid_language_hint() {
        let host = loaded_synthetic_host();
        let explicit = shape_text_with_text_host(
            &host,
            "A",
            &format("synthetic", 20.0),
            Some(&TextShaperOptions {
                language: Some("en".to_string()),
                script: Some("Cyrl".to_string()),
                ..shaper_options()
            }),
        )
        .expect("explicit properties");
        assert_eq!(explicit.read().expect("run").script, "Cyrl");

        let invalid = TextShaperOptions {
            language: Some(String::new()),
            ..shaper_options()
        };
        assert!(
            shape_text_with_text_host(&host, "A", &format("synthetic", 20.0), Some(&invalid),)
                .is_none()
        );

        let localized = create_text_host(None);
        load_font_bytes_with_text_host(&localized, "language", &synthetic_language_font(), None)
            .expect("language fixture");
        let shape_for = |language: &str| {
            shape_text_with_text_host(
                &localized,
                "A",
                &format("language", 20.0),
                Some(&TextShaperOptions {
                    language: Some(language.to_string()),
                    script: Some("Latn".to_string()),
                    ..shaper_options()
                }),
            )
            .expect("localized run")
            .read()
            .expect("localized run")
            .glyphs[0]
                .glyph_id
        };
        assert_eq!(shape_for("en"), 1);
        assert_eq!(shape_for("tr"), 2);
    }

    #[test]
    fn applies_generated_ligature_ranges_direction_and_mark_positioning() {
        let ligatures = create_text_host(None);
        load_font_bytes_with_text_host(&ligatures, "ligatures", &synthetic_ligature_font(), None)
            .expect("ligature fixture");
        let liga = |value, text: &str, start, end, direction| {
            shape_text_with_text_host(
                &ligatures,
                text,
                &format("ligatures", 20.0),
                Some(&TextShaperOptions {
                    direction,
                    features: Some(vec![TextFeature {
                        end,
                        start,
                        tag: "liga".to_string(),
                        value,
                    }]),
                    language: Some("en".to_string()),
                    script: Some("Latn".to_string()),
                    variations: None,
                }),
            )
            .expect("ligature run")
        };
        let disabled = liga(0, "fi", None, None, Some(TextDirection::LeftToRight));
        let enabled = liga(1, "fi", None, None, Some(TextDirection::LeftToRight));
        assert_eq!(
            disabled
                .read()
                .expect("disabled")
                .glyphs
                .iter()
                .map(|glyph| glyph.glyph_id)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert_eq!(enabled.read().expect("enabled").glyphs[0].glyph_id, 3);
        assert_eq!(enabled.read().expect("enabled").glyph_count, 1);

        let ranged = liga(0, "fifi", Some(0), Some(2), None);
        assert_eq!(
            ranged
                .read()
                .expect("ranged")
                .glyphs
                .iter()
                .map(|glyph| glyph.glyph_id)
                .collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
        let rtl = liga(0, "fi", None, None, Some(TextDirection::RightToLeft));
        let rtl = rtl.read().expect("rtl");
        assert_eq!(rtl.direction, TextDirection::RightToLeft);
        assert_eq!(
            rtl.glyphs
                .iter()
                .map(|glyph| (glyph.glyph_id, glyph.cluster))
                .collect::<Vec<_>>(),
            vec![(2, 1), (1, 0)]
        );

        let positioned = create_text_host(None);
        load_font_bytes_with_text_host(
            &positioned,
            "positioning",
            &synthetic_positioning_font(),
            None,
        )
        .expect("positioning fixture");
        let run = shape_text_with_text_host(
            &positioned,
            "A\u{301}",
            &format("positioning", 20.0),
            Some(&TextShaperOptions {
                direction: Some(TextDirection::LeftToRight),
                language: Some("en".to_string()),
                script: Some("Latn".to_string()),
                ..shaper_options()
            }),
        )
        .expect("positioned mark");
        let run = run.read().expect("positioned mark");
        let mark = run
            .glyphs
            .iter()
            .find(|glyph| glyph.glyph_id == 2)
            .expect("mark glyph");
        assert_eq!(
            (mark.x_advance, mark.x_offset, mark.y_offset),
            (0.0, 2.0, -4.0)
        );
    }
}
