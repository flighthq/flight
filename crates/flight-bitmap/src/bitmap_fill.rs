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
    fn bitmap_flood_fill_matches_flood_fill_bitmap() {
        let mut a = test_bitmap();
        let mut b = test_bitmap();
        let ra = a.flood_fill(1, 1, 0xff0000ff);
        let rb = flood_fill_bitmap(&mut b, 1, 1, 0xff0000ff);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }

    #[test]
    fn bitmapregion_fill_rectangle_matches_fill_bitmap_rectangle() {
        let mut a = test_region();
        let mut b = test_region();
        let ra = a.fill_rectangle(0xff0000ff);
        let rb = fill_bitmap_rectangle(&mut b, 0xff0000ff);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

/// Fills the rectangular dest region with a packed RGBA color.
pub fn fill_bitmap_rectangle(dest: &mut BitmapRegion, color: u32) {
    let r = ((color >> 24) & 0xff) as u8;
    let g = ((color >> 16) & 0xff) as u8;
    let b = ((color >> 8) & 0xff) as u8;
    let a = (color & 0xff) as u8;
    let bw = dest.bitmap.width as i32;
    for py in 0..dest.height {
        let y = dest.y + py;
        if y < 0 || y >= dest.bitmap.height as i32 {
            continue;
        }
        for px in 0..dest.width {
            let x = dest.x + px;
            if x < 0 || x >= bw {
                continue;
            }
            let i = (y as usize * bw as usize + x as usize) * 4;
            dest.bitmap.data[i] = r;
            dest.bitmap.data[i + 1] = g;
            dest.bitmap.data[i + 2] = b;
            dest.bitmap.data[i + 3] = a;
        }
    }
    invalidate_bitmap(&mut dest.bitmap);
}

/// Flood-fills a connected region of out starting at (x, y).
pub fn flood_fill_bitmap(out: &mut Bitmap, x: i32, y: i32, color: u32) {
    if x < 0 || x >= out.width as i32 || y < 0 || y >= out.height as i32 {
        return;
    }

    let fill_r = ((color >> 24) & 0xff) as u8;
    let fill_g = ((color >> 16) & 0xff) as u8;
    let fill_b = ((color >> 8) & 0xff) as u8;
    let fill_a = (color & 0xff) as u8;

    let w = out.width as usize;
    let target_i = (y as usize * w + x as usize) * 4;
    let target_r = out.data[target_i];
    let target_g = out.data[target_i + 1];
    let target_b = out.data[target_i + 2];
    let target_a = out.data[target_i + 3];

    if target_r == fill_r && target_g == fill_g && target_b == fill_b && target_a == fill_a {
        return;
    }

    let needed = out.width as usize * out.height as usize;
    let mut visited = vec![0u8; needed];

    let mut stack = vec![x as usize + y as usize * w];

    while let Some(idx) = stack.pop() {
        if visited[idx] != 0 {
            continue;
        }
        visited[idx] = 1;

        let i = idx * 4;
        if out.data[i] != target_r
            || out.data[i + 1] != target_g
            || out.data[i + 2] != target_b
            || out.data[i + 3] != target_a
        {
            continue;
        }

        out.data[i] = fill_r;
        out.data[i + 1] = fill_g;
        out.data[i + 2] = fill_b;
        out.data[i + 3] = fill_a;

        let px = idx % w;
        let py = idx / w;
        if px > 0 {
            stack.push(idx - 1);
        }
        if px < w - 1 {
            stack.push(idx + 1);
        }
        if py > 0 {
            stack.push(idx - w);
        }
        if py < out.height as usize - 1 {
            stack.push(idx + w);
        }
    }
    invalidate_bitmap(out);
}

impl Bitmap {
    pub fn flood_fill(&mut self, x: i32, y: i32, color: u32) {
        return flood_fill_bitmap(self, x, y, color);
    }
}

impl BitmapRegion {
    pub fn fill_rectangle(&mut self, color: u32) {
        return fill_bitmap_rectangle(self, color);
    }
}
