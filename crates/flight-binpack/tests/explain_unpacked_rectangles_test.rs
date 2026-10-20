use flight_binpack::*;
use std::collections::HashMap;

fn count_by_id(ids: &[RectangleId]) -> HashMap<String, i32> {
    let mut counts: HashMap<String, i32> = HashMap::new();
    for id in ids {
        let key = id.to_string();
        *counts.entry(key).or_insert(0) += 1;
    }
    return counts;
}

struct Random {
    state: i64,
}

fn make_random(seed: i32) -> Random {
    let state = ((seed as i64) * 1103515245 + 12345) % 2147483648;
    return Random { state };
}

fn next_random(rng: &mut Random) -> f32 {
    rng.state = (rng.state * 1103515245 + 12345) % 2147483648;
    return rng.state as f32 / 2147483648.0;
}

mod create_unpacked_rectangle_explanation {
    use super::*;

    #[test]
    fn returns_an_explanation_with_the_given_values() {
        let explanation = create_unpacked_rectangle_explanation(
            RectangleId::Text("a".to_string()),
            UnpackedRectangleReason::Oversized,
            100.0,
            200.0,
        );
        assert_eq!(explanation.id, RectangleId::Text("a".to_string()));
        assert_eq!(explanation.reason, UnpackedRectangleReason::Oversized);
        assert_eq!(explanation.usable_width, 100.0);
        assert_eq!(explanation.usable_height, 200.0);
    }
}

mod explain_unpacked_rectangles {
    use super::*;

    #[test]
    fn returns_nothing_when_everything_was_placed() {
        let result = explain_unpacked_rectangles(
            &[create_packable_rectangle(
                RectangleId::Text("a".to_string()),
                8.0,
                8.0,
            )],
            None,
        );
        assert!(result.is_empty());
    }

    #[test]
    fn separates_oversized_from_bin_exhausted_which_have_different_remedies() {
        let rects = vec![
            create_packable_rectangle(RectangleId::Text("huge".to_string()), 500.0, 10.0),
            create_packable_rectangle(RectangleId::Text("filler".to_string()), 90.0, 90.0),
            create_packable_rectangle(RectangleId::Text("filler2".to_string()), 90.0, 90.0),
        ];
        let mut options = create_bin_pack_options();
        options.max_width = 100.0;
        options.max_height = 100.0;
        options.growable = false;
        let explanations = explain_unpacked_rectangles(&rects, Some(&options));
        let mut by_id: HashMap<String, UnpackedRectangleReason> = HashMap::new();
        for e in &explanations {
            by_id.insert(e.id.to_string(), e.reason);
        }
        assert_eq!(
            by_id.get("huge"),
            Some(&UnpackedRectangleReason::Oversized)
        );
        assert_eq!(
            by_id.get("filler2"),
            Some(&UnpackedRectangleReason::BinExhausted)
        );
    }

    #[test]
    fn blames_the_collapsed_region_rather_than_the_pieces_when_border_eats_the_caps() {
        let rects = vec![
            create_packable_rectangle(RectangleId::Text("a".to_string()), 2.0, 2.0),
            create_packable_rectangle(RectangleId::Text("b".to_string()), 2.0, 2.0),
        ];
        let mut options = create_bin_pack_options();
        options.max_width = 10.0;
        options.max_height = 10.0;
        options.border = 6.0;
        options.growable = false;
        let explanations = explain_unpacked_rectangles(&rects, Some(&options));
        let reasons: Vec<UnpackedRectangleReason> = explanations.iter().map(|e| e.reason).collect();
        assert_eq!(
            reasons,
            vec![
                UnpackedRectangleReason::RegionCollapsed,
                UnpackedRectangleReason::RegionCollapsed,
            ]
        );
        assert!(explanations[0].usable_width <= 0.0);
    }

    #[test]
    fn counts_rotation_as_a_real_second_chance_before_calling_a_piece_oversized() {
        let rects = vec![create_packable_rectangle(
            RectangleId::Text("tall".to_string()),
            10.0,
            200.0,
        )];
        let mut options = create_bin_pack_options();
        options.max_width = 300.0;
        options.max_height = 100.0;
        options.growable = false;
        let without_rotation = explain_unpacked_rectangles(&rects, Some(&options));
        assert_eq!(
            without_rotation[0].reason,
            UnpackedRectangleReason::Oversized
        );

        let mut options_rotated = create_bin_pack_options();
        options_rotated.max_width = 300.0;
        options_rotated.max_height = 100.0;
        options_rotated.growable = false;
        options_rotated.allow_rotation = true;
        let with_rotation = explain_unpacked_rectangles(&rects, Some(&options_rotated));
        assert!(with_rotation.is_empty());
    }

    #[test]
    fn reports_the_usable_extent_it_measured_against_net_of_border() {
        let rects = vec![create_packable_rectangle(
            RectangleId::Text("a".to_string()),
            999.0,
            4.0,
        )];
        let mut options = create_bin_pack_options();
        options.max_width = 100.0;
        options.max_height = 100.0;
        options.border = 5.0;
        options.growable = false;
        let explanations = explain_unpacked_rectangles(&rects, Some(&options));
        assert_eq!(explanations[0].id, RectangleId::Text("a".to_string()));
        assert_eq!(explanations[0].usable_width, 90.0);
        assert_eq!(explanations[0].usable_height, 90.0);
    }

    #[test]
    fn returns_exactly_one_entry_per_unpacked_piece_when_two_rectangles_share_an_id() {
        let rects = vec![
            create_packable_rectangle(RectangleId::Text("a".to_string()), 60.0, 60.0),
            create_packable_rectangle(RectangleId::Text("a".to_string()), 60.0, 60.0),
        ];
        let mut options = create_bin_pack_options();
        options.growable = false;
        options.max_height = 64.0;
        options.max_width = 64.0;

        let result = pack_rectangles(&rects, Some(&options));
        assert_eq!(result.placements.len(), 1);
        assert_eq!(result.unpacked, vec![RectangleId::Text("a".to_string())]);

        let explanations = explain_unpacked_rectangles(&rects, Some(&options));
        assert_eq!(explanations.len(), 1);
    }

    #[test]
    fn returns_one_entry_per_failure_when_both_duplicates_fail() {
        let rects = vec![
            create_packable_rectangle(RectangleId::Text("a".to_string()), 500.0, 500.0),
            create_packable_rectangle(RectangleId::Text("a".to_string()), 500.0, 500.0),
        ];
        let mut options = create_bin_pack_options();
        options.growable = false;
        options.max_height = 64.0;
        options.max_width = 64.0;

        let result = pack_rectangles(&rects, Some(&options));
        assert_eq!(
            result.unpacked,
            vec![
                RectangleId::Text("a".to_string()),
                RectangleId::Text("a".to_string()),
            ]
        );

        let explanations = explain_unpacked_rectangles(&rects, Some(&options));
        assert_eq!(explanations.len(), 2);
    }

    #[test]
    fn agrees_with_pack_rectangles_across_seeded_inputs_counting_ids_rather_than_assuming_uniqueness(
    ) {
        for seed in (1..=30_i32).step_by(1) {
            let mut rng = make_random(seed);
            let count = 1 + (next_random(&mut rng) * 12.0).floor() as i32;
            let mut rects: Vec<PackableRectangle> = Vec::new();
            for index in 0..count {
                let id_str = if seed % 2 == 0 {
                    format!("id-{}", index % 3)
                } else {
                    format!("id-{}", index)
                };
                rects.push(create_packable_rectangle(
                    RectangleId::Text(id_str),
                    1.0 + (next_random(&mut rng) * 80.0).floor(),
                    1.0 + (next_random(&mut rng) * 80.0).floor(),
                ));
            }
            let mut options = create_bin_pack_options();
            options.growable = false;
            options.max_height = 96.0;
            options.max_width = 96.0;
            let label = format!("seed {}", seed);

            let unpacked = pack_rectangles(&rects, Some(&options)).unpacked;
            let explained = explain_unpacked_rectangles(&rects, Some(&options));

            assert_eq!(explained.len(), unpacked.len(), "{}", label);
            let explained_ids: Vec<RectangleId> = explained.iter().map(|e| e.id.clone()).collect();
            assert_eq!(
                count_by_id(&explained_ids),
                count_by_id(&unpacked),
                "{}",
                label
            );
        }
    }
}

mod initialize_unpacked_rectangle_explanation {
    use super::*;

    #[test]
    fn writes_all_fields_to_the_out_parameter() {
        let mut out = create_unpacked_rectangle_explanation(
            RectangleId::Number(0),
            UnpackedRectangleReason::BinExhausted,
            0.0,
            0.0,
        );
        initialize_unpacked_rectangle_explanation(
            &mut out,
            RectangleId::Text("updated".to_string()),
            UnpackedRectangleReason::RegionCollapsed,
            50.0,
            60.0,
        );
        assert_eq!(out.id, RectangleId::Text("updated".to_string()));
        assert_eq!(out.reason, UnpackedRectangleReason::RegionCollapsed);
        assert_eq!(out.usable_width, 50.0);
        assert_eq!(out.usable_height, 60.0);
    }
}
