//! Color utility functions.

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Converts a 24-bit RGB color (`0xRRGGBB`, e.g. a text format color) to a
/// CSS `#RRGGBB` hex string. High-byte bits are masked off — pass RGB, not RGBA.
pub fn compute_rgb_hex_string(color: u32) -> String {
    format!("#{:06x}", color & 0x00ff_ffff)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // compute_rgb_hex_string
    #[test]
    fn compute_rgb_hex_string_red() {
        assert_eq!(compute_rgb_hex_string(0x00ff_0000), "#ff0000");
    }

    #[test]
    fn compute_rgb_hex_string_green() {
        assert_eq!(compute_rgb_hex_string(0x0000_ff00), "#00ff00");
    }

    #[test]
    fn compute_rgb_hex_string_blue() {
        assert_eq!(compute_rgb_hex_string(0x0000_00ff), "#0000ff");
    }

    #[test]
    fn compute_rgb_hex_string_black() {
        assert_eq!(compute_rgb_hex_string(0x0000_0000), "#000000");
    }

    #[test]
    fn compute_rgb_hex_string_white() {
        assert_eq!(compute_rgb_hex_string(0x00ff_ffff), "#ffffff");
    }

    #[test]
    fn compute_rgb_hex_string_masks_high_byte() {
        // 0xAABBCCDD — lower 24 bits are 0xBBCCDD
        assert_eq!(compute_rgb_hex_string(0xaabb_ccdd), "#bbccdd");
    }
}
