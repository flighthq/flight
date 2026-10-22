use flight_compression::contract::*;

mod compute_adler32 {
    use super::*;

    #[test]
    fn is_order_sensitive_so_a_transposition_is_not_silently_equal() {
        assert_ne!(
            compute_adler32(&[1, 2]),
            compute_adler32(&[2, 1])
        );
    }

    #[test]
    fn matches_the_checksum_rfc_1950_defines_for_a_known_string() {
        // 'Wikipedia' is the worked example carried in the Adler-32 definition itself.
        assert_eq!(
            compute_adler32(b"Wikipedia"),
            0x11e60398
        );
    }

    #[test]
    fn returns_the_initial_value_for_an_empty_input() {
        assert_eq!(compute_adler32(&[]), 1);
    }

    #[test]
    fn stays_a_32_bit_unsigned_value_past_the_point_the_sums_wrap() {
        // TS checked checksum <= 0xffffffff; u32 guarantees that in Rust.
        // Verify wrapping produces a nonzero result.
        let bytes = vec![0xffu8; 10_000];
        let checksum = compute_adler32(&bytes);
        assert_ne!(checksum, 0);
    }
}

mod deflate_format_tables {
    use super::*;

    #[test]
    fn pairs_every_distance_code_with_its_extra_bit_count_and_covers_the_whole_window() {
        assert_eq!(DISTANCE_BASE.len(), DISTANCE_EXTRA.len());
        assert_eq!(DISTANCE_BASE[0], 1);
        let last = DISTANCE_BASE.len() - 1;
        assert_eq!(
            DISTANCE_BASE[last] + (1 << DISTANCE_EXTRA[last]) - 1,
            32768
        );
    }

    #[test]
    fn pairs_every_length_code_with_its_extra_bit_count_and_ends_at_the_maximum_match() {
        assert_eq!(LENGTH_BASE.len(), LENGTH_EXTRA.len());
        assert_eq!(LENGTH_BASE[0], 3);
        assert_eq!(LENGTH_BASE[LENGTH_BASE.len() - 1], 258);
        assert_eq!(LENGTH_EXTRA[LENGTH_EXTRA.len() - 1], 0);
    }

    #[test]
    fn tiles_the_distance_alphabet_without_gap_or_overlap() {
        for i in 0..DISTANCE_BASE.len() - 1 {
            assert_eq!(
                DISTANCE_BASE[i] + (1 << DISTANCE_EXTRA[i]),
                DISTANCE_BASE[i + 1]
            );
        }
    }

    #[test]
    fn tiles_the_length_alphabet_except_for_the_final_pair_which_the_format_leaves_irregular() {
        for i in 0..LENGTH_BASE.len() - 2 {
            assert_eq!(
                LENGTH_BASE[i] + (1 << LENGTH_EXTRA[i]),
                LENGTH_BASE[i + 1]
            );
        }
        let penultimate = LENGTH_BASE.len() - 2;
        assert_eq!(
            LENGTH_BASE[penultimate] + (1 << LENGTH_EXTRA[penultimate]) - 1,
            258
        );
        assert_eq!(LENGTH_BASE[LENGTH_BASE.len() - 1], 258);
    }
}
