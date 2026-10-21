use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

fn rgb_strip() -> Bitmap {
    let mut s = create_bitmap(3, 1, None);
    s.data[0] = 255; s.data[1] = 0; s.data[2] = 0; s.data[3] = 255;
    s.data[4] = 0; s.data[5] = 255; s.data[6] = 0; s.data[7] = 255;
    s.data[8] = 0; s.data[9] = 0; s.data[10] = 255; s.data[11] = 255;
    return s;
}

mod displace_bitmap_fn {
    use super::*;

    #[test]
    fn is_a_noop_copy_when_scale_x_and_scale_y_are_0() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 128; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(0.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: Some(DisplacementMode::Clamp),
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 255);
        assert_eq!(out[4 + 1], 255);
        assert_eq!(out[8 + 2], 255);
    }

    #[test]
    fn shifts_the_sample_position_by_the_scaled_map_displacement() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        map_bmp.data[0] = 255; map_bmp.data[3] = 255;
        map_bmp.data[4] = 255; map_bmp.data[7] = 255;
        map_bmp.data[8] = 255; map_bmp.data[11] = 255;
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: Some(0),
            component_y: None,
            scale_x: Some(2.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: Some(DisplacementMode::Clamp),
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[1], 255);
        assert_eq!(out[4 + 2], 255);
        assert_eq!(out[8 + 2], 255);
    }

    #[test]
    fn color_mode_fills_out_of_range_samples_with_fill_color() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(4.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: Some(DisplacementMode::Color),
            fill_color: Some(0xff00ffff),
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[2 * 4 + 0], 0xff);
        assert_eq!(out[2 * 4 + 1], 0);
        assert_eq!(out[2 * 4 + 2], 0xff);
        assert_eq!(out[2 * 4 + 3], 255);
    }

    #[test]
    fn ignore_mode_keeps_the_undisplaced_source_pixel_for_out_of_range_samples() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(4.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: Some(DisplacementMode::Ignore),
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[2 * 4 + 2], 255);
        assert_eq!(out[2 * 4 + 3], 255);
    }

    #[test]
    fn clamp_edge_mode_clamps_out_of_range_samples_to_the_edge() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        map_bmp.data[0] = 255; map_bmp.data[3] = 255;
        map_bmp.data[4] = 255; map_bmp.data[7] = 255;
        map_bmp.data[8] = 255; map_bmp.data[11] = 255;
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: Some(0),
            component_y: None,
            scale_x: Some(2.0),
            scale_y: Some(0.0),
            edge_mode: Some(BitmapEdgeMode::Clamp),
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[8 + 2], 255);
    }

    #[test]
    fn transparent_edge_mode_fills_out_of_range_samples_with_transparent_black() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(4.0),
            scale_y: Some(0.0),
            edge_mode: Some(BitmapEdgeMode::Transparent),
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[2 * 4 + 0], 0);
        assert_eq!(out[2 * 4 + 3], 0);
    }

    #[test]
    fn transparent_edge_mode_treats_out_of_range_bilinear_tap_as_transparent() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(1.0),
            scale_y: Some(0.0),
            edge_mode: Some(BitmapEdgeMode::Transparent),
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(&out[2 * 4..3 * 4], &[0, 0, 128, 128]);
    }

    #[test]
    fn wrap_edge_mode_wraps_each_out_of_range_bilinear_tap() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(1.0),
            scale_y: Some(0.0),
            edge_mode: Some(BitmapEdgeMode::Wrap),
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(&out[2 * 4..3 * 4], &[128, 0, 128, 255]);
    }

    #[test]
    fn mirror_edge_mode_reflects_out_of_range_bilinear_taps() {
        let source = rgb_strip();
        let mut map_bmp = create_bitmap(3, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 255; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(3.0),
            scale_y: Some(0.0),
            edge_mode: Some(BitmapEdgeMode::Mirror),
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(&out[2 * 4..3 * 4], &[0, 128, 128, 255]);
    }

    #[test]
    fn samples_through_the_source_region_offset() {
        let mut source = create_bitmap(4, 1, None);
        source.data[0] = 255; source.data[1] = 0; source.data[2] = 0; source.data[3] = 255;
        source.data[4] = 0; source.data[5] = 255; source.data[6] = 0; source.data[7] = 255;
        source.data[8] = 0; source.data[9] = 0; source.data[10] = 255; source.data[11] = 255;
        source.data[12] = 255; source.data[13] = 255; source.data[14] = 255; source.data[15] = 255;
        let mut map_bmp = create_bitmap(2, 1, None);
        for b in map_bmp.data.iter_mut() { *b = 128; }
        let mut out = vec![0u8; 2 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map_bmp),
            component_x: None,
            component_y: None,
            scale_x: Some(0.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: None,
            fill_color: None,
        };
        displace_bitmap(&mut out, &region_at(source, 1, 0, 2, 1), &opts);
        assert_eq!(out[1], 255);
        assert_eq!(out[4 + 2], 255);
    }
}
