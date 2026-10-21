pub(crate) fn find_utf16_unit(units: &[u16], unit: u16, start: usize) -> Option<usize> {
    return units
        .iter()
        .enumerate()
        .skip(start)
        .find_map(|(index, value)| (*value == unit).then_some(index));
}

pub(crate) fn js_max(left: f32, right: f32) -> f32 {
    if left.is_nan() || right.is_nan() {
        return f32::NAN;
    }
    return left.max(right);
}

pub(crate) fn js_min(left: f32, right: f32) -> f32 {
    if left.is_nan() || right.is_nan() {
        return f32::NAN;
    }
    return left.min(right);
}

pub(crate) fn utf16_code_point_len(units: &[u16], index: usize) -> usize {
    let first = units[index];
    if (0xd800..=0xdbff).contains(&first)
        && index + 1 < units.len()
        && (0xdc00..=0xdfff).contains(&units[index + 1])
    {
        return 2;
    }
    return 1;
}

pub(crate) fn utf16_slice(units: &[u16], start: usize, end: usize) -> String {
    return String::from_utf16_lossy(&units[start..end]);
}
