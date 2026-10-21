use flight_font_formats::*;
use flight_path::{Path, PathWinding, create_path};

fn run(bytes: &[u8]) -> (bool, Path) {
    let mut path = create_path(Some(PathWinding::EvenOdd));
    let ok = run_cff_charstring(
        &mut path,
        bytes,
        &CffIndexEntry {
            start: 0,
            end: bytes.len(),
        },
        &[],
        &[],
    );
    return (ok, path);
}

mod cff_subroutine_bias {
    use super::*;
    #[test]
    fn steps_at_both_format_thresholds() {
        assert_eq!(cff_subroutine_bias(0), 107);
        assert_eq!(cff_subroutine_bias(1239), 107);
        assert_eq!(cff_subroutine_bias(1240), 1131);
        assert_eq!(cff_subroutine_bias(33899), 1131);
        assert_eq!(cff_subroutine_bias(33900), 32768);
    }
}

mod run_cff_charstring {
    use super::*;
    #[test]
    fn writes_nonzero_winding_instead_of_leaving_a_stale_rule() {
        assert_eq!(run(&[149, 159, 21, 14]).1.winding, PathWinding::NonZero);
    }
    #[test]
    fn emits_a_move_and_closes_on_endchar() {
        let (ok, path) = run(&[149, 159, 21, 14]);
        assert!(ok);
        assert_eq!(path.commands, [1, 7]);
        assert_eq!(path.data, [10.0, -20.0]);
    }
    #[test]
    fn draws_relative_lines() {
        let (_, path) = run(&[139, 139, 21, 189, 139, 139, 199, 5, 14]);
        assert_eq!(path.commands, [1, 2, 2, 7]);
        assert_eq!(path.data, [0.0, -0.0, 50.0, -0.0, 50.0, -60.0]);
    }
    #[test]
    fn alternates_axis_for_horizontal_and_vertical_lines() {
        let (_, path) = run(&[139, 139, 21, 149, 159, 169, 6, 14]);
        assert_eq!(path.data, [0.0, -0.0, 10.0, -0.0, 10.0, -20.0, 40.0, -20.0]);
    }
    #[test]
    fn emits_cubic_curves() {
        let (_, path) = run(&[139, 139, 21, 149, 139, 149, 149, 139, 149, 8, 14]);
        assert_eq!(path.commands, [1, 6, 7]);
        assert_eq!(path.data, [0.0, -0.0, 10.0, -0.0, 20.0, -10.0, 20.0, -20.0]);
    }
    #[test]
    fn discards_a_leading_width_only_at_the_first_stack_clearing_operator() {
        assert_eq!(
            run(&[238, 149, 159, 21, 14]).1.data,
            run(&[149, 159, 21, 14]).1.data
        );
    }
    #[test]
    fn does_not_treat_later_move_arguments_as_a_width() {
        let (_, path) = run(&[149, 159, 21, 144, 144, 21, 14]);
        assert_eq!(&path.data[..2], &[10.0, -20.0]);
        assert_eq!(&path.data[2..4], &[15.0, -25.0]);
    }
    #[test]
    fn closes_the_previous_contour_before_a_second_move() {
        let (_, path) = run(&[139, 139, 21, 149, 139, 5, 189, 189, 21, 149, 139, 5, 14]);
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == 1)
                .count(),
            2
        );
        assert_eq!(
            path.commands
                .iter()
                .filter(|command| **command == 7)
                .count(),
            2
        );
    }
    #[test]
    fn skips_hintmask_bytes_implied_by_explicit_stems() {
        let (ok, path) = run(&[
            139, 139, 149, 149, 1, 139, 139, 21, 19, 255, 149, 139, 5, 14,
        ]);
        assert!(ok);
        assert_eq!(path.commands, [1, 2, 7]);
    }
    #[test]
    fn counts_implicit_stems_before_a_mask() {
        let mut bytes = vec![139, 139, 21];
        for value in 0..9 {
            bytes.extend_from_slice(&[139 + value, 139 + value]);
        }
        bytes.extend_from_slice(&[19, 255, 255, 149, 139, 5, 14]);
        let (ok, path) = run(&bytes);
        assert!(ok);
        assert_eq!(path.commands, [1, 2, 7]);
    }
    #[test]
    fn calls_biased_local_subroutines_and_returns_to_the_caller() {
        let bytes = [139, 139, 21, 32, 10, 14, 149, 139, 5, 11];
        let mut path = create_path(None);
        assert!(run_cff_charstring(
            &mut path,
            &bytes,
            &CffIndexEntry { start: 0, end: 6 },
            &[CffIndexEntry { start: 6, end: 10 }],
            &[]
        ));
        assert_eq!(path.commands, [1, 2, 7]);
    }
    #[test]
    fn returns_false_for_indices_outside_the_subroutine_pool() {
        assert!(!run(&[139, 139, 21, 189, 10, 14]).0);
    }
    #[test]
    fn returns_false_for_unknown_operators() {
        assert!(!run(&[139, 139, 21, 2, 14]).0);
    }
    #[test]
    fn returns_true_with_an_empty_path_for_endchar_alone() {
        let (ok, path) = run(&[14]);
        assert!(ok);
        assert!(path.commands.is_empty());
    }
    #[test]
    fn replaces_the_previous_output_contents() {
        let bytes = [139, 139, 21, 149, 139, 5, 14];
        let entry = CffIndexEntry {
            start: 0,
            end: bytes.len(),
        };
        let mut path = create_path(None);
        assert!(run_cff_charstring(&mut path, &bytes, &entry, &[], &[]));
        let first = path.commands.clone();
        assert!(run_cff_charstring(&mut path, &bytes, &entry, &[], &[]));
        assert_eq!(path.commands, first);
    }
    #[test]
    fn closes_an_unterminated_contour() {
        let (ok, path) = run(&[139, 139, 21, 149, 139, 5]);
        assert!(ok);
        assert_eq!(path.commands.last(), Some(&7));
    }
    #[test]
    fn invokes_global_pools_and_refuses_recursive_calls_past_the_depth_limit() {
        let bytes = [139, 139, 21, 32, 29, 14, 149, 139, 5, 11];
        let mut path = create_path(None);
        assert!(run_cff_charstring(
            &mut path,
            &bytes,
            &CffIndexEntry { start: 0, end: 6 },
            &[],
            &[CffIndexEntry { start: 6, end: 10 }]
        ));
        assert_eq!(path.data, [0.0, -0.0, 10.0, -0.0]);
        assert!(!run_cff_charstring(
            &mut path,
            &[32, 10, 11],
            &CffIndexEntry { start: 0, end: 3 },
            &[CffIndexEntry { start: 0, end: 3 }],
            &[]
        ));
    }
    #[test]
    fn reads_exact_fixed_point_operands_and_rejects_truncated_encodings() {
        let (_, path) = run(&[255, 0, 0, 128, 0, 255, 0, 1, 64, 0, 21, 14]);
        assert_eq!(path.data, [0.5, -1.25]);
        for bytes in [
            vec![28],
            vec![247],
            vec![251],
            vec![255, 0, 0],
            vec![12],
            vec![139, 139, 1, 19],
        ] {
            assert!(!run(&bytes).0);
        }
    }
    #[test]
    fn handles_axis_constrained_and_alternating_curves_and_mixed_line_operators() {
        for (operator, operands, commands, end) in [
            (26, vec![10, 20, 30, 40], vec![1, 6, 7], vec![20.0, -80.0]),
            (27, vec![10, 20, 30, 40], vec![1, 6, 7], vec![70.0, -30.0]),
            (
                30,
                vec![10, 20, 30, 40, 5],
                vec![1, 6, 7],
                vec![60.0, -45.0],
            ),
            (
                31,
                vec![10, 20, 30, 40, 5],
                vec![1, 6, 7],
                vec![35.0, -70.0],
            ),
            (
                24,
                vec![10, 0, 10, 10, 0, 10, 5, 6],
                vec![1, 6, 2, 7],
                vec![25.0, -26.0],
            ),
            (
                25,
                vec![5, 6, 10, 0, 10, 10, 0, 10],
                vec![1, 2, 6, 7],
                vec![25.0, -26.0],
            ),
        ] {
            let mut bytes = vec![139, 139, 21];
            bytes.extend(operands.iter().map(|operand| (*operand + 139) as u8));
            bytes.extend_from_slice(&[operator, 14]);
            let (ok, path) = run(&bytes);
            assert!(ok);
            assert_eq!(path.commands, commands);
            assert_eq!(&path.data[path.data.len() - 2..], &end);
        }
    }
    #[test]
    fn keeps_source_nan_geometry_for_incomplete_line_curve_operands() {
        let (ok, path) = run(&[25, 14]);
        assert!(ok);
        assert_eq!(path.commands, [6]);
        assert!(path.data.iter().all(|value| value.is_nan()));
    }
    #[test]
    fn uses_view_relative_ranges_without_copying_or_rewriting_the_byte_stream() {
        let storage = [99, 139, 139, 21, 149, 139, 5, 14, 88];
        let view = &storage[1..8];
        let mut path = create_path(None);
        assert!(run_cff_charstring(
            &mut path,
            view,
            &CffIndexEntry { start: 0, end: 7 },
            &[],
            &[]
        ));
        assert_eq!(path.data, [0.0, -0.0, 10.0, -0.0]);
        assert_eq!(storage[0], 99);
        assert_eq!(storage[8], 88);
    }
}
