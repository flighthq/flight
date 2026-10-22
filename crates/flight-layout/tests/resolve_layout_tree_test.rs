use flight_layout::*;

fn tree(nodes: Vec<LayoutNode>) -> LayoutTree {
    LayoutTree { nodes }
}

fn make_root() -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::None,
        item_style: ItemStyle::None,
        kind: "acme.Root".to_string(),
        parent_index: -1,
    }
}

fn make_child() -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::None,
        item_style: ItemStyle::None,
        kind: "acme.Leaf".to_string(),
        parent_index: 0,
    }
}

// Test-only types matching FlightDocumentLayoutBinding and NodeAny
struct NodeAny {
    #[allow(dead_code)]
    name: String,
}

struct FlightDocumentLayoutBinding {
    #[allow(dead_code)]
    targets: Vec<NodeAny>,
    tree: LayoutTree,
}

fn custom_resolver(
    out: &mut [f32],
    _tree: &LayoutTree,
    _sizes: &[f32],
    _parent: usize,
    child_index: usize,
) -> Option<LayoutResolutionFailureKind> {
    let offset = child_index * 4;
    out[offset] = 10.0;
    out[offset + 1] = 20.0;
    out[offset + 2] = 30.0;
    out[offset + 3] = 40.0;
    return None;
}

fn failing_resolver(
    _out: &mut [f32],
    _tree: &LayoutTree,
    _sizes: &[f32],
    _parent: usize,
    _child: usize,
) -> Option<LayoutResolutionFailureKind> {
    return Some(LayoutResolutionFailureKind::InvalidItemStyle);
}

mod explain_layout_resolution {
    use super::*;

    #[test]
    fn diagnoses_an_unregistered_container_without_running_resolution() {
        let state = create_layout_state();
        let input = tree(vec![make_root(), make_child()]);
        assert_eq!(
            super::explain_layout_resolution(&state, &input, 0),
            Some(LayoutResolutionExplanation {
                actual_length: 0,
                kind: LayoutResolutionFailureKind::UnregisteredKind,
                node_index: 0,
                parent_index: -1,
                required_length: 0,
                resolver_kind: Some("acme.Root".to_string()),
            })
        );
    }

    #[test]
    fn diagnoses_invalid_hierarchy_without_retained_state() {
        let invalid = tree(vec![LayoutNode {
            parent_index: -2,
            ..make_root()
        }]);
        let exp = super::explain_layout_resolution(&create_layout_state(), &invalid, 0).unwrap();
        assert_eq!(exp.kind, LayoutResolutionFailureKind::InvalidHierarchy);
        assert_eq!(exp.node_index, 0);
        assert_eq!(exp.parent_index, -2);

        let self_ref = tree(vec![LayoutNode {
            parent_index: 0,
            ..make_root()
        }]);
        let exp2 = super::explain_layout_resolution(&create_layout_state(), &self_ref, 0).unwrap();
        assert_eq!(exp2.kind, LayoutResolutionFailureKind::InvalidHierarchy);
        assert_eq!(exp2.node_index, 0);
        assert_eq!(exp2.parent_index, 0);
    }

    #[test]
    fn returns_none_at_the_exact_upper_node_index_boundary() {
        assert!(
            super::explain_layout_resolution(
                &create_layout_state(),
                &tree(vec![make_root(), make_child()]),
                2
            )
            .is_none()
        );
    }

    #[test]
    fn returns_a_retained_failure_only_for_its_matching_node() {
        let mut state = create_layout_state();
        let input = tree(vec![make_root(), make_child()]);
        register_layout_resolver(&mut state, "acme.Root", Some(failing_resolver));
        assert_eq!(
            resolve_layout_tree(
                &mut vec![0.0; 8],
                &mut state,
                &input,
                &[0.0; 4],
                100.0,
                100.0
            ),
            false
        );
        assert_eq!(
            super::explain_layout_resolution(&state, &input, -1)
                .unwrap()
                .kind,
            LayoutResolutionFailureKind::InvalidItemStyle
        );
        assert_eq!(
            super::explain_layout_resolution(&state, &input, 1)
                .unwrap()
                .kind,
            LayoutResolutionFailureKind::InvalidItemStyle
        );
        assert!(super::explain_layout_resolution(&state, &input, 0).is_none());
    }

    #[test]
    fn does_not_return_a_node_zero_failure_for_a_different_node() {
        let mut state = create_layout_state();
        let input = tree(vec![make_root(), make_child()]);
        assert_eq!(
            resolve_layout_tree(
                &mut vec![0.0; 8],
                &mut state,
                &input,
                &[0.0; 4],
                100.0,
                100.0
            ),
            false
        );
        assert!(super::explain_layout_resolution(&state, &input, 1).is_none());
    }
}

mod resolve_layout_tree {
    use super::*;

    #[test]
    fn consumes_an_inert_flight_document_binding_without_moving_kind_ownership_out_of_layout_state()
    {
        let binding = FlightDocumentLayoutBinding {
            targets: vec![
                NodeAny {
                    name: "root".to_string(),
                },
                NodeAny {
                    name: "child".to_string(),
                },
            ],
            tree: LayoutTree {
                nodes: vec![
                    LayoutNode {
                        container_style: ContainerStyle::None,
                        item_style: ItemStyle::None,
                        kind: "acme.Root".to_string(),
                        parent_index: -1,
                    },
                    LayoutNode {
                        container_style: ContainerStyle::None,
                        item_style: ItemStyle::None,
                        kind: "acme.Leaf".to_string(),
                        parent_index: 0,
                    },
                ],
            },
        };
        let mut state = create_layout_state();
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 8],
                &mut state,
                &binding.tree,
                &[0.0; 4],
                100.0,
                100.0
            ),
            false
        );
        let exp = explain_layout_resolution(&state, &binding.tree, 0).unwrap();
        assert_eq!(exp.kind, LayoutResolutionFailureKind::UnregisteredKind);
        assert_eq!(exp.resolver_kind, Some("acme.Root".to_string()));
    }

    #[test]
    fn writes_every_root_as_the_available_rectangle() {
        let mut out = vec![0.0_f32; 8];
        let mut state = create_layout_state();
        assert!(super::resolve_layout_tree(
            &mut out,
            &mut state,
            &tree(vec![make_root(), make_root()]),
            &[0.0; 4],
            320.0,
            180.0,
        ));
        assert_eq!(&out, &[0.0, 0.0, 320.0, 180.0, 0.0, 0.0, 320.0, 180.0]);
    }

    #[test]
    fn normalizes_non_finite_and_negative_available_root_sizes() {
        let mut out = vec![0.0_f32; 4];
        let mut state = create_layout_state();
        assert!(super::resolve_layout_tree(
            &mut out,
            &mut state,
            &tree(vec![make_root()]),
            &[0.0; 2],
            f32::NAN,
            -1.0,
        ));
        assert_eq!(&out, &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn dispatches_a_child_through_its_parent_kind() {
        let mut out = vec![0.0_f32; 8];
        let mut state = create_layout_state();
        register_layout_resolver(&mut state, "acme.Root", Some(custom_resolver));
        assert!(super::resolve_layout_tree(
            &mut out,
            &mut state,
            &tree(vec![make_root(), make_child()]),
            &[0.0; 4],
            100.0,
            100.0,
        ));
        assert_eq!(&out[4..8], &[10.0, 20.0, 30.0, 40.0]);
    }

    #[test]
    fn returns_a_sentinel_for_an_out_buffer_that_is_too_small() {
        let mut state = create_layout_state();
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 7],
                &mut state,
                &tree(vec![make_root(), make_child()]),
                &[0.0; 4],
                100.0,
                100.0
            ),
            false
        );
        let exp =
            explain_layout_resolution(&state, &tree(vec![make_root(), make_child()]), -1).unwrap();
        assert_eq!(exp.actual_length, 7);
        assert_eq!(exp.kind, LayoutResolutionFailureKind::OutputTooSmall);
        assert_eq!(exp.node_index, -1);
        assert_eq!(exp.parent_index, -1);
        assert_eq!(exp.required_length, 8);
    }

    #[test]
    fn returns_a_sentinel_for_an_intrinsic_size_buffer_that_is_too_small() {
        let mut state = create_layout_state();
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 8],
                &mut state,
                &tree(vec![make_root(), make_child()]),
                &[0.0; 3],
                100.0,
                100.0
            ),
            false
        );
        let exp =
            explain_layout_resolution(&state, &tree(vec![make_root(), make_child()]), -1).unwrap();
        assert_eq!(
            exp.kind,
            LayoutResolutionFailureKind::IntrinsicSizesTooSmall
        );
        assert_eq!(exp.node_index, -1);
        assert_eq!(exp.parent_index, -1);
    }

    #[test]
    fn rejects_a_child_that_does_not_follow_its_parent() {
        let invalid = tree(vec![LayoutNode {
            parent_index: 0,
            ..make_root()
        }]);
        let mut state = create_layout_state();
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 4],
                &mut state,
                &invalid,
                &[0.0; 2],
                100.0,
                100.0
            ),
            false
        );
        let exp = explain_layout_resolution(&state, &invalid, 0).unwrap();
        assert_eq!(exp.kind, LayoutResolutionFailureKind::InvalidHierarchy);
        assert_eq!(exp.node_index, 0);
    }

    #[test]
    fn rejects_a_parent_index_below_the_root_sentinel() {
        let invalid = tree(vec![LayoutNode {
            parent_index: -2,
            ..make_root()
        }]);
        let mut state = create_layout_state();
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 4],
                &mut state,
                &invalid,
                &[0.0; 2],
                100.0,
                100.0
            ),
            false
        );
        let exp = explain_layout_resolution(&state, &invalid, 0).unwrap();
        assert_eq!(exp.kind, LayoutResolutionFailureKind::InvalidHierarchy);
        assert_eq!(exp.node_index, 0);
        assert_eq!(exp.parent_index, -2);
    }

    #[test]
    fn clears_retained_failure_details_before_a_successful_resolution() {
        let mut state = create_layout_state();
        let input = tree(vec![make_root()]);
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 3],
                &mut state,
                &input,
                &[0.0; 2],
                100.0,
                100.0
            ),
            false
        );
        assert!(super::resolve_layout_tree(
            &mut vec![0.0; 4],
            &mut state,
            &input,
            &[0.0; 2],
            100.0,
            100.0,
        ));
        assert!(explain_layout_resolution(&state, &input, -1).is_none());
        assert_eq!(state.last_failure_node_index, -1);
        assert_eq!(state.last_failure_parent_index, -1);
    }

    #[test]
    fn reports_an_unregistered_parent_kind_only_when_it_has_a_child_to_arrange() {
        let mut state = create_layout_state();
        let input = tree(vec![make_root(), make_child()]);
        assert_eq!(
            super::resolve_layout_tree(
                &mut vec![0.0; 8],
                &mut state,
                &input,
                &[0.0; 4],
                100.0,
                100.0
            ),
            false
        );
        let exp = explain_layout_resolution(&state, &input, 0).unwrap();
        assert_eq!(exp.kind, LayoutResolutionFailureKind::UnregisteredKind);
        assert_eq!(exp.parent_index, -1);
        assert_eq!(exp.resolver_kind, Some("acme.Root".to_string()));
        assert!(
            explain_layout_resolution(&create_layout_state(), &tree(vec![make_root()]), 0)
                .is_none()
        );
    }
}
