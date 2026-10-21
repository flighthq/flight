use flight_font_formats::*;

fn format3(ranges: &[(u16, u8)], sentinel: u16) -> Vec<u8> {
    let mut bytes = vec![3];
    bytes.extend_from_slice(&(ranges.len() as u16).to_be_bytes());
    for (first, fd) in ranges {
        bytes.extend_from_slice(&first.to_be_bytes());
        bytes.push(*fd);
    }
    bytes.extend_from_slice(&sentinel.to_be_bytes());
    return bytes;
}

mod read_cff_fd_select {
    use super::*;

    #[test]
    fn reads_a_byte_per_glyph_mapping() {
        assert_eq!(
            read_cff_fd_select(&[0, 0, 1, 1, 2], 0, 4),
            Some(vec![0, 1, 1, 2].into_boxed_slice())
        );
    }

    #[test]
    fn expands_ranges_to_a_dense_per_glyph_map() {
        assert_eq!(
            read_cff_fd_select(&format3(&[(0, 0), (2, 1)], 5), 0, 5),
            Some(vec![0, 0, 1, 1, 1].into_boxed_slice())
        );
    }

    #[test]
    fn reads_a_table_that_does_not_start_at_byte_zero() {
        assert_eq!(
            read_cff_fd_select(&[99, 98, 97, 96, 0, 3, 3], 4, 2),
            Some(vec![3, 3].into_boxed_slice())
        );
    }

    #[test]
    fn returns_null_when_ranges_leave_an_unmapped_tail() {
        assert_eq!(read_cff_fd_select(&format3(&[(0, 0)], 3), 0, 5), None);
    }

    #[test]
    fn returns_null_for_backward_or_out_of_count_ranges() {
        assert_eq!(
            read_cff_fd_select(&format3(&[(0, 0), (4, 1)], 2), 0, 5),
            None
        );
        assert_eq!(read_cff_fd_select(&format3(&[(0, 0)], 99), 0, 5), None);
    }

    #[test]
    fn returns_null_for_unknown_formats() {
        assert_eq!(read_cff_fd_select(&[7, 0, 0], 0, 2), None);
    }

    #[test]
    fn returns_null_for_truncated_tables() {
        assert_eq!(read_cff_fd_select(&[0, 0, 1], 0, 5), None);
        assert_eq!(read_cff_fd_select(&[3, 0], 0, 2), None);
        assert_eq!(read_cff_fd_select(&[], 0, 1), None);
    }

    #[test]
    fn preserves_source_policy_for_zero_initialized_prefix_gaps_and_empty_ranges() {
        assert_eq!(
            read_cff_fd_select(&format3(&[(2, 3)], 4), 0, 4),
            Some(vec![0, 0, 3, 3].into_boxed_slice())
        );
        assert_eq!(
            read_cff_fd_select(&format3(&[], 0), 0, 0),
            Some(vec![].into_boxed_slice())
        );
    }

    #[test]
    fn allocates_independent_results_from_a_sliced_source() {
        let storage = [88, 0, 2, 3, 99];
        let view = &storage[1..4];
        let mut first = read_cff_fd_select(view, 0, 2).unwrap();
        let second = read_cff_fd_select(view, 0, 2).unwrap();
        first[0] = 9;
        assert_eq!(&*second, &[2, 3]);
        assert_eq!(storage, [88, 0, 2, 3, 99]);
    }
}
