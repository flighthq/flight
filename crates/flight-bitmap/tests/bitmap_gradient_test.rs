use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

mod build_bitmap_gradient_ramp {
    use super::*;

    #[test]
    fn places_endpoints_exactly_and_interpolates_the_middle() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0xff0000, 0x0000ff], &[1.0, 1.0], &[0.0, 255.0]);
        assert_eq!(ramp[0], 255);
        assert_eq!(ramp[1], 0);
        assert_eq!(ramp[2], 0);
        assert_eq!(ramp[255 * 4], 0);
        assert_eq!(ramp[255 * 4 + 2], 255);
        assert_eq!((ramp[128 * 4] as i32 - 127).abs() <= 1, true);
    }

    #[test]
    fn zero_fills_when_there_are_no_stops() {
        let mut ramp = vec![0xffu8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[], &[], &[]);
        assert!(ramp.iter().all(|&v| v == 0));
    }
}

mod gradient_bevel_bitmap {
    use super::*;

    #[test]
    fn maps_the_signed_edge_gradient_through_the_ramp() {
        let mut source = create_bitmap(5, 1, None);
        for x in 2..5 {
            source.data[x * 4 + 3] = 255;
        }
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0x000000, 0x808080, 0xffffff], &[1.0, 0.0, 1.0], &[0.0, 128.0, 255.0]);
        let sr = region(source);
        let mut out = vec![0u8; 5 * 4];
        let mut scratch = vec![0u8; 5 * 4];
        let opts = BitmapGradientBevelOptions {
            angle: Some(std::f32::consts::PI),
            distance: Some(1.0),
            type_: Some(BevelType::Both),
            intensity: Some(1.0),
            radius_x: Some(1.0),
            radius_y: Some(0.0),
            passes: None,
        };
        gradient_bevel_bitmap(&mut out, &mut scratch, &sr, &ramp, &opts);
        assert!(out[2 * 4] > 150);
        assert!(out[2 * 4 + 3] > 0);
    }
}

mod gradient_glow_bitmap {
    use super::*;

    #[test]
    fn indexes_the_ramp_by_the_blurred_alpha() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0x00ff00, 0x00ff00], &[0.0, 1.0], &[0.0, 255.0]);
        let src = create_bitmap(1, 1, Some(0xffffffff));
        let sr = region(src);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGradientGlowOptions {
            intensity: None,
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: None,
        };
        gradient_glow_bitmap(&mut out, &mut scratch, &sr, &ramp, &opts);
        assert_eq!(out[0], 0);
        assert_eq!(out[1], 0xff);
        assert_eq!(out[2], 0);
        assert_eq!(out[3], 255);
    }

    #[test]
    fn bitmap_data_can_be_used_as_out_for_full_bitmap_region() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0x00ff00, 0x00ff00], &[0.0, 1.0], &[0.0, 255.0]);
        let bitmap = create_bitmap(1, 1, Some(0xffffffff));
        let mut scratch = vec![0u8; 4];
        let r = region(bitmap);
        let opts = BitmapGradientGlowOptions {
            intensity: None,
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: None,
        };
        let mut data = r.bitmap.data.clone();
        gradient_glow_bitmap(&mut data, &mut scratch, &r, &ramp, &opts);
        assert_eq!(data[1], 0xff);
        assert_eq!(data[3], 255);
    }

    #[test]
    fn scales_the_ramp_alpha_by_intensity() {
        let mut ramp = vec![0u8; 1024];
        build_bitmap_gradient_ramp(&mut ramp, &[0x00ff00, 0x00ff00], &[1.0, 1.0], &[0.0, 255.0]);
        let src = create_bitmap(1, 1, Some(0xffffffff));
        let sr = region(src);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGradientGlowOptions {
            intensity: Some(0.5),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: None,
        };
        gradient_glow_bitmap(&mut out, &mut scratch, &sr, &ramp, &opts);
        assert_eq!(out[3], 128);
    }
}
