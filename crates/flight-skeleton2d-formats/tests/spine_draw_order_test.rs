use flight_skeleton2d_formats::contract::*;

mod resolve_spine_draw_ordering {
    use super::*;

    #[test]
    fn resolves_valid_moves_to_per_slot_sort_keys() {
        assert_eq!(
            resolve_spine_draw_ordering(&[], 3),
            Some(vec![0.0, 1.0, 2.0])
        );
        assert_eq!(
            resolve_spine_draw_ordering(
                &[
                    SpineDrawOrderMove {
                        offset: 2,
                        slot_index: 0,
                    },
                    SpineDrawOrderMove {
                        offset: -1,
                        slot_index: 2,
                    },
                ],
                3,
            ),
            Some(vec![2.0, 0.0, 1.0]),
        );
    }

    #[test]
    fn rejects_invalid_or_conflicting_moves() {
        assert!(resolve_spine_draw_ordering(&[], 0).is_none());
        assert!(
            resolve_spine_draw_ordering(
                &[SpineDrawOrderMove {
                    offset: -1,
                    slot_index: 0,
                }],
                3,
            )
            .is_none()
        );
        assert!(
            resolve_spine_draw_ordering(
                &[
                    SpineDrawOrderMove {
                        offset: 1,
                        slot_index: 0,
                    },
                    SpineDrawOrderMove {
                        offset: 0,
                        slot_index: 1,
                    },
                ],
                3,
            )
            .is_none()
        );
    }
}
