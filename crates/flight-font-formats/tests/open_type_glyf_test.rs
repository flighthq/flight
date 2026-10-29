use crate::support::font_options;
use flight_font_formats::*;
use flight_path::{Path, PathWinding, create_path};

fn read_glyph(glyphs: Vec<SyntheticGlyph>, glyph_index: i32) -> (bool, Path) {
    let font = create_synthetic_font(Some(&SyntheticFontOptions {
        glyphs: Some(glyphs),
        ..font_options()
    }));
    let directory = read_sfnt_table_directory(&font).unwrap();
    let ranges = read_open_type_glyph_ranges(
        &font,
        &directory,
        read_open_type_glyph_count(&font, &directory) as usize,
        read_open_type_loca_format(&font, &directory),
    )
    .unwrap();
    let mut path = create_path(Some(flight_path::PathWinding::NonZero));
    path.winding = PathWinding::EvenOdd;
    let ok = read_open_type_glyph_outline(&mut path, &font, &directory, &ranges, glyph_index);
    return (ok, path);
}
fn point(x: f32, y: f32, on_curve: bool) -> SyntheticGlyphPoint {
    return SyntheticGlyphPoint { x, y, on_curve };
}

mod read_open_type_glyph_outline {
    use super::*;
    #[test]
    fn writes_nonzero_winding_instead_of_leaving_the_previous_rule() {
        let (_, path) = read_glyph(
            vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)],
            1,
        );
        assert_eq!(path.winding, PathWinding::NonZero);
    }
    #[test]
    fn emits_one_line_per_edge_and_close_without_a_redundant_segment() {
        let (ok, path) = read_glyph(
            vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)],
            1,
        );
        assert!(ok);
        assert_eq!(path.commands, [1, 2, 2, 2, 7]);
    }
    #[test]
    fn reconstructs_implied_midpoints_between_consecutive_off_curve_points() {
        let (_, path) = read_glyph(
            vec![
                empty_synthetic_glyph(),
                SyntheticGlyph {
                    end_points: vec![2.0],
                    points: vec![
                        point(0.0, 0.0, true),
                        point(100.0, 0.0, false),
                        point(100.0, 100.0, false),
                    ],
                },
            ],
            1,
        );
        assert_eq!(path.commands, [1, 3, 3, 7]);
        assert_eq!(&path.data[2..6], &[100.0, -0.0, 100.0, -50.0]);
    }
    #[test]
    fn starts_at_the_midpoint_when_both_contour_ends_are_off_curve() {
        let (_, path) = read_glyph(
            vec![
                empty_synthetic_glyph(),
                SyntheticGlyph {
                    end_points: vec![2.0],
                    points: vec![
                        point(0.0, 100.0, false),
                        point(50.0, 0.0, true),
                        point(100.0, 100.0, false),
                    ],
                },
            ],
            1,
        );
        assert_eq!(&path.data[..2], &[50.0, -100.0]);
        assert_eq!(path.commands[0], 1);
    }
    #[test]
    fn emits_a_quadratic_through_a_single_off_curve_control() {
        let (_, path) = read_glyph(
            vec![
                empty_synthetic_glyph(),
                SyntheticGlyph {
                    end_points: vec![2.0],
                    points: vec![
                        point(0.0, 0.0, true),
                        point(50.0, 100.0, false),
                        point(100.0, 0.0, true),
                    ],
                },
            ],
            1,
        );
        assert_eq!(path.commands, [1, 3, 7]);
        assert_eq!(path.data, [0.0, -0.0, 50.0, -100.0, 100.0, -0.0]);
    }
    #[test]
    fn reads_a_second_contour_into_the_same_path() {
        let glyph = SyntheticGlyph {
            end_points: vec![3.0, 7.0],
            points: vec![
                point(0.0, 0.0, true),
                point(10.0, 0.0, true),
                point(10.0, 10.0, true),
                point(0.0, 10.0, true),
                point(20.0, 20.0, true),
                point(30.0, 20.0, true),
                point(30.0, 30.0, true),
                point(20.0, 30.0, true),
            ],
        };
        let (_, path) = read_glyph(vec![empty_synthetic_glyph(), glyph], 1);
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == 1)
                .count(),
            2
        );
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == 7)
                .count(),
            2
        );
    }
    #[test]
    fn returns_true_with_an_empty_path_for_a_blank_glyph() {
        let (ok, path) = read_glyph(vec![empty_synthetic_glyph()], 0);
        assert!(ok);
        assert!(path.commands.is_empty());
    }
    #[test]
    fn replaces_existing_output_contents() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(100.0)]),
            ..font_options()
        }));
        let directory = read_sfnt_table_directory(&font).unwrap();
        let ranges = read_open_type_glyph_ranges(&font, &directory, 2, 1).unwrap();
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        assert!(read_open_type_glyph_outline(
            &mut path, &font, &directory, &ranges, 1
        ));
        let first = path.commands.clone();
        assert!(read_open_type_glyph_outline(
            &mut path, &font, &directory, &ranges, 1
        ));
        assert_eq!(path.commands, first);
    }
    #[test]
    fn returns_false_for_indices_outside_the_range_table() {
        assert!(!read_glyph(vec![empty_synthetic_glyph()], 5).0);
        assert!(!read_glyph(vec![empty_synthetic_glyph()], -1).0);
    }
    #[test]
    fn preserves_the_source_empty_outline_policy_for_composites() {
        let glyph = encode_sfnt_composite_glyph(
            &[0, 0, 0, 0, 0, 0],
            &[],
            &SfntGlyphBounds {
                x_max: 1.0,
                x_min: 0.0,
                y_max: 1.0,
                y_min: 0.0,
            },
            false,
        );
        let ranges = vec![0, glyph.len() as u32];
        let font = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: glyph,
                tag: pack_sfnt_tag("glyf"),
            }],
        );
        let directory = read_sfnt_table_directory(&font).unwrap();
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        path.winding = PathWinding::EvenOdd;
        assert!(read_open_type_glyph_outline(
            &mut path, &font, &directory, &ranges, 0
        ));
        assert!(path.commands.is_empty());
        assert_eq!(path.winding, PathWinding::NonZero);
    }
    #[test]
    fn expands_repeat_flags_across_the_single_byte_repeat_limit() {
        let xs = (0..300).map(|x| x as f32).collect::<Vec<_>>();
        let glyph = encode_sfnt_simple_glyph(
            &vec![299.0],
            &xs,
            &vec![0.0; 300],
            &vec![true; 300],
            &[],
            &SfntGlyphBounds {
                x_max: 299.0,
                x_min: 0.0,
                y_max: 0.0,
                y_min: 0.0,
            },
        );
        let ranges = vec![0, glyph.len() as u32];
        let font = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: glyph,
                tag: pack_sfnt_tag("glyf"),
            }],
        );
        let mut path = create_path(Some(flight_path::PathWinding::NonZero));
        assert!(read_open_type_glyph_outline(
            &mut path,
            &font,
            &read_sfnt_table_directory(&font).unwrap(),
            &ranges,
            0
        ));
        assert_eq!(path.commands.len(), 301);
        assert_eq!(&path.data[path.data.len() - 2..], &[299.0, -0.0]);
    }
}

mod read_open_type_glyph_ranges {
    use super::*;
    #[test]
    fn yields_one_more_entry_than_glyphs() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            glyphs: Some(vec![empty_synthetic_glyph(), square_synthetic_glyph(10.0)]),
            ..font_options()
        }));
        assert_eq!(
            read_open_type_glyph_ranges(&font, &read_sfnt_table_directory(&font).unwrap(), 2, 1)
                .unwrap()
                .len(),
            3
        );
    }
    #[test]
    fn returns_null_without_loca() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            omit_table: Some("loca".to_string()),
            ..font_options()
        }));
        assert!(
            read_open_type_glyph_ranges(&font, &read_sfnt_table_directory(&font).unwrap(), 1, 1)
                .is_none()
        );
    }
    #[test]
    fn returns_null_when_loca_cannot_index_the_declared_glyph_count() {
        let font = create_synthetic_font(None);
        assert!(
            read_open_type_glyph_ranges(&font, &read_sfnt_table_directory(&font).unwrap(), 999, 1)
                .is_none()
        );
    }
    #[test]
    fn doubles_short_form_offsets_and_preserves_empty_glyph_ranges() {
        let font = assemble_sfnt_font(
            0x10000,
            &[SfntFontTable {
                data: vec![0, 0, 0, 2, 0, 2, 0, 5].into_boxed_slice(),
                tag: pack_sfnt_tag("loca"),
            }],
        );
        assert_eq!(
            &*read_open_type_glyph_ranges(&font, &read_sfnt_table_directory(&font).unwrap(), 3, 0)
                .unwrap(),
            &[0, 4, 4, 10]
        );
    }
}
