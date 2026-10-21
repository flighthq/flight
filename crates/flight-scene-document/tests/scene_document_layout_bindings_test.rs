// flight-lint: allow-file(f64) D1: document numbers are JS Numbers
use std::sync::Arc;

use flight_node::add_node_child;
use flight_scene_document::contract::*;

use crate::support::*;

fn create_document_node(name: &str, children: Vec<FlightDocumentNode>) -> FlightDocumentNode {
    return document_node(
        "DisplayObject",
        fields(vec![("name", text(name))]),
        children,
    );
}

fn create_layout(targets: &[&str]) -> FlightDocumentLayoutDescriptor {
    return FlightDocumentLayoutDescriptor {
        targets: targets.iter().map(|target| target.to_string()).collect(),
        tree: Arc::new(FlightDocumentLayoutTree {
            nodes: (0..targets.len())
                .map(|index| FlightDocumentLayoutNode {
                    container_style: (index == 0).then(|| fields(vec![("gap", number(8.0))])),
                    item_style: (index != 0).then(|| fields(vec![("grow", number(1.0))])),
                    kind: if index == 0 { "acme.Flow" } else { "acme.Leaf" }.to_string(),
                    parent_index: index as i64 - 1,
                })
                .collect(),
        }),
    };
}

fn identity(node: &flight_node::NodeRef) -> String {
    return flight_entity::get_entity_uid(node.write().unwrap().node_fields_mut());
}

fn is_range_error(result: std::thread::Result<()>) -> bool {
    return result.is_err_and(|payload| {
        return payload
            .downcast_ref::<flight_entity::FlightError>()
            .is_some_and(|error| error.kind == flight_entity::FlightErrorKind::RangeError);
    });
}

mod check_flight_document_layout_targets {
    use super::*;

    #[test]
    fn distinguishes_missing_and_multiply_authored_names() {
        let root = create_document_node("same", vec![create_document_node("same", vec![])]);

        let missing =
            check_flight_document_layout_targets(&[create_layout(&["missing"])], &root, 2).unwrap();
        assert_eq!(missing.path, "scenes[2].layouts[0].targets[0]");
        assert_eq!(
            missing.reason,
            FlightDocumentRefusalReason::LayoutTargetUnresolved
        );
        let ambiguous =
            check_flight_document_layout_targets(&[create_layout(&["same"])], &root, 2).unwrap();
        assert_eq!(ambiguous.path, "scenes[2].layouts[0].targets[0]");
        assert_eq!(
            ambiguous.reason,
            FlightDocumentRefusalReason::LayoutTargetAmbiguous
        );
    }

    #[test]
    fn classifies_malformed_descriptors_and_non_document_styles_as_structural_refusals() {
        let root = create_document_node("root", vec![]);
        let malformed = FlightDocumentLayoutDescriptor {
            targets: vec!["root".to_string()],
            tree: Arc::new(FlightDocumentLayoutTree {
                nodes: vec![FlightDocumentLayoutNode {
                    container_style: Some(fields(vec![("gap", number(f64::NAN))])),
                    item_style: None,
                    kind: "acme.Flow".to_string(),
                    parent_index: -1,
                }],
            }),
        };

        let refusal = check_flight_document_layout_targets(&[malformed], &root, 0).unwrap();
        assert_eq!(refusal.path, "scenes[0].layouts[0].tree.nodes[0]");
        assert_eq!(
            refusal.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
        // D15 non-representable: the source's `[null]` layout (sceneDocumentLayoutBindings.test.ts:57-62,
        // refusing StructureInvalid at `scenes[0].layouts[0]`) cannot be built from typed descriptors;
        // its raw-text form refuses through the text codec's layout reader instead.
        let explanation = explain_flight_document_text(
            "flight: 1\ndefaultScene: 0\nscenes:\n  - kind: Scene2D\n    scene:\n      kind: DisplayObject\n    layouts:\n      - null\n",
        )
        .unwrap();
        assert_eq!(explanation.path, "scenes[0].layouts[0]");
        assert_eq!(
            explanation.reason,
            FlightDocumentRefusalReason::StructureInvalid
        );
    }
}

mod create_flight_document_layout_bindings {
    use super::*;

    #[test]
    fn replaces_authored_names_with_index_matched_live_node_identities() {
        let child = create_document_node("child", vec![]);
        let root = create_document_node("root", vec![child]);
        let live_root = display_object(Some("root"));
        let live_child = display_object(Some("child"));
        add_node_child(&live_root, &live_child);
        let layout = create_layout(&["root", "child"]);
        let mut materialized = FlightDocumentMaterializedNodes::new();
        materialized.insert(&root as *const FlightDocumentNode, live_root.clone());
        materialized.insert(
            &root.children[0] as *const FlightDocumentNode,
            live_child.clone(),
        );

        let bindings = create_flight_document_layout_bindings(
            std::slice::from_ref(&layout),
            &root,
            &materialized,
        )
        .unwrap();

        assert_eq!(bindings[0].targets.len(), 2);
        assert!(same_node(&bindings[0].targets[0], &live_root));
        assert!(same_node(&bindings[0].targets[1], &live_child));
        assert!(Arc::ptr_eq(&bindings[0].tree, &layout.tree));
    }
}

mod write_flight_document_layout_bindings {
    use super::*;

    #[test]
    fn writes_node_name_references_and_clones_the_document_safe_tree() {
        let root = display_object(Some("root"));
        let child = display_object(Some("child"));
        add_node_child(&root, &child);
        let tree = create_layout(&["root", "child"]).tree;
        let mut written = FlightDocumentWrittenNodes::new();
        written.insert(identity(&root), create_document_node("root", vec![]));
        written.insert(identity(&child), create_document_node("child", vec![]));

        let layouts = write_flight_document_layout_bindings(
            &[FlightDocumentLayoutBinding {
                targets: vec![root.clone(), child.clone()],
                tree: tree.clone(),
            }],
            &root,
            &written,
        );

        assert_eq!(layouts.len(), 1);
        assert_eq!(
            layouts[0].targets,
            vec!["root".to_string(), "child".to_string()]
        );
        assert_eq!(layouts[0].tree.nodes.len(), tree.nodes.len());
        for (written_node, source_node) in layouts[0].tree.nodes.iter().zip(&tree.nodes) {
            assert_eq!(written_node.kind, source_node.kind);
            assert_eq!(written_node.parent_index, source_node.parent_index);
        }
        assert!(fields_equal(
            layouts[0].tree.nodes[0].container_style.as_ref().unwrap(),
            tree.nodes[0].container_style.as_ref().unwrap()
        ));
        assert!(!Arc::ptr_eq(&layouts[0].tree, &tree));
    }

    #[test]
    fn rejects_duplicate_and_foreign_live_targets_as_writer_misuse() {
        let root = display_object(Some("root"));
        let foreign = display_object(Some("foreign"));
        let mut written = FlightDocumentWrittenNodes::new();
        written.insert(identity(&root), create_document_node("root", vec![]));

        assert!(is_range_error(std::panic::catch_unwind(|| {
            write_flight_document_layout_bindings(
                &[FlightDocumentLayoutBinding {
                    targets: vec![foreign.clone()],
                    tree: create_layout(&["foreign"]).tree,
                }],
                &root,
                &written,
            );
        })));
        assert!(is_range_error(std::panic::catch_unwind(|| {
            write_flight_document_layout_bindings(
                &[
                    FlightDocumentLayoutBinding {
                        targets: vec![root.clone()],
                        tree: create_layout(&["root"]).tree,
                    },
                    FlightDocumentLayoutBinding {
                        targets: vec![root.clone()],
                        tree: create_layout(&["root"]).tree,
                    },
                ],
                &root,
                &written,
            );
        })));
    }
}
