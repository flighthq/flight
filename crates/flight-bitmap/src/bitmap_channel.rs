use flight_entity::{Uint8Array, allocate_entity};

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
    fn bitmap_split_channels_matches_split_bitmap_channels() {
        let s = test_bitmap();
        let ra = s.split_channels();
        let rb = split_bitmap_channels(&s);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn bitmapregion_merge_channels_matches_merge_bitmap_channels() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.merge_channels(&test_region(), &test_region(), &test_region(), &test_region());
        let rb = merge_bitmap_channels(&mut b, &test_region(), &test_region(), &test_region(), &test_region());
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Initializes a bitmap's fields from raw components.
pub fn initialize_bitmap(
    out: &mut Bitmap,
    alpha_type: AlphaType,
    data: Box<Uint8Array>,
    format: &str,
    gamut: &str,
    height: u32,
    width: u32,
) {
    out.alpha_type = alpha_type;
    out.data = data;
    out.format = format.to_string();
    out.gamut = gamut.to_string();
    out.height = height;
    out.kind = BITMAP_TEXTURE_SOURCE_KIND;
    out.version = 0;
    out.width = width;
}

/// Merges four single-channel bitmaps into out by taking one channel from each.
pub fn merge_bitmap_channels(
    out: &mut BitmapRegion,
    r: &BitmapRegion,
    g: &BitmapRegion,
    b: &BitmapRegion,
    a: &BitmapRegion,
) {
    let w = out.width.min(r.width).min(g.width).min(b.width).min(a.width);
    let h = out.height.min(r.height).min(g.height).min(b.height).min(a.height);
    let rd = r.bitmap.data.clone();
    let gd = g.bitmap.data.clone();
    let bd = b.bitmap.data.clone();
    let ad = a.bitmap.data.clone();
    for py in 0..h {
        let oy = out.y + py;
        let ry = r.y + py;
        let gy = g.y + py;
        let by = b.y + py;
        let ay = a.y + py;
        if oy < 0 || oy >= out.bitmap.height as i32
            || ry < 0 || ry >= r.bitmap.height as i32
            || gy < 0 || gy >= g.bitmap.height as i32
            || by < 0 || by >= b.bitmap.height as i32
            || ay < 0 || ay >= a.bitmap.height as i32
        {
            continue;
        }
        for px in 0..w {
            let ox = out.x + px;
            let rx = r.x + px;
            let gx = g.x + px;
            let bx = b.x + px;
            let ax = a.x + px;
            if ox < 0 || ox >= out.bitmap.width as i32
                || rx < 0 || rx >= r.bitmap.width as i32
                || gx < 0 || gx >= g.bitmap.width as i32
                || bx < 0 || bx >= b.bitmap.width as i32
                || ax < 0 || ax >= a.bitmap.width as i32
            {
                continue;
            }
            let di = (oy as usize * out.bitmap.width as usize + ox as usize) * 4;
            out.bitmap.data[di] = rd[(ry as usize * r.bitmap.width as usize + rx as usize) * 4];
            out.bitmap.data[di + 1] = gd[(gy as usize * g.bitmap.width as usize + gx as usize) * 4 + 1];
            out.bitmap.data[di + 2] = bd[(by as usize * b.bitmap.width as usize + bx as usize) * 4 + 2];
            out.bitmap.data[di + 3] = ad[(ay as usize * a.bitmap.width as usize + ax as usize) * 4 + 3];
        }
    }
    invalidate_bitmap(&mut out.bitmap);
}

/// Splits source into four single-channel grayscale bitmaps [R, G, B, A].
pub fn split_bitmap_channels(source: &Bitmap) -> [Bitmap; 4] {
    let w = source.width as usize;
    let h = source.height as usize;
    let sd = &source.data;
    let mut r_data = vec![0u8; w * h * 4];
    let mut g_data = vec![0u8; w * h * 4];
    let mut b_data = vec![0u8; w * h * 4];
    let mut a_data = vec![0u8; w * h * 4];
    for i in 0..(w * h) {
        let si = i * 4;
        let rv = sd[si];
        let gv = sd[si + 1];
        let bv = sd[si + 2];
        let av = sd[si + 3];
        r_data[si] = rv;
        r_data[si + 1] = rv;
        r_data[si + 2] = rv;
        r_data[si + 3] = 0xff;
        g_data[si] = gv;
        g_data[si + 1] = gv;
        g_data[si + 2] = gv;
        g_data[si + 3] = 0xff;
        b_data[si] = bv;
        b_data[si + 1] = bv;
        b_data[si + 2] = bv;
        b_data[si + 3] = 0xff;
        a_data[si] = av;
        a_data[si + 1] = av;
        a_data[si + 2] = av;
        a_data[si + 3] = av;
    }
    let make = |data: Vec<u8>| -> Bitmap {
        let mut out: Bitmap = allocate_entity();
        initialize_bitmap(&mut out, source.alpha_type, data.into_boxed_slice(), &source.format, &source.gamut, source.height, source.width);
        out.kind = source.kind;
        return out;
    };
    [make(r_data), make(g_data), make(b_data), make(a_data)]
}

impl Bitmap {
    pub fn split_channels(&self) -> [Bitmap; 4] {
        return split_bitmap_channels(self);
    }
}

impl BitmapRegion {
    pub fn merge_channels(&mut self, r: &BitmapRegion, g: &BitmapRegion, b: &BitmapRegion, a: &BitmapRegion) {
        return merge_bitmap_channels(self, r, g, b, a);
    }
}
