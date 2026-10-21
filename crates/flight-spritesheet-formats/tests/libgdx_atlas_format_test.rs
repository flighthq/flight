use flight_spritesheet_formats::*;

use crate::support::*;

mod format_libgdx_atlas {
    use super::*;

    #[test]
    fn emits_exact_single_page_fields_trailing_newline_and_round_trips() {
        let data = sample_data();
        let text = format_libgdx_atlas(&data);
        assert!(text.starts_with("atlas.png\n  size: 256, 128\n  format: RGBA8888\n  filter: Linear, Linear\n  repeat: none\n"));
        assert!(text.contains("hero_1.png\n  rotate: true\n  xy: 32, 0\n  size: 20, 40\n  orig: 44, 24\n  offset: 1, 2\n  index: -1"));
        assert!(text.ends_with('\n'));
        let round_trip = parse_libgdx_atlas_spritesheet(&text, None, None);
        assert_eq!(round_trip.frames.len(), 2);
        assert!(round_trip.frames[1].rotated);
        assert_eq!(
            (round_trip.frames[1].width, round_trip.frames[1].height),
            (40.0, 20.0)
        );
    }
}
