use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod dilate_bitmap_fn {
    use super::*;

    #[test]
    fn expands_bright_pixel() {
        let mut src = create_bitmap(5, 5, 0);
        set_bitmap_pixel(&mut src, 2, 2, 0xffffffff);
        let mut out = vec![0u8; 5 * 5 * 4];
        dilate_bitmap(&mut out, &region(src), 1);
        // Neighbors of center should now be 0xff
        let neighbor = (2 * 5 + 1) * 4;
        assert_eq!(out[neighbor], 0xff);
    }
}

mod erode_bitmap_fn {
    use super::*;

    #[test]
    fn shrinks_bright_region() {
        let mut src = create_bitmap(5, 5, 0xffffffff);
        // Set border pixels to black
        for x in 0..5 {
            set_bitmap_pixel(&mut src, x, 0, 0x000000ff);
            set_bitmap_pixel(&mut src, x, 4, 0x000000ff);
        }
        for y in 0..5 {
            set_bitmap_pixel(&mut src, 0, y, 0x000000ff);
            set_bitmap_pixel(&mut src, 4, y, 0x000000ff);
        }
        let mut out = vec![0u8; 5 * 5 * 4];
        erode_bitmap(&mut out, &region(src), 1);
        // Edge of white area should erode
        let edge_pixel = (1 * 5 + 1) * 4;
        assert_eq!(out[edge_pixel], 0x00);
        // Center should stay white
        let center = (2 * 5 + 2) * 4;
        assert_eq!(out[center], 0xff);
    }
}
