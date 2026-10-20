use std::cell::RefCell;

use flight_spatial::*;

thread_local! {
    static NOTICES: RefCell<Vec<SpatialIndexingNotice>> = RefCell::new(Vec::new());
}

fn test_guard(notice: &SpatialIndexingNotice) {
    NOTICES.with(|n| n.borrow_mut().push(notice.clone()));
}

fn take_notices() -> Vec<SpatialIndexingNotice> {
    NOTICES.with(|n| n.borrow_mut().drain(..).collect())
}

fn box3(min_x: f32, min_y: f32, min_z: f32, size: f32) -> SpatialAabb3D {
    return create_spatial_aabb_3d(min_x, min_y, min_z, min_x + size, min_y + size, min_z + size);
}

fn sorted_ids(ids: &[SpatialObjectId]) -> Vec<SpatialObjectId> {
    let mut v: Vec<SpatialObjectId> = ids.to_vec();
    v.sort();
    return v;
}

mod create_uniform_grid_spatial_backend_3d {
    use super::*;

    #[test]
    fn clears_every_object_while_staying_reusable() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let huge = create_spatial_aabb_3d(0.0, 0.0, 0.0, 1e9, 1e9, 1e9);
        insert_spatial_object_3d(&mut grid, 2, &huge);
        clear_spatial_index_3d(&mut grid);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 1.0, 1.0, 1.0, &mut out);
        assert!(out.is_empty());
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Absent);
        assert_eq!(explain_spatial_indexing_3d(&grid, 2).mode, SpatialIndexingMode::Absent);

        insert_spatial_object_3d(&mut grid, 3, &box3(0.0, 0.0, 0.0, 5.0));
        query_spatial_point_3d(&mut grid, 1.0, 1.0, 1.0, &mut out);
        assert_eq!(out, vec![3]);
    }

    #[test]
    fn declines_non_finite_and_inverted_bounds_along_z() {
        let mut grid = create_spatial_index_3d(10.0);
        let nan_z = create_spatial_aabb_3d(0.0, 0.0, f32::NAN, 1.0, 1.0, 1.0);
        assert!(!insert_spatial_object_3d(&mut grid, 1, &nan_z));
        let inverted_z = create_spatial_aabb_3d(0.0, 0.0, 5.0, 1.0, 1.0, 0.0);
        assert!(!insert_spatial_object_3d(&mut grid, 2, &inverted_z));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).reason, Some(SpatialDeclineReason::NonFiniteBounds));
        assert_eq!(explain_spatial_indexing_3d(&grid, 2).reason, Some(SpatialDeclineReason::InvertedBounds));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = create_spatial_aabb_3d(-1e6, -1e6, -1e6, 1e6, 1e6, 1e6);
        query_spatial_region_3d(&mut grid, &region, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn routes_past_budget_to_overflow_and_keeps_queryable() {
        let mut grid = create_spatial_index_3d(1.0);
        assert!(insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 10.5)));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Overflow);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 5.0, 5.0, 5.0, &mut out);
        assert_eq!(out, vec![1]);
        query_spatial_region_3d(&mut grid, &box3(2.0, 2.0, 2.0, 1.0), &mut out);
        assert_eq!(out, vec![1]);
        query_spatial_ray_3d(&mut grid, -100.0, 5.0, 5.0, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn holds_at_budget_in_cells() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 9.5));
        let explanation = explain_spatial_indexing_3d(&grid, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);
        assert_eq!(explanation.bucket_count, 1000.0);
        assert!(explanation.bucket_count <= MAX_INDEXED_CELLS_PER_OBJECT as f64);
    }

    #[test]
    fn reports_span_for_overflow() {
        take_notices();
        let mut grid = create_spatial_index_3d(1.0);
        set_spatial_indexing_guard_3d(&mut grid, Some(test_guard));
        insert_spatial_object_3d(&mut grid, 7, &box3(0.0, 0.0, 0.0, 19.0));
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].cell_size, 1.0);
        assert_eq!(captured[0].id, 7);
        assert_eq!(captured[0].mode, SpatialIndexingMode::Overflow);
        assert_eq!(captured[0].reason, None);
        assert_eq!(captured[0].would_occupy_bucket_count, 8000.0);
    }

    #[test]
    fn keeps_results_correct_with_invalid_cell_size() {
        take_notices();
        let mut grid = create_spatial_index_3d(0.0);
        set_spatial_indexing_guard_3d(&mut grid, Some(test_guard));
        assert!(insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 10.0)));
        let explanation = explain_spatial_indexing_3d(&grid, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].reason, Some(SpatialIndexingReason::InvalidCellSize));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 5.0, 5.0, 5.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn removes_object_from_every_cell() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 25.0));
        remove_spatial_object_3d(&mut grid, 1);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        for c in [1.0_f32, 11.0, 21.0] {
            query_spatial_point_3d(&mut grid, c, c, c, &mut out);
            assert!(out.is_empty());
        }
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Absent);
    }
}

mod query_spatial_pairs_3d_test {
    use super::*;

    #[test]
    fn emits_co_located_pair_once_across_many_cells() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 3.5));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.5, 0.5, 0.5, 3.5));
        let mut out: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_3d(&mut grid, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }

    #[test]
    fn never_emits_self_pair_and_orders_ids() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 9, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 4, &box3(1.0, 1.0, 1.0, 5.0));
        let mut out: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_3d(&mut grid, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 4);
        assert_eq!(out[0].b, 9);
    }

    #[test]
    fn separates_objects_sharing_no_cell() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 0.5));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 0.0, 50.0, 0.5));
        let mut out: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_3d(&mut grid, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn pairs_overflow_only_against_real_overlaps() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 40.0));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Overflow);
        insert_spatial_object_3d(&mut grid, 2, &box3(5.0, 5.0, 5.0, 1.0));
        insert_spatial_object_3d(&mut grid, 3, &box3(500.0, 500.0, 500.0, 1.0));
        let mut out: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_3d(&mut grid, &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }
}

mod query_spatial_point_3d_test {
    use super::*;

    #[test]
    fn confirms_cell_co_occupant_against_real_bounds() {
        let mut grid = create_spatial_index_3d(100.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(50.0, 50.0, 50.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 0.5, 0.5, 0.5, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn separates_points_differing_only_in_z() {
        let mut grid = create_spatial_index_3d(10.0);
        let bounds = create_spatial_aabb_3d(0.0, 0.0, 0.0, 100.0, 100.0, 5.0);
        insert_spatial_object_3d(&mut grid, 1, &bounds);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 50.0, 50.0, 2.0, &mut out);
        assert_eq!(out, vec![1]);
        query_spatial_point_3d(&mut grid, 50.0, 50.0, 7.0, &mut out);
        assert!(out.is_empty());
    }
}

mod query_spatial_ray_3d_test {
    use super::*;

    #[test]
    fn finds_objects_along_each_axis() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(100.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 100.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 3, &box3(0.0, 0.0, 100.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut grid, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, vec![1]);
        query_spatial_ray_3d(&mut grid, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0, &mut out);
        assert_eq!(out, vec![2]);
        query_spatial_ray_3d(&mut grid, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, &mut out);
        assert_eq!(out, vec![3]);
    }

    #[test]
    fn walks_a_diagonal() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(10.0, 10.0, 10.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut grid, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn treats_zero_direction_as_point_query() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut grid, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn returns_nothing_from_empty_grid() {
        let mut grid = create_spatial_index_3d(10.0);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut grid, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn still_terminates_when_only_overflow_remains() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 3.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 0.0, 0.0, 40.0));
        remove_spatial_object_3d(&mut grid, 1);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut grid, -1e6, 5.0, 5.0, 1.0, 0.0, 0.0, &mut out);
        assert_eq!(out, vec![2]);
    }
}

mod query_spatial_region_3d_test {
    use super::*;

    #[test]
    fn confirms_cell_mates_against_region_bounds() {
        let mut grid = create_spatial_index_3d(100.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(50.0, 50.0, 50.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut grid, &box3(0.0, 0.0, 0.0, 2.0), &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn answers_wide_region_by_scanning_objects() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 0.5));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = create_spatial_aabb_3d(-1e6, -1e6, -1e6, 1e6, 1e6, 1e6);
        query_spatial_region_3d(&mut grid, &region, &mut out);
        assert_eq!(out, vec![1]);
    }
}

mod update_spatial_object_3d_test {
    use super::*;

    #[test]
    fn fast_path_refreshes_bounds() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(1.0, 1.0, 1.0, 3.0));
        let updated = box3(2.0, 2.0, 2.0, 3.0);
        assert!(update_spatial_object_3d(&mut grid, 1, &updated));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 3.0, 3.0, 3.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn moves_across_cells() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        update_spatial_object_3d(&mut grid, 1, &box3(100.0, 100.0, 100.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 1.0, 1.0, 1.0, &mut out);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut grid, 101.0, 101.0, 101.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn removes_rather_than_strands_on_decline() {
        let mut grid = create_spatial_index_3d(10.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let nan_bounds = create_spatial_aabb_3d(0.0, 0.0, f32::NAN, 5.0, 5.0, 5.0);
        assert!(!update_spatial_object_3d(&mut grid, 1, &nan_bounds));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 1.0, 1.0, 1.0, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn transitions_between_cells_and_overflow() {
        let mut grid = create_spatial_index_3d(1.0);
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 2.0));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Cells);
        update_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 40.0));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Overflow);
        update_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 2.0));
        assert_eq!(explain_spatial_indexing_3d(&grid, 1).mode, SpatialIndexingMode::Cells);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut grid, 1.0, 1.0, 1.0, &mut out);
        assert_eq!(out, vec![1]);
    }
}
