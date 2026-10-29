pub fn find_utf16_unit(units: &[u16], unit: u16, start: usize) -> Option<usize> {
    let mut index = start;
    while index < units.len() {
        if units[index] == unit {
            return Some(index);
        }
        index += 1;
    }
    return None;
}

pub fn js_max(left: f32, right: f32) -> f32 {
    if left.is_nan() || right.is_nan() {
        return f32::NAN;
    }
    return left.max(right);
}

pub fn js_min(left: f32, right: f32) -> f32 {
    if left.is_nan() || right.is_nan() {
        return f32::NAN;
    }
    return left.min(right);
}

pub fn utf16_code_point_len(units: &[u16], index: usize) -> usize {
    let first = units[index];
    if first & 0xfc00 == 0xd800 && index + 1 < units.len() && units[index + 1] & 0xfc00 == 0xdc00 {
        return 2;
    }
    return 1;
}

pub fn utf16_slice(units: &[u16], start: usize, end: usize) -> String {
    return String::from_utf16_lossy(&units[start..end]);
}
