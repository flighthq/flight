use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion {
        bitmap: bmp,
        x: 0,
        y: 0,
        width: w,
        height: h,
    };
}

mod drop_shadow_bitmap {
    use super::*;

    #[test]
    fn produces_a_tinted_alpha_mask_in_out() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapDropShadowOptions {
            color: Some(0x0000ffff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        drop_shadow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[0], 0);
        assert_eq!(out[2], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn compositing_out_at_an_offset_places_the_shadow_correctly() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let dest = create_bitmap(4, 4, None);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapDropShadowOptions {
            color: Some(0x0000ffff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        drop_shadow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        let angle = 0.0f32;
        let offset_x = (angle.cos() * 1.0).round() as i32;
        let offset_y = (angle.sin() * 1.0).round() as i32;
        let mut dr = BitmapRegion {
            bitmap: dest,
            x: 1 + offset_x,
            y: 1 + offset_y,
            width: 1,
            height: 1,
        };
        composite_bitmap_pixels(&mut dr, &out, BitmapCompositeMode::Normal);
        let i = (1 * dr.bitmap.width as usize + 2) * 4;
        assert_eq!(dr.bitmap.data[i + 2], 0xff);
        assert_eq!(dr.bitmap.data[i + 3], 0xff);
    }

    #[test]
    fn compositing_shadow_then_source_produces_source_over_shadow() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(2, 1, None);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapDropShadowOptions {
            color: Some(0x0000ffff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        drop_shadow_bitmap(&mut out, &mut scratch, &region(source.clone()), &opts);
        let mut dest_r1 = BitmapRegion {
            bitmap: dest,
            x: 1,
            y: 0,
            width: 1,
            height: 1,
        };
        composite_bitmap_pixels(&mut dest_r1, &out, BitmapCompositeMode::Normal);
        let mut dest_r0 = BitmapRegion {
            bitmap: dest_r1.bitmap,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
        };
        composite_bitmap_region(&mut dest_r0, &region(source), BitmapCompositeMode::Normal);
        assert_eq!(dest_r0.bitmap.data[0], 0xff);
        assert_eq!(dest_r0.bitmap.data[3], 0xff);
    }

    #[test]
    fn bitmap_data_can_be_used_as_out_for_full_bitmap_region() {
        let bitmap = create_bitmap(1, 1, Some(0xffffffff));
        let mut scratch = vec![0u8; 4];
        let opts = BitmapDropShadowOptions {
            color: Some(0x0000ffff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        let r = region(bitmap);
        let mut data = r.bitmap.data.clone();
        drop_shadow_bitmap(&mut data, &mut scratch, &r, &opts);
        assert_eq!(data[2], 0xff);
        assert_eq!(data[3], 0xff);
    }
}

mod glow_bitmap {
    use super::*;

    #[test]
    fn produces_a_tinted_alpha_mask_in_out() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGlowOptions {
            color: Some(0x00ff00ff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        glow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[1], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn compositing_out_places_the_glow_at_the_same_position() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let dest = create_bitmap(1, 1, None);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGlowOptions {
            color: Some(0x00ff00ff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        glow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &out, BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[1], 0xff);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn compositing_source_over_glow_produces_source_over_glow() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(1, 1, None);
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGlowOptions {
            color: Some(0x00ff00ff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        glow_bitmap(&mut out, &mut scratch, &region(source.clone()), &opts);
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &out, BitmapCompositeMode::Normal);
        composite_bitmap_region(&mut dr, &region(source), BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn bitmap_data_can_be_used_as_out_for_full_bitmap_region() {
        let bitmap = create_bitmap(1, 1, Some(0xffffffff));
        let mut scratch = vec![0u8; 4];
        let opts = BitmapGlowOptions {
            color: Some(0x00ff00ff),
            intensity: Some(1.0),
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        let r = region(bitmap);
        let mut data = r.bitmap.data.clone();
        glow_bitmap(&mut data, &mut scratch, &r, &opts);
        assert_eq!(data[1], 0xff);
        assert_eq!(data[3], 0xff);
    }
}

mod inner_glow_bitmap {
    use super::*;

    #[test]
    fn clips_the_glow_to_inside_the_shape_and_tints_it() {
        let mut source = create_bitmap(3, 1, None);
        source.data[1 * 4 + 3] = 255;
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapInnerGlowOptions {
            color: Some(0x00ff00ff),
            intensity: Some(1.0),
            radius_x: Some(2.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        inner_glow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[0 * 4 + 3], 0);
        assert_eq!(out[2 * 4 + 3], 0);
        assert_eq!(out[1 * 4 + 3], 170);
        assert_eq!(out[1 * 4 + 0], 0);
        assert_eq!(out[1 * 4 + 1], 0xff);
        assert_eq!(out[1 * 4 + 2], 0);
    }

    #[test]
    fn produces_no_inner_glow_when_blur_is_zero() {
        let source = create_bitmap(1, 1, Some(0x0000ffff));
        let mut out = vec![0u8; 4];
        let mut scratch = vec![0u8; 4];
        let opts = BitmapInnerGlowOptions {
            color: None,
            intensity: None,
            radius_x: Some(0.0),
            radius_y: Some(0.0),
            passes: None,
        };
        inner_glow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[3], 0);
    }
}

mod inner_shadow_bitmap {
    use super::*;

    #[test]
    fn defaults_to_a_black_tint() {
        let mut source = create_bitmap(3, 1, None);
        source.data[1 * 4 + 3] = 255;
        let mut out = vec![0u8; 3 * 4];
        let mut scratch = vec![0u8; 3 * 4];
        let opts = BitmapInnerShadowOptions {
            color: None,
            intensity: Some(1.0),
            offset_x: None,
            offset_y: None,
            radius_x: Some(2.0),
            radius_y: Some(0.0),
            passes: Some(1),
        };
        inner_shadow_bitmap(&mut out, &mut scratch, &region(source), &opts);
        assert_eq!(out[1 * 4 + 0], 0);
        assert_eq!(out[1 * 4 + 1], 0);
        assert_eq!(out[1 * 4 + 2], 0);
        assert_eq!(out[1 * 4 + 3], 170);
    }

    #[test]
    fn gathers_the_shadow_toward_one_edge_when_given_a_directional_offset() {
        let mut source = create_bitmap(5, 1, None);
        for px in 1..=3 {
            source.data[px * 4 + 3] = 255;
        }

        let alpha_at = |offset_x: i32| -> [u8; 3] {
            let mut out = vec![0u8; 5 * 4];
            let mut scratch = vec![0u8; 5 * 4];
            let opts = BitmapInnerShadowOptions {
                color: None,
                intensity: Some(1.0),
                offset_x: Some(offset_x),
                offset_y: Some(0),
                radius_x: Some(1.0),
                radius_y: Some(0.0),
                passes: Some(1),
            };
            inner_shadow_bitmap(&mut out, &mut scratch, &region(source.clone()), &opts);
            return [out[1 * 4 + 3], out[2 * 4 + 3], out[3 * 4 + 3]];
        };

        let centered = alpha_at(0);
        assert_eq!(centered[0], centered[2]);

        let shifted = alpha_at(2);
        assert!(shifted[0] > shifted[2]);

        let mirrored = alpha_at(-2);
        assert!(mirrored[2] > mirrored[0]);
        assert_eq!(mirrored[0], shifted[2]);
        assert_eq!(mirrored[2], shifted[0]);
    }
}
