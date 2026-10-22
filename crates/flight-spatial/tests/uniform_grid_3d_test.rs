use std::cell::RefCell;

use flight_spatial::contract::initialize_uniform_grid_spatial_backend_3d;
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
    return SpatialAabb3D {
        min_x,
        min_y,
        min_z,
        max_x: min_x + size,
        max_y: min_y + size,
        max_z: min_z + size,
    };
}

mod create_uniform_grid_spatial_backend_3d {
    use super::*;

    #[test]
    fn returns_an_entity() {
        let mut backend = create_uniform_grid_spatial_backend_3d(10.0);
        assert!(!flight_entity::has_entity_runtime(&backend));
        flight_entity::set_entity_uid(&mut backend, "grid3d".to_owned());
        assert!(flight_entity::has_entity_runtime(&backend));
        assert_eq!(flight_entity::get_entity_uid(&mut backend), "grid3d");
    }

    #[test]
    fn clears_every_object_while_staying_reusable() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let huge = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 1e9,
            max_y: 1e9,
            max_z: 1e9,
        };
        insert_spatial_object_3d(&mut grid, 2, &huge);
        clear_spatial_index_3d(&mut grid);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 1.0, 1.0, 1.0);
        assert!(out.is_empty());
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Absent
        );
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 2).mode,
            SpatialIndexingMode::Absent
        );

        insert_spatial_object_3d(&mut grid, 3, &box3(0.0, 0.0, 0.0, 5.0));
        query_spatial_point_3d(&mut out, &mut grid, 1.0, 1.0, 1.0);
        assert_eq!(out, vec![3]);
    }

    #[test]
    #[allow(unused_assignments)]
    fn copies_the_bounds_so_caller_may_reuse() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        let mut bounds = box3(1.0, 1.0, 1.0, 4.0);
        insert_spatial_object_3d(&mut grid, 1, &bounds);
        bounds.min_x = -500.0;
        bounds.max_z = 500.0;

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, -400.0, 1.0, 1.0);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut out, &mut grid, 2.0, 2.0, 2.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn declines_non_finite_and_inverted_bounds_along_z() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        let nan_z = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: f32::NAN,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        };
        assert!(!insert_spatial_object_3d(&mut grid, 1, &nan_z));
        let inverted_z = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 5.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 0.0,
        };
        assert!(!insert_spatial_object_3d(&mut grid, 2, &inverted_z));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).reason,
            Some(SpatialDeclineReason::NonFiniteBounds)
        );
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 2).reason,
            Some(SpatialDeclineReason::InvertedBounds)
        );

        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = SpatialAabb3D {
            min_x: -1e6,
            min_y: -1e6,
            min_z: -1e6,
            max_x: 1e6,
            max_y: 1e6,
            max_z: 1e6,
        };
        query_spatial_region_3d(&mut out, &mut grid, &region);
        assert!(out.is_empty());
    }

    #[test]
    fn routes_past_budget_to_overflow_and_keeps_queryable() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        assert!(insert_spatial_object_3d(
            &mut grid,
            1,
            &box3(0.0, 0.0, 0.0, 10.5)
        ));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Overflow
        );

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 5.0, 5.0, 5.0);
        assert_eq!(out, vec![1]);
        query_spatial_region_3d(&mut out, &mut grid, &box3(2.0, 2.0, 2.0, 1.0));
        assert_eq!(out, vec![1]);
        query_spatial_ray_3d(&mut out, &mut grid, -100.0, 5.0, 5.0, 1.0, 0.0, 0.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn holds_at_budget_in_cells() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 9.5));
        let explanation = explain_spatial_indexing_3d(&grid, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);
        assert_eq!(explanation.bucket_count, 1000.0);
        assert!(explanation.bucket_count <= MAX_INDEXED_CELLS_PER_OBJECT as f64);
    }

    #[test]
    fn reports_span_for_overflow() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        set_spatial_indexing_guard(Some(crate::spatial_guard_for_current_test(test_guard)));
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
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(0.0)));
        set_spatial_indexing_guard(Some(crate::spatial_guard_for_current_test(test_guard)));
        assert!(insert_spatial_object_3d(
            &mut grid,
            1,
            &box3(0.0, 0.0, 0.0, 10.0)
        ));
        let explanation = explain_spatial_indexing_3d(&grid, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(
            captured[0].reason,
            Some(SpatialIndexingReason::InvalidCellSize)
        );

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 5.0, 5.0, 5.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn removes_object_from_every_cell() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 25.0));
        remove_spatial_object_3d(&mut grid, 1);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        for c in [1.0_f32, 11.0, 21.0] {
            query_spatial_point_3d(&mut out, &mut grid, c, c, c);
            assert!(out.is_empty());
        }
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Absent
        );
    }
}

mod initialize_uniform_grid_spatial_backend_3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut backend = create_uniform_grid_spatial_backend_3d(1.0);
        initialize_uniform_grid_spatial_backend_3d(&mut backend, 10.0);
        let mut out = create_spatial_index_3d(Some(backend));
        insert_spatial_object_3d(&mut out, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut point, &mut out, 2.5, 2.5, 2.5);
        assert_eq!(point, vec![1]);
    }
}

mod query_spatial_pairs_3d {
    use super::*;

    #[test]
    fn emits_co_located_pair_once_across_many_cells() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 3.5));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.5, 0.5, 0.5, 3.5));
        let out = query_spatial_pairs_3d(&mut grid);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }

    #[test]
    fn never_emits_self_pair_and_orders_ids() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 9, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 4, &box3(1.0, 1.0, 1.0, 5.0));
        let out = query_spatial_pairs_3d(&mut grid);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 4);
        assert_eq!(out[0].b, 9);
    }

    #[test]
    fn separates_objects_sharing_no_cell() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 0.5));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 0.0, 50.0, 0.5));
        let out = query_spatial_pairs_3d(&mut grid);
        assert!(out.is_empty());
    }

    #[test]
    fn clears_the_out_array_between_queries() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(1.0, 1.0, 1.0, 5.0));
        let first = query_spatial_pairs_3d(&mut grid).as_ptr();
        let out = query_spatial_pairs_3d(&mut grid);
        assert!(std::ptr::eq(first, &out[0]));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }

    #[test]
    fn pairs_overflow_only_against_real_overlaps() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 40.0));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Overflow
        );
        insert_spatial_object_3d(&mut grid, 2, &box3(5.0, 5.0, 5.0, 1.0));
        insert_spatial_object_3d(&mut grid, 3, &box3(500.0, 500.0, 500.0, 1.0));
        let out = query_spatial_pairs_3d(&mut grid);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }

    #[test]
    fn retains_pair_objects_across_steady_topology_query() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(1.0, 1.0, 1.0, 5.0));
        let out = query_spatial_pairs_3d(&mut grid);
        let pair = out[0];
        let pair_address = &out[0] as *const SpatialPair;

        let out = query_spatial_pairs_3d(&mut grid);

        assert_eq!(out[0], pair);
        assert!(std::ptr::eq(pair_address, &out[0]));
    }
}

mod query_spatial_point_3d {
    use super::*;

    #[test]
    fn confirms_cell_co_occupant_against_real_bounds() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(100.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(50.0, 50.0, 50.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 0.5, 0.5, 0.5);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn separates_points_differing_only_in_z() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        let bounds = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 100.0,
            max_y: 100.0,
            max_z: 5.0,
        };
        insert_spatial_object_3d(&mut grid, 1, &bounds);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 50.0, 50.0, 2.0);
        assert_eq!(out, vec![1]);
        query_spatial_point_3d(&mut out, &mut grid, 50.0, 50.0, 7.0);
        assert!(out.is_empty());
    }
}

mod query_spatial_ray_3d {
    use super::*;

    #[test]
    fn finds_objects_along_each_axis() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(100.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 100.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 3, &box3(0.0, 0.0, 100.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0);
        assert_eq!(out, vec![1]);
        query_spatial_ray_3d(&mut out, &mut grid, 1.0, 1.0, 1.0, 0.0, 1.0, 0.0);
        assert_eq!(out, vec![2]);
        query_spatial_ray_3d(&mut out, &mut grid, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0);
        assert_eq!(out, vec![3]);
    }

    #[test]
    fn drops_cell_co_occupant_ray_does_not_strike() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(100.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 90.0, 90.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, -10.0, 0.5, 0.5, 1.0, 0.0, 0.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn ignores_objects_behind_the_origin() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, 100.0, 2.0, 2.0, 1.0, 0.0, 0.0);
        assert!(out.is_empty());
    }

    #[test]
    fn walks_a_diagonal() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(10.0, 10.0, 10.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn treats_zero_direction_as_point_query() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn returns_nothing_from_empty_grid() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        assert!(out.is_empty());
    }

    #[test]
    fn still_terminates_when_only_overflow_remains() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 3.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(0.0, 0.0, 0.0, 40.0));
        remove_spatial_object_3d(&mut grid, 1);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut grid, -1e6, 5.0, 5.0, 1.0, 0.0, 0.0);
        assert_eq!(out, vec![2]);
    }
}

mod query_spatial_region_3d {
    use super::*;

    #[test]
    fn confirms_cell_mates_against_region_bounds() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(100.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(50.0, 50.0, 50.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut out, &mut grid, &box3(0.0, 0.0, 0.0, 2.0));
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn excludes_object_that_only_touches_a_face() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = SpatialAabb3D {
            min_x: 5.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 9.0,
            max_y: 5.0,
            max_z: 5.0,
        };
        query_spatial_region_3d(&mut out, &mut grid, &region);
        assert!(out.is_empty());
    }

    #[test]
    fn answers_wide_region_by_scanning_objects() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 0.5));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = SpatialAabb3D {
            min_x: -1e6,
            min_y: -1e6,
            min_z: -1e6,
            max_x: 1e6,
            max_y: 1e6,
            max_z: 1e6,
        };
        query_spatial_region_3d(&mut out, &mut grid, &region);
        assert_eq!(out, vec![1]);
    }
}

mod update_spatial_object_3d {
    use super::*;

    #[test]
    fn fast_path_refreshes_bounds() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(1.0, 1.0, 1.0, 3.0));
        let updated = box3(2.0, 2.0, 2.0, 3.0);
        assert!(update_spatial_object_3d(&mut grid, 1, &updated));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, -50.0, 2.0, 2.0);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut out, &mut grid, 3.0, 3.0, 3.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn moves_across_cells() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        update_spatial_object_3d(&mut grid, 1, &box3(100.0, 100.0, 100.0, 5.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 1.0, 1.0, 1.0);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut out, &mut grid, 101.0, 101.0, 101.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn removes_rather_than_strands_on_decline() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let nan_bounds = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: f32::NAN,
            max_x: 5.0,
            max_y: 5.0,
            max_z: 5.0,
        };
        assert!(!update_spatial_object_3d(&mut grid, 1, &nan_bounds));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 1.0, 1.0, 1.0);
        assert!(out.is_empty());
    }

    #[test]
    fn transitions_between_cells_and_overflow() {
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 2.0));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Cells
        );
        update_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 40.0));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Overflow
        );
        update_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 2.0));
        assert_eq!(
            explain_spatial_indexing_3d(&grid, 1).mode,
            SpatialIndexingMode::Cells
        );

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut grid, 1.0, 1.0, 1.0);
        assert_eq!(out, vec![1]);
    }
}
