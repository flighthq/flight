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

    #[test]
    fn bitmap_coverage_matches_get_bitmap_coverage() {
        let s = test_bitmap();
        let ra = s.coverage(0xff0000ff, 2);
        let rb = get_bitmap_coverage(&s, 0xff0000ff, 2);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }
}

/// Returns the fraction of pixels (0..1) that differ from background_color.
// flight-lint: allow(f64) pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps
pub fn get_bitmap_coverage(source: &Bitmap, background_color: u32, channel_tolerance: u32) -> f64 {
    let br = ((background_color >> 24) & 0xff) as i32;
    let bg = ((background_color >> 16) & 0xff) as i32;
    let bb = ((background_color >> 8) & 0xff) as i32;
    let ba = (background_color & 0xff) as i32;
    let data = &source.data;
    let total_pixels = (source.width * source.height) as u64;
    if total_pixels == 0 {
        return 0.0;
    }

    let tol = channel_tolerance as i32;
    let mut covered = 0u64;
    let mut i = 0;
    while i < data.len() {
        if (data[i] as i32 - br).abs() > tol
            || (data[i + 1] as i32 - bg).abs() > tol
            || (data[i + 2] as i32 - bb).abs() > tol
            || (data[i + 3] as i32 - ba).abs() > tol
        {
            covered += 1;
        }
        i += 4;
    }
    covered as f64 / total_pixels as f64
}

impl Bitmap {
    // flight-lint: allow(f64) pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps
    pub fn coverage(&self, background_color: u32, channel_tolerance: u32) -> f64 {
        return get_bitmap_coverage(self, background_color, channel_tolerance);
    }
}
