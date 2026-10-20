/// Return `true` if `n` is an integer power of two (i.e. 1, 2, 4, 8, ...).
///
/// Returns `false` for `n <= 0`.
pub fn is_power_of_two(n: i32) -> bool {
    return n > 0 && (n & (n - 1)) == 0;
}

/// Round `value` up to the nearest multiple of `multiple`.
///
/// `next_multiple_of(7.0, 4.0)` -> `8.0`. When `multiple <= 0` the result is `value`.
pub fn next_multiple_of(value: f32, multiple: f32) -> f32 {
    if multiple <= 0.0 {
        return value;
    }
    let remainder = value % multiple;
    return if remainder == 0.0 { value } else { value + multiple - remainder };
}

/// Round `n` up to the next power of two.
///
/// Uses integer bit-twiddling for stability on large values. Returns `1` for
/// `n <= 1`.
pub fn next_power_of_two(n: i32) -> u32 {
    if n <= 1 {
        return 1;
    }
    let mut v = (n - 1) as u32;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    return v.wrapping_add(1);
}

/// Round `n` down to the largest power of two that is `<= n`.
///
/// `previous_power_of_two(6)` -> `4`. Returns `1` for `n <= 1`.
pub fn previous_power_of_two(n: i32) -> u32 {
    if n <= 1 {
        return 1;
    }
    let mut v = n;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    return ((v as u32).wrapping_add(1)) >> 1;
}
