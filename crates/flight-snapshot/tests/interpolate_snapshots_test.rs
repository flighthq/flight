use flight_entity::{Record, get_record_value, has_record_key, set_record_value};
use flight_snapshot::contract::*;

use crate::support::*;

fn schema(paths: &[&str]) -> SnapshotSchema {
    return paths.iter().map(|path| path.to_string()).collect();
}

fn body(x: f32, y: f32, hp: f32, name: &str) -> Body {
    return Body {
        pos: Point { x, y },
        hp,
        name: name.to_string(),
    };
}

fn record(entries: &[(&str, f32)]) -> Record<f32> {
    let make: fn() -> Record<f32> = Record::default;
    let mut out = make();
    for (key, value) in entries {
        set_record_value(&mut out, key.to_string(), *value);
    }
    return out;
}

mod interpolate_snapshot_field {
    use super::*;

    #[test]
    fn joins_the_field_onto_the_container_path() {
        let g = guards();
        let a = capture_snapshot(&g, &body(0.0, 0.0, 0.0, ""));
        let b = capture_snapshot(&g, &body(100.0, 200.0, 0.0, ""));
        let mut out = body(0.0, 0.0, 0.0, "");
        interpolate_snapshots(&a, &b, 0.5, &mut out, Some(&schema(&["pos.y"])));
        assert_eq!(out.pos, Point { x: 100.0, y: 100.0 });
    }
}

mod interpolate_snapshots {
    use super::*;

    #[test]
    fn lerps_numerics_and_snaps_the_string_at_half() {
        let g = guards();
        let a = capture_snapshot(&g, &body(0.0, 10.0, 0.0, "a"));
        let b = capture_snapshot(&g, &body(10.0, 0.0, 0.0, "b"));
        let mut out = body(0.0, 0.0, 0.0, "");
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out, body(5.0, 5.0, 0.0, "b"));
    }

    #[test]
    fn returns_a_numerics_at_zero_and_b_numerics_at_one() {
        let g = guards();
        let a = capture_snapshot(&g, &Point { x: 0.0, y: 10.0 });
        let b = capture_snapshot(&g, &Point { x: 10.0, y: 0.0 });
        let mut at_start = Point { x: -1.0, y: -1.0 };
        let mut at_end = Point { x: -1.0, y: -1.0 };
        interpolate_snapshots(&a, &b, 0.0, &mut at_start, None);
        interpolate_snapshots(&a, &b, 1.0, &mut at_end, None);
        assert_eq!(at_start, Point { x: 0.0, y: 10.0 });
        assert_eq!(at_end, Point { x: 10.0, y: 0.0 });
    }

    #[test]
    fn interpolates_only_dotted_path_schema_listed_nested_fields() {
        let g = guards();
        let a = capture_snapshot(&g, &body(0.0, 0.0, 100.0, ""));
        let b = capture_snapshot(&g, &body(100.0, 200.0, 0.0, ""));
        let mut out = body(0.0, 0.0, 0.0, "");
        interpolate_snapshots(&a, &b, 0.5, &mut out, Some(&schema(&["pos.x"])));
        assert_eq!(out.pos.x, 50.0);
        assert_eq!(out.pos.y, 200.0);
        assert_eq!(out.hp, 0.0);
    }

    #[test]
    fn interpolates_only_schema_listed_paths_and_snaps_the_rest_to_b() {
        let g = guards();
        let a = capture_snapshot(&g, &Point { x: 0.0, y: 10.0 });
        let b = capture_snapshot(&g, &Point { x: 10.0, y: 0.0 });
        let mut out = Point { x: 0.0, y: 0.0 };
        interpolate_snapshots(&a, &b, 0.5, &mut out, Some(&schema(&["x"])));
        assert_eq!(out, Point { x: 5.0, y: 0.0 });
    }

    #[test]
    fn lerps_nested_numeric_fields() {
        let g = guards();
        let a = capture_snapshot(&g, &body(0.0, 0.0, 0.0, ""));
        let b = capture_snapshot(&g, &body(100.0, 40.0, 0.0, ""));
        let mut out = body(0.0, 0.0, 0.0, "");
        interpolate_snapshots(&a, &b, 0.25, &mut out, None);
        assert_eq!(out.pos, Point { x: 25.0, y: 10.0 });
    }

    #[test]
    fn assigns_keys_present_only_in_b_and_ignores_keys_present_only_in_a() {
        let g = guards();
        let a = capture_snapshot(&g, &record(&[("x", 10.0), ("onlyA", 99.0)]));
        let b = capture_snapshot(&g, &record(&[("x", 20.0), ("onlyB", 7.0)]));
        let mut out = record(&[("x", 0.0), ("extra", 5.0)]);
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(get_record_value(&out, "x"), Some(&15.0));
        assert_eq!(get_record_value(&out, "onlyB"), Some(&7.0));
        assert!(!has_record_key(&out, "onlyA"));
        assert_eq!(get_record_value(&out, "extra"), Some(&5.0));
    }

    #[test]
    fn clamps_t_below_zero_and_above_one() {
        let g = guards();
        let a = capture_snapshot(&g, &Point { x: 0.0, y: 0.0 });
        let b = capture_snapshot(&g, &Point { x: 10.0, y: 0.0 });
        let mut under = Point { x: -1.0, y: 0.0 };
        let mut over = Point { x: -1.0, y: 0.0 };
        interpolate_snapshots(&a, &b, -5.0, &mut under, None);
        interpolate_snapshots(&a, &b, 5.0, &mut over, None);
        assert_eq!(under.x, 0.0);
        assert_eq!(over.x, 10.0);
    }

    #[test]
    fn lerps_arrays_of_numbers_element_wise() {
        let g = guards();
        let a = capture_snapshot(&g, &vec![0.0_f32, 100.0]);
        let b = capture_snapshot(&g, &vec![10.0_f32, 0.0]);
        let mut out = vec![0.0_f32, 0.0];
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out, vec![5.0, 50.0]);
    }

    #[test]
    fn resizes_arrays_to_b_and_snaps_elements_missing_from_a() {
        let g = guards();
        let a = capture_snapshot(&g, &vec![0.0_f32]);
        let b = capture_snapshot(&g, &vec![10.0_f32, 20.0, 30.0]);
        let mut out = vec![-1.0_f32; 5];
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out, vec![5.0, 20.0, 30.0]);
    }

    #[test]
    fn snaps_a_null_field_to_b() {
        #[derive(Clone, Debug, PartialEq)]
        struct Tagged {
            value: f32,
            tag: Option<f32>,
        }
        impl SnapshotInterpolate for Tagged {
            fn interpolate_snapshot(
                out: &mut Self,
                a: &Self,
                b: &Self,
                interpolation: &SnapshotInterpolation,
                path: &str,
            ) {
                interpolate_snapshot_field(
                    &mut out.value,
                    &a.value,
                    &b.value,
                    interpolation,
                    path,
                    "value",
                );
                interpolate_snapshot_field(
                    &mut out.tag,
                    &a.tag,
                    &b.tag,
                    interpolation,
                    path,
                    "tag",
                );
            }
            fn is_snapshot_container() -> bool {
                return true;
            }
        }
        let g = guards();
        let a = capture_snapshot(
            &g,
            &Tagged {
                value: 1.0,
                tag: None,
            },
        );
        let b = capture_snapshot(
            &g,
            &Tagged {
                value: 3.0,
                tag: None,
            },
        );
        let mut out = Tagged {
            value: 0.0,
            tag: Some(7.0),
        };
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out.value, 2.0);
        assert_eq!(out.tag, None);
        // A number in both snapshots interpolates through the Option.
        let c = capture_snapshot(
            &g,
            &Tagged {
                value: 0.0,
                tag: Some(10.0),
            },
        );
        interpolate_snapshots(
            &c,
            &capture_snapshot(
                &g,
                &Tagged {
                    value: 0.0,
                    tag: Some(20.0),
                },
            ),
            0.5,
            &mut out,
            None,
        );
        assert_eq!(out.tag, Some(15.0));
    }

    #[test]
    fn is_a_no_op_for_a_top_level_non_container() {
        let g = guards();
        let mut out = 1.0_f32;
        interpolate_snapshots(
            &capture_snapshot(&g, &0.0_f32),
            &capture_snapshot(&g, &10.0_f32),
            0.5,
            &mut out,
            None,
        );
        assert_eq!(out, 1.0);
    }

    #[test]
    fn interpolates_only_the_array_indexed_path_listed_in_the_schema() {
        let g = guards();
        let roster = |health: f32| Roster {
            players: vec![Player { health }, Player { health }],
        };
        let a = capture_snapshot(&g, &roster(0.0));
        let b = capture_snapshot(&g, &roster(100.0));
        let mut out = roster(0.0);
        interpolate_snapshots(&a, &b, 0.5, &mut out, Some(&schema(&["players.0.health"])));
        assert_eq!(out.players[0].health, 50.0);
        assert_eq!(out.players[1].health, 100.0);
    }

    #[test]
    fn treats_an_empty_schema_as_interpolate_nothing() {
        let g = guards();
        let a = capture_snapshot(&g, &Player { health: 0.0 });
        let b = capture_snapshot(&g, &Player { health: 100.0 });
        let mut out = Player { health: 0.0 };
        interpolate_snapshots(&a, &b, 0.5, &mut out, Some(&schema(&[])));
        assert_eq!(out.health, 100.0);
    }

    #[test]
    fn interpolates_every_numeric_leaf_when_no_schema_is_given() {
        let g = guards();
        let a = capture_snapshot(&g, &Point { x: 0.0, y: 0.0 });
        let b = capture_snapshot(&g, &Point { x: 100.0, y: 50.0 });
        let mut out = Point { x: 0.0, y: 0.0 };
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out, Point { x: 50.0, y: 25.0 });
    }

    #[test]
    fn interpolates_into_an_out_object_that_is_later_restored_into() {
        let g = guards();
        let a = capture_snapshot(&g, &body(0.0, 0.0, 0.0, "a"));
        let b = capture_snapshot(&g, &body(10.0, 20.0, 0.0, "b"));
        let mut live = body(0.0, 0.0, 0.0, "a");
        interpolate_snapshots(&a, &b, 0.5, &mut live, None);
        assert_eq!(live.pos, Point { x: 5.0, y: 10.0 });
        assert_eq!(live.name, "b");
        restore_snapshot(&a, &mut live);
        assert_eq!(live.pos, Point { x: 0.0, y: 0.0 });
        assert_eq!(live.name, "a");
    }

    #[test]
    fn lerps_f64_leaves_in_double_precision() {
        let g = guards();
        let a = capture_snapshot(&g, &vec![1.0e15_f64]);
        let b = capture_snapshot(&g, &vec![1.0e15_f64 + 2.0]);
        let mut out = vec![0.0_f64];
        interpolate_snapshots(&a, &b, 0.5, &mut out, None);
        assert_eq!(out[0], 1.0e15 + 1.0);
    }
}
