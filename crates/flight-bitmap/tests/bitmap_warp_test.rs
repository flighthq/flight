use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod warp_bitmap_fn {
    use super::*;

    #[test]
    fn identity_matrix_copies() {
        let src = create_bitmap(4, 4, 0xaabbccff);
        let dest = create_bitmap(4, 4, 0);
        let sr = region(src);
        let mut dr = region(dest);
        let identity = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
        warp_bitmap(&mut dr, &sr, identity, BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 0, 0), 0xaabbccff);
        assert_eq!(get_bitmap_pixel(&dr.bitmap, 3, 3), 0xaabbccff);
    }
}

mod warp_bitmap_quad_fn {
    use super::*;

    #[test]
    fn identity_quad_copies() {
        let src = create_bitmap(4, 4, 0x112233ff);
        let dest = create_bitmap(4, 4, 0);
        let sr = region(src);
        let mut dr = region(dest);
        let quad = [0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0];
        warp_bitmap_quad(&mut dr, &sr, quad, BitmapEdgeMode::Clamp, BitmapResizeMode::Nearest);
        // Center pixel should be close to source
        let p = get_bitmap_pixel(&dr.bitmap, 2, 2);
        let r = (p >> 24) & 0xff;
        assert!((r as i32 - 0x11).abs() <= 2);
    }
}
