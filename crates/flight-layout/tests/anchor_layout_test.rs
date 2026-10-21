use flight_layout::*;

fn node(parent_index: i32, item_style: Option<AnchorLayoutItemStyle>) -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::None,
        item_style: match item_style {
            Some(s) => ItemStyle::Anchor(s),
            None => ItemStyle::None,
        },
        kind: ANCHOR_LAYOUT_KIND.to_string(),
        parent_index,
    }
}

fn resolve(nodes: Vec<LayoutNode>, intrinsic_sizes: &[f32], width: f32, height: f32) -> Vec<f32> {
    let mut out = vec![0.0_f32; nodes.len() * 4];
    let mut state = create_layout_state();
    register_anchor_layout_resolver(&mut state);
    let tree = LayoutTree { nodes };
    assert!(resolve_layout_tree(
        &mut out,
        &mut state,
        &tree,
        intrinsic_sizes,
        width,
        height,
    ));
    return out;
}

mod register_anchor_layout_resolver {
    use super::*;

    #[test]
    fn aligns_a_natural_size_child_to_each_position() {
        let cases: &[(&str, ViewportAlign, f32, f32)] = &[
            ("top", ViewportAlign::Top, 87.0, 0.0),
            ("bottom", ViewportAlign::Bottom, 87.0, 108.0),
            ("left", ViewportAlign::Left, 0.0, 54.0),
            ("right", ViewportAlign::Right, 174.0, 54.0),
            ("topleft", ViewportAlign::TopLeft, 0.0, 0.0),
            ("topright", ViewportAlign::TopRight, 174.0, 0.0),
            ("bottomleft", ViewportAlign::BottomLeft, 0.0, 108.0),
            ("bottomright", ViewportAlign::BottomRight, 174.0, 108.0),
        ];
        for &(label, align, x, y) in cases {
            let out = resolve(
                vec![
                    node(-1, None),
                    node(0, Some(AnchorLayoutItemStyle { align: Some(align), bottom: None, height: None, left: None, right: None, top: None, width: None })),
                ],
                &[0.0, 0.0, 37.0, 19.0],
                211.0,
                127.0,
            );
            assert!(
                (out[4] - x).abs() < 0.001 && (out[5] - y).abs() < 0.001,
                "align {}: expected ({}, {}), got ({}, {})",
                label, x, y, out[4], out[5],
            );
            assert!((out[6] - 37.0).abs() < 0.001);
            assert!((out[7] - 19.0).abs() < 0.001);
        }
    }

    #[test]
    fn stretches_between_opposing_pins_as_the_available_rect_changes() {
        let nodes = vec![
            node(-1, None),
            node(
                0,
                Some(AnchorLayoutItemStyle {
                    bottom: Some(10.0),
                    left: Some(20.0),
                    right: Some(30.0),
                    top: Some(5.0),
                    align: None,
                    height: None,
                    width: None,
                }),
            ),
        ];
        let out1 = resolve(nodes.clone(), &[0.0, 0.0, 1.0, 1.0], 200.0, 100.0);
        assert_eq!(&out1[4..8], &[20.0, 5.0, 150.0, 85.0]);
        let out2 = resolve(nodes, &[0.0, 0.0, 1.0, 1.0], 300.0, 160.0);
        assert_eq!(&out2[4..8], &[20.0, 5.0, 250.0, 145.0]);
    }

    #[test]
    fn lets_an_edge_pin_override_alignment_on_only_that_axis() {
        let out = resolve(
            vec![
                node(-1, None),
                node(
                    0,
                    Some(AnchorLayoutItemStyle {
                        align: Some(ViewportAlign::BottomRight),
                        left: Some(12.0),
                        bottom: None,
                        height: None,
                        right: None,
                        top: None,
                        width: None,
                    }),
                ),
            ],
            &[0.0, 0.0, 30.0, 20.0],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[12.0, 80.0, 30.0, 20.0]);
    }

    #[test]
    fn positions_from_right_and_bottom_pins_on_asymmetric_axes() {
        let out = resolve(
            vec![
                node(-1, None),
                node(
                    0,
                    Some(AnchorLayoutItemStyle {
                        bottom: Some(13.0),
                        right: Some(11.0),
                        align: None,
                        height: None,
                        left: None,
                        top: None,
                        width: None,
                    }),
                ),
            ],
            &[0.0, 0.0, 37.0, 19.0],
            211.0,
            127.0,
        );
        assert_eq!(&out[4..8], &[163.0, 95.0, 37.0, 19.0]);
    }

    #[test]
    fn normalizes_invalid_intrinsic_sizes_for_a_null_item_style() {
        let out = resolve(
            vec![node(-1, None), node(0, None)],
            &[0.0, 0.0, f32::NAN, -1.0],
            211.0,
            127.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn propagates_nested_rectangles_in_one_parent_before_child_pass() {
        let out = resolve(
            vec![
                node(-1, None),
                node(
                    0,
                    Some(AnchorLayoutItemStyle {
                        bottom: Some(17.0),
                        left: Some(13.0),
                        right: Some(29.0),
                        top: Some(7.0),
                        align: None,
                        height: None,
                        width: None,
                    }),
                ),
                node(
                    1,
                    Some(AnchorLayoutItemStyle {
                        align: Some(ViewportAlign::BottomRight),
                        bottom: None,
                        height: None,
                        left: None,
                        right: None,
                        top: None,
                        width: None,
                    }),
                ),
            ],
            &[0.0, 0.0, 0.0, 0.0, 31.0, 19.0],
            211.0,
            127.0,
        );
        assert_eq!(&out[4..8], &[13.0, 7.0, 169.0, 103.0]);
        assert_eq!(&out[8..12], &[151.0, 91.0, 31.0, 19.0]);
    }

    #[test]
    fn rejects_a_style_shape_its_parent_resolver_cannot_interpret() {
        let tree = LayoutTree {
            nodes: vec![
                node(-1, None),
                LayoutNode {
                    container_style: ContainerStyle::None,
                    item_style: ItemStyle::Invalid,
                    kind: ANCHOR_LAYOUT_KIND.to_string(),
                    parent_index: 0,
                },
            ],
        };
        let mut state = create_layout_state();
        register_anchor_layout_resolver(&mut state);
        assert_eq!(
            resolve_layout_tree(&mut vec![0.0; 8], &mut state, &tree, &[0.0; 4], 100.0, 100.0),
            false
        );
        assert_eq!(
            explain_layout_resolution(&state, &tree, 1).unwrap().kind,
            LayoutResolutionFailureKind::InvalidItemStyle
        );
    }

    #[test]
    fn rejects_a_non_empty_anchor_container_style() {
        let tree = LayoutTree {
            nodes: vec![
                LayoutNode {
                    container_style: ContainerStyle::Invalid,
                    item_style: ItemStyle::None,
                    kind: ANCHOR_LAYOUT_KIND.to_string(),
                    parent_index: -1,
                },
                node(0, None),
            ],
        };
        let mut state = create_layout_state();
        register_anchor_layout_resolver(&mut state);
        assert_eq!(
            resolve_layout_tree(&mut vec![0.0; 8], &mut state, &tree, &[0.0; 4], 100.0, 100.0),
            false
        );
        assert_eq!(
            explain_layout_resolution(&state, &tree, 0).unwrap().kind,
            LayoutResolutionFailureKind::InvalidContainerStyle
        );
    }
}
