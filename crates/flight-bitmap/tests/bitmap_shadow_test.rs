use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod drop_shadow_bitmap_fn {
    use super::*;

    #[test]
    fn produces_tinted_blurred_alpha() {
        let mut src = create_bitmap(8, 8, 0);
        // Opaque center block
        for y in 2..6 {
            for x in 2..6 {
                set_bitmap_pixel(&mut src, x, y, 0xffffffff);
            }
        }
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let opts = BitmapDropShadowOptions {
            color: Some(0x000000ff),
            intensity: Some(1.0),
            radius_x: Some(1.0),
            radius_y: Some(1.0),
            passes: Some(1),
        };
        drop_shadow_bitmap(&mut out, &mut scratch, &sr, &opts);
        // Center should have nonzero alpha
        let ci = (4 * 8 + 4) * 4;
        assert!(out[ci + 3] > 0);
        // Color should be black
        assert_eq!(out[ci], 0);
    }
}

mod glow_bitmap_fn {
    use super::*;

    #[test]
    fn produces_colored_glow() {
        let mut src = create_bitmap(8, 8, 0);
        set_bitmap_pixel(&mut src, 4, 4, 0xffffffff);
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let opts = BitmapGlowOptions {
            color: Some(0xff0000ff),
            intensity: Some(1.0),
            radius_x: Some(1.0),
            radius_y: Some(1.0),
            passes: Some(1),
        };
        glow_bitmap(&mut out, &mut scratch, &sr, &opts);
        let ci = (4 * 8 + 4) * 4;
        assert!(out[ci + 3] > 0);
        assert_eq!(out[ci], 0xff); // red tint
    }
}

mod inner_shadow_bitmap_fn {
    use super::*;

    #[test]
    fn clips_to_source_alpha() {
        // Create a source with an opaque center and transparent border
        let mut src = create_bitmap(8, 8, 0);
        for y in 1..7 {
            for x in 1..7 {
                set_bitmap_pixel(&mut src, x, y, 0xffffffff);
            }
        }
        let sr = region(src);
        let len = 8 * 8 * 4;
        let mut out = vec![0u8; len];
        let mut scratch = vec![0u8; len];
        let opts = BitmapInnerShadowOptions {
            color: Some(0x000000ff),
            intensity: Some(1.0),
            offset_x: Some(0),
            offset_y: Some(0),
            radius_x: Some(2.0),
            radius_y: Some(2.0),
            passes: Some(1),
        };
        inner_shadow_bitmap(&mut out, &mut scratch, &sr, &opts);
        // Inner edge pixels (inside the opaque region) should have nonzero alpha
        let inner_edge = (1 * 8 + 1) * 4;
        assert!(out[inner_edge + 3] > 0);
        // Transparent border pixels should remain zero alpha (clipped by source)
        let border = (0 * 8 + 0) * 4;
        assert_eq!(out[border + 3], 0);
    }
}
