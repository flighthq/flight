#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_utf16_units_from_the_requested_offset() {
        let units = [0x0061, 0x000a, 0x0062, 0x000a];
        assert_eq!(find_utf16_unit(&units, 0x000a, 0), Some(1));
        assert_eq!(find_utf16_unit(&units, 0x000a, 2), Some(3));
        assert_eq!(find_utf16_unit(&units, 0x000d, 0), None);
    }

    #[test]
    fn preserves_javascript_minimum_and_maximum_nan_behavior() {
        assert_eq!(js_max(-2.0, 4.0), 4.0);
        assert_eq!(js_min(-2.0, 4.0), -2.0);
        assert!(js_max(f32::NAN, 4.0).is_nan());
        assert!(js_min(-2.0, f32::NAN).is_nan());
    }

    #[test]
    fn counts_and_slices_utf16_surrogate_pairs() {
        let units = [0x0061, 0xd83d, 0xde80, 0x0062];
        assert_eq!(utf16_code_point_len(&units, 0), 1);
        assert_eq!(utf16_code_point_len(&units, 1), 2);
        assert_eq!(utf16_slice(&units, 1, 3), "🚀");
    }
}

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
