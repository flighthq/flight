use std::sync::{Arc, RwLock};

use flight_materials::contract::{Material2D, create_standard_material};
use flight_materials::{BLEND_MODE_MULTIPLY, BLEND_MODE_NORMAL};
use flight_node::{NodeRef, add_node_child};
use flight_scene2d::contract::*;

use crate::scene2d_fixture::*;

fn key(value: &'static str) -> TestToken {
    return TestToken::Key(value);
}

fn num(value: f64) -> TestToken {
    return TestToken::Number(value);
}

fn add(parent: &Node2DRef, child: &Node2DRef) {
    add_node_child(&as_node(parent), &as_node(child));
}

fn usage_of(build: impl FnOnce(&Node2DRef)) -> Scene2DKindUsage {
    let scene2d = create_scene2d();
    let root = scene2d.read().unwrap().root.clone();
    build(&root);
    let mut usage = create_scene2d_kind_usage();
    get_scene2d_kind_usage(&mut usage, &scene2d.read().unwrap());
    return usage;
}

fn html_view() -> Node2DRef {
    return create_html_view();
}

mod create_scene2d_kind_usage {
    use super::*;

    #[test]
    fn starts_empty_so_a_caller_can_reuse_one_record_across_scenes() {
        let usage = create_scene2d_kind_usage();
        assert!(usage.blend_modes.is_empty() && usage.material_kinds.is_empty());
        assert!(usage.node_kinds.is_empty() && usage.shape_command_keys.is_empty());
    }
}

mod get_scene2d_kind_usage {
    use super::*;

    #[test]
    fn collects_node_kinds_across_the_tree_deduped_and_sorted() {
        let usage = usage_of(|root| {
            add(root, &html_view());
            add(root, &html_view());
            add(root, &display_object());
        });
        assert_eq!(usage.node_kinds, vec![DISPLAY_OBJECT_KIND, HTML_VIEW_KIND]);
    }

    #[test]
    fn walks_a_nested_child_not_just_the_root_generation() {
        let usage = usage_of(|root| {
            let group = display_object();
            add(&group, &html_view());
            add(root, &group);
        });
        assert!(usage.node_kinds.contains(&HTML_VIEW_KIND.to_string()));
    }

    #[test]
    fn reads_the_command_keys_out_of_a_recorded_stream() {
        let usage = usage_of(|root| {
            add(
                root,
                &shape_like_node(vec![
                    key("beginFill"),
                    num(2.0),
                    num(4278190335.0),
                    num(1.0),
                    key("drawRectangle"),
                    num(4.0),
                    num(0.0),
                    num(0.0),
                    num(10.0),
                    num(10.0),
                    key("endFill"),
                    num(0.0),
                ]),
            );
        });
        assert_eq!(
            usage.shape_command_keys,
            vec!["beginFill", "drawRectangle", "endFill"]
        );
    }

    #[test]
    fn dedupes_a_command_key_repeated_within_one_stream_and_across_nodes() {
        let usage = usage_of(|root| {
            add(
                root,
                &shape_like_node(vec![
                    key("drawRectangle"),
                    num(4.0),
                    num(0.0),
                    num(0.0),
                    num(10.0),
                    num(10.0),
                    key("drawRectangle"),
                    num(4.0),
                    num(20.0),
                    num(0.0),
                    num(10.0),
                    num(10.0),
                ]),
            );
            add(
                root,
                &shape_like_node(vec![
                    key("drawRectangle"),
                    num(4.0),
                    num(0.0),
                    num(0.0),
                    num(5.0),
                    num(5.0),
                ]),
            );
        });
        assert_eq!(usage.shape_command_keys, vec!["drawRectangle"]);
    }

    #[test]
    fn advances_by_the_declared_argument_count_so_arguments_are_never_read_as_command_keys() {
        let usage = usage_of(|root| {
            add(
                root,
                &shape_like_node(vec![
                    key("lineStyle"),
                    num(3.0),
                    num(2.0),
                    num(255.0),
                    key("round"),
                    key("moveTo"),
                    num(2.0),
                    num(0.0),
                    num(0.0),
                ]),
            );
        });
        assert_eq!(usage.shape_command_keys, vec!["lineStyle", "moveTo"]);
    }

    #[test]
    fn stops_the_stream_walk_at_a_missing_or_non_numeric_argument_count() {
        let usage = usage_of(|root| {
            add(
                root,
                &shape_like_node(vec![key("moveTo"), key("lineTo"), num(0.0)]),
            );
            add(root, &shape_like_node(vec![key("closePath")]));
        });
        assert_eq!(usage.shape_command_keys, vec!["closePath", "moveTo"]);
    }

    #[test]
    fn ignores_a_node_whose_data_carries_no_command_stream() {
        assert!(
            usage_of(|root| add(root, &html_view()))
                .shape_command_keys
                .is_empty()
        );
    }

    #[test]
    fn reports_a_non_default_blend_mode_and_omits_normal_and_unset() {
        let usage = usage_of(|root| {
            let (plain, lit, normal) = (display_object(), display_object(), display_object());
            lit.write().unwrap().node2d_fields_mut().blend_mode =
                Some(BLEND_MODE_MULTIPLY.to_string());
            normal.write().unwrap().node2d_fields_mut().blend_mode =
                Some(BLEND_MODE_NORMAL.to_string());
            add(root, &plain);
            add(root, &lit);
            add(root, &normal);
        });
        assert_eq!(usage.blend_modes, vec![BLEND_MODE_MULTIPLY]);
    }

    #[test]
    fn reports_the_kind_of_a_material_a_node_carries() {
        let usage = usage_of(|root| {
            let node = display_object();
            let material: flight_entity::Ref<dyn Material2D> =
                Arc::new(RwLock::new(create_standard_material()));
            node.write().unwrap().node2d_fields_mut().material = Some(material);
            add(root, &node);
        });
        assert_eq!(usage.material_kinds, vec!["StandardMaterial"]);
    }

    #[test]
    fn leaves_material_kinds_empty_when_no_node_carries_one() {
        assert!(
            usage_of(|root| add(root, &display_object()))
                .material_kinds
                .is_empty()
        );
    }

    #[test]
    fn reads_the_root_itself_and_reports_a_non_2d_descendant_by_kind_only() {
        let usage = usage_of(|root| {
            root.write().unwrap().node2d_fields_mut().blend_mode = Some("Screen".to_string());
            let other: NodeRef = plain_node("Mesh");
            add_node_child(&as_node(root), &other);
        });
        assert_eq!(usage.node_kinds, vec![DISPLAY_OBJECT_KIND, "Mesh"]);
        assert_eq!(usage.blend_modes, vec!["Screen"]);
    }

    #[test]
    fn sorts_by_utf16_code_units_like_the_source() {
        let usage = usage_of(|root| {
            for kind in ["b", "B", "a", "\u{1F600}", "\u{FF5E}"] {
                let node = display_object();
                node.write().unwrap().node2d_fields_mut().kind = kind.to_string();
                add(root, &node);
            }
        });
        assert_eq!(
            usage.node_kinds,
            vec!["B", DISPLAY_OBJECT_KIND, "a", "b", "\u{1F600}", "\u{FF5E}"]
        );
    }

    #[test]
    fn clears_every_list_so_a_reused_record_does_not_accumulate() {
        let scene2d = create_scene2d();
        add(&scene2d.read().unwrap().root.clone(), &html_view());
        let mut usage = create_scene2d_kind_usage();
        usage.shape_command_keys.push("stale".to_string());
        get_scene2d_kind_usage(&mut usage, &scene2d.read().unwrap());
        get_scene2d_kind_usage(&mut usage, &scene2d.read().unwrap());
        assert_eq!(usage.node_kinds, vec![DISPLAY_OBJECT_KIND, HTML_VIEW_KIND]);
        assert!(usage.shape_command_keys.is_empty());
    }
}

mod initialize_scene2d_kind_usage {
    use super::*;

    #[test]
    fn is_the_construction_initializer_clearing_all_four_lists() {
        let mut usage = create_scene2d_kind_usage();
        usage.blend_modes.push("Multiply".to_string());
        usage.material_kinds.push("StandardMaterial".to_string());
        usage.node_kinds.push(DISPLAY_OBJECT_KIND.to_string());
        usage.shape_command_keys.push("moveTo".to_string());
        initialize_scene2d_kind_usage(&mut usage);
        assert_eq!(usage, create_scene2d_kind_usage());
    }
}

mod node2d_shape_command_stream {
    use super::*;

    #[test]
    fn plain_kinds_carry_no_stream_and_a_custom_kind_exposes_its_own() {
        assert!(
            display_object()
                .read()
                .unwrap()
                .shape_command_stream()
                .is_none()
        );
        assert!(
            create_html_view()
                .read()
                .unwrap()
                .shape_command_stream()
                .is_none()
        );
        let node = shape_like_node(vec![
            TestToken::Key("moveTo"),
            TestToken::Number(2.0),
            TestToken::Number(0.0),
            TestToken::Number(0.0),
        ]);
        let guard = node.read().unwrap();
        let stream = guard.shape_command_stream().unwrap();
        assert_eq!((stream.len(), stream.is_empty()), (4, false));
        assert_eq!((stream.key_at(0), stream.key_at(1)), (Some("moveTo"), None));
        assert_eq!(stream.arg_count_at(1), 2.0);
        assert!(stream.arg_count_at(0).is_nan() && stream.arg_count_at(9).is_nan());
        assert!(stream.arg_at(3).is_some() && stream.arg_at(4).is_none());
    }
}
