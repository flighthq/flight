use flight_snapshot::contract::*;

use crate::support::*;

fn schema(paths: &[&str]) -> SnapshotSchema {
    return paths.iter().map(|path| path.to_string()).collect();
}

fn xy(x: f64, y: f64) -> SnapshotValue {
    return obj(vec![("x", num(x)), ("y", num(y))]);
}

mod interpolate_snapshots {
    use super::*;

    #[test]
    fn lerps_numerics_and_snaps_the_string_at_half() {
        let a = capture(&obj(vec![
            ("x", num(0.0)),
            ("y", num(10.0)),
            ("name", text("a")),
        ]));
        let b = capture(&obj(vec![
            ("x", num(10.0)),
            ("y", num(0.0)),
            ("name", text("b")),
        ]));
        let out = obj(vec![("x", num(0.0)), ("y", num(0.0)), ("name", text(""))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(
            &out,
            &obj(vec![("x", num(5.0)), ("y", num(5.0)), ("name", text("b"))])
        ));
    }

    #[test]
    fn returns_a_numerics_at_zero_and_b_numerics_at_one() {
        let (a, b) = (capture(&xy(0.0, 10.0)), capture(&xy(10.0, 0.0)));
        let (at_start, at_end) = (xy(-1.0, -1.0), xy(-1.0, -1.0));
        interpolate_snapshots(&a, &b, 0.0, &at_start, None);
        interpolate_snapshots(&a, &b, 1.0, &at_end, None);
        assert!(to_equal(&at_start, &xy(0.0, 10.0)));
        assert!(to_equal(&at_end, &xy(10.0, 0.0)));
    }

    #[test]
    fn interpolates_only_dotted_path_schema_listed_nested_fields() {
        let a = capture(&obj(vec![("pos", xy(0.0, 0.0)), ("hp", num(100.0))]));
        let b = capture(&obj(vec![("pos", xy(100.0, 200.0)), ("hp", num(0.0))]));
        let out = obj(vec![("pos", xy(0.0, 0.0)), ("hp", num(0.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, Some(&schema(&["pos.x"])));
        assert!(to_equal(&get(&out, "pos.x"), &num(50.0)));
        assert!(to_equal(&get(&out, "pos.y"), &num(200.0)));
        assert!(to_equal(&get(&out, "hp"), &num(0.0)));
    }

    #[test]
    fn interpolates_only_schema_listed_paths_and_snaps_the_rest_to_b() {
        let (a, b) = (capture(&xy(0.0, 10.0)), capture(&xy(10.0, 0.0)));
        let out = xy(0.0, 0.0);
        interpolate_snapshots(&a, &b, 0.5, &out, Some(&schema(&["x"])));
        assert!(to_equal(&out, &xy(5.0, 0.0)));
    }

    #[test]
    fn lerps_nested_numeric_fields() {
        let a = capture(&obj(vec![("pos", xy(0.0, 0.0))]));
        let b = capture(&obj(vec![("pos", xy(100.0, 40.0))]));
        let out = obj(vec![("pos", xy(0.0, 0.0))]);
        interpolate_snapshots(&a, &b, 0.25, &out, None);
        assert!(to_equal(&get(&out, "pos"), &xy(25.0, 10.0)));
    }

    #[test]
    fn assigns_keys_present_only_in_b_and_ignores_keys_present_only_in_a() {
        let a = capture(&obj(vec![("x", num(10.0)), ("onlyA", num(99.0))]));
        let b = capture(&obj(vec![("x", num(20.0)), ("onlyB", text("hello"))]));
        let out = obj(vec![("x", num(0.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(&get(&out, "x"), &num(15.0)));
        assert!(to_equal(&get(&out, "onlyB"), &text("hello")));
        assert!(
            !{
                let mut collected = Vec::new();
                get_snapshot_keys(&mut collected, &out);
                collected
            }
            .contains(&"onlyA".to_string())
        );
    }

    #[test]
    fn clamps_t_below_zero_and_above_one() {
        let (a, b) = (
            capture(&obj(vec![("x", num(0.0))])),
            capture(&obj(vec![("x", num(10.0))])),
        );
        let (under, over) = (obj(vec![("x", num(-1.0))]), obj(vec![("x", num(-1.0))]));
        interpolate_snapshots(&a, &b, -5.0, &under, None);
        interpolate_snapshots(&a, &b, 5.0, &over, None);
        assert!(to_equal(&get(&under, "x"), &num(0.0)));
        assert!(to_equal(&get(&over, "x"), &num(10.0)));
    }

    #[test]
    fn lerps_arrays_of_numbers_element_wise() {
        let a = capture(&obj(vec![("points", nums(&[0.0, 100.0]))]));
        let b = capture(&obj(vec![("points", nums(&[10.0, 0.0]))]));
        let out = obj(vec![("points", nums(&[0.0, 0.0]))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(&get(&out, "points"), &nums(&[5.0, 50.0])));
    }

    #[test]
    fn snaps_to_b_when_a_has_a_number_but_b_has_a_non_number_at_the_same_key() {
        let a = capture(&obj(vec![("x", num(5.0))]));
        let b = capture(&obj(vec![("x", text("hello"))]));
        let out = obj(vec![("x", num(0.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(&get(&out, "x"), &text("hello")));
    }

    #[test]
    fn snaps_a_null_field_to_b() {
        let a = capture(&obj(vec![
            ("value", num(1.0)),
            ("tag", SnapshotValue::Null),
        ]));
        let b = capture(&obj(vec![
            ("value", num(3.0)),
            ("tag", SnapshotValue::Null),
        ]));
        let out = obj(vec![("value", num(0.0)), ("tag", num(7.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(&get(&out, "value"), &num(2.0)));
        assert!(matches!(get(&out, "tag"), SnapshotValue::Null));
    }

    #[test]
    fn snaps_a_container_to_a_mutable_unaliased_clone_of_b() {
        let a = capture(&obj(vec![("data", num(1.0))]));
        let b = capture(&obj(vec![("data", obj(vec![("k", num(2.0))]))]));
        let out = obj(vec![]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(!same(&get(&out, "data"), &get(&b, "data")));
        assert!(!is_snapshot_frozen(&get(&out, "data")));
        assert!(to_equal(&get(&out, "data"), &obj(vec![("k", num(2.0))])));
    }

    #[test]
    fn allocates_a_container_when_out_does_not_mirror_the_shape() {
        let a = capture(&obj(vec![("pos", xy(0.0, 0.0))]));
        let b = capture(&obj(vec![("pos", xy(10.0, 20.0))]));
        let out = obj(vec![("pos", nums(&[1.0]))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(!is_snapshot_array(&get(&out, "pos")));
        assert!(to_equal(&get(&out, "pos"), &xy(5.0, 10.0)));
    }

    #[test]
    fn is_a_no_op_unless_a_b_and_out_are_objects() {
        let out = obj(vec![("x", num(1.0))]);
        interpolate_snapshots(
            &capture(&num(0.0)),
            &capture(&obj(vec![("x", num(9.0))])),
            0.5,
            &out,
            None,
        );
        assert!(to_equal(&out, &obj(vec![("x", num(1.0))])));
    }

    #[test]
    fn interpolates_only_the_array_indexed_path_listed_in_the_schema() {
        let roster = |health: f64| {
            obj(vec![(
                "players",
                arr(vec![
                    obj(vec![("health", num(health))]),
                    obj(vec![("health", num(health))]),
                ]),
            )])
        };
        let (a, b) = (capture(&roster(0.0)), capture(&roster(100.0)));
        let out = roster(0.0);
        interpolate_snapshots(&a, &b, 0.5, &out, Some(&schema(&["players.0.health"])));
        assert!(to_equal(&get(&out, "players.0.health"), &num(50.0)));
        assert!(to_equal(&get(&out, "players.1.health"), &num(100.0)));
    }

    #[test]
    fn treats_an_empty_schema_as_interpolate_nothing_not_interpolate_everything() {
        let (a, b) = (
            capture(&obj(vec![("hp", num(0.0))])),
            capture(&obj(vec![("hp", num(100.0))])),
        );
        let out = obj(vec![("hp", num(0.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, Some(&schema(&[])));
        assert!(to_equal(&get(&out, "hp"), &num(100.0)));
    }

    #[test]
    fn interpolates_every_numeric_leaf_when_no_schema_is_given() {
        let a = capture(&obj(vec![("hp", num(0.0)), ("mp", num(0.0))]));
        let b = capture(&obj(vec![("hp", num(100.0)), ("mp", num(50.0))]));
        let out = obj(vec![("hp", num(0.0)), ("mp", num(0.0))]);
        interpolate_snapshots(&a, &b, 0.5, &out, None);
        assert!(to_equal(&get(&out, "hp"), &num(50.0)));
        assert!(to_equal(&get(&out, "mp"), &num(25.0)));
    }

    #[test]
    fn interpolates_into_an_out_object_that_is_later_restored_into() {
        let a = capture(&obj(vec![("pos", xy(0.0, 0.0)), ("tag", text("a"))]));
        let b = capture(&obj(vec![("pos", xy(10.0, 20.0)), ("tag", text("b"))]));
        let live = obj(vec![("pos", xy(0.0, 0.0)), ("tag", text("a"))]);
        interpolate_snapshots(&a, &b, 0.5, &live, None);
        assert!(to_equal(&get(&live, "pos"), &xy(5.0, 10.0)));
        assert!(to_equal(&get(&live, "tag"), &text("b")));
        restore_snapshot(&a, &live);
        assert!(to_equal(&get(&live, "pos"), &xy(0.0, 0.0)));
        assert!(to_equal(&get(&live, "tag"), &text("a")));
    }
}
