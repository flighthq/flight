use flight_binpack::contract::*;
use flight_binpack::*;
use std::collections::HashMap;

fn is_power_of_two(value: f32) -> bool {
    let v = value as i32;
    return v > 0 && (v & (v - 1)) == 0;
}

fn rectangles_overlap(a: &PackedRectangle, b: &PackedRectangle) -> bool {
    return !(a.x + a.width <= b.x
        || b.x + b.width <= a.x
        || a.y + a.height <= b.y
        || b.y + b.height <= a.y);
}

fn count_ids(ids: &[RectangleId]) -> HashMap<String, i32> {
    let mut counts: HashMap<String, i32> = HashMap::new();
    for id in ids {
        let key = id.to_string();
        *counts.entry(key).or_insert(0) += 1;
    }
    return counts;
}

struct Random {
    state: u32,
}

fn make_random(seed: u32) -> Random {
    return Random { state: seed };
}

fn next_random(rng: &mut Random) -> f32 {
    rng.state = rng.state.wrapping_mul(1664525).wrapping_add(1013904223);
    return rng.state as f32 / 4294967296.0;
}

mod get_bin_pack_heuristic_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(
            get_bin_pack_heuristic_string(BinPackHeuristic::BestShortSideFit),
            "bestShortSideFit"
        );
        assert_eq!(
            get_bin_pack_heuristic_string(BinPackHeuristic::BestAreaFit),
            "bestAreaFit"
        );
    }
}

mod get_pack_result_occupancy {
    use super::*;

    #[test]
    fn reports_covered_fraction_of_the_reported_extent_so_rounding_waste_is_visible() {
        let exact = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 16.0,
                height: 16.0,
            }],
            None,
        );
        assert_eq!(get_pack_result_occupancy(&exact), 1.0);

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
        options.power_of_two = Some(true);
        let rounded = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 24.0,
                height: 24.0,
            }],
            Some(&options),
        );
        assert_eq!(rounded.width, 32.0);
        let expected_occupancy = (24.0 * 24.0) / (32.0 * 32.0);
        let actual_occupancy = get_pack_result_occupancy(&rounded);
        let diff = (actual_occupancy - expected_occupancy).abs();
        // TS `toBeCloseTo(expected, 10)`: abs diff < 0.5e-10.
        assert!(
            diff < 0.5e-10,
            "expected {}, got {} (diff: {})",
            expected_occupancy,
            actual_occupancy,
            diff
        );
    }

    #[test]
    fn returns_zero_rather_than_nan_for_an_empty_result_since_nothing_packed_is_expected() {
        let empty = pack_rectangles(&[], None);
        assert_eq!(empty.width * empty.height, 0.0);
        assert_eq!(get_pack_result_occupancy(&empty), 0.0);
    }
}

mod pack_rectangles {
    use super::*;

    #[test]
    fn bin_pack_default_max_extent_is_the_cap_the_packer_actually_applies_when_the_caller_names_none()
     {
        let over = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("over".to_string()),
                width: BIN_PACK_DEFAULT_MAX_EXTENT + 1.0,
                height: 4.0,
            }],
            None,
        );
        assert_eq!(over.unpacked, vec![RectangleId::Text("over".to_string())]);

        let at = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("at".to_string()),
                width: BIN_PACK_DEFAULT_MAX_EXTENT,
                height: 4.0,
            }],
            None,
        );
        assert!(at.unpacked.is_empty());
    }

    #[test]
    fn places_varied_rectangles_with_no_pairwise_overlap_inside_the_bin_at_their_input_size() {
        let mut rects: Vec<PackableRectangle> = Vec::new();
        for i in 0..20 {
            rects.push(PackableRectangle {
                id: RectangleId::Number(i),
                width: 8.0 + ((i * 7) % 40) as f32,
                height: 6.0 + ((i * 13) % 34) as f32,
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
        options.padding = Some(1.0);
        options.border = Some(2.0);
        let result = pack_rectangles(&rects, Some(&options));
        assert!(result.unpacked.is_empty());
        assert_eq!(result.placements.len(), 20);

        let mut size_by_id: HashMap<RectangleId, (f32, f32)> = HashMap::new();
        for rect in &rects {
            size_by_id.insert(rect.id.clone(), (rect.width, rect.height));
        }
        for placement in &result.placements {
            let (input_w, input_h) = size_by_id[&placement.id];
            let expected_width = if placement.rotated { input_h } else { input_w };
            let expected_height = if placement.rotated { input_w } else { input_h };
            assert_eq!(placement.width, expected_width);
            assert_eq!(placement.height, expected_height);

            assert!(placement.x >= 2.0);
            assert!(placement.y >= 2.0);
            assert!(placement.x + placement.width <= result.width - 2.0);
            assert!(placement.y + placement.height <= result.height - 2.0);
        }

        for i in 0..result.placements.len() {
            for j in (i + 1)..result.placements.len() {
                assert!(
                    !rectangles_overlap(&result.placements[i], &result.placements[j]),
                    "placements {} and {} overlap",
                    i,
                    j
                );
            }
        }
    }

    #[test]
    fn leaves_nothing_unpacked_when_everything_fits_in_a_growable_bin() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 30.0,
                height: 20.0,
            },
            PackableRectangle {
                id: RectangleId::Text("b".to_string()),
                width: 40.0,
                height: 40.0,
            },
            PackableRectangle {
                id: RectangleId::Text("c".to_string()),
                width: 10.0,
                height: 60.0,
            },
            PackableRectangle {
                id: RectangleId::Text("d".to_string()),
                width: 25.0,
                height: 25.0,
            },
            PackableRectangle {
                id: RectangleId::Text("e".to_string()),
                width: 50.0,
                height: 15.0,
            },
        ];

        let result = pack_rectangles(&rects, None);
        assert!(result.unpacked.is_empty());
        assert_eq!(result.placements.len(), 5);
        for i in 0..result.placements.len() {
            for j in (i + 1)..result.placements.len() {
                assert!(!rectangles_overlap(
                    &result.placements[i],
                    &result.placements[j]
                ));
            }
        }
    }

    #[test]
    fn reports_overflow_ids_in_a_fixed_bin_and_keeps_the_placed_rectangles_non_overlapping() {
        let mut rects: Vec<PackableRectangle> = Vec::new();
        for i in 0..12 {
            rects.push(PackableRectangle {
                id: RectangleId::Number(i),
                width: 20.0,
                height: 20.0,
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
        options.max_width = Some(44.0);
        options.max_height = Some(44.0);
        let result = pack_rectangles(&rects, Some(&options));
        assert!(result.unpacked.len() > 0);
        assert_eq!(result.placements.len() + result.unpacked.len(), 12);
        for i in 0..result.placements.len() {
            for j in (i + 1)..result.placements.len() {
                assert!(!rectangles_overlap(
                    &result.placements[i],
                    &result.placements[j]
                ));
            }
        }
    }

    #[test]
    fn respects_padding_between_neighbors_and_border_at_the_bin_edge() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 10.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Text("b".to_string()),
                width: 10.0,
                height: 10.0,
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
        options.padding = Some(2.0);
        options.border = Some(4.0);
        let result = pack_rectangles(&rects, Some(&options));
        assert!(result.unpacked.is_empty());

        let a = result
            .placements
            .iter()
            .find(|p| p.id == RectangleId::Text("a".to_string()))
            .unwrap();
        let b = result
            .placements
            .iter()
            .find(|p| p.id == RectangleId::Text("b".to_string()))
            .unwrap();
        assert_eq!(
            *a,
            PackedRectangle {
                id: RectangleId::Text("a".to_string()),
                x: 4.0,
                y: 4.0,
                width: 10.0,
                height: 10.0,
                rotated: false
            }
        );
        assert_eq!(
            *b,
            PackedRectangle {
                id: RectangleId::Text("b".to_string()),
                x: 16.0,
                y: 4.0,
                width: 10.0,
                height: 10.0,
                rotated: false
            }
        );

        assert_eq!(b.x - (a.x + a.width), 2.0);

        for placement in &result.placements {
            assert!(placement.x >= 4.0);
            assert!(placement.y >= 4.0);
            assert!(placement.x + placement.width <= result.width - 4.0);
            assert!(placement.y + placement.height <= result.height - 4.0);
        }
    }

    #[test]
    fn reports_power_of_two_and_square_extents_that_still_contain_every_placement() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 30.0,
                height: 20.0,
            },
            PackableRectangle {
                id: RectangleId::Text("b".to_string()),
                width: 17.0,
                height: 41.0,
            },
            PackableRectangle {
                id: RectangleId::Text("c".to_string()),
                width: 25.0,
                height: 9.0,
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
        options.power_of_two = Some(true);
        options.square = Some(true);
        let result = pack_rectangles(&rects, Some(&options));
        assert!(is_power_of_two(result.width));
        assert!(is_power_of_two(result.height));
        assert_eq!(result.width, result.height);

        for placement in &result.placements {
            assert!(placement.x + placement.width <= result.width);
            assert!(placement.y + placement.height <= result.height);
        }
    }

    #[test]
    fn rotates_a_rectangle_when_rotation_is_required_to_fit_a_fixed_bin() {
        let rects = vec![PackableRectangle {
            id: RectangleId::Text("tall".to_string()),
            width: 8.0,
            height: 20.0,
        }];

        let mut options_with = BinPackOptions {
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
        options_with.growable = Some(false);
        options_with.max_width = Some(20.0);
        options_with.max_height = Some(8.0);
        options_with.allow_rotation = Some(true);
        let with_rotation = pack_rectangles(&rects, Some(&options_with));
        assert!(with_rotation.unpacked.is_empty());
        assert_eq!(with_rotation.placements.len(), 1);
        let placed = &with_rotation.placements[0];
        assert_eq!(placed.rotated, true);
        assert_eq!(placed.width, 20.0);
        assert_eq!(placed.height, 8.0);

        let mut options_without = BinPackOptions {
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
        options_without.growable = Some(false);
        options_without.max_width = Some(20.0);
        options_without.max_height = Some(8.0);
        options_without.allow_rotation = Some(false);
        let without_rotation = pack_rectangles(&rects, Some(&options_without));
        assert!(without_rotation.placements.is_empty());
        assert_eq!(
            without_rotation.unpacked,
            vec![RectangleId::Text("tall".to_string())]
        );
    }

    #[test]
    fn grows_to_fit_a_rectangle_that_would_need_rotation_in_a_fixed_bin() {
        let rects = vec![PackableRectangle {
            id: RectangleId::Text("tall".to_string()),
            width: 8.0,
            height: 20.0,
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
        options.allow_rotation = Some(false);
        let result = pack_rectangles(&rects, Some(&options));
        assert!(result.unpacked.is_empty());
        assert_eq!(result.placements[0].rotated, false);
        assert_eq!(result.placements[0].width, 8.0);
        assert_eq!(result.placements[0].height, 20.0);
    }

    #[test]
    fn produces_a_deep_equal_result_for_the_same_input_packed_twice() {
        let mut rects: Vec<PackableRectangle> = Vec::new();
        for i in 0..15 {
            rects.push(PackableRectangle {
                id: RectangleId::Text(format!("r{}", i)),
                width: 5.0 + ((i * 11) % 30) as f32,
                height: 5.0 + ((i * 17) % 28) as f32,
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
        options.padding = Some(1.0);
        options.border = Some(3.0);
        options.allow_rotation = Some(true);

        let first = pack_rectangles(&rects, Some(&options));
        let second = pack_rectangles(&rects, Some(&options));
        assert_eq!(second, first);
    }

    #[test]
    fn returns_an_empty_result_with_a_zero_size_bin_for_empty_input() {
        let result = pack_rectangles(&[], None);
        assert_eq!(result.placements.len(), 0);
        assert_eq!(result.width, 0.0);
        assert_eq!(result.height, 0.0);
        assert_eq!(result.unpacked.len(), 0);
    }

    #[test]
    fn packs_a_single_rectangle_at_the_border_corner() {
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
        options.border = Some(3.0);
        let result = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("only".to_string()),
                width: 12.0,
                height: 7.0,
            }],
            Some(&options),
        );
        assert!(result.unpacked.is_empty());
        assert_eq!(result.placements.len(), 1);
        assert_eq!(
            result.placements[0],
            PackedRectangle {
                id: RectangleId::Text("only".to_string()),
                x: 3.0,
                y: 3.0,
                width: 12.0,
                height: 7.0,
                rotated: false
            }
        );
        assert_eq!(result.width, 18.0);
        assert_eq!(result.height, 13.0);
    }

    #[test]
    fn reports_a_rectangle_larger_than_a_fixed_bin_as_unpacked() {
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
        options.max_width = Some(64.0);
        options.max_height = Some(64.0);
        let result = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("big".to_string()),
                width: 500.0,
                height: 500.0,
            }],
            Some(&options),
        );
        assert!(result.placements.is_empty());
        assert_eq!(result.unpacked, vec![RectangleId::Text("big".to_string())]);
    }

    #[test]
    fn reports_a_rectangle_larger_than_the_growth_cap_as_unpacked() {
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
        options.max_width = Some(64.0);
        options.max_height = Some(64.0);
        let result = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("huge".to_string()),
                width: 200.0,
                height: 10.0,
            }],
            Some(&options),
        );
        assert_eq!(result.unpacked, vec![RectangleId::Text("huge".to_string())]);
    }

    #[test]
    fn rejects_zero_and_negative_dimensions_to_unpacked_rather_than_placing_a_degenerate_rect() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("zeroW".to_string()),
                width: 0.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Text("zeroH".to_string()),
                width: 10.0,
                height: 0.0,
            },
            PackableRectangle {
                id: RectangleId::Text("negative".to_string()),
                width: -8.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Text("ok".to_string()),
                width: 10.0,
                height: 10.0,
            },
        ];
        let result = pack_rectangles(&rects, None);
        assert_eq!(result.placements.len(), 1);
        assert_eq!(result.placements[0].id, RectangleId::Text("ok".to_string()));
        let mut unpacked_strings: Vec<String> =
            result.unpacked.iter().map(|id| id.to_string()).collect();
        unpacked_strings.sort();
        assert_eq!(unpacked_strings, vec!["negative", "zeroH", "zeroW"]);
    }

    #[test]
    fn round_trips_negative_numeric_ids_through_placements_and_unpacked() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Number(-7),
                width: 10.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Number(-2),
                width: 10.0,
                height: 10.0,
            },
        ];
        let result = pack_rectangles(&rects, None);
        let mut ids: Vec<i32> = Vec::new();
        for placement in &result.placements {
            if let RectangleId::Number(id) = &placement.id {
                ids.push(*id);
            }
        }
        ids.sort();
        assert_eq!(ids, vec![-7, -2]);

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
        options.max_width = Some(5.0);
        options.max_height = Some(5.0);
        let fixed = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Number(-9),
                width: 20.0,
                height: 20.0,
            }],
            Some(&options),
        );
        assert_eq!(fixed.unpacked, vec![RectangleId::Number(-9)]);
    }

    #[test]
    fn treats_duplicate_ids_as_distinct_rectangles_placing_both_without_overlap() {
        let rects = vec![
            PackableRectangle {
                id: RectangleId::Text("same".to_string()),
                width: 10.0,
                height: 10.0,
            },
            PackableRectangle {
                id: RectangleId::Text("same".to_string()),
                width: 10.0,
                height: 10.0,
            },
        ];
        let result = pack_rectangles(&rects, None);
        assert_eq!(result.placements.len(), 2);
        let a = &result.placements[0];
        let b = &result.placements[1];
        assert!(a.x != b.x || a.y != b.y);
    }

    #[test]
    fn places_non_integer_sizes_without_rounding_them() {
        let result = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("frac".to_string()),
                width: 10.5,
                height: 4.25,
            }],
            None,
        );
        assert_eq!(result.placements[0].width, 10.5);
        assert_eq!(result.placements[0].height, 4.25);
    }

    #[test]
    fn sends_everything_to_unpacked_when_border_collapses_the_usable_region() {
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
        let result = pack_rectangles(
            &[PackableRectangle {
                id: RectangleId::Text("a".to_string()),
                width: 4.0,
                height: 4.0,
            }],
            Some(&options),
        );
        assert!(result.placements.is_empty());
        assert_eq!(result.unpacked, vec![RectangleId::Text("a".to_string())]);
    }

    #[test]
    fn keeps_padding_larger_than_the_pieces_from_overlapping_them() {
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
        options.padding = Some(20.0);
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
        let result = pack_rectangles(&rects, Some(&options));
        assert_eq!(result.placements.len(), 2);
        let a = &result.placements[0];
        let b = &result.placements[1];
        let gap_x = (a.x - b.x).abs() >= 2.0 + 20.0;
        let gap_y = (a.y - b.y).abs() >= 2.0 + 20.0;
        assert!(gap_x || gap_y);
    }

    #[test]
    fn holds_its_invariants_across_40_seeded_inputs_and_both_heuristics() {
        for seed in 1..=40_i32 {
            let mut rng = make_random(seed as u32);
            let count = 1 + (next_random(&mut rng) * 25.0).floor() as i32;
            let mut rects: Vec<PackableRectangle> = Vec::new();
            for i in 0..count {
                let id = if seed % 5 == 0 { i % 3 } else { i };
                let mut size = make_random((seed * 1000 + id) as u32);
                rects.push(PackableRectangle {
                    id: RectangleId::Number(id),
                    width: 1.0 + (next_random(&mut size) * 60.0).floor(),
                    height: 1.0 + (next_random(&mut size) * 60.0).floor(),
                });
            }
            let padding = (next_random(&mut rng) * 4.0).floor();
            let border = (next_random(&mut rng) * 4.0).floor();
            let heuristic = if seed % 2 == 0 {
                BinPackHeuristic::BestAreaFit
            } else {
                BinPackHeuristic::BestShortSideFit
            };
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
            options.padding = Some(padding);
            options.border = Some(border);
            options.heuristic = Some(heuristic);
            options.allow_rotation = Some(seed % 3 == 0);

            let result = pack_rectangles(&rects, Some(&options));
            let label = format!("seed {} ({:?})", seed, heuristic);

            assert_eq!(
                result.placements.len() + result.unpacked.len(),
                rects.len(),
                "{}",
                label
            );

            let mut result_ids: Vec<RectangleId> = Vec::new();
            for p in &result.placements {
                result_ids.push(p.id.clone());
            }
            for u in &result.unpacked {
                result_ids.push(u.clone());
            }
            let input_ids: Vec<RectangleId> = rects.iter().map(|r| r.id.clone()).collect();
            assert_eq!(count_ids(&result_ids), count_ids(&input_ids), "{}", label);

            let mut sizes: HashMap<i32, (f32, f32)> = HashMap::new();
            for rect in &rects {
                if let RectangleId::Number(n) = &rect.id {
                    sizes.insert(*n, (rect.width, rect.height));
                }
            }
            for placement in &result.placements {
                if let RectangleId::Number(n) = &placement.id {
                    let (source_width, source_height) = sizes[n];
                    let (expected_width, expected_height) = if placement.rotated {
                        (source_height, source_width)
                    } else {
                        (source_width, source_height)
                    };
                    assert_eq!(placement.width, expected_width, "{}: {}", label, n);
                    assert_eq!(placement.height, expected_height, "{}: {}", label, n);
                }
            }

            let placed_area: f32 = result.placements.iter().map(|p| p.width * p.height).sum();
            let reported_area = result.width * result.height;
            let expected_occupancy = if reported_area > 0.0 {
                placed_area / reported_area
            } else {
                0.0
            };
            let actual_occupancy = get_pack_result_occupancy(&result);
            let diff = (actual_occupancy - expected_occupancy).abs();
            // TS `toBeCloseTo(expected, 12)`: abs diff < 0.5e-12.
            assert!(
                diff < 0.5e-12,
                "{}: occupancy mismatch: expected {}, got {} (diff: {})",
                label,
                expected_occupancy,
                actual_occupancy,
                diff
            );

            for placement in &result.placements {
                assert!(
                    placement.x >= border,
                    "{}: x {} < border {}",
                    label,
                    placement.x,
                    border
                );
                assert!(
                    placement.y >= border,
                    "{}: y {} < border {}",
                    label,
                    placement.y,
                    border
                );
                assert!(
                    placement.x + placement.width <= result.width - border,
                    "{}: right {} > width - border {}",
                    label,
                    placement.x + placement.width,
                    result.width - border
                );
                assert!(
                    placement.y + placement.height <= result.height - border,
                    "{}: bottom {} > height - border {}",
                    label,
                    placement.y + placement.height,
                    result.height - border
                );
            }

            for i in 0..result.placements.len() {
                for j in (i + 1)..result.placements.len() {
                    let a = &result.placements[i];
                    let b = &result.placements[j];
                    let apart = a.x + a.width + padding <= b.x
                        || b.x + b.width + padding <= a.x
                        || a.y + a.height + padding <= b.y
                        || b.y + b.height + padding <= a.y;
                    assert!(
                        apart,
                        "{}: {} vs {} overlap with padding",
                        label, a.id, b.id
                    );
                }
            }

            let deterministic = pack_rectangles(&rects, Some(&options));
            assert_eq!(deterministic, result, "{}", label);
        }
    }
}

mod parse_bin_pack_heuristic {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_bin_pack_heuristic("bestShortSideFit"),
            Some(BinPackHeuristic::BestShortSideFit)
        );
        assert_eq!(
            parse_bin_pack_heuristic("bestAreaFit"),
            Some(BinPackHeuristic::BestAreaFit)
        );
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_bin_pack_heuristic("bestshortsidefit"), None);
        assert_eq!(parse_bin_pack_heuristic("BestAreaFit"), None);
        assert_eq!(parse_bin_pack_heuristic(""), None);
    }
}
