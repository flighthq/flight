use crate::bitmap::invalidate_bitmap;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use crate::contract::*;

    fn test_bitmap() -> Bitmap {
        let mut out = create_bitmap(4, 4, Some(0x336699ff));
        set_bitmap_pixel(&mut out, 1, 1, 0x00000000);
        set_bitmap_pixel(&mut out, 2, 1, 0xff8000c0);
        return out;
    }

    fn test_region() -> BitmapRegion {
        return create_bitmap_region(test_bitmap(), 0, 0, 4, 4);
    }

    #[test]
    fn bitmapregion_copy_channel_matches_copy_bitmap_channel() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.copy_channel(ImageChannel::Green, &test_region(), ImageChannel::Red);
        let rb = copy_bitmap_channel(
            &mut b,
            ImageChannel::Green,
            &test_region(),
            ImageChannel::Red,
        );
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_copy_pixels_matches_copy_bitmap_pixels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.copy_pixels(&test_region(), true);
        let rb = copy_bitmap_pixels(&mut b, &test_region(), true);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Copies one channel of source into a channel of dest.
pub fn copy_bitmap_channel(
    dest: &mut BitmapRegion,
    dest_channel: ImageChannel,
    source: &BitmapRegion,
    source_channel: ImageChannel,
) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    let dc = dest_channel as usize;
    let sc = source_channel as usize;
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0
                || sx >= source.bitmap.width as i32
                || dx < 0
                || dx >= dest.bitmap.width as i32
            {
                continue;
            }
            let si = (sy as usize * source.bitmap.width as usize + sx as usize) * 4;
            let di = (dy as usize * dest.bitmap.width as usize + dx as usize) * 4;
            dest.bitmap.data[di + dc] = sd[si + sc];
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Copies source into dest. When composite is true, alpha-composites source-over.
pub fn copy_bitmap_pixels(dest: &mut BitmapRegion, source: &BitmapRegion, composite: bool) {
    let w = dest.width.min(source.width);
    let h = dest.height.min(source.height);
    let sd = source.bitmap.data.clone();
    for py in 0..h {
        let sy = source.y + py;
        let dy = dest.y + py;
        if sy < 0 || sy >= source.bitmap.height as i32 || dy < 0 || dy >= dest.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let sx = source.x + px;
            let dx = dest.x + px;
            if sx < 0
                || sx >= source.bitmap.width as i32
                || dx < 0
                || dx >= dest.bitmap.width as i32
            {
                continue;
            }
            let si = (sy as usize * source.bitmap.width as usize + sx as usize) * 4;
            let di = (dy as usize * dest.bitmap.width as usize + dx as usize) * 4;
            if composite {
                let src_a = sd[si + 3] as f32 / 255.0;
                let dst_a = dest.bitmap.data[di + 3] as f32 / 255.0;
                let out_a = src_a + dst_a * (1.0 - src_a);
                if out_a > 0.0 {
                    dest.bitmap.data[di] = ((sd[si] as f32 * src_a
                        + dest.bitmap.data[di] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dest.bitmap.data[di + 1] = ((sd[si + 1] as f32 * src_a
                        + dest.bitmap.data[di + 1] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dest.bitmap.data[di + 2] = ((sd[si + 2] as f32 * src_a
                        + dest.bitmap.data[di + 2] as f32 * dst_a * (1.0 - src_a))
                        / out_a)
                        .round() as u8;
                    dest.bitmap.data[di + 3] = (out_a * 255.0).round() as u8;
                }
            } else {
                dest.bitmap.data[di] = sd[si];
                dest.bitmap.data[di + 1] = sd[si + 1];
                dest.bitmap.data[di + 2] = sd[si + 2];
                dest.bitmap.data[di + 3] = sd[si + 3];
            }
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

impl BitmapRegion {
    pub fn copy_channel(
        &mut self,
        dest_channel: ImageChannel,
        source: &BitmapRegion,
        source_channel: ImageChannel,
    ) {
        return copy_bitmap_channel(self, dest_channel, source, source_channel);
    }

    pub fn copy_pixels(&mut self, source: &BitmapRegion, composite: bool) {
        return copy_bitmap_pixels(self, source, composite);
    }
}
