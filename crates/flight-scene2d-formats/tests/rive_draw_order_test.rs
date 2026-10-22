use std::sync::Arc;

use flight_importdiagnostics::{ImportDiagnostic, ImportDiagnosticSeverity};
use flight_node::contract::{NodeRef, add_node_child, get_node_child_at, get_node_child_count};
use flight_scene2d::{Node2DRef, create_display_object};
use flight_scene2d_formats::contract::*;

const ARTBOARD: u64 = 1;
const SHAPE: u64 = 3;
const DRAW_TARGET: u64 = 48;
const DRAW_RULES: u64 = 49;

const DRAWABLE_ID: u64 = 119;
const PLACEMENT_VALUE: u64 = 120;
const DRAW_TARGET_ID: u64 = 121;

mod apply_rive_draw_order {
    use super::*;

    #[test]
    fn leaves_hierarchy_order_alone_when_the_artboard_states_no_rule() {
        let root = named_node("Board");
        let a = named_node("a");
        let b = named_node("b");
        attach(&root, &a);
        attach(&root, &b);
        let nodes = vec![Some(root.clone()), Some(a), Some(b)];
        let artboard = graph(
            vec![
                object(ARTBOARD, &[]),
                object(SHAPE, &[]),
                object(SHAPE, &[]),
            ],
            vec![-1, 0, 0],
        );
        apply_rive_draw_order(&nodes, &artboard, &root, None);
        assert_eq!(child_names(&root), ["a", "b"]);
    }

    #[test]
    fn draws_a_governed_sibling_above_its_target_reversing_hierarchy_order() {
        let root = named_node("Board");
        let a = named_node("a");
        let b = named_node("b");
        attach(&root, &a);
        attach(&root, &b);
        let nodes = vec![Some(root.clone()), Some(a), Some(b)];
        let artboard = graph(
            vec![
                object(ARTBOARD, &[]),
                object(SHAPE, &[]),
                object(SHAPE, &[]),
                object(DRAW_TARGET, &[(DRAWABLE_ID, 2), (PLACEMENT_VALUE, 1)]),
                object(DRAW_RULES, &[(DRAW_TARGET_ID, 3)]),
            ],
            vec![-1, 0, 0, 0, 1],
        );
        apply_rive_draw_order(&nodes, &artboard, &root, None);
        assert_eq!(child_names(&root), ["b", "a"]);
    }

    #[test]
    fn draws_a_governed_sibling_below_its_target() {
        let root = named_node("Board");
        let a = named_node("a");
        let b = named_node("b");
        attach(&root, &a);
        attach(&root, &b);
        let nodes = vec![Some(root.clone()), Some(a), Some(b)];
        let artboard = graph(
            vec![
                object(ARTBOARD, &[]),
                object(SHAPE, &[]),
                object(SHAPE, &[]),
                object(DRAW_TARGET, &[(DRAWABLE_ID, 1), (PLACEMENT_VALUE, 0)]),
                object(DRAW_RULES, &[(DRAW_TARGET_ID, 3)]),
            ],
            vec![-1, 0, 0, 0, 2],
        );
        apply_rive_draw_order(&nodes, &artboard, &root, None);
        assert_eq!(child_names(&root), ["b", "a"]);
    }

    #[test]
    fn reports_a_rule_whose_ends_are_not_siblings_instead_of_reparenting() {
        let root = named_node("Board");
        let a = named_node("a");
        let group = named_node("group");
        let b = named_node("b");
        attach(&root, &a);
        attach(&root, &group);
        attach(&group, &b);
        let nodes = vec![Some(root.clone()), Some(a), Some(group), Some(b)];
        let artboard = graph(
            vec![
                object(ARTBOARD, &[]),
                object(SHAPE, &[]),
                object(SHAPE, &[]),
                object(SHAPE, &[]),
                object(DRAW_TARGET, &[(DRAWABLE_ID, 1)]),
                object(DRAW_RULES, &[(DRAW_TARGET_ID, 4)]),
            ],
            vec![-1, 0, 0, 2, 0, 3],
        );
        let mut diagnostics = Vec::new();
        apply_rive_draw_order(&nodes, &artboard, &root, Some(&mut diagnostics));
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.draw-rule-crosses-parent"]
        );
        assert_eq!(child_names(&root), ["a", "group"]);
    }

    #[test]
    fn reports_a_rule_whose_target_does_not_resolve() {
        let root = named_node("Board");
        let a = named_node("a");
        attach(&root, &a);
        let nodes = vec![Some(root.clone()), Some(a)];
        let artboard = graph(
            vec![
                object(ARTBOARD, &[]),
                object(SHAPE, &[]),
                object(DRAW_RULES, &[(DRAW_TARGET_ID, 99)]),
            ],
            vec![-1, 0, 1],
        );
        let mut diagnostics = Vec::new();
        apply_rive_draw_order(&nodes, &artboard, &root, Some(&mut diagnostics));
        assert_eq!(
            diagnostic_kinds(&diagnostics),
            ["rive.draw-rule-unresolved"]
        );
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Drop);
    }
}

mod register_rive_draw_order_handlers {
    use super::*;

    #[test]
    fn claims_both_halves_with_one_handler_so_the_pass_runs_once() {
        let mut registry = create_rive_import_registry();
        register_rive_draw_order_handlers(&mut registry);
        let rules = get_rive_core_object_handler(&registry, DRAW_RULES as i32).unwrap();
        let target = get_rive_core_object_handler(&registry, DRAW_TARGET as i32).unwrap();
        assert!(Arc::ptr_eq(&rules, &target));
    }

    #[test]
    fn registers_draw_rules_as_data_with_an_artboard_pass() {
        let mut registry = create_rive_import_registry();
        register_rive_draw_order_handlers(&mut registry);
        let rules = get_rive_core_object_handler(&registry, DRAW_RULES as i32).unwrap();
        assert!(rules.apply_artboard.is_some());
        assert!(rules.import_component.is_some());
    }
}

fn attach(parent: &Node2DRef, child: &Node2DRef) {
    let parent: NodeRef = parent.clone();
    let child: NodeRef = child.clone();
    add_node_child(&parent, &child);
}

fn child_names(root: &Node2DRef) -> Vec<String> {
    let root: NodeRef = root.clone();
    return (0..get_node_child_count(&root))
        .map(|index| {
            let child = get_node_child_at(&root, index as i32).unwrap();
            let name = child.read().unwrap().node_fields().name.clone();
            return name.unwrap_or_default();
        })
        .collect();
}

fn diagnostic_kinds(diagnostics: &[ImportDiagnostic]) -> Vec<&str> {
    return diagnostics
        .iter()
        .map(|diagnostic| diagnostic.kind.as_str())
        .collect();
}

fn graph(objects: Vec<RiveCoreObject>, parent_indices: Vec<i32>) -> RiveArtboardGraph {
    let stream_end = objects.len();
    return RiveArtboardGraph {
        objects,
        parent_indices,
        stream_end,
        stream_start: 0,
    };
}

fn named_node(name: &str) -> Node2DRef {
    let node: Node2DRef = create_display_object();
    node.write().unwrap().node2d_fields_mut().name = Some(name.to_string());
    return node;
}

fn object(type_key: u64, numbers: &[(u64, u64)]) -> RiveCoreObject {
    return RiveCoreObject {
        properties: numbers
            .iter()
            .map(|(key, value)| RiveProperty {
                key: *key,
                r#type: RiveFieldType::Uint,
                value: RiveValue::Uint(*value),
            })
            .collect(),
        type_key,
    };
}
