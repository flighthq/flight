use crate::support::font_options;
use flight_font::GlyphOutlineMetrics;
use flight_font_formats::*;

mod read_open_type_advances {
    use super::*;
    #[test]
    fn reads_one_advance_per_glyph() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            advances: Some(vec![300.0, 750.0]),
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(10.0)]),
            ..font_options()
        }));
        assert_eq!(
            &*read_open_type_advances(&font, &read_sfnt_table_directory(&font).unwrap(), 2)
                .unwrap(),
            &[300, 750]
        );
    }
    #[test]
    fn repeats_the_last_advance_beyond_the_long_metric_count() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            advances: Some(vec![600.0]),
            glyphs: Some(vec![
                empty_synthetic_glyph(),
                square_synthetic_glyph(10.0),
                square_synthetic_glyph(20.0),
            ]),
            ..font_options()
        }));
        assert_eq!(
            &*read_open_type_advances(&font, &read_sfnt_table_directory(&font).unwrap(), 3)
                .unwrap(),
            &[600, 600, 600]
        );
    }
    #[test]
    fn returns_null_when_either_required_metric_table_is_absent() {
        for table in ["hmtx", "hhea"] {
            let font = create_synthetic_font(Some(&SyntheticFontOptions {
                omit_table: Some(table.to_string()),
                ..font_options()
            }));
            assert!(
                read_open_type_advances(&font, &read_sfnt_table_directory(&font).unwrap(), 1)
                    .is_none()
            );
        }
    }
    #[test]
    fn refuses_zero_count_and_tables_too_short_for_declared_long_metrics() {
        let mut font = create_synthetic_font(None);
        let mut directory = read_sfnt_table_directory(&font).unwrap();
        let at = directory.tables.get("hhea").unwrap().offset + 34;
        font[at..at + 2].copy_from_slice(&0u16.to_be_bytes());
        assert!(read_open_type_advances(&font, &directory, 1).is_none());
        font[at..at + 2].copy_from_slice(&2u16.to_be_bytes());
        assert!(read_open_type_advances(&font, &directory, 1).is_none());
        directory.tables.get_mut("hhea").unwrap().length = 35;
        assert!(read_open_type_advances(&font, &directory, 1).is_none());
    }
}

mod read_open_type_glyph_count {
    use super::*;
    #[test]
    fn reads_the_maxp_glyph_count() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(10.0)]),
            ..font_options()
        }));
        assert_eq!(
            read_open_type_glyph_count(&font, &read_sfnt_table_directory(&font).unwrap()),
            2
        );
    }
    #[test]
    fn returns_negative_one_when_maxp_is_absent() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            omit_table: Some("maxp".to_string()),
            ..font_options()
        }));
        assert_eq!(
            read_open_type_glyph_count(&font, &read_sfnt_table_directory(&font).unwrap()),
            -1
        );
    }
}

mod read_open_type_loca_format {
    use super::*;
    #[test]
    fn reads_the_head_index_width() {
        let font = create_synthetic_font(None);
        assert_eq!(
            read_open_type_loca_format(&font, &read_sfnt_table_directory(&font).unwrap()),
            1
        );
    }
    #[test]
    fn returns_negative_one_for_an_undefined_format() {
        let mut font = create_synthetic_font(None);
        let directory = read_sfnt_table_directory(&font).unwrap();
        let at = directory.tables.get("head").unwrap().offset + 50;
        font[at..at + 2].copy_from_slice(&7u16.to_be_bytes());
        assert_eq!(read_open_type_loca_format(&font, &directory), -1);
    }
    #[test]
    fn returns_negative_one_without_head() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            omit_table: Some("head".to_string()),
            ..font_options()
        }));
        assert_eq!(
            read_open_type_loca_format(&font, &read_sfnt_table_directory(&font).unwrap()),
            -1
        );
    }
}

mod read_open_type_metrics {
    use super::*;
    #[test]
    fn reads_design_units_from_head() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            units_per_em: Some(2048.0),
            ..font_options()
        }));
        assert_eq!(
            read_open_type_metrics(&font, &read_sfnt_table_directory(&font).unwrap())
                .unwrap()
                .units_per_em,
            2048.0
        );
    }
    #[test]
    fn flips_stored_negative_descent_to_a_positive_distance() {
        let font = create_synthetic_font(None);
        assert_eq!(
            read_open_type_metrics(&font, &read_sfnt_table_directory(&font).unwrap()),
            Some(GlyphOutlineMetrics {
                ascent: 800.0,
                descent: 200.0,
                line_gap: 100.0,
                units_per_em: 1000.0
            })
        );
    }
    #[test]
    fn returns_null_for_zero_units_per_em() {
        let mut font = create_synthetic_font(None);
        let directory = read_sfnt_table_directory(&font).unwrap();
        let at = directory.tables.get("head").unwrap().offset + 18;
        font[at..at + 2].copy_from_slice(&0u16.to_be_bytes());
        assert!(read_open_type_metrics(&font, &directory).is_none());
    }
    #[test]
    fn returns_null_when_head_or_hhea_is_absent() {
        for table in ["head", "hhea"] {
            let font = create_synthetic_font(Some(&SyntheticFontOptions {
                omit_table: Some(table.to_string()),
                ..font_options()
            }));
            assert!(
                read_open_type_metrics(&font, &read_sfnt_table_directory(&font).unwrap()).is_none()
            );
        }
    }
    #[test]
    fn respects_the_window_of_sliced_storage() {
        let font = create_synthetic_font(None);
        let mut storage = vec![55, 66];
        storage.extend_from_slice(&font);
        storage.push(77);
        let view = &storage[2..storage.len() - 1];
        assert_eq!(
            read_open_type_metrics(view, &read_sfnt_table_directory(view).unwrap())
                .unwrap()
                .descent,
            200.0
        );
    }
}
