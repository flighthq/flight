use crate::support::{
    create_rectangle_record, create_test_parse_state, join_bytes, reader, uint16,
};
use flight_swf::contract::*;

mod read_swf_bounded_definition_header {
    use super::*;

    #[test]
    fn keeps_both_morph_endpoints_and_merges_the_shared_extent() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[
            &uint16(3),
            &create_rectangle_record(0, 200, 0, 200),
            &create_rectangle_record(0, 400, 0, 400),
        ]);
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes), &mut state, true),
            3
        );
        assert_eq!(
            state.character_bounds.get(&3),
            Some(&SwfTagRectangle {
                height: 20.0,
                width: 20.0,
                x: 0.0,
                y: 0.0
            })
        );
        assert_eq!(
            state.morph_bounds.get(&3),
            Some(&SwfMorphBounds {
                end: SwfTagRectangle {
                    height: 20.0,
                    width: 20.0,
                    x: 0.0,
                    y: 0.0
                },
                start: SwfTagRectangle {
                    height: 10.0,
                    width: 10.0,
                    x: 0.0,
                    y: 0.0
                }
            })
        );
    }

    #[test]
    fn records_the_character_and_its_authored_extent() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[&uint16(7), &create_rectangle_record(0, 400, 0, 200)]);
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes), &mut state, false),
            7
        );
        assert_eq!(
            state.character_bounds.get(&7),
            Some(&SwfTagRectangle {
                height: 10.0,
                width: 20.0,
                x: 0.0,
                y: 0.0
            })
        );
        assert!(state.defined_characters.contains(&7));
        assert!(!state.morph_bounds.contains_key(&7));
    }

    #[test]
    fn refuses_a_morph_record_missing_its_second_extent() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[&uint16(4), &create_rectangle_record(0, 200, 0, 200)]);
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes), &mut state, true),
            0
        );
    }

    #[test]
    fn refuses_a_record_truncated_before_its_extent() {
        let mut state = create_test_parse_state();
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(uint16(9).to_vec()), &mut state, false),
            0
        );
        assert!(!state.defined_characters.contains(&9));
    }

    #[test]
    fn refuses_a_second_definition_of_an_existing_character() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[&uint16(5), &create_rectangle_record(0, 200, 0, 200)]);
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes.clone()), &mut state, false),
            5
        );
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes), &mut state, false),
            0
        );
    }

    #[test]
    fn refuses_reserved_character_zero() {
        let mut state = create_test_parse_state();
        let bytes = join_bytes(&[&uint16(0), &create_rectangle_record(0, 1, 0, 1)]);
        assert_eq!(
            read_swf_bounded_definition_header(&mut reader(bytes), &mut state, false),
            0
        );
        assert!(state.character_bounds.is_empty());
    }
}
