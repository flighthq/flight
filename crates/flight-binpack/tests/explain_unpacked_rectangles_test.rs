use flight_binpack::contract::*;
use std::collections::HashMap;

// D24 out collector: each call fills a fresh caller-owned Vec.
fn explain(
    rectangles: &[PackableRectangle],
    options: Option<&BinPackOptions>,
) -> Vec<UnpackedRectangleExplanation> {
    let mut out = Vec::new();
    explain_unpacked_rectangles(&mut out, rectangles, options);
    return out;
}

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

mod explain_unpacked_rectangles {
    use super::*;

    #[test]
    fn clears_a_reused_out_and_keeps_its_capacity() {
        let rectangle = PackableRectangle {
            id: RectangleId::Text("a".to_string()),
            width: 8.0,
            height: 8.0,
        };
        let mut out = Vec::with_capacity(8);
        out.push(UnpackedRectangleExplanation {
            id: RectangleId::Text("stale".to_string()),
            reason: UnpackedRectangleReason::Oversized,
            usable_width: 0.0,
            usable_height: 0.0,
        });

        explain_unpacked_rectangles(&mut out, &[rectangle], None);

        assert!(out.is_empty());
        assert!(out.capacity() >= 8);
    }

    #[test]
    fn returns_nothing_when_everything_was_placed() {
        let result = explain(
            &[PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 8.0,
                height: 8.0,
            }],
            None,
        );
        assert!(result.is_empty());
    }

    #[test]
    fn separates_oversized_from_bin_exhausted_which_have_different_remedies() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("huge".to_string()),
                width: 500.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Text("filler".to_string()),
                width: 90.0,
                height: 90.0,
            },
            PackableRectangle {
                id: RectangleId::Text("filler2".to_string()),
                width: 90.0,
                height: 90.0,
            },
        ];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.max_width = Some(100.0);
        options.max_height = Some(100.0);
        options.growable = Some(false);
        let explanations = explain(&rects, Some(&options));
        let mut by_id: HashMap<String, UnpackedRectangleReason> = HashMap::new();
        for e in &explanations {
            by_id.insert(e.id.to_string(), e.reason);
        }
        assert_eq!(by_id.get("huge"), Some(&UnpackedRectangleReason::Oversized));
        assert_eq!(
            by_id.get("filler2"),
            Some(&UnpackedRectangleReason::BinExhausted)
        );
    }

    #[test]
    fn blames_the_collapsed_region_rather_than_the_pieces_when_border_eats_the_caps() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 2.0,
                height: 2.0,
            },
            PackableRectangle {
                id: RectangleId::Text("b".to_string()),
                width: 2.0,
                height: 2.0,
            },
        ];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.max_width = Some(10.0);
        options.max_height = Some(10.0);
        options.border = Some(6.0);
        options.growable = Some(false);
        let explanations = explain(&rects, Some(&options));
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
        let rects = vec![PackableRectangle {
            id: RectangleId::Text("tall".to_string()),
            width: 10.0,
            height: 200.0,
        }];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.max_width = Some(300.0);
        options.max_height = Some(100.0);
        options.growable = Some(false);
        let without_rotation = explain(&rects, Some(&options));
        assert_eq!(
            without_rotation[0].reason,
            UnpackedRectangleReason::Oversized
        );

        let mut options_rotated = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options_rotated.max_width = Some(300.0);
        options_rotated.max_height = Some(100.0);
        options_rotated.growable = Some(false);
        options_rotated.allow_rotation = Some(true);
        let with_rotation = explain(&rects, Some(&options_rotated));
        assert!(with_rotation.is_empty());
    }

    #[test]
    fn reports_the_usable_extent_it_measured_against_net_of_border() {
        let rects = vec![PackableRectangle {
            id: RectangleId::Text("a".to_string()),
            width: 999.0,
            height: 4.0,
        }];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.max_width = Some(100.0);
        options.max_height = Some(100.0);
        options.border = Some(5.0);
        options.growable = Some(false);
        let explanations = explain(&rects, Some(&options));
        assert_eq!(explanations[0].id, RectangleId::Text("a".to_string()));
        assert_eq!(explanations[0].usable_width, 90.0);
        assert_eq!(explanations[0].usable_height, 90.0);
    }

    #[test]
    fn returns_exactly_one_entry_per_unpacked_piece_when_two_rectangles_share_an_id() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 60.0,
                height: 60.0,
            },
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 60.0,
                height: 60.0,
            },
        ];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.growable = Some(false);
        options.max_height = Some(64.0);
        options.max_width = Some(64.0);

        let result = pack_rectangles(&rects, Some(&options));
        assert_eq!(result.placements.len(), 1);
        assert_eq!(result.unpacked, vec![RectangleId::Text("a".to_string())]);

        let explanations = explain(&rects, Some(&options));
        assert_eq!(explanations.len(), 1);
    }

    #[test]
    fn returns_one_entry_per_failure_when_both_duplicates_fail() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 500.0,
                height: 500.0,
            },
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 500.0,
                height: 500.0,
            },
        ];
        let mut options = BinPackOptions {
            padding: Some(0.0),
            border: Some(0.0),
            allow_rotation: Some(false),
            heuristic: Some(BinPackHeuristic::BestShortSideFit),
            growable: Some(true),
            power_of_two: Some(false),
            square: Some(false),
            max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
        };
        options.growable = Some(false);
        options.max_height = Some(64.0);
        options.max_width = Some(64.0);

        let result = pack_rectangles(&rects, Some(&options));
        assert_eq!(
            result.unpacked,
            vec![
                RectangleId::Text("a".to_string()),
                RectangleId::Text("a".to_string()),
            ]
        );

        let explanations = explain(&rects, Some(&options));
        assert_eq!(explanations.len(), 2);
    }

    #[test]
    fn agrees_with_pack_rectangles_across_seeded_inputs_counting_ids_rather_than_assuming_uniqueness()
     {
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
                rects.push(PackableRectangle {
                    id: RectangleId::Text(id_str),
                    width: 1.0 + (next_random(&mut rng) * 80.0).floor(),
                    height: 1.0 + (next_random(&mut rng) * 80.0).floor(),
                });
            }
            let mut options = BinPackOptions {
                padding: Some(0.0),
                border: Some(0.0),
                allow_rotation: Some(false),
                heuristic: Some(BinPackHeuristic::BestShortSideFit),
                growable: Some(true),
                power_of_two: Some(false),
                square: Some(false),
                max_width: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
                max_height: Some(BIN_PACK_DEFAULT_MAX_EXTENT),
            };
            options.growable = Some(false);
            options.max_height = Some(96.0);
            options.max_width = Some(96.0);
            let label = format!("seed {}", seed);

            let unpacked = pack_rectangles(&rects, Some(&options)).unpacked;
            let explained = explain(&rects, Some(&options));

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

mod get_unpacked_rectangle_reason_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_unpacked_rectangle_reason_string(UnpackedRectangleReason::Oversized),
            "oversized"
        );
        assert_eq!(
            get_unpacked_rectangle_reason_string(UnpackedRectangleReason::RegionCollapsed),
            "regionCollapsed"
        );
        assert_eq!(
            get_unpacked_rectangle_reason_string(UnpackedRectangleReason::BinExhausted),
            "binExhausted"
        );
    }
}

mod parse_unpacked_rectangle_reason {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_unpacked_rectangle_reason("oversized"),
            Some(UnpackedRectangleReason::Oversized)
        );
        assert_eq!(
            parse_unpacked_rectangle_reason("regionCollapsed"),
            Some(UnpackedRectangleReason::RegionCollapsed)
        );
        assert_eq!(
            parse_unpacked_rectangle_reason("binExhausted"),
            Some(UnpackedRectangleReason::BinExhausted)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_unpacked_rectangle_reason("Oversized"), None);
        assert_eq!(parse_unpacked_rectangle_reason("binexhausted"), None);
        assert_eq!(parse_unpacked_rectangle_reason(""), None);
    }
}
