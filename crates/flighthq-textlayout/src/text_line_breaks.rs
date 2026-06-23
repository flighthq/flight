/// Returns the first line-break index in `line_breaks` that is greater than
/// or equal to `start_index`, or `-1` when none exists.
pub fn get_text_line_break_index(line_breaks: &[usize], start_index: usize) -> i64 {
    for &lb in line_breaks {
        if lb >= start_index {
            return lb as i64;
        }
    }
    -1
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
