use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod composite_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn alpha_composites_pixels_over_dest() {
        let dest = create_bitmap(1, 1, 0x0000ffff);
        let pixels: Vec<u8> = vec![0xff, 0, 0, 0xff];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0);
    }

    #[test]
    fn multiply_blend() {
        let dest = create_bitmap(1, 1, 0xff0000ff);
        let pixels: Vec<u8> = vec![128, 128, 128, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Multiply);
        assert_eq!(dr.bitmap.data[0], 128);
        assert_eq!(dr.bitmap.data[1], 0);
    }

    #[test]
    fn add_blend_clamps() {
        let dest = create_bitmap(1, 1, 0x640000ff);
        let pixels: Vec<u8> = vec![200, 0, 0, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Add);
        assert_eq!(dr.bitmap.data[0], 255);
    }
}

mod composite_bitmap_region_fn {
    use super::*;

    #[test]
    fn composites_source_over_dest() {
        let source = create_bitmap(1, 1, 0xff0000ff);
        let dest = create_bitmap(1, 1, 0x0000ffff);
        let mut dr = region(dest);
        composite_bitmap_region(&mut dr, &region(source), BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0);
    }
}

mod extract_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn copies_region_into_buffer() {
        let mut source = create_bitmap(2, 2, 0);
        let i = (1 * 2 + 1) * 4;
        source.data[i] = 0xff;
        source.data[i + 3] = 0xff;
        let mut out = vec![0u8; 4];
        let sr = BitmapRegion { bitmap: source, x: 1, y: 1, width: 1, height: 1 };
        extract_bitmap_pixels(&mut out, &sr);
        assert_eq!(out[0], 0xff);
        assert_eq!(out[3], 0xff);
    }
}

mod write_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn writes_at_given_region() {
        let dest = create_bitmap(3, 3, 0);
        let pixels: Vec<u8> = vec![0x33, 0x66, 0x99, 0xff];
        let mut dr = BitmapRegion { bitmap: dest, x: 1, y: 1, width: 1, height: 1 };
        write_bitmap_pixels(&mut dr, &pixels);
        let i = (1 * 3 + 1) * 4;
        assert_eq!(dr.bitmap.data[i], 0x33);
        assert_eq!(dr.bitmap.data[i + 3], 0xff);
    }
}
