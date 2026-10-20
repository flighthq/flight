use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

mod dissolve_bitmap_pixels_fn {
    use super::*;

    #[test]
    fn dissolves_at_most_pixel_count() {
        let source = create_bitmap(4, 4, 0x112233ff);
        let dest = create_bitmap(4, 4, 0x00000000);
        let original = dest.data.clone();
        let mut dr = region(dest);
        dissolve_bitmap_pixels(&mut dr, &region(source), 0, 5, 0);
        let changed = dr.bitmap.data.chunks(4).zip(original.chunks(4))
            .filter(|(a, b)| a != b).count();
        assert_eq!(changed, 5);
    }

    #[test]
    fn is_deterministic() {
        let source = create_bitmap(6, 6, 0xaabbccff);
        let a_dest = create_bitmap(6, 6, 0x00000000);
        let b_dest = create_bitmap(6, 6, 0x00000000);
        let sr = region(source.clone());
        let mut ar = region(a_dest);
        let mut br = region(b_dest);
        dissolve_bitmap_pixels(&mut ar, &sr, 3, 7, 0);
        let sr2 = region(source);
        dissolve_bitmap_pixels(&mut br, &sr2, 3, 7, 0);
        assert_eq!(ar.bitmap.data, br.bitmap.data);
    }
}
