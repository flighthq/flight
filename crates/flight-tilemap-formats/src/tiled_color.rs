//! Tiled color literals (`#RRGGBB` or `#AARRGGBB`) converted to/from Flight's packed-RGBA
//! convention (`0xRRGGBBAA`, alpha in the low byte). TS `tiledColor.ts`.

pub fn format_tiled_color(packed: u32) -> String {
    let alpha = packed & 0xff;
    let rgb = (packed >> 8) & 0x00ff_ffff;
    return format!("#{:02x}{:06x}", alpha, rgb);
}

pub fn parse_tiled_color(text: &str) -> Option<u32> {
    let s = text.trim();
    let s = s.strip_prefix('#').unwrap_or(s);
    if !s.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    if s.len() == 6 {
        let rgb = u32::from_str_radix(s, 16).ok()?;
        return Some((rgb << 8) | 0xff);
    }
    if s.len() == 8 {
        let argb = u32::from_str_radix(s, 16).ok()?;
        let alpha = (argb >> 24) & 0xff;
        let rgb = argb & 0x00ff_ffff;
        return Some((rgb << 8) | alpha);
    }
    return None;
}
