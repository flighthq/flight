use flight_entity::allocate_entity;

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
    fn bitmapfingerprint_compare_matches_compare_bitmap_fingerprints() {
        let s = create_bitmap_fingerprint(&test_bitmap(), 2);
        let ra = s.compare(&create_bitmap_fingerprint(&test_bitmap(), 2));
        let rb = compare_bitmap_fingerprints(&s, &create_bitmap_fingerprint(&test_bitmap(), 2));
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn bitmapfingerprint_format_matches_format_bitmap_fingerprint() {
        let s = create_bitmap_fingerprint(&test_bitmap(), 2);
        let ra = s.format();
        let rb = format_bitmap_fingerprint(&s);
        assert_eq!(format!("{:?}", ra), format!("{:?}", rb));
    }

    #[test]
    fn bitmapfingerprint_from_bitmap_matches_create_bitmap_fingerprint() {
        let a = BitmapFingerprint::from_bitmap(&test_bitmap(), 2);
        let b = create_bitmap_fingerprint(&test_bitmap(), 2);
        assert_eq!(format!("{:?}", a), format!("{:?}", b));
    }
}

pub const BITMAP_FINGERPRINT_COMPUTATION_ID: &str = "grid-average-rgb-v1";

const HEX: &[u8; 16] = b"0123456789abcdef";

/// Reduces a bitmap to a gridSize x gridSize grid of averaged RGB cells.
// flight-lint: allow(f64) integer channel sums over a region exceed f32 exact range (2^24) on large bitmaps; averaged in double before rounding, as TS number does
pub fn create_bitmap_fingerprint(source: &Bitmap, grid_size: u32) -> BitmapFingerprint {
    assert!(
        grid_size >= 1,
        "createBitmapFingerprint: gridSize must be >= 1 (got {})",
        grid_size
    );
    let gs = grid_size as usize;
    let mut cells = vec![0u8; gs * gs * 3];
    let w = source.width as usize;
    let h = source.height as usize;
    if w == 0 || h == 0 {
        return make_bitmap_fingerprint(grid_size, cells);
    }
    let data = &source.data;
    for cy in 0..gs {
        let y0 = (cy * h) / gs;
        let y1 = ((cy + 1) * h / gs).max(y0 + 1);
        for cx in 0..gs {
            let x0 = (cx * w) / gs;
            let x1 = ((cx + 1) * w / gs).max(x0 + 1);
            let mut sum_r = 0u64;
            let mut sum_g = 0u64;
            let mut sum_b = 0u64;
            let mut count = 0u64;
            for y in y0..y1.min(h) {
                let mut i = (y * w + x0) * 4;
                for _x in x0..x1.min(w) {
                    sum_r += data[i] as u64;
                    sum_g += data[i + 1] as u64;
                    sum_b += data[i + 2] as u64;
                    count += 1;
                    i += 4;
                }
            }
            let c = (cy * gs + cx) * 3;
            if count == 0 {
                cells[c] = 0;
                cells[c + 1] = 0;
                cells[c + 2] = 0;
            } else {
                cells[c] = ((sum_r as f64 / count as f64).round()) as u8;
                cells[c + 1] = ((sum_g as f64 / count as f64).round()) as u8;
                cells[c + 2] = ((sum_b as f64 / count as f64).round()) as u8;
            }
        }
    }
    return make_bitmap_fingerprint(grid_size, cells);
}

/// Initializes a BitmapFingerprint.
pub fn initialize_bitmap_fingerprint(out: &mut BitmapFingerprint, grid_size: u32, cells: Vec<u8>) {
    out.grid_size = grid_size;
    out.cells = cells;
}

/// Mean absolute per-channel difference between two fingerprints.
// flight-lint: allow(f64) pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps
pub fn compare_bitmap_fingerprints(a: &BitmapFingerprint, b: &BitmapFingerprint) -> f64 {
    assert_eq!(
        a.grid_size, b.grid_size,
        "compareBitmapFingerprints: gridSize mismatch ({} vs {})",
        a.grid_size, b.grid_size
    );
    if a.cells.is_empty() {
        return 0.0;
    }
    let mut sum = 0i64;
    for i in 0..a.cells.len() {
        sum += (a.cells[i] as i64 - b.cells[i] as i64).abs();
    }
    sum as f64 / a.cells.len() as f64
}

/// Serializes a fingerprint to text: "<gridSize>:<hex>".
pub fn format_bitmap_fingerprint(fingerprint: &BitmapFingerprint) -> String {
    let mut hex = String::with_capacity(fingerprint.cells.len() * 2);
    for &byte in &fingerprint.cells {
        hex.push(HEX[((byte >> 4) & 0xf) as usize] as char);
        hex.push(HEX[(byte & 0xf) as usize] as char);
    }
    format!("{}:{}", fingerprint.grid_size, hex)
}

fn make_bitmap_fingerprint(grid_size: u32, cells: Vec<u8>) -> BitmapFingerprint {
    let mut out: BitmapFingerprint = allocate_entity();
    initialize_bitmap_fingerprint(&mut out, grid_size, cells);
    return out;
}

/// Parses the text form. Returns None for malformed input.
pub fn parse_bitmap_fingerprint(text: &str) -> Option<BitmapFingerprint> {
    let colon = text.find(':')?;
    if colon == 0 {
        return None;
    }
    let grid_size: u32 = text[..colon].parse().ok()?;
    if grid_size < 1 {
        return None;
    }
    let hex = &text[colon + 1..];
    let expected_len = grid_size as usize * grid_size as usize * 3 * 2;
    if hex.len() != expected_len {
        return None;
    }
    let hex_chars = "0123456789abcdef";
    let mut cells = vec![0u8; hex.len() / 2];
    for i in 0..cells.len() {
        let hi = hex_chars.find(hex.as_bytes()[i * 2] as char)?;
        let lo = hex_chars.find(hex.as_bytes()[i * 2 + 1] as char)?;
        cells[i] = ((hi << 4) | lo) as u8;
    }
    return Some(make_bitmap_fingerprint(grid_size, cells));
}

impl BitmapFingerprint {
    // flight-lint: allow(f64) pixel-count ratio; counts exceed f32 exact range (2^24) on large bitmaps
    pub fn compare(&self, b: &BitmapFingerprint) -> f64 {
        return compare_bitmap_fingerprints(self, b);
    }

    pub fn format(&self) -> String {
        return format_bitmap_fingerprint(self);
    }

    pub fn from_bitmap(source: &Bitmap, grid_size: u32) -> Self {
        return create_bitmap_fingerprint(source, grid_size);
    }
}
