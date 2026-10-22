use flight_skeleton2d_formats::contract::*;

mod resolve_spine_draw_ordering {
    use super::*;

    #[test]
    fn resolves_valid_moves_to_per_slot_sort_keys() {
        let mut out = Vec::new();
        assert!(resolve_spine_draw_ordering(&mut out, &[], 3));
        assert_eq!(out, [0.0, 1.0, 2.0]);
        assert!(resolve_spine_draw_ordering(
            &mut out,
            &[SpineDrawOrderMove {
                offset: -2,
                slot_index: 2,
            }],
            3,
        ));
        assert_eq!(out, [1.0, 2.0, 0.0]);
        assert!(resolve_spine_draw_ordering(
            &mut out,
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
        ));
        assert_eq!(out, [2.0, 0.0, 1.0]);
    }

    #[test]
    fn rejects_invalid_or_conflicting_moves() {
        let mut out = Vec::new();
        assert!(!resolve_spine_draw_ordering(&mut out, &[], 0));
        assert!(!resolve_spine_draw_ordering(
            &mut out,
            &[SpineDrawOrderMove {
                offset: -1,
                slot_index: 0,
            }],
            3,
        ));
        assert!(!resolve_spine_draw_ordering(
            &mut out,
            &[SpineDrawOrderMove {
                offset: 9,
                slot_index: 0,
            }],
            3,
        ));
        assert!(!resolve_spine_draw_ordering(
            &mut out,
            &[SpineDrawOrderMove {
                offset: 0,
                slot_index: 7,
            }],
            3,
        ));
        assert!(!resolve_spine_draw_ordering(
            &mut out,
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
        ));
        assert!(out.is_empty());
    }

    #[test]
    fn reuses_sort_key_storage_and_clears_it_for_every_rejected_keyframe() {
        let mut out = Vec::with_capacity(8);
        out.push(99.0);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        assert!(resolve_spine_draw_ordering(
            &mut out,
            &[SpineDrawOrderMove {
                offset: 3,
                slot_index: 1,
            }],
            5,
        ));
        assert_eq!(out, [0.0, 4.0, 1.0, 2.0, 3.0]);
        let mut sorted = out.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert_eq!(sorted, [0.0, 1.0, 2.0, 3.0, 4.0]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);

        assert!(resolve_spine_draw_ordering(&mut out, &[], 2));
        assert_eq!(out, [0.0, 1.0]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        let invalid_cases = [
            (vec![], 0),
            (vec![], -1),
            (
                vec![SpineDrawOrderMove {
                    offset: 0,
                    slot_index: -1,
                }],
                3,
            ),
            (
                vec![SpineDrawOrderMove {
                    offset: i32::MAX,
                    slot_index: 1,
                }],
                3,
            ),
            (
                vec![
                    SpineDrawOrderMove {
                        offset: 0,
                        slot_index: 0,
                    },
                    SpineDrawOrderMove {
                        offset: 1,
                        slot_index: 0,
                    },
                ],
                3,
            ),
        ];
        for (moves, slot_count) in invalid_cases {
            out.push(99.0);
            assert!(!resolve_spine_draw_ordering(&mut out, &moves, slot_count));
            assert!(out.is_empty());
            assert_eq!(out.as_ptr(), pointer);
            assert_eq!(out.capacity(), capacity);
        }
        assert!(resolve_spine_draw_ordering(&mut out, &[], 1));
        assert_eq!(out, [0.0]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
