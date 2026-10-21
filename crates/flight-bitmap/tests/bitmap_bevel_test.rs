use flight_bitmap::contract::*;

fn edge_strip() -> Bitmap {
    let mut s = create_bitmap(5, 1, None);
    for x in 2..5 {
        s.data[x * 4 + 3] = 255;
    }
    return s;
}

mod bevel_bitmap {
    use super::*;

    #[test]
    fn highlights_the_light_facing_edge_and_shades_the_opposite_edge() {
        let source = edge_strip();
        let sr = BitmapRegion { bitmap: source, x: 0, y: 0, width: 5, height: 1 };
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        let opts = BitmapBevelOptions {
            angle: Some(std::f32::consts::PI),
            distance: Some(1.0),
            type_: Some(BevelType::Both),
            intensity: Some(1.0),
            highlight_color: Some(0xffffffff),
            shadow_color: Some(0x000000ff),
            radius_x: Some(1.0),
            radius_y: Some(0.0),
            passes: None,
        };
        bevel_bitmap(&mut out, &mut scratch, &sr, &opts);
        assert_eq!(out[2 * 4], 255);
        assert_eq!(out[2 * 4 + 1], 255);
        assert_eq!(out[2 * 4 + 2], 255);
        assert_eq!(out[4 * 4], 0);
        assert_eq!(out[4 * 4 + 1], 0);
        assert_eq!(out[4 * 4 + 2], 0);
        assert_eq!(out[4 * 4 + 3], 255);
    }

    #[test]
    fn inner_type_clips_the_bevel_to_inside_the_shape() {
        let source = edge_strip();
        let sr = BitmapRegion { bitmap: source, x: 0, y: 0, width: 5, height: 1 };
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        let opts = BitmapBevelOptions {
            angle: Some(std::f32::consts::PI),
            distance: Some(1.0),
            type_: Some(BevelType::Inner),
            intensity: Some(1.0),
            highlight_color: None,
            shadow_color: None,
            radius_x: Some(1.0),
            radius_y: Some(0.0),
            passes: None,
        };
        bevel_bitmap(&mut out, &mut scratch, &sr, &opts);
        assert_eq!(out[0 * 4 + 3], 0);
        assert_eq!(out[1 * 4 + 3], 0);
        assert_eq!(out[2 * 4 + 3], 170);
    }
}
