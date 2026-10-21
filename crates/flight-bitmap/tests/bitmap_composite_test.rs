use flight_bitmap::contract::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    return BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h };
}

fn region_at(bmp: Bitmap, x: i32, y: i32, width: i32, height: i32) -> BitmapRegion {
    return BitmapRegion { bitmap: bmp, x, y, width, height };
}

mod composite_bitmap_pixels {
    use super::*;

    #[test]
    fn alpha_composites_pixels_over_dest() {
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let pixels: Vec<u8> = vec![0xff, 0, 0, 0xff];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn blends_semi_transparent_source_over_destination() {
        let dest = create_bitmap(1, 1, Some(0x000000ff));
        let pixels: Vec<u8> = vec![0xff, 0xff, 0xff, 0x80];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Normal);
        assert!(dr.bitmap.data[0] > 0);
        assert!(dr.bitmap.data[0] < 0xff);
        assert_eq!(dr.bitmap.data[3], 0xff);
    }

    #[test]
    fn silently_skips_pixels_outside_destination_bounds() {
        let dest = create_bitmap(1, 1, None);
        let pixels: Vec<u8> = vec![0xff, 0xff, 0xff, 0xff];
        let mut dr = region_at(dest, 5, 5, 1, 1);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[3], 0);
    }

    #[test]
    fn multiply_blend() {
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let pixels: Vec<u8> = vec![128, 128, 128, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Multiply);
        assert_eq!(dr.bitmap.data[0], 128);
        assert_eq!(dr.bitmap.data[1], 0);
    }

    #[test]
    fn add_blend_clamps() {
        let dest = create_bitmap(1, 1, Some(0x640000ff));
        let pixels: Vec<u8> = vec![200, 0, 0, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Add);
        assert_eq!(dr.bitmap.data[0], 255);
    }

    #[test]
    fn defaults_to_source_over_normal() {
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let pixels: Vec<u8> = vec![0, 0, 255, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0);
        assert_eq!(dr.bitmap.data[2], 255);
    }

    #[test]
    fn overlay_blend_mode_darkens_on_dark_backdrops() {
        let dest = create_bitmap(1, 1, Some(0x400000ff));
        let pixels: Vec<u8> = vec![200, 0, 0, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Overlay);
        assert_eq!(dr.bitmap.data[0], 100);
    }

    #[test]
    fn hardlight_blend_mode_is_overlay_with_operands_swapped() {
        let dest = create_bitmap(1, 1, Some(0xc80000ff));
        let pixels: Vec<u8> = vec![64, 0, 0, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::HardLight);
        assert_eq!(dr.bitmap.data[0], 100);
    }

    #[test]
    fn invert_blend_mode_inverts_the_backdrop() {
        let dest = create_bitmap(1, 1, Some(0xc80000ff));
        let pixels: Vec<u8> = vec![0, 0, 0, 255];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Invert);
        assert_eq!(dr.bitmap.data[0], 55);
    }

    #[test]
    fn destination_out_knocks_alpha_out_of_backdrop() {
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let pixels: Vec<u8> = vec![0, 0, 0, 128];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::DestinationOut);
        assert_eq!(dr.bitmap.data[0], 255);
        assert_eq!(dr.bitmap.data[3], 127);
    }

    #[test]
    fn destination_in_masks_backdrop_to_source_coverage() {
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let pixels: Vec<u8> = vec![0, 0, 0, 128];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::DestinationIn);
        assert_eq!(dr.bitmap.data[0], 255);
        assert_eq!(dr.bitmap.data[3], 128);
    }

    #[test]
    fn copy_overwrites_the_backdrop_with_the_source() {
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let pixels: Vec<u8> = vec![0, 0, 255, 128];
        let mut dr = region(dest);
        composite_bitmap_pixels(&mut dr, &pixels, BitmapCompositeMode::Copy);
        assert_eq!(dr.bitmap.data[2], 255);
        assert_eq!(dr.bitmap.data[3], 128);
    }
}

mod composite_bitmap_region {
    use super::*;

    #[test]
    fn composites_source_over_dest() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let mut dr = region(dest);
        composite_bitmap_region(&mut dr, &region(source), BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0);
    }

    #[test]
    fn clips_to_the_smaller_of_source_and_dest_dimensions() {
        let source = create_bitmap(1, 1, Some(0xff0000ff));
        let dest = create_bitmap(3, 3, None);
        let mut dr = region_at(dest, 1, 1, 2, 2);
        composite_bitmap_region(&mut dr, &region(source), BitmapCompositeMode::Normal);
        assert_eq!(dr.bitmap.data[(1 * 3 + 1) * 4], 0xff);
        assert_eq!(dr.bitmap.data[(1 * 3 + 2) * 4], 0);
    }

    #[test]
    fn applies_the_blend_mode_to_the_source_region() {
        let source = create_bitmap(1, 1, Some(0x808080ff));
        let dest = create_bitmap(1, 1, Some(0xff0000ff));
        let mut dr = region(dest);
        composite_bitmap_region(&mut dr, &region(source), BitmapCompositeMode::Multiply);
        assert_eq!(dr.bitmap.data[0], 128);
        assert_eq!(dr.bitmap.data[1], 0);
    }
}

mod extract_bitmap_pixels {
    use super::*;

    #[test]
    fn copies_region_into_buffer() {
        let mut source = create_bitmap(2, 2, None);
        let i = (1 * 2 + 1) * 4;
        source.data[i] = 0xff;
        source.data[i + 3] = 0xff;
        let mut out = vec![0u8; 4];
        let sr = BitmapRegion { bitmap: source, x: 1, y: 1, width: 1, height: 1 };
        extract_bitmap_pixels(&mut out, &sr);
        assert_eq!(out[0], 0xff);
        assert_eq!(out[3], 0xff);
    }

    #[test]
    fn silently_skips_pixels_outside_source_bounds() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let mut out = vec![0u8; 4 * 4];
        let sr = BitmapRegion { bitmap: source, x: -1, y: -1, width: 2, height: 2 };
        extract_bitmap_pixels(&mut out, &sr);
        let i = (1 * 2 + 1) * 4;
        assert_eq!(out[i], 0xff);
        assert_eq!(out[i + 3], 0xff);
        assert_eq!(out[0], 0);
    }

    #[test]
    fn full_bitmap_extraction() {
        let source = create_bitmap(2, 2, Some(0xaabbccff));
        let mut out = vec![0u8; 2 * 2 * 4];
        let sr = region(source);
        extract_bitmap_pixels(&mut out, &sr);
        assert_eq!(out[0], 0xaa);
        assert_eq!(out[3], 0xff);
    }
}

mod extract_bitmap_pixels32 {
    use super::*;

    #[test]
    fn packs_each_pixel_into_one_rgba_entry() {
        let mut source = create_bitmap(2, 2, None);
        let i = (1 * 2 + 1) * 4;
        source.data[i] = 0x11;
        source.data[i + 1] = 0x22;
        source.data[i + 2] = 0x33;
        source.data[i + 3] = 0x44;
        let mut out = vec![0u32; 1];
        let sr = BitmapRegion { bitmap: source, x: 1, y: 1, width: 1, height: 1 };
        extract_bitmap_pixels32(&mut out, &sr);
        assert_eq!(out[0], 0x11223344);
    }

    #[test]
    fn round_trips_with_write_bitmap_pixels32() {
        let mut source = create_bitmap(3, 2, None);
        for p in 0..6 {
            let i = p * 4;
            source.data[i] = (p * 10 + 1) as u8;
            source.data[i + 1] = (p * 10 + 2) as u8;
            source.data[i + 2] = (p * 10 + 3) as u8;
            source.data[i + 3] = (p * 10 + 4) as u8;
        }
        let mut packed = vec![0u32; 6];
        let sr = region(source);
        extract_bitmap_pixels32(&mut packed, &sr);
        let dest = create_bitmap(3, 2, None);
        let mut dr = region(dest);
        write_bitmap_pixels32(&mut dr, &packed);
        assert_eq!(dr.bitmap.data, sr.bitmap.data);
    }

    #[test]
    fn silently_skips_pixels_outside_source_bounds() {
        let source = create_bitmap(1, 1, Some(0xffffffff));
        let mut out = vec![0u32; 4];
        let sr = BitmapRegion { bitmap: source, x: -1, y: -1, width: 2, height: 2 };
        extract_bitmap_pixels32(&mut out, &sr);
        assert_eq!(out[1 * 2 + 1], 0xffffffff);
        assert_eq!(out[0], 0);
    }
}

mod write_bitmap_pixels {
    use super::*;

    #[test]
    fn writes_at_given_region() {
        let dest = create_bitmap(3, 3, None);
        let pixels: Vec<u8> = vec![0x33, 0x66, 0x99, 0xff];
        let mut dr = BitmapRegion { bitmap: dest, x: 1, y: 1, width: 1, height: 1 };
        write_bitmap_pixels(&mut dr, &pixels);
        let i = (1 * 3 + 1) * 4;
        assert_eq!(dr.bitmap.data[i], 0x33);
        assert_eq!(dr.bitmap.data[i + 3], 0xff);
    }

    #[test]
    fn overwrites_existing_content() {
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let pixels: Vec<u8> = vec![0xff, 0, 0, 0xff];
        let mut dr = region(dest);
        write_bitmap_pixels(&mut dr, &pixels);
        assert_eq!(dr.bitmap.data[2], 0);
        assert_eq!(dr.bitmap.data[0], 0xff);
    }

    #[test]
    fn silently_clips_writes_outside_destination_bounds() {
        let dest = create_bitmap(1, 1, None);
        let pixels: Vec<u8> = vec![0xff, 0xff, 0xff, 0xff];
        let mut dr = region_at(dest, 5, 5, 1, 1);
        write_bitmap_pixels(&mut dr, &pixels);
        assert_eq!(dr.bitmap.data[3], 0);
    }
}

mod write_bitmap_pixels32 {
    use super::*;

    #[test]
    fn unpacks_each_rgba_entry_into_destination_region() {
        let dest = create_bitmap(3, 3, None);
        let mut dr = BitmapRegion { bitmap: dest, x: 1, y: 1, width: 1, height: 1 };
        write_bitmap_pixels32(&mut dr, &[0x336699ff]);
        let i = (1 * 3 + 1) * 4;
        assert_eq!(dr.bitmap.data[i], 0x33);
        assert_eq!(dr.bitmap.data[i + 1], 0x66);
        assert_eq!(dr.bitmap.data[i + 2], 0x99);
        assert_eq!(dr.bitmap.data[i + 3], 0xff);
    }

    #[test]
    fn overwrites_existing_content() {
        let dest = create_bitmap(1, 1, Some(0x0000ffff));
        let mut dr = region(dest);
        write_bitmap_pixels32(&mut dr, &[0xff0000ff]);
        assert_eq!(dr.bitmap.data[0], 0xff);
        assert_eq!(dr.bitmap.data[2], 0);
    }

    #[test]
    fn silently_clips_writes_outside_destination_bounds() {
        let dest = create_bitmap(1, 1, None);
        let mut dr = region_at(dest, 5, 5, 1, 1);
        write_bitmap_pixels32(&mut dr, &[0xffffffff]);
        assert_eq!(dr.bitmap.data[3], 0);
    }
}
