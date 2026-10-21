pub(crate) fn js_round(value: f32) -> f32 {
    if !value.is_finite() || value.fract() == 0.0 {
        return value;
    }
    return (value + 0.5).floor();
}

pub(crate) fn utf16_len(value: &str) -> usize {
    return value.encode_utf16().count();
}

pub(crate) fn utf16_replace(value: &str, start: usize, end: usize, replacement: &str) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    let start = start.min(units.len());
    let end = end.min(units.len()).max(start);
    let mut out = Vec::with_capacity(units.len() - (end - start) + utf16_len(replacement));
    out.extend_from_slice(&units[..start]);
    out.extend(replacement.encode_utf16());
    out.extend_from_slice(&units[end..]);
    return String::from_utf16_lossy(&out);
}

pub(crate) fn utf16_slice(value: &str, start: usize, end: usize) -> String {
    let units: Vec<u16> = value.encode_utf16().collect();
    let start = start.min(units.len());
    let end = end.min(units.len()).max(start);
    return String::from_utf16_lossy(&units[start..end]);
}
