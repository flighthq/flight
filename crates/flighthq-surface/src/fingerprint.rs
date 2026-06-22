//! Coarse visual fingerprint for regression testing.

use flighthq_types::{Surface, SurfaceFingerprint};

/// The mean absolute per-channel difference (0..255) between two fingerprints
/// of the same `grid_size`. Panics if the `grid_size` values differ.
pub fn compare_surface_fingerprints(a: &SurfaceFingerprint, b: &SurfaceFingerprint) -> f32 {
    if a.grid_size != b.grid_size {
        panic!(
            "compare_surface_fingerprints: grid_size mismatch ({} vs {})",
            a.grid_size, b.grid_size
        );
    }
    if a.cells.is_empty() {
        return 0.0;
    }
    let mut sum: u32 = 0;
    for i in 0..a.cells.len() {
        sum += (a.cells[i] as i32 - b.cells[i] as i32).unsigned_abs();
    }
    sum as f32 / a.cells.len() as f32
}

/// Reduces a surface to a `grid_size × grid_size` grid of averaged RGB cells.
/// Each cell averages the RGB of the source pixels that fall in it (alpha is
/// ignored). Panics if `grid_size` is 0.
pub fn create_surface_fingerprint(source: &Surface, grid_size: u32) -> SurfaceFingerprint {
    if grid_size < 1 {
        panic!("create_surface_fingerprint: grid_size must be >= 1 (got {grid_size})");
    }

    let g = grid_size as usize;
    let mut cells = vec![0u8; g * g * 3];
    let width = source.width as usize;
    let height = source.height as usize;
    if width == 0 || height == 0 {
        return SurfaceFingerprint { grid_size, cells };
    }
    let data = &source.data;

    for cy in 0..g {
        let y0 = (cy * height) / g;
        let y1 = (y0 + 1).max(((cy + 1) * height) / g);
        for cx in 0..g {
            let x0 = (cx * width) / g;
            let x1 = (x0 + 1).max(((cx + 1) * width) / g);
            let mut sum_r: u64 = 0;
            let mut sum_g: u64 = 0;
            let mut sum_b: u64 = 0;
            let mut count: u64 = 0;
            let mut y = y0;
            while y < y1 && y < height {
                let mut i = (y * width + x0) * 4;
                let mut x = x0;
                while x < x1 && x < width {
                    sum_r += data[i] as u64;
                    sum_g += data[i + 1] as u64;
                    sum_b += data[i + 2] as u64;
                    count += 1;
                    i += 4;
                    x += 1;
                }
                y += 1;
            }
            let c = (cy * g + cx) * 3;
            if count == 0 {
                cells[c] = 0;
                cells[c + 1] = 0;
                cells[c + 2] = 0;
            } else {
                cells[c] = round_div(sum_r, count);
                cells[c + 1] = round_div(sum_g, count);
                cells[c + 2] = round_div(sum_b, count);
            }
        }
    }
    SurfaceFingerprint { grid_size, cells }
}

/// Serializes a fingerprint to a compact, git-diffable text line:
/// `<grid_size>:<hex cells>`.
pub fn format_surface_fingerprint(fingerprint: &SurfaceFingerprint) -> String {
    let mut hex = String::with_capacity(fingerprint.cells.len() * 2);
    for &cell in &fingerprint.cells {
        hex.push(HEX[((cell >> 4) & 0xf) as usize] as char);
        hex.push(HEX[(cell & 0xf) as usize] as char);
    }
    format!("{}:{}", fingerprint.grid_size, hex)
}

/// Parses the text form produced by `format_surface_fingerprint`. Returns
/// `None` for malformed input (wrong shape, odd hex length, or a cell count
/// that is not `grid_size × grid_size × 3`).
pub fn parse_surface_fingerprint(text: &str) -> Option<SurfaceFingerprint> {
    let colon = text.find(':')?;
    if colon == 0 {
        return None;
    }
    let grid_size: u32 = text[..colon].parse().ok()?;
    if grid_size < 1 {
        return None;
    }

    let hex = &text[colon + 1..];
    let g = grid_size as usize;
    if hex.len() != g * g * 3 * 2 {
        return None;
    }

    let hex_bytes = hex.as_bytes();
    let mut cells = vec![0u8; hex.len() / 2];
    for i in 0..cells.len() {
        let hi = hex_digit(hex_bytes[i * 2])?;
        let lo = hex_digit(hex_bytes[i * 2 + 1])?;
        cells[i] = (hi << 4) | lo;
    }
    Some(SurfaceFingerprint { grid_size, cells })
}

fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        _ => None,
    }
}

fn round_div(sum: u64, count: u64) -> u8 {
    ((sum * 2 + count) / (count * 2)) as u8
}

const HEX: &[u8; 16] = b"0123456789abcdef";

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pixel::set_surface_pixel;
    use crate::surface::create_surface;

    #[test]
    fn compare_surface_fingerprints_identical() {
        let fp = create_surface_fingerprint(&create_surface(8, 8, 0x336699ff), 4);
        assert_eq!(compare_surface_fingerprints(&fp, &fp), 0.0);
    }

    #[test]
    fn compare_surface_fingerprints_mean_abs_diff() {
        let a = create_surface_fingerprint(&create_surface(4, 4, 0x000000ff), 1);
        let b = create_surface_fingerprint(&create_surface(4, 4, 0x0c0c0cff), 1);
        assert_eq!(compare_surface_fingerprints(&a, &b), 12.0);
    }

    #[test]
    #[should_panic]
    fn compare_surface_fingerprints_grid_mismatch_panics() {
        let a = create_surface_fingerprint(&create_surface(4, 4, 0), 2);
        let b = create_surface_fingerprint(&create_surface(4, 4, 0), 4);
        compare_surface_fingerprints(&a, &b);
    }

    #[test]
    fn create_surface_fingerprint_solid_color() {
        let fp = create_surface_fingerprint(&create_surface(8, 8, 0x336699ff), 4);
        assert_eq!(fp.grid_size, 4);
        assert_eq!(fp.cells.len(), 4 * 4 * 3);
        assert_eq!(&fp.cells[0..3], &[0x33, 0x66, 0x99]);
        let n = fp.cells.len();
        assert_eq!(&fp.cells[n - 3..], &[0x33, 0x66, 0x99]);
    }

    #[test]
    fn create_surface_fingerprint_quadrant() {
        let mut surface = create_surface(2, 2, 0x000000ff);
        set_surface_pixel(&mut surface, 0, 0, 0xff0000ff);
        let fp = create_surface_fingerprint(&surface, 2);
        assert_eq!(&fp.cells[0..3], &[255, 0, 0]);
        assert_eq!(&fp.cells[3..6], &[0, 0, 0]);
    }

    #[test]
    fn create_surface_fingerprint_empty_surface() {
        let fp = create_surface_fingerprint(&create_surface(0, 0, 0), 2);
        assert!(fp.cells.iter().all(|&v| v == 0));
    }

    #[test]
    #[should_panic]
    fn create_surface_fingerprint_zero_grid_panics() {
        create_surface_fingerprint(&create_surface(4, 4, 0), 0);
    }

    #[test]
    fn format_surface_fingerprint_roundtrip() {
        let mut surface = create_surface(8, 8, 0x000000ff);
        set_surface_pixel(&mut surface, 1, 1, 0x12ab34ff);
        set_surface_pixel(&mut surface, 6, 6, 0xfe01dcff);
        let fp = create_surface_fingerprint(&surface, 4);
        let parsed = parse_surface_fingerprint(&format_surface_fingerprint(&fp)).unwrap();
        assert_eq!(parsed.grid_size, 4);
        assert_eq!(parsed.cells, fp.cells);
        assert_eq!(compare_surface_fingerprints(&fp, &parsed), 0.0);
    }

    #[test]
    fn format_surface_fingerprint_lowercase_hex() {
        let fp = create_surface_fingerprint(&create_surface(4, 4, 0x0a0b0cff), 1);
        assert_eq!(format_surface_fingerprint(&fp), "1:0a0b0c");
    }

    #[test]
    fn parse_surface_fingerprint_invalid_returns_none() {
        assert!(parse_surface_fingerprint("garbage").is_none());
        assert!(parse_surface_fingerprint("").is_none());
        assert!(parse_surface_fingerprint("2:abcd").is_none());
        assert!(parse_surface_fingerprint("1:0a0b0").is_none());
        assert!(parse_surface_fingerprint("1:0a0b0z").is_none());
    }

    #[test]
    fn parse_surface_fingerprint_valid_single_cell() {
        let parsed = parse_surface_fingerprint("1:0a0b0c").unwrap();
        assert_eq!(parsed.cells, vec![0x0a, 0x0b, 0x0c]);
    }
}
