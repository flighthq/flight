use crate::support::{font_options, font_view};
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_font_formats::*;
use flight_path::{Path, create_path};

fn signed_contour_areas(path: &Path) -> Vec<f64> {
    let mut areas = Vec::new();
    let mut points: Vec<(f64, f64)> = Vec::new();
    let mut at = 0;
    let close = |areas: &mut Vec<f64>, points: &mut Vec<(f64, f64)>| {
        if points.len() > 2 {
            let mut twice = 0.0;
            for index in 0..points.len() {
                let (a, b) = points[index];
                let (c, d) = points[(index + 1) % points.len()];
                twice += a * d - c * b;
            }
            areas.push(twice / 2.0);
        }
        points.clear();
    };
    for command in &path.commands {
        match command {
            1 | 2 => {
                points.push((path.data[at], path.data[at + 1]));
                at += 2;
            }
            3 => {
                points.push((path.data[at + 2], path.data[at + 3]));
                at += 4;
            }
            6 => {
                points.push((path.data[at + 4], path.data[at + 5]));
                at += 6;
            }
            7 => close(&mut areas, &mut points),
            _ => {}
        }
    }
    close(&mut areas, &mut points);
    return areas;
}
fn ring_areas(reverse_counter: bool, flip_both: bool) -> Vec<f64> {
    let font = font_view(create_synthetic_font(Some(&SyntheticFontOptions {
        glyphs: Some(vec![
            empty_synthetic_glyph(),
            ring_synthetic_glyph(Some(reverse_counter), Some(flip_both)),
        ]),
        ..font_options()
    })));
    let source =
        create_glyph_outline_source_from_open_type_font(&font, &SDK_HOST_DECOMPRESS_DEFLATE, None)
            .unwrap();
    let mut path = create_path(None);
    assert!((source.get_glyph_outline)(&mut path, 1));
    return signed_contour_areas(&path);
}

mod open_type_glyf_winding {
    use super::*;
    #[test]
    fn winds_counters_opposite_outer_contours_to_form_a_hole() {
        let areas = ring_areas(false, false);
        assert_eq!(areas.len(), 2);
        assert_eq!(
            areas.iter().map(|value| value.abs()).collect::<Vec<_>>(),
            [360000.0, 40000.0]
        );
        assert_ne!(areas[0].signum(), areas[1].signum());
    }
    #[test]
    fn detects_a_counter_wound_the_same_way_as_its_outer_contour() {
        let areas = ring_areas(true, false);
        assert_eq!(areas[0].signum(), areas[1].signum());
    }
    #[test]
    fn preserves_the_hole_when_both_contours_are_reversed() {
        let areas = ring_areas(false, true);
        assert_ne!(areas[0].signum(), areas[1].signum());
    }
}
