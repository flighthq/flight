use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use flight_entity::allocate_entity;
use flight_geometry::{create_matrix, create_rectangle};
use flight_path::{PathWinding, append_path_line_to, append_path_move_to, create_path};

use super::*;

fn contours() -> Vec<Vec<f64>> {
    return vec![vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
}

fn triangle() -> Vec<Vec<f64>> {
    return vec![vec![0.0, 0.0, 10.0, 0.0, 5.0, 10.0]];
}

mod acquire_clip_region {
    use super::*;

    #[test]
    fn returns_distinct_regions_then_reuses_and_resets_a_released_region() {
        let mut state = create_clip_region_state();
        let a = acquire_clip_region(&mut state);
        let b = acquire_clip_region(&mut state);
        assert!(!Arc::ptr_eq(&a, &b));
        {
            let mut a = a.write().unwrap();
            a.rect.x = 99.0;
            a.contours = Some(vec![vec![1.0, 2.0, 3.0, 4.0]]);
            a.version = 5;
        }
        release_clip_region(&mut state, &a);
        let reused = acquire_clip_region(&mut state);
        assert!(Arc::ptr_eq(&a, &reused));
        let reused = reused.read().unwrap();
        assert_eq!(reused.rect.x, 0.0);
        assert_eq!(reused.contours, None);
        assert_eq!(reused.winding, PathWinding::NonZero);
        assert_eq!(reused.version, 0);
    }
}

mod clip_region_contains_clip_region {
    use super::*;

    #[test]
    fn uses_bounds_conservatively_for_contour_regions() {
        let state = create_clip_region_state();
        let outer = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        let inner = rectangle_clip(8.0, 8.0, 1.0, 1.0);
        assert!(clip_region_contains_clip_region(&state, &outer, &inner));
    }
}

mod clip_region_contains_point {
    use super::*;

    #[test]
    fn tests_rectangles_and_contours_with_the_declared_winding() {
        let state = create_clip_region_state();
        let rectangle = rectangle_clip(0.0, 0.0, 10.0, 10.0);
        assert!(clip_region_contains_point(&state, &rectangle, 5.0, 5.0));
        assert!(!clip_region_contains_point(&state, &rectangle, 15.0, 5.0));
        let triangle = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        assert!(clip_region_contains_point(&state, &triangle, 5.0, 4.0));
        assert!(!clip_region_contains_point(&state, &triangle, 0.0, 9.0));
    }
}

mod clip_region_contains_rectangle {
    use super::*;

    #[test]
    fn answers_from_bounds_for_both_region_forms() {
        let state = create_clip_region_state();
        let clip = rectangle_clip(0.0, 0.0, 100.0, 100.0);
        assert!(clip_region_contains_rectangle(
            &state,
            &clip,
            &create_rectangle(10.0, 10.0, 20.0, 20.0),
        ));
        assert!(!clip_region_contains_rectangle(
            &state,
            &clip,
            &create_rectangle(90.0, 90.0, 20.0, 20.0),
        ));
    }
}

mod clip_region_intersects_clip_region {
    use super::*;

    #[test]
    fn rejects_disjoint_region_bounds() {
        let state = create_clip_region_state();
        let a = rectangle_clip(0.0, 0.0, 10.0, 10.0);
        let b = rectangle_clip(20.0, 20.0, 5.0, 5.0);
        assert!(!clip_region_intersects_clip_region(&state, &a, &b));
    }
}

mod clip_region_intersects_rectangle {
    use super::*;

    #[test]
    fn reports_overlap_and_disjoint_bounds() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        assert!(clip_region_intersects_rectangle(
            &state,
            &clip,
            &create_rectangle(8.0, 8.0, 1.0, 1.0),
        ));
        assert!(!clip_region_intersects_rectangle(
            &state,
            &clip,
            &create_rectangle(20.0, 20.0, 1.0, 1.0),
        ));
    }
}

mod clone_clip_region {
    use super::*;

    #[test]
    fn preserves_version_and_deep_copies_geometry_into_a_fresh_entity() {
        let state = create_clip_region_state();
        let source = create_clip_region_from_contours(&state, &contours(), PathWinding::EvenOdd);
        source.write().unwrap().version = 7;
        let cloned = clone_clip_region(&state, &source);
        assert!(!Arc::ptr_eq(&source, &cloned));
        assert_eq!(region_snapshot(&source), region_snapshot(&cloned));
        cloned.write().unwrap().contours.as_mut().unwrap()[0][0] = 99.0;
        assert_eq!(source.read().unwrap().contours.as_ref().unwrap()[0][0], 0.0);
    }
}

mod copy_clip_region {
    use super::*;

    #[test]
    fn overwrites_out_bumps_version_and_is_an_identity_no_op() {
        let state = create_clip_region_state();
        let source = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let out = rectangle_clip(2.0, 3.0, 4.0, 5.0);
        out.write().unwrap().version = 10;
        copy_clip_region(&state, &out, &source);
        assert_eq!(out.read().unwrap().version, 11);
        assert_eq!(out.read().unwrap().contours, Some(triangle()));
        copy_clip_region(&state, &out, &out);
        assert_eq!(out.read().unwrap().version, 11);
    }
}

mod create_clip_region_from_circle {
    use super::*;

    #[test]
    fn creates_a_contour_with_the_circle_bounds() {
        let clip = create_clip_region_from_circle(50.0, 50.0, 20.0, None);
        let clip = clip.read().unwrap();
        assert!(clip.contours.is_some());
        assert!((clip.rect.x - 30.0).abs() < 0.5);
        assert!((clip.rect.width - 40.0).abs() < 0.5);
    }
}

mod create_clip_region_from_contours {
    use super::*;

    #[test]
    fn deep_copies_valid_input_and_skips_malformed_contours_for_bounds() {
        let state = create_clip_region_state();
        let mut input = contours();
        let clip = create_clip_region_from_contours(&state, &input, PathWinding::NonZero);
        input[0][2] = 999.0;
        assert_eq!(clip.read().unwrap().contours.as_ref().unwrap()[0][2], 10.0);
        assert_eq!(clip.read().unwrap().rect.width, 10.0);

        let malformed = vec![
            vec![0.0, 0.0, 10.0],
            vec![0.0, 0.0, 10.0, 0.0],
            vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0],
        ];
        let empty = create_clip_region_from_contours(&state, &malformed, PathWinding::NonZero);
        assert!(is_clip_region_empty(&state, &empty));
    }
}

mod create_clip_region_from_ellipse {
    use super::*;

    #[test]
    fn creates_a_contour_with_the_source_rectangle_bounds() {
        let clip = create_clip_region_from_ellipse(&create_rectangle(10.0, 20.0, 40.0, 30.0), None);
        let clip = clip.read().unwrap();
        assert!(clip.contours.is_some());
        assert!((clip.rect.x - 10.0).abs() < 0.5);
        assert!((clip.rect.height - 30.0).abs() < 0.5);
    }
}

mod create_clip_region_from_path {
    use super::*;

    #[test]
    fn flattens_path_geometry_and_uses_its_winding() {
        let mut path = create_path(Some(PathWinding::EvenOdd));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        let clip = create_clip_region_from_path(&path, None);
        let clip = clip.read().unwrap();
        assert_eq!(clip.rect.width, 10.0);
        assert_eq!(clip.rect.height, 10.0);
        assert_eq!(clip.winding, PathWinding::EvenOdd);
    }
}

mod create_clip_region_from_rectangle {
    use super::*;

    #[test]
    fn copies_the_rectangle_into_the_scissor_eligible_form() {
        let mut rectangle = create_rectangle(5.0, 6.0, 20.0, 30.0);
        let clip = create_clip_region_from_rectangle(&rectangle);
        rectangle.x = 99.0;
        let clip = clip.read().unwrap();
        assert_eq!(clip.rect.x, 5.0);
        assert_eq!(clip.contours, None);
        assert_eq!(clip.version, 0);
    }
}

mod create_clip_region_from_rounded_rectangle {
    use super::*;

    #[test]
    fn uses_contours_for_positive_radius_and_rect_form_for_zero_radius() {
        let rectangle = create_rectangle(0.0, 0.0, 100.0, 60.0);
        let rounded = create_clip_region_from_rounded_rectangle(&rectangle, 10.0, None);
        let plain = create_clip_region_from_rounded_rectangle(&rectangle, 0.0, None);
        assert!(rounded.read().unwrap().contours.is_some());
        assert!(plain.read().unwrap().contours.is_none());
    }
}

mod create_clip_region_state {
    use super::*;

    #[test]
    fn creates_an_empty_independent_pool() {
        let mut a = create_clip_region_state();
        let mut b = create_clip_region_state();
        let region = acquire_clip_region(&mut a);
        release_clip_region(&mut a, &region);
        assert!(!Arc::ptr_eq(&acquire_clip_region(&mut b), &region));
    }
}

mod equals_clip_region {
    use super::*;

    #[test]
    fn compares_geometry_and_winding_but_not_version() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        let b = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        b.write().unwrap().version = 99;
        assert!(equals_clip_region(&state, &a, &b));
        b.write().unwrap().winding = PathWinding::EvenOdd;
        assert!(!equals_clip_region(&state, &a, &b));
        assert!(equals_clip_region(&state, &a, &a));
    }
}

mod explain_clip_region {
    use super::*;

    #[test]
    fn reports_conservative_geometry_and_pool_ownership() {
        let mut state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        assert_eq!(
            explain_clip_region(&state, &clip).status,
            ClipRegionStatus::Active
        );
        release_clip_region(&mut state, &clip);
        let explanation = explain_clip_region(&state, &clip);
        assert!(explanation.conservative);
        assert_eq!(explanation.status, ClipRegionStatus::Released);
    }
}

mod explain_clip_region_contours {
    use super::*;

    #[test]
    fn reports_the_first_problem_with_odd_runs_before_short_runs() {
        let explanation = explain_clip_region_contours(&[vec![0.0, 0.0, 1.0]]).unwrap();
        assert_eq!(explanation.contour_index, 0);
        assert_eq!(explanation.coordinate_count, 3);
        assert_eq!(
            explanation.reason,
            ClipRegionContoursReason::OddCoordinateCount
        );
        let explanation = explain_clip_region_contours(&[vec![0.0, 0.0, 1.0, 1.0]]).unwrap();
        assert_eq!(explanation.reason, ClipRegionContoursReason::TooFewPoints);
        assert_eq!(explain_clip_region_contours(&contours()), None);
    }
}

mod get_clip_region_bounds {
    use super::*;

    #[test]
    fn copies_bounds_into_the_caller_owned_out_rectangle() {
        let state = create_clip_region_state();
        let clip = rectangle_clip(2.0, 3.0, 4.0, 5.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        get_clip_region_bounds(&state, &mut out, &clip);
        assert_eq!(out, create_rectangle(2.0, 3.0, 4.0, 5.0));
    }
}

mod initialize_clip_region_from_contours {
    use super::*;

    #[test]
    fn initializes_preallocated_entity_storage() {
        let state = create_clip_region_state();
        let mut out: ClipRegion = allocate_entity();
        initialize_clip_region_from_contours(&state, &mut out, &triangle(), PathWinding::EvenOdd);
        assert_eq!(out.contours, Some(triangle()));
        assert_eq!(out.winding, PathWinding::EvenOdd);
    }
}

mod initialize_clip_region_from_path {
    use super::*;

    #[test]
    fn initializes_preallocated_entity_storage() {
        let mut path = create_path(None);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 3.0, 4.0);
        append_path_line_to(&mut path, 6.0, 0.0);
        let mut out: ClipRegion = allocate_entity();
        initialize_clip_region_from_path(&mut out, &path, None);
        assert_eq!(out.rect.width, 6.0);
        assert_eq!(out.rect.height, 4.0);
    }
}

mod initialize_clip_region_from_rectangle {
    use super::*;

    #[test]
    fn initializes_preallocated_entity_storage() {
        let mut out: ClipRegion = allocate_entity();
        initialize_clip_region_from_rectangle(&mut out, &create_rectangle(1.0, 2.0, 3.0, 4.0));
        assert_eq!(out.rect, create_rectangle(1.0, 2.0, 3.0, 4.0));
        assert_eq!(out.contours, None);
    }
}

mod intersect_clip_regions {
    use super::*;

    #[test]
    fn is_alias_safe_and_preserves_contours_for_mixed_inputs() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_contours(&state, &contours(), PathWinding::EvenOdd);
        let b = rectangle_clip(5.0, 5.0, 10.0, 10.0);
        intersect_clip_regions(&state, &a, &a, &b);
        let a = a.read().unwrap();
        assert_eq!(a.rect, create_rectangle(5.0, 5.0, 5.0, 5.0));
        assert!(a.contours.is_some());
        assert_eq!(a.winding, PathWinding::EvenOdd);
        assert_eq!(a.version, 1);
    }

    #[test]
    fn returns_canonical_empty_for_disjoint_inputs() {
        let state = create_clip_region_state();
        let a = rectangle_clip(0.0, 0.0, 1.0, 1.0);
        let b = rectangle_clip(2.0, 2.0, 1.0, 1.0);
        let out = rectangle_clip(9.0, 9.0, 9.0, 9.0);
        intersect_clip_regions(&state, &out, &a, &b);
        assert_eq!(
            out.read().unwrap().rect,
            create_rectangle(0.0, 0.0, 0.0, 0.0)
        );
        assert_eq!(out.read().unwrap().contours, None);
    }
}

mod invalidate_clip_region {
    use super::*;

    #[test]
    fn increments_and_wraps_the_u32_version() {
        let state = create_clip_region_state();
        let clip = rectangle_clip(0.0, 0.0, 1.0, 1.0);
        clip.write().unwrap().version = u32::MAX;
        invalidate_clip_region(&state, &clip);
        assert_eq!(clip.read().unwrap().version, 0);
    }
}

mod is_clip_region_empty {
    use super::*;

    #[test]
    fn treats_empty_bounds_or_an_empty_contour_list_as_empty() {
        let state = create_clip_region_state();
        assert!(is_clip_region_empty(
            &state,
            &rectangle_clip(0.0, 0.0, 0.0, 10.0)
        ));
        assert!(!is_clip_region_empty(
            &state,
            &rectangle_clip(0.0, 0.0, 10.0, 10.0)
        ));
        let contours = create_clip_region_from_contours(&state, &[], PathWinding::NonZero);
        contours.write().unwrap().rect = create_rectangle(0.0, 0.0, 10.0, 10.0);
        assert!(is_clip_region_empty(&state, &contours));
    }
}

mod is_clip_region_rectangular {
    use super::*;

    #[test]
    fn discriminates_the_scissor_form_from_contours() {
        let state = create_clip_region_state();
        assert!(is_clip_region_rectangular(
            &state,
            &rectangle_clip(0.0, 0.0, 1.0, 1.0)
        ));
        let contours = create_clip_region_from_contours(&state, &triangle(), PathWinding::NonZero);
        assert!(!is_clip_region_rectangular(&state, &contours));
    }
}

mod normalize_clip_region {
    use super::*;

    #[test]
    fn restores_quad_contours_to_rect_form_and_is_alias_safe_for_non_rectangles() {
        let state = create_clip_region_state();
        let quad = create_clip_region_from_contours(&state, &contours(), PathWinding::EvenOdd);
        normalize_clip_region(&state, &quad, &quad);
        let quad = quad.read().unwrap();
        assert_eq!(quad.contours, None);
        assert_eq!(quad.rect, create_rectangle(0.0, 0.0, 10.0, 10.0));
        assert_eq!(quad.winding, PathWinding::NonZero);
        drop(quad);

        let triangle = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        normalize_clip_region(&state, &triangle, &triangle);
        assert_eq!(triangle.read().unwrap().contours, Some(super::triangle()));
        assert_eq!(triangle.read().unwrap().winding, PathWinding::EvenOdd);
    }
}

mod release_clip_region {
    use super::*;

    #[test]
    fn returns_the_exact_shared_region_to_the_pool() {
        let mut state = create_clip_region_state();
        let region = acquire_clip_region(&mut state);
        release_clip_region(&mut state, &region);
        assert!(Arc::ptr_eq(&region, &acquire_clip_region(&mut state)));
    }
}

mod set_clip_region_contours_guard {
    use super::*;

    #[test]
    fn installs_and_removes_the_invalid_contour_seam() {
        let reports = Arc::new(AtomicUsize::new(0));
        let captured = reports.clone();
        let mut state = create_clip_region_state();
        set_clip_region_contours_guard(
            &mut state,
            Some(Arc::new(move |_explanation, _contours| {
                captured.fetch_add(1, Ordering::SeqCst);
            })),
        );
        let malformed = vec![vec![0.0, 0.0, 1.0]];
        let _ = create_clip_region_from_contours(&state, &malformed, PathWinding::NonZero);
        set_clip_region_contours_guard(&mut state, None);
        let _ = create_clip_region_from_contours(&state, &malformed, PathWinding::NonZero);
        assert_eq!(reports.load(Ordering::SeqCst), 1);
    }
}

mod set_clip_region_release_guard {
    use super::*;

    #[test]
    fn reports_only_a_duplicate_pool_entry_while_installed() {
        let reports = Arc::new(AtomicUsize::new(0));
        let captured = reports.clone();
        let mut state = create_clip_region_state();
        set_clip_region_release_guard(
            &mut state,
            Some(Arc::new(move |_clip| {
                captured.fetch_add(1, Ordering::SeqCst);
            })),
        );
        let region = acquire_clip_region(&mut state);
        release_clip_region(&mut state, &region);
        release_clip_region(&mut state, &region);
        set_clip_region_release_guard(&mut state, None);
        release_clip_region(&mut state, &region);
        assert_eq!(reports.load(Ordering::SeqCst), 1);
    }
}

mod set_clip_region_to_contours {
    use super::*;

    #[test]
    fn deep_copies_recomputes_bounds_and_bumps_version() {
        let state = create_clip_region_state();
        let out = rectangle_clip(0.0, 0.0, 0.0, 0.0);
        let mut source = triangle();
        set_clip_region_to_contours(&state, &out, &source, PathWinding::EvenOdd);
        source[0][0] = 99.0;
        let out = out.read().unwrap();
        assert_eq!(out.contours, Some(triangle()));
        assert_eq!(out.rect, create_rectangle(0.0, 0.0, 10.0, 10.0));
        assert_eq!(out.version, 1);
    }
}

mod set_clip_region_to_rectangle {
    use super::*;

    #[test]
    fn retargets_contours_to_scissor_form_and_bumps_version() {
        let state = create_clip_region_state();
        let out = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        set_clip_region_to_rectangle(&state, &out, &create_rectangle(5.0, 6.0, 7.0, 8.0));
        let out = out.read().unwrap();
        assert_eq!(out.contours, None);
        assert_eq!(out.rect, create_rectangle(5.0, 6.0, 7.0, 8.0));
        assert_eq!(out.winding, PathWinding::NonZero);
        assert_eq!(out.version, 1);
    }
}

mod set_clip_region_use_guard {
    use super::*;

    #[test]
    fn reports_use_after_release_only_while_installed() {
        let reports = Arc::new(AtomicUsize::new(0));
        let captured = reports.clone();
        let mut state = create_clip_region_state();
        set_clip_region_use_guard(
            &mut state,
            Some(Arc::new(move |_clip| {
                captured.fetch_add(1, Ordering::SeqCst);
            })),
        );
        let clip = acquire_clip_region(&mut state);
        release_clip_region(&mut state, &clip);
        let _ = clip_region_contains_point(&state, &clip, 0.0, 0.0);
        set_clip_region_use_guard(&mut state, None);
        let _ = clip_region_contains_point(&state, &clip, 0.0, 0.0);
        assert_eq!(reports.load(Ordering::SeqCst), 1);
    }
}

mod transform_clip_region {
    use super::*;

    #[test]
    fn preserves_rect_form_for_axis_alignment_and_promotes_rotation_to_a_quad() {
        let state = create_clip_region_state();
        let clip = rectangle_clip(0.0, 0.0, 10.0, 10.0);
        transform_clip_region(
            &state,
            &clip,
            &clip,
            &create_matrix(2.0, 0.0, 0.0, 2.0, 5.0, 5.0),
        );
        assert_eq!(
            clip.read().unwrap().rect,
            create_rectangle(5.0, 5.0, 20.0, 20.0)
        );
        assert_eq!(clip.read().unwrap().contours, None);

        let rotated = rectangle_clip(0.0, 0.0, 10.0, 10.0);
        transform_clip_region(
            &state,
            &rotated,
            &rotated,
            &create_matrix(0.0, 1.0, -1.0, 0.0, 10.0, 0.0),
        );
        assert_eq!(
            rotated.read().unwrap().contours.as_ref().unwrap()[0].len(),
            8
        );
        assert_eq!(
            rotated.read().unwrap().rect,
            create_rectangle(0.0, 0.0, 10.0, 10.0)
        );
    }

    #[test]
    fn transforms_contours_alias_safely() {
        let state = create_clip_region_state();
        let clip = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        transform_clip_region(
            &state,
            &clip,
            &clip,
            &create_matrix(1.0, 0.0, 0.0, 1.0, 5.0, 7.0),
        );
        assert_eq!(
            clip.read().unwrap().contours,
            Some(vec![vec![5.0, 7.0, 15.0, 7.0, 10.0, 17.0]])
        );
    }
}

mod union_clip_regions {
    use super::*;

    #[test]
    fn is_alias_safe_and_keeps_contours_from_the_richer_input() {
        let state = create_clip_region_state();
        let a = create_clip_region_from_contours(&state, &triangle(), PathWinding::EvenOdd);
        let b = rectangle_clip(5.0, 5.0, 20.0, 20.0);
        union_clip_regions(&state, &b, &a, &b);
        let b = b.read().unwrap();
        assert_eq!(b.rect, create_rectangle(0.0, 0.0, 25.0, 25.0));
        assert_eq!(b.contours, Some(triangle()));
        assert_eq!(b.winding, PathWinding::EvenOdd);
        assert_eq!(b.version, 1);
    }
}
