/// Binary search for the first break index at or after `start_index`.
/// Returns `-1` when no such break exists. The `line_breaks` slice must be
/// sorted in ascending order (as produced by `get_text_line_breaks`).
pub fn get_text_line_break_index(line_breaks: &[usize], start_index: usize) -> i64 {
    if line_breaks.is_empty() {
        return -1;
    }
    let mut lo: isize = 0;
    let mut hi: isize = line_breaks.len() as isize - 1;
    let mut result: i64 = -1;
    while lo <= hi {
        let mid = (lo + hi) / 2;
        if line_breaks[mid as usize] >= start_index {
            result = line_breaks[mid as usize] as i64;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    result
}

/// Fills `out` with the byte offsets of every `\n` and `\r` character in
/// `text`, in ascending order.
pub fn get_text_line_breaks(out: &mut Vec<usize>, text: &str) {
    out.clear();
    for (i, ch) in text.char_indices() {
        if ch == '\n' || ch == '\r' {
            out.push(i);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn get_text_line_break_index_empty() {
        assert_eq!(get_text_line_break_index(&[], 0), -1);
    }

    #[test]
    fn get_text_line_break_index_found() {
        assert_eq!(get_text_line_break_index(&[3, 7, 12], 5), 7);
    }

    #[test]
    fn get_text_line_break_index_exact() {
        assert_eq!(get_text_line_break_index(&[3, 7], 3), 3);
    }

    #[test]
    fn get_text_line_break_index_none_in_range() {
        assert_eq!(get_text_line_break_index(&[1, 2], 5), -1);
    }

    #[test]
    fn get_text_line_break_index_exact_match() {
        assert_eq!(get_text_line_break_index(&[3, 7, 12], 7), 7);
    }

    #[test]
    fn get_text_line_break_index_single_element() {
        assert_eq!(get_text_line_break_index(&[5], 3), 5);
        assert_eq!(get_text_line_break_index(&[5], 5), 5);
        assert_eq!(get_text_line_break_index(&[5], 6), -1);
    }

    #[test]
    fn get_text_line_break_index_large_sorted_array() {
        let breaks: Vec<usize> = (0..100).map(|i| i * 10).collect();
        assert_eq!(get_text_line_break_index(&breaks, 55), 60);
        assert_eq!(get_text_line_break_index(&breaks, 60), 60);
        assert_eq!(get_text_line_break_index(&breaks, 0), 0);
        assert_eq!(get_text_line_break_index(&breaks, 999), -1);
    }

    #[test]
    fn get_text_line_breaks_lf() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "ab\ncd\nef");
        assert_eq!(out, vec![2, 5]);
    }

    #[test]
    fn get_text_line_breaks_cr() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "a\rb\rc");
        assert_eq!(out, vec![1, 3]);
    }

    #[test]
    fn get_text_line_breaks_no_breaks() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "hello");
        assert!(out.is_empty());
    }

    #[test]
    fn get_text_line_breaks_empty_string() {
        let mut out = Vec::new();
        get_text_line_breaks(&mut out, "");
        assert!(out.is_empty());
    }
}
