use flight_layout::*;

fn root(container_style: GridLayoutContainerStyle) -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::Grid(container_style),
        item_style: ItemStyle::None,
        kind: GRID_LAYOUT_KIND.to_string(),
        parent_index: -1,
    }
}

fn child(item_style: Option<GridLayoutItemStyle>) -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::None,
        item_style: match item_style {
            Some(s) => ItemStyle::Grid(s),
            None => ItemStyle::None,
        },
        kind: GRID_LAYOUT_KIND.to_string(),
        parent_index: 0,
    }
}

fn resolve(nodes: Vec<LayoutNode>, intrinsic_sizes: &[f32], width: f32, height: f32) -> Vec<f32> {
    let mut out = vec![0.0_f32; nodes.len() * 4];
    let mut state = create_layout_state();
    register_grid_layout_resolver(&mut state);
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

mod register_grid_layout_resolver {
    use super::*;

    #[test]
    fn sizes_fixed_fractional_and_intrinsic_tracks() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(10.0),
                    columns: vec![
                        GridLayoutTrack::Fixed { size: 40.0 },
                        GridLayoutTrack::Auto,
                        GridLayoutTrack::Fraction { fraction: 1.0 },
                    ],
                    rows: vec![GridLayoutTrack::Auto],
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
                child(Some(GridLayoutItemStyle {
                    column: Some(1),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
                child(Some(GridLayoutItemStyle {
                    column: Some(2),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
            ],
            &[0.0, 0.0, 20.0, 10.0, 30.0, 25.0, 15.0, 20.0],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 40.0, 25.0]);
        assert_eq!(&out[8..12], &[50.0, 0.0, 30.0, 25.0]);
        assert_eq!(&out[12..16], &[90.0, 0.0, 110.0, 25.0]);
    }

    #[test]
    fn distributes_space_in_proportion_to_unequal_fraction_tracks() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    columns: vec![
                        GridLayoutTrack::Fraction { fraction: 1.0 },
                        GridLayoutTrack::Fraction { fraction: 2.0 },
                    ],
                    rows: vec![GridLayoutTrack::Fixed { size: 10.0 }],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
                child(Some(GridLayoutItemStyle {
                    column: Some(1),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
            ],
            &[0.0; 6],
            180.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 60.0, 10.0]);
        assert_eq!(&out[8..12], &[60.0, 0.0, 120.0, 10.0]);
    }

    #[test]
    fn assigns_omitted_placement_row_major() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(5.0),
                    columns: vec![
                        GridLayoutTrack::Fixed { size: 20.0 },
                        GridLayoutTrack::Fixed { size: 30.0 },
                    ],
                    row_gap: Some(4.0),
                    rows: vec![
                        GridLayoutTrack::Fixed { size: 10.0 },
                        GridLayoutTrack::Fixed { size: 15.0 },
                    ],
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                }),
                child(None),
                child(None),
                child(None),
            ],
            &[0.0; 8],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 20.0, 10.0]);
        assert_eq!(&out[8..12], &[25.0, 0.0, 30.0, 10.0]);
        assert_eq!(&out[12..16], &[0.0, 14.0, 20.0, 15.0]);
    }

    #[test]
    fn accepts_explicit_zero_container_fields_and_an_empty_item_style() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(0.0),
                    columns: vec![GridLayoutTrack::Fixed { size: 0.0 }],
                    padding_bottom: Some(0.0),
                    padding_left: Some(0.0),
                    padding_right: Some(0.0),
                    padding_top: Some(0.0),
                    row_gap: Some(0.0),
                    rows: vec![GridLayoutTrack::Fixed { size: 0.0 }],
                }),
                child(Some(GridLayoutItemStyle { column: None, column_span: None, row: None, row_span: None })),
            ],
            &[0.0; 4],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn supports_spans_padding_and_independent_gaps() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(5.0),
                    columns: vec![
                        GridLayoutTrack::Fixed { size: 20.0 },
                        GridLayoutTrack::Fixed { size: 30.0 },
                    ],
                    padding_left: Some(7.0),
                    padding_top: Some(11.0),
                    row_gap: Some(3.0),
                    rows: vec![
                        GridLayoutTrack::Fixed { size: 10.0 },
                        GridLayoutTrack::Fixed { size: 15.0 },
                    ],
                    padding_bottom: None,
                    padding_right: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    column_span: Some(2),
                    row: Some(0),
                    row_span: Some(2),
                })),
            ],
            &[0.0; 4],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[7.0, 11.0, 55.0, 28.0]);
    }

    #[test]
    fn shares_intrinsic_size_across_auto_tracks_in_a_span() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    columns: vec![GridLayoutTrack::Auto, GridLayoutTrack::Auto],
                    rows: vec![GridLayoutTrack::Auto],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    column_span: Some(2),
                    row: Some(0),
                    row_span: None,
                })),
            ],
            &[0.0, 0.0, 80.0, 20.0],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 80.0, 20.0]);
    }

    #[test]
    fn deducts_fixed_tracks_and_gaps_from_a_spanning_intrinsic_contribution() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(10.0),
                    columns: vec![GridLayoutTrack::Auto, GridLayoutTrack::Fixed { size: 30.0 }],
                    row_gap: Some(5.0),
                    rows: vec![GridLayoutTrack::Auto, GridLayoutTrack::Fixed { size: 20.0 }],
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    column_span: Some(2),
                    row: Some(0),
                    row_span: Some(2),
                })),
            ],
            &[0.0, 0.0, 100.0, 70.0],
            173.0,
            119.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 100.0, 70.0]);
    }

    #[test]
    fn does_not_deduct_tracks_outside_an_intrinsic_item_span() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    columns: vec![GridLayoutTrack::Auto, GridLayoutTrack::Fixed { size: 30.0 }],
                    rows: vec![GridLayoutTrack::Auto],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
            ],
            &[0.0, 0.0, 100.0, 17.0],
            173.0,
            119.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 100.0, 17.0]);
    }

    #[test]
    fn keeps_intrinsic_row_and_column_sizing_on_their_distinct_axes() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    column_gap: Some(7.0),
                    columns: vec![GridLayoutTrack::Auto, GridLayoutTrack::Auto],
                    row_gap: Some(5.0),
                    rows: vec![GridLayoutTrack::Auto, GridLayoutTrack::Auto],
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                }),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
                child(Some(GridLayoutItemStyle {
                    column: Some(1),
                    row: Some(0),
                    column_span: None,
                    row_span: None,
                })),
                child(Some(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(1),
                    column_span: None,
                    row_span: None,
                })),
            ],
            &[0.0, 0.0, 70.0, 11.0, 23.0, 31.0, 41.0, 47.0],
            173.0,
            119.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 70.0, 31.0]);
        assert_eq!(&out[8..12], &[77.0, 0.0, 23.0, 31.0]);
        assert_eq!(&out[12..16], &[0.0, 36.0, 70.0, 47.0]);
    }

    #[test]
    fn normalizes_invalid_intrinsic_sizes_for_auto_tracks() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    columns: vec![GridLayoutTrack::Auto],
                    rows: vec![GridLayoutTrack::Auto],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(None),
            ],
            &[0.0, 0.0, f32::NAN, -1.0],
            173.0,
            119.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn normalizes_positive_infinity_in_auto_track_intrinsic_sizes() {
        let out = resolve(
            vec![
                root(GridLayoutContainerStyle {
                    columns: vec![GridLayoutTrack::Auto],
                    rows: vec![GridLayoutTrack::Auto],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                child(None),
            ],
            &[0.0, 0.0, f32::INFINITY, f32::INFINITY],
            173.0,
            119.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn resolves_nested_fractional_rows_and_columns_from_asymmetric_parent_rectangles() {
        let nodes: Vec<LayoutNode> = vec![
            root(GridLayoutContainerStyle {
                column_gap: Some(5.0),
                columns: vec![
                    GridLayoutTrack::Fixed { size: 30.0 },
                    GridLayoutTrack::Fraction { fraction: 1.0 },
                ],
                padding_bottom: Some(17.0),
                padding_left: Some(7.0),
                padding_right: Some(13.0),
                padding_top: Some(11.0),
                row_gap: Some(3.0),
                rows: vec![
                    GridLayoutTrack::Fixed { size: 20.0 },
                    GridLayoutTrack::Fraction { fraction: 2.0 },
                ],
            }),
            LayoutNode {
                container_style: ContainerStyle::Grid(GridLayoutContainerStyle {
                    column_gap: Some(2.0),
                    columns: vec![
                        GridLayoutTrack::Fraction { fraction: 1.0 },
                        GridLayoutTrack::Fixed { size: 20.0 },
                    ],
                    padding_bottom: Some(8.0),
                    padding_left: Some(4.0),
                    padding_right: Some(9.0),
                    padding_top: Some(6.0),
                    row_gap: Some(5.0),
                    rows: vec![
                        GridLayoutTrack::Fixed { size: 10.0 },
                        GridLayoutTrack::Fraction { fraction: 3.0 },
                    ],
                }),
                item_style: ItemStyle::Grid(GridLayoutItemStyle {
                    column: Some(1),
                    row: Some(1),
                    column_span: None,
                    row_span: None,
                }),
                kind: GRID_LAYOUT_KIND.to_string(),
                parent_index: 0,
            },
            LayoutNode {
                container_style: ContainerStyle::None,
                item_style: ItemStyle::Grid(GridLayoutItemStyle {
                    column: Some(0),
                    row: Some(1),
                    column_span: None,
                    row_span: None,
                }),
                kind: GRID_LAYOUT_KIND.to_string(),
                parent_index: 1,
            },
        ];
        let out = resolve(nodes, &[0.0; 6], 200.0, 130.0);
        assert_eq!(&out[4..8], &[42.0, 34.0, 145.0, 79.0]);
        assert_eq!(&out[8..12], &[46.0, 55.0, 110.0, 50.0]);
    }

    #[test]
    fn returns_diagnosable_sentinels_for_mismatched_container_and_item_styles() {
        let invalid_container_nodes = vec![
            LayoutNode {
                container_style: ContainerStyle::Invalid,
                item_style: ItemStyle::None,
                kind: GRID_LAYOUT_KIND.to_string(),
                parent_index: -1,
            },
            child(None),
        ];
        let mut state = create_layout_state();
        register_grid_layout_resolver(&mut state);
        let tree = LayoutTree {
            nodes: invalid_container_nodes,
        };
        assert_eq!(
            resolve_layout_tree(&mut vec![0.0; 8], &mut state, &tree, &[0.0; 4], 10.0, 10.0),
            false
        );
        assert_eq!(
            explain_layout_resolution(&state, &tree, 0).unwrap().kind,
            LayoutResolutionFailureKind::InvalidContainerStyle
        );

        let invalid_item_nodes = vec![
            root(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Auto],
                rows: vec![GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
            child(Some(GridLayoutItemStyle {
                column: Some(0),
                column_span: None,
                row: None,
                row_span: None,
            })),
        ];
        let tree2 = LayoutTree {
            nodes: invalid_item_nodes,
        };
        assert_eq!(
            resolve_layout_tree(&mut vec![0.0; 8], &mut state, &tree2, &[0.0; 4], 10.0, 10.0),
            false
        );
        assert_eq!(
            explain_layout_resolution(&state, &tree2, 1).unwrap().kind,
            LayoutResolutionFailureKind::InvalidItemStyle
        );
    }

    #[test]
    fn rejects_a_span_that_exceeds_the_explicit_grid() {
        let nodes = vec![
            root(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Auto, GridLayoutTrack::Auto],
                rows: vec![GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
            child(Some(GridLayoutItemStyle {
                column: Some(1),
                column_span: Some(2),
                row: Some(0),
                row_span: None,
            })),
        ];
        let tree = LayoutTree { nodes };
        let mut state = create_layout_state();
        register_grid_layout_resolver(&mut state);
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
    fn rejects_a_row_span_that_exceeds_the_explicit_grid() {
        let nodes = vec![
            root(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Auto],
                rows: vec![GridLayoutTrack::Auto, GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
            child(Some(GridLayoutItemStyle {
                column: Some(0),
                row: Some(1),
                row_span: Some(2),
                column_span: None,
            })),
        ];
        let tree = LayoutTree { nodes };
        let mut state = create_layout_state();
        register_grid_layout_resolver(&mut state);
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
    fn rejects_malformed_container_styles() {
        let cases: Vec<ContainerStyle> = vec![
            ContainerStyle::None,    // null container
            ContainerStyle::Invalid, // { columns: [null], rows: [{ kind: 'auto' }] }
            ContainerStyle::Grid(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Fraction { fraction: 0.0 }],
                rows: vec![GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
            ContainerStyle::Grid(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Fixed { size: -1.0 }],
                rows: vec![GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
            ContainerStyle::Grid(GridLayoutContainerStyle {
                columns: vec![GridLayoutTrack::Auto],
                padding_left: Some(f32::INFINITY),
                rows: vec![GridLayoutTrack::Auto],
                column_gap: None,
                padding_bottom: None,
                padding_right: None,
                padding_top: None,
                row_gap: None,
            }),
        ];
        for container_style in cases {
            let nodes = vec![
                LayoutNode {
                    container_style,
                    item_style: ItemStyle::None,
                    kind: GRID_LAYOUT_KIND.to_string(),
                    parent_index: -1,
                },
                child(None),
            ];
            let tree = LayoutTree { nodes };
            let mut state = create_layout_state();
            register_grid_layout_resolver(&mut state);
            assert_eq!(
                resolve_layout_tree(
                    &mut vec![0.0; 8],
                    &mut state,
                    &tree,
                    &[0.0; 4],
                    100.0,
                    100.0
                ),
                false
            );
            assert_eq!(
                explain_layout_resolution(&state, &tree, 0).unwrap().kind,
                LayoutResolutionFailureKind::InvalidContainerStyle
            );
        }
    }

    #[test]
    fn rejects_malformed_item_placements() {
        let cases: Vec<ItemStyle> = vec![
            ItemStyle::Grid(GridLayoutItemStyle {
                column: Some(-1),
                row: Some(0),
                column_span: None,
                row_span: None,
            }),
            ItemStyle::Invalid, // { column: 0.5, row: 0 }
            ItemStyle::Invalid, // { column: '0', row: 0 }
            ItemStyle::Grid(GridLayoutItemStyle {
                column: Some(0),
                column_span: Some(0),
                row: Some(0),
                row_span: None,
            }),
            ItemStyle::Grid(GridLayoutItemStyle {
                column: Some(0),
                row: Some(0),
                row_span: Some(0),
                column_span: None,
            }),
        ];
        for item_style in cases {
            let nodes = vec![
                root(GridLayoutContainerStyle {
                    columns: vec![GridLayoutTrack::Auto],
                    rows: vec![GridLayoutTrack::Auto],
                    column_gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    row_gap: None,
                }),
                LayoutNode {
                    container_style: ContainerStyle::None,
                    item_style,
                    kind: GRID_LAYOUT_KIND.to_string(),
                    parent_index: 0,
                },
            ];
            let tree = LayoutTree { nodes };
            let mut state = create_layout_state();
            register_grid_layout_resolver(&mut state);
            assert_eq!(
                resolve_layout_tree(
                    &mut vec![0.0; 8],
                    &mut state,
                    &tree,
                    &[0.0; 4],
                    100.0,
                    100.0
                ),
                false
            );
            assert_eq!(
                explain_layout_resolution(&state, &tree, 1).unwrap().kind,
                LayoutResolutionFailureKind::InvalidItemStyle
            );
        }
    }
}
