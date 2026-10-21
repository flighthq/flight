use flight_font_formats::*;

mod read_cff_dict {
    use super::*;

    #[test]
    fn assigns_accumulated_operands_to_the_following_operator() {
        assert_eq!(
            read_cff_dict(&[139, 17], 0, 2)
                .unwrap()
                .get(&CFF_OPERATOR_CHARSTRINGS),
            Some(&vec![0.0])
        );
        assert_eq!(
            read_cff_dict(&[140, 141, 18], 0, 3)
                .unwrap()
                .get(&CFF_OPERATOR_PRIVATE),
            Some(&vec![1.0, 2.0])
        );
    }

    #[test]
    fn starts_each_operator_with_a_fresh_operand_list() {
        let parsed = read_cff_dict(&[140, 17, 141, 18], 0, 4).unwrap();
        assert_eq!(parsed.get(&CFF_OPERATOR_CHARSTRINGS), Some(&vec![1.0]));
        assert_eq!(parsed.get(&CFF_OPERATOR_PRIVATE), Some(&vec![2.0]));
    }

    #[test]
    fn reads_one_byte_operands_around_zero() {
        assert_eq!(
            read_cff_dict(&[32, 17], 0, 2).unwrap().get(&17),
            Some(&vec![-107.0])
        );
        assert_eq!(
            read_cff_dict(&[246, 17], 0, 2).unwrap().get(&17),
            Some(&vec![107.0])
        );
    }

    #[test]
    fn reads_two_byte_positive_and_negative_operands() {
        assert_eq!(
            read_cff_dict(&[247, 0, 17], 0, 3).unwrap().get(&17),
            Some(&vec![108.0])
        );
        assert_eq!(
            read_cff_dict(&[251, 0, 17], 0, 3).unwrap().get(&17),
            Some(&vec![-108.0])
        );
    }

    #[test]
    fn reads_sized_integer_operands() {
        assert_eq!(
            read_cff_dict(&[28, 0x30, 0x39, 17], 0, 4).unwrap().get(&17),
            Some(&vec![12345.0])
        );
        assert_eq!(
            read_cff_dict(&[29, 0, 1, 0, 0, 17], 0, 6).unwrap().get(&17),
            Some(&vec![65536.0])
        );
    }

    #[test]
    fn reads_packed_reals_and_exponents() {
        assert_eq!(
            read_cff_dict(&[30, 0xe2, 0xa2, 0x5f, 17], 0, 5)
                .unwrap()
                .get(&17),
            Some(&vec![-2.25])
        );
        assert_eq!(
            read_cff_dict(&[30, 0x0a, 0x14, 0x0c, 0x3f, 17], 0, 6)
                .unwrap()
                .get(&17),
            Some(&vec![0.14e-3])
        );
    }

    #[test]
    fn keys_escaped_operators_apart_from_unescaped_ones() {
        let parsed = read_cff_dict(&[139, 12, 30], 0, 3).unwrap();
        assert!(parsed.contains_key(&CFF_OPERATOR_ROS));
        assert!(!parsed.contains_key(&30));
    }

    #[test]
    fn returns_null_for_reserved_operands() {
        assert_eq!(read_cff_dict(&[22, 17], 0, 2), None);
        assert_eq!(read_cff_dict(&[31, 17], 0, 2), None);
    }

    #[test]
    fn returns_null_for_truncated_numbers() {
        for bytes in [vec![28, 0x30], vec![29, 0, 1], vec![247], vec![30, 0xe2]] {
            assert_eq!(read_cff_dict(&bytes, 0, bytes.len()), None);
        }
    }

    #[test]
    fn returns_null_when_an_escape_ends_the_stream() {
        assert_eq!(read_cff_dict(&[139, 12], 0, 2), None);
    }

    #[test]
    fn retains_last_operator_write_and_skips_reserved_real_nibbles() {
        let parsed = read_cff_dict(&[140, 17, 141, 17, 30, 0xdf, 18, 142], 0, 8).unwrap();
        assert_eq!(parsed.get(&17), Some(&vec![2.0]));
        assert_eq!(parsed.get(&18), Some(&vec![0.0]));
    }

    #[test]
    fn respects_sliced_input_and_explicit_start_and_end() {
        let backing = [22, 22, 140, 17, 141, 18, 22];
        let view = &backing[1..6];
        let parsed = read_cff_dict(view, 1, 5).unwrap();
        assert_eq!(parsed.get(&17), Some(&vec![1.0]));
        assert_eq!(parsed.get(&18), Some(&vec![2.0]));
    }
}
