use flight_layout::*;

fn root(container_style: Option<FlexLayoutContainerStyle>) -> LayoutNode {
    LayoutNode {
        container_style: match container_style {
            Some(c) => ContainerStyle::Flex(c),
            None => ContainerStyle::None,
        },
        item_style: ItemStyle::None,
        kind: FLEX_LAYOUT_KIND.to_string(),
        parent_index: -1,
    }
}

fn child(item_style: Option<FlexLayoutItemStyle>) -> LayoutNode {
    LayoutNode {
        container_style: ContainerStyle::None,
        item_style: match item_style {
            Some(s) => ItemStyle::Flex(s),
            None => ItemStyle::None,
        },
        kind: FLEX_LAYOUT_KIND.to_string(),
        parent_index: 0,
    }
}

fn resolve(nodes: Vec<LayoutNode>, intrinsic_sizes: &[f32], width: f32, height: f32) -> Vec<f32> {
    let mut out = vec![0.0_f32; nodes.len() * 4];
    let mut state = create_layout_state();
    register_flex_layout_resolver(&mut state);
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

// TS `toBeCloseTo(expected)` (default 2 digits): abs diff < 0.5e-2.
fn assert_approx(actual: f32, expected: f32, label: &str) {
    assert!(
        (actual - expected).abs() < 0.005,
        "{}: expected {}, got {}",
        label,
        expected,
        actual,
    );
}

// D1 single-evaluation bound at a public f32 (Principal 192423ac):
// |actual - expected| <= max(ts_bound, 4 * f32::EPSILON * max(1, |expected|)).
fn assert_f32_single(actual: f32, expected: f32, ts_bound: f32, label: &str) {
    let bound = ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        (actual - expected).abs() <= bound,
        "{}: expected {}, got {} (bound {})",
        label,
        expected,
        actual,
        bound,
    );
}

mod register_flex_layout_resolver {
    use super::*;

    #[test]
    fn uses_intrinsic_sizes_for_basis_auto_and_distributes_growth() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    grow: Some(1.0),
                    align_self: None,
                    basis: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    grow: Some(2.0),
                    align_self: None,
                    basis: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 20.0, 10.0, 20.0, 15.0],
            200.0,
            100.0,
        );
        assert_eq!(out[4], 0.0);
        assert_eq!(out[5], 0.0);
        // D1 f32 bound (TS: 0)
        assert_f32_single(out[6], 73.33333587646484, 0.0, "width1");
        assert_eq!(out[7], 10.0);
        assert_approx(out[8], 73.3333, "x2");
        assert_approx(out[10], 126.6667, "width2");
    }

    #[test]
    fn shrinks_overflowing_items_in_proportion_to_basis_and_shrink() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(1.0),
                    align_self: None,
                    grow: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(1.0),
                    align_self: None,
                    grow: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 10.0],
            100.0,
            100.0,
        );
        assert_eq!(out[6], 50.0);
        assert_eq!(out[8], 50.0);
        assert_eq!(out[10], 50.0);
    }

    #[test]
    fn redistributes_shrink_deficit_after_an_item_reaches_zero() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(100.0)),
                    shrink: Some(10.0),
                    align_self: None,
                    grow: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(100.0)),
                    shrink: Some(1.0),
                    align_self: None,
                    grow: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            50.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 10.0]);
        assert_eq!(&out[8..12], &[0.0, 0.0, 50.0, 20.0]);
    }

    #[test]
    fn preserves_an_item_whose_shrink_factor_is_zero() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(0.0),
                    align_self: None,
                    grow: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(1.0),
                    align_self: None,
                    grow: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            100.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 80.0, 10.0]);
        assert_eq!(&out[8..12], &[80.0, 0.0, 20.0, 20.0]);
    }

    #[test]
    fn preserves_overflow_when_every_shrink_factor_is_zero() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(0.0),
                    align_self: None,
                    grow: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    shrink: Some(0.0),
                    align_self: None,
                    grow: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            100.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 80.0, 10.0]);
        assert_eq!(&out[8..12], &[80.0, 0.0, 60.0, 20.0]);
    }

    #[test]
    fn distinguishes_a_zero_basis_from_basis_auto() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    justify: Some(FlexLayoutJustify::End),
                    direction: None,
                    gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(0.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(20.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 30.0, 10.0, 0.0, 20.0],
            50.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[30.0, 0.0, 0.0, 10.0]);
        assert_eq!(&out[8..12], &[30.0, 0.0, 20.0, 20.0]);
    }

    #[test]
    fn accepts_explicit_zero_numeric_fields_and_an_empty_item_style() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    gap: Some(0.0),
                    padding_bottom: Some(0.0),
                    padding_left: Some(0.0),
                    padding_right: Some(0.0),
                    padding_top: Some(0.0),
                    align: None,
                    direction: None,
                    justify: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(0.0)),
                    grow: Some(0.0),
                    shrink: Some(0.0),
                    align_self: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    align_self: None,
                    basis: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 30.0, 10.0, 20.0, 17.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 70.0]);
        assert_eq!(&out[8..12], &[0.0, 0.0, 20.0, 70.0]);
    }

    #[test]
    fn stretches_a_null_item_style_across_the_default_cross_axis() {
        let out = resolve(
            vec![root(None), child(None)],
            &[0.0, 0.0, 20.0, 10.0],
            137.0,
            83.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 20.0, 83.0]);
    }

    #[test]
    fn uses_container_alignment_for_an_explicit_auto_align_self() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::End),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    align_self: Some(FlexAlignSelf::Auto),
                    basis: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 20.0, 17.0],
            137.0,
            83.0,
        );
        assert_eq!(&out[4..8], &[0.0, 66.0, 20.0, 17.0]);
    }

    #[test]
    fn uses_the_default_shrink_factor_in_weighted_overflow() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(80.0)),
                    shrink: Some(2.0),
                    align_self: None,
                    grow: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            100.0,
            100.0,
        );
        assert_eq!(out[6], 60.0);
        assert_eq!(out[8], 60.0);
        assert_eq!(out[10], 40.0);
    }

    #[test]
    fn keeps_one_item_at_main_start_for_space_between() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    justify: Some(FlexLayoutJustify::SpaceBetween),
                    direction: None,
                    gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(20.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0],
            200.0,
            100.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 20.0, 10.0]);
    }

    #[test]
    fn normalizes_an_invalid_intrinsic_basis_while_honoring_explicit_stretch() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Stretch),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(None),
            ],
            &[0.0, 0.0, f32::NAN, -1.0],
            137.0,
            83.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 83.0]);
    }

    #[test]
    fn applies_main_axis_justification() {
        let cases: &[(FlexLayoutJustify, f32, f32)] = &[
            (FlexLayoutJustify::Start, 0.0, 10.0),
            (FlexLayoutJustify::End, 70.0, 80.0),
            (FlexLayoutJustify::Center, 35.0, 45.0),
            (FlexLayoutJustify::SpaceBetween, 0.0, 80.0),
            (FlexLayoutJustify::SpaceAround, 17.5, 62.5),
            (FlexLayoutJustify::SpaceEvenly, 70.0 / 3.0, 170.0 / 3.0),
        ];
        for &(justify, first_x, second_x) in cases {
            let out = resolve(
                vec![
                    root(Some(FlexLayoutContainerStyle {
                        align: Some(FlexLayoutAlign::Start),
                        justify: Some(justify),
                        direction: None,
                        gap: None,
                        padding_bottom: None,
                        padding_left: None,
                        padding_right: None,
                        padding_top: None,
                        wrap: None,
                    })),
                    child(Some(FlexLayoutItemStyle {
                        basis: Some(FlexBasis::Fixed(10.0)),
                        align_self: None,
                        grow: None,
                        shrink: None,
                    })),
                    child(Some(FlexLayoutItemStyle {
                        basis: Some(FlexBasis::Fixed(20.0)),
                        align_self: None,
                        grow: None,
                        shrink: None,
                    })),
                ],
                &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
                100.0,
                100.0,
            );
            assert_approx(out[4], first_x, &format!("{:?} first_x", justify));
            assert_approx(out[8], second_x, &format!("{:?} second_x", justify));
        }
    }

    #[test]
    fn applies_padding_gap_justify_and_cross_axis_alignment() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Center),
                    gap: Some(10.0),
                    justify: Some(FlexLayoutJustify::SpaceBetween),
                    padding_bottom: Some(10.0),
                    padding_left: Some(10.0),
                    padding_right: Some(10.0),
                    padding_top: Some(10.0),
                    direction: None,
                    wrap: None,
                })),
                child(None),
                child(Some(FlexLayoutItemStyle {
                    align_self: Some(FlexAlignSelf::Align(FlexLayoutAlign::End)),
                    basis: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 20.0, 10.0, 30.0, 20.0],
            120.0,
            80.0,
        );
        assert_eq!(&out[4..8], &[10.0, 35.0, 20.0, 10.0]);
        assert_eq!(&out[8..12], &[80.0, 50.0, 30.0, 20.0]);
    }

    #[test]
    fn deducts_asymmetric_opposing_padding_from_grown_and_stretched_content() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    padding_bottom: Some(17.0),
                    padding_left: Some(13.0),
                    padding_right: Some(29.0),
                    padding_top: Some(7.0),
                    align: None,
                    direction: None,
                    gap: None,
                    justify: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    grow: Some(1.0),
                    align_self: None,
                    basis: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 0.0],
            211.0,
            127.0,
        );
        assert_eq!(&out[4..8], &[13.0, 7.0, 169.0, 103.0]);
    }

    #[test]
    fn deducts_asymmetric_opposing_padding_for_column_layout() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    direction: Some(FlexLayoutDirection::Column),
                    padding_bottom: Some(17.0),
                    padding_left: Some(13.0),
                    padding_right: Some(29.0),
                    padding_top: Some(7.0),
                    align: None,
                    gap: None,
                    justify: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    grow: Some(1.0),
                    align_self: None,
                    basis: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 0.0],
            211.0,
            127.0,
        );
        assert_eq!(&out[4..8], &[13.0, 7.0, 169.0, 103.0]);
    }

    #[test]
    fn deducts_gaps_before_distributing_growth() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(10.0),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(10.0)),
                    grow: Some(1.0),
                    align_self: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(10.0)),
                    grow: Some(1.0),
                    align_self: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 11.0, 0.0, 23.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 45.0, 11.0]);
        assert_eq!(&out[8..12], &[55.0, 0.0, 45.0, 23.0]);
    }

    #[test]
    fn keeps_exact_fit_items_together_when_wrapping() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(10.0),
                    wrap: Some(FlexLayoutWrap::Wrap),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(40.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(50.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 11.0, 0.0, 23.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 40.0, 11.0]);
        assert_eq!(&out[8..12], &[50.0, 0.0, 50.0, 23.0]);
    }

    #[test]
    fn wraps_when_the_gap_alone_pushes_the_next_item_past_the_line() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(10.0),
                    wrap: Some(FlexLayoutWrap::Wrap),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(50.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(45.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 11.0, 0.0, 23.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 50.0, 11.0]);
        assert_eq!(&out[8..12], &[0.0, 21.0, 45.0, 23.0]);
    }

    #[test]
    fn keeps_an_oversized_first_item_at_the_first_cross_axis_position() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(10.0),
                    wrap: Some(FlexLayoutWrap::Wrap),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(120.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 17.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 100.0, 17.0]);
    }

    #[test]
    fn distributes_space_between_across_more_than_two_items() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    justify: Some(FlexLayoutJustify::SpaceBetween),
                    direction: None,
                    gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(10.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(10.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(10.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0, 0.0, 30.0],
            100.0,
            100.0,
        );
        assert_eq!(out[4], 0.0);
        assert_eq!(out[8], 45.0);
        assert_eq!(out[12], 90.0);
    }

    #[test]
    fn supports_column_reverse_without_changing_item_role_semantics() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: Some(FlexLayoutDirection::ColumnReverse),
                    gap: Some(5.0),
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(None),
                child(None),
            ],
            &[0.0, 0.0, 20.0, 10.0, 30.0, 15.0],
            100.0,
            60.0,
        );
        assert_eq!(&out[4..8], &[0.0, 50.0, 20.0, 10.0]);
        assert_eq!(&out[8..12], &[0.0, 30.0, 30.0, 15.0]);
    }

    #[test]
    fn supports_row_reverse_without_transposing_the_cross_axis() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: Some(FlexLayoutDirection::RowReverse),
                    gap: Some(5.0),
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(None),
                child(None),
            ],
            &[0.0, 0.0, 10.0, 17.0, 20.0, 23.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[90.0, 0.0, 10.0, 17.0]);
        assert_eq!(&out[8..12], &[65.0, 0.0, 20.0, 23.0]);
    }

    #[test]
    fn applies_a_nonzero_justify_offset_from_row_reverse_main_start() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: Some(FlexLayoutDirection::RowReverse),
                    justify: Some(FlexLayoutJustify::Center),
                    gap: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(20.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 17.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[40.0, 0.0, 20.0, 17.0]);
    }

    #[test]
    fn resolves_a_nested_column_from_an_asymmetric_flex_parent_rectangle() {
        let nodes: Vec<LayoutNode> = vec![
            root(Some(FlexLayoutContainerStyle {
                align: Some(FlexLayoutAlign::Start),
                padding_bottom: Some(5.0),
                padding_left: Some(11.0),
                padding_right: Some(13.0),
                padding_top: Some(7.0),
                direction: None,
                gap: None,
                justify: None,
                wrap: None,
            })),
            LayoutNode {
                container_style: ContainerStyle::Flex(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: Some(FlexLayoutDirection::Column),
                    padding_bottom: Some(5.0),
                    padding_left: Some(3.0),
                    padding_right: Some(7.0),
                    padding_top: Some(4.0),
                    gap: None,
                    justify: None,
                    wrap: None,
                }),
                item_style: ItemStyle::Flex(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(100.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                }),
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 0,
            },
            LayoutNode {
                container_style: ContainerStyle::None,
                item_style: ItemStyle::Flex(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(20.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                }),
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 1,
            },
        ];
        let out = resolve(nodes, &[0.0, 0.0, 0.0, 60.0, 17.0, 0.0], 200.0, 100.0);
        assert_eq!(&out[4..8], &[11.0, 7.0, 100.0, 60.0]);
        assert_eq!(&out[8..12], &[14.0, 11.0, 17.0, 20.0]);
    }

    #[test]
    fn skips_interleaved_descendants_when_positioning_later_siblings() {
        let nodes: Vec<LayoutNode> = vec![
            root(Some(FlexLayoutContainerStyle {
                align: Some(FlexLayoutAlign::Start),
                direction: None,
                gap: None,
                justify: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                wrap: None,
            })),
            LayoutNode {
                container_style: ContainerStyle::Flex(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                }),
                item_style: ItemStyle::Flex(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(20.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                }),
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 0,
            },
            LayoutNode {
                container_style: ContainerStyle::None,
                item_style: ItemStyle::Flex(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(5.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                }),
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 1,
            },
            LayoutNode {
                container_style: ContainerStyle::None,
                item_style: ItemStyle::Flex(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(30.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                }),
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 0,
            },
        ];
        let out = resolve(
            nodes,
            &[0.0, 0.0, 0.0, 10.0, 0.0, 4.0, 0.0, 17.0],
            40.0,
            60.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 16.0, 10.0]);
        assert_eq!(&out[8..12], &[0.0, 0.0, 5.0, 4.0]);
        assert_eq!(&out[12..16], &[16.0, 0.0, 24.0, 17.0]);
    }

    #[test]
    fn wraps_lines_and_reverses_their_cross_axis_direction_for_wrap_reverse() {
        let normal = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(5.0),
                    wrap: Some(FlexLayoutWrap::Wrap),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            100.0,
            80.0,
        );
        assert_eq!(&normal[4..8], &[0.0, 0.0, 60.0, 10.0]);
        assert_eq!(&normal[8..12], &[0.0, 15.0, 60.0, 20.0]);

        let reversed = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(5.0),
                    wrap: Some(FlexLayoutWrap::WrapReverse),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0],
            100.0,
            80.0,
        );
        assert_eq!(reversed[5], 70.0);
        assert_eq!(reversed[9], 45.0);

        let column = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: Some(FlexLayoutDirection::Column),
                    gap: Some(5.0),
                    wrap: Some(FlexLayoutWrap::WrapReverse),
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 10.0, 0.0, 20.0, 0.0],
            90.0,
            100.0,
        );
        assert_eq!(&column[4..8], &[80.0, 0.0, 10.0, 60.0]);
        assert_eq!(&column[8..12], &[55.0, 0.0, 20.0, 60.0]);
    }

    #[test]
    fn reverses_start_and_end_alignment_within_wrap_reverse_lines() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    gap: Some(5.0),
                    wrap: Some(FlexLayoutWrap::WrapReverse),
                    direction: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(40.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    align_self: Some(FlexAlignSelf::Align(FlexLayoutAlign::End)),
                    basis: Some(FlexBasis::Fixed(40.0)),
                    grow: None,
                    shrink: None,
                })),
                child(Some(FlexLayoutItemStyle {
                    basis: Some(FlexBasis::Fixed(60.0)),
                    align_self: None,
                    grow: None,
                    shrink: None,
                })),
            ],
            &[0.0, 0.0, 0.0, 10.0, 0.0, 20.0, 0.0, 30.0],
            100.0,
            90.0,
        );
        assert_eq!(&out[4..8], &[0.0, 80.0, 40.0, 10.0]);
        assert_eq!(&out[8..12], &[45.0, 70.0, 40.0, 20.0]);
        assert_eq!(&out[12..16], &[0.0, 35.0, 60.0, 30.0]);
    }

    #[test]
    fn returns_a_diagnosable_sentinel_for_mismatched_styles() {
        let nodes = vec![
            root(None),
            LayoutNode {
                container_style: ContainerStyle::None,
                item_style: ItemStyle::Invalid,
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: 0,
            },
        ];
        let tree = LayoutTree { nodes };
        let mut state = create_layout_state();
        register_flex_layout_resolver(&mut state);
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

    #[test]
    fn rejects_an_invalid_container_enum() {
        let nodes = vec![
            LayoutNode {
                container_style: ContainerStyle::Invalid,
                item_style: ItemStyle::None,
                kind: FLEX_LAYOUT_KIND.to_string(),
                parent_index: -1,
            },
            child(None),
        ];
        let tree = LayoutTree { nodes };
        let mut state = create_layout_state();
        register_flex_layout_resolver(&mut state);
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

    #[test]
    fn rejects_malformed_container_fields() {
        let cases: Vec<ContainerStyle> = vec![
            ContainerStyle::Invalid, // { align: 'middle' }
            ContainerStyle::Flex(FlexLayoutContainerStyle {
                gap: Some(-1.0),
                align: None,
                direction: None,
                justify: None,
                padding_bottom: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                wrap: None,
            }),
            ContainerStyle::Invalid, // { justify: 'edges' }
            ContainerStyle::Flex(FlexLayoutContainerStyle {
                padding_bottom: Some(f32::INFINITY),
                align: None,
                direction: None,
                gap: None,
                justify: None,
                padding_left: None,
                padding_right: None,
                padding_top: None,
                wrap: None,
            }),
            ContainerStyle::Invalid, // { wrap: 'reverse' }
        ];
        for container_style in cases {
            let nodes = vec![
                LayoutNode {
                    container_style,
                    item_style: ItemStyle::None,
                    kind: FLEX_LAYOUT_KIND.to_string(),
                    parent_index: -1,
                },
                child(None),
            ];
            let tree = LayoutTree { nodes };
            let mut state = create_layout_state();
            register_flex_layout_resolver(&mut state);
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
    fn rejects_malformed_item_fields() {
        let cases: Vec<ItemStyle> = vec![
            ItemStyle::Invalid, // { alignSelf: 'middle' }
            ItemStyle::Flex(FlexLayoutItemStyle {
                basis: Some(FlexBasis::Fixed(-1.0)),
                align_self: None,
                grow: None,
                shrink: None,
            }),
            ItemStyle::Flex(FlexLayoutItemStyle {
                grow: Some(-1.0),
                align_self: None,
                basis: None,
                shrink: None,
            }),
            ItemStyle::Flex(FlexLayoutItemStyle {
                shrink: Some(f32::NAN),
                align_self: None,
                basis: None,
                grow: None,
            }),
        ];
        for item_style in cases {
            let nodes = vec![
                root(None),
                LayoutNode {
                    container_style: ContainerStyle::None,
                    item_style,
                    kind: FLEX_LAYOUT_KIND.to_string(),
                    parent_index: 0,
                },
            ];
            let tree = LayoutTree { nodes };
            let mut state = create_layout_state();
            register_flex_layout_resolver(&mut state);
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

    #[test]
    fn normalizes_positive_infinity_in_an_intrinsic_basis() {
        let out = resolve(
            vec![
                root(Some(FlexLayoutContainerStyle {
                    align: Some(FlexLayoutAlign::Start),
                    direction: None,
                    gap: None,
                    justify: None,
                    padding_bottom: None,
                    padding_left: None,
                    padding_right: None,
                    padding_top: None,
                    wrap: None,
                })),
                child(None),
            ],
            &[0.0, 0.0, f32::INFINITY, 17.0],
            100.0,
            70.0,
        );
        assert_eq!(&out[4..8], &[0.0, 0.0, 0.0, 17.0]);
    }
}
