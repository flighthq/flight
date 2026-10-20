use flight_spatial::*;

fn pair_keys(pairs: &[SpatialPair]) -> Vec<String> {
    let mut keys: Vec<String> = pairs
        .iter()
        .map(|p| {
            let a = p.a.min(p.b);
            let b = p.a.max(p.b);
            format!("{}-{}", a, b)
        })
        .collect();
    keys.sort();
    return keys;
}

fn sorted_ids(ids: &[SpatialObjectId]) -> Vec<SpatialObjectId> {
    let mut v: Vec<SpatialObjectId> = ids.to_vec();
    v.sort();
    return v;
}

fn bounds_overlap(a: &SpatialAabb2D, b: &SpatialAabb2D) -> bool {
    return a.min_x < b.max_x && a.max_x > b.min_x && a.min_y < b.max_y && a.max_y > b.min_y;
}

mod create_uniform_grid_spatial_backend_2d {
    use super::*;

    #[test]
    fn emits_pair_spanning_several_shared_cells_exactly_once() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 25.0, 25.0));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(5.0, 5.0, 29.0, 29.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn never_pairs_an_object_with_itself() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pairs.len(), 0);
    }

    #[test]
    fn returns_nothing_from_every_query_on_empty_grid() {
        let mut grid = create_spatial_index_2d(10.0);
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(-50.0, -50.0, 50.0, 50.0), &mut region);
        assert_eq!(region.len(), 0);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 0.0, 0.0, &mut point);
        assert_eq!(point.len(), 0);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, 0.0, 0.0, 1.0, 1.0, &mut ray);
        assert_eq!(ray.len(), 0);
    }

    #[test]
    fn indexes_objects_at_negative_coordinates() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-8.0, -8.0, -4.0, -4.0));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(-6.0, -6.0, -2.0, -2.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, -5.0, -5.0, &mut point);
        assert_eq!(sorted_ids(&point), vec![1, 2]);
    }

    #[test]
    fn gives_the_same_confirmed_pairs_across_cell_sizes() {
        let objects: Vec<(SpatialObjectId, SpatialAabb2D)> = vec![
            (1, create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0)),
            (2, create_spatial_aabb_2d(5.0, 5.0, 15.0, 15.0)),
            (3, create_spatial_aabb_2d(12.0, 12.0, 20.0, 20.0)),
            (4, create_spatial_aabb_2d(100.0, 100.0, 110.0, 110.0)),
        ];

        let confirmed_pairs = |cell_size: f32| -> Vec<String> {
            let mut grid = create_spatial_index_2d(cell_size);
            for &(id, ref bounds) in &objects {
                insert_spatial_object_2d(&mut grid, id, bounds);
            }
            let mut candidates: Vec<SpatialPair> = Vec::new();
            query_spatial_pairs_2d(&mut grid, &mut candidates);
            let confirmed: Vec<SpatialPair> = candidates
                .iter()
                .filter(|p| {
                    let ab = objects.iter().find(|(id, _)| *id == p.a).unwrap().1;
                    let bb = objects.iter().find(|(id, _)| *id == p.b).unwrap().1;
                    bounds_overlap(&ab, &bb)
                })
                .copied()
                .collect();
            return pair_keys(&confirmed);
        };

        let fine = confirmed_pairs(10.0);
        let coarse = confirmed_pairs(64.0);
        assert_eq!(fine, vec!["1-2", "2-3"]);
        assert_eq!(coarse, fine);
    }
}

mod max_indexed_cells_per_object_test {
    use super::*;

    #[test]
    fn per_object_cell_budget() {
        let mut grid = create_spatial_index_2d(1.0);
        let side = (MAX_INDEXED_CELLS_PER_OBJECT as f32).sqrt();
        assert_eq!(side, side.floor());
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, side - 1.0, side - 1.0));
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.bucket_count, MAX_INDEXED_CELLS_PER_OBJECT as f64);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);

        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(0.0, 0.0, side, side - 1.0));
        assert_eq!(explain_spatial_indexing_2d(&grid, 2).mode, SpatialIndexingMode::Overflow);
    }
}

mod non_finite_bounds {
    use super::*;

    #[test]
    fn declines_rather_than_indexing() {
        let mut grid = create_spatial_index_2d(10.0);
        assert!(!insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(f32::NAN, 0.0, 10.0, 10.0)));
        assert!(!insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(0.0, 0.0, f32::INFINITY, 10.0)));
        assert!(!insert_spatial_object_2d(&mut grid, 3, &create_spatial_aabb_2d(0.0, f32::NEG_INFINITY, 10.0, 10.0)));
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.mode, SpatialIndexingMode::Declined);
        assert_eq!(explanation.reason, Some(SpatialDeclineReason::NonFiniteBounds));
    }

    #[test]
    fn returns_true_for_finite_bounds() {
        let mut grid = create_spatial_index_2d(10.0);
        assert!(insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0)));
    }

    #[test]
    fn keeps_declined_out_of_every_query() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(f32::NAN, f32::NAN, f32::NAN, f32::NAN));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0));

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(-1e6, -1e6, 1e6, 1e6), &mut region);
        assert_eq!(region, vec![2]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 5.0, 5.0, &mut point);
        assert_eq!(point, vec![2]);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, -5.0, 5.0, 1.0, 0.0, &mut ray);
        assert_eq!(ray, vec![2]);

        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert!(pairs.is_empty());
    }

    #[test]
    fn drops_object_updating_to_non_finite_bounds() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0));
        assert!(!update_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(f32::NAN, f32::NAN, f32::NAN, f32::NAN)));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Declined);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 5.0, 5.0, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn declined_object_recovers_on_finite_update() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(f32::NAN, f32::NAN, f32::NAN, f32::NAN));
        assert!(update_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0)));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 5.0, 5.0, &mut out);
        assert_eq!(out, vec![1]);
    }
}

mod oversized_region_query {
    use super::*;

    #[test]
    fn answers_region_far_wider_than_grid() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 1.0, 1.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12), &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn returns_the_same_objects_either_way() {
        let mut grid = create_spatial_index_2d(1.0);
        for i in 0..40u64 {
            insert_spatial_object_2d(&mut grid, i, &create_spatial_aabb_2d(i as f32, 0.0, i as f32 + 0.5, 1.0));
        }
        let mut wide: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(-1e9, -1e9, 1e9, 1e9), &mut wide);
        let mut narrow: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(-1.0, -1.0, 41.0, 2.0), &mut narrow);
        assert_eq!(sorted_ids(&wide), sorted_ids(&narrow));
        assert_eq!(wide.len(), 40);
    }
}

mod oversized_extent_bound {
    use super::*;

    #[test]
    fn holds_oversized_object_without_writing_cell_per_unit() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 200.0, 200.0));
        let explanation = explain_spatial_indexing_2d(&grid, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        assert_eq!(explanation.bucket_count, 0.0);
    }

    #[test]
    fn indexes_extreme_aabb_in_constant_time() {
        let mut grid = create_spatial_index_2d(1.0);
        assert!(insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12)));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Overflow);
    }

    #[test]
    fn oversized_object_remains_queryable() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(0.0, 0.0, 1.0, 1.0));

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut grid, &create_spatial_aabb_2d(100.0, 100.0, 101.0, 101.0), &mut region);
        assert_eq!(region, vec![1]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 500.0, 500.0, &mut point);
        assert_eq!(point, vec![1]);

        let mut ray: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, 1e6, 1e6, 1.0, 0.0, &mut ray);
        assert_eq!(ray, vec![1]);

        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn emits_each_overflow_pair_once() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e9, -1e9, 1e9, 1e9));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(-1e9, -1e9, 1e9, 1e9));
        insert_spatial_object_2d(&mut grid, 3, &create_spatial_aabb_2d(0.0, 0.0, 1.0, 1.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert_eq!(pair_keys(&pairs), vec!["1-2", "1-3", "2-3"]);
    }

    #[test]
    fn does_not_pair_overflow_with_disjoint() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 100000.0, 100000.0));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(-50.0, -50.0, -40.0, -40.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut grid, &mut pairs);
        assert!(pairs.is_empty());
    }

    #[test]
    fn removes_oversized_object() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12));
        remove_spatial_object_2d(&mut grid, 1);
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Absent);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 0.0, 0.0, &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn transitions_between_cells_and_overflow() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 2.0, 2.0));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);
        update_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Overflow);
        update_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(0.0, 0.0, 2.0, 2.0));
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Cells);

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 1.0, 1.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn clears_overflow_with_the_rest() {
        let mut grid = create_spatial_index_2d(1.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(-1e12, -1e12, 1e12, 1e12));
        clear_spatial_index_2d(&mut grid);
        assert_eq!(explain_spatial_indexing_2d(&grid, 1).mode, SpatialIndexingMode::Absent);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 0.0, 0.0, &mut out);
        assert!(out.is_empty());
    }
}

mod ray_edge_cases {
    use super::*;

    #[test]
    fn finds_objects_along_cell_corner_diagonals() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(10.0, 10.0, 12.0, 12.0));
        insert_spatial_object_2d(&mut grid, 2, &create_spatial_aabb_2d(20.0, 20.0, 22.0, 22.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, -5.0, -5.0, 1.0, 1.0, &mut out);
        assert_eq!(sorted_ids(&out), vec![1, 2]);
    }

    #[test]
    fn finds_object_when_ray_starts_inside() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(5.0, 5.0, 15.0, 15.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, 10.0, 10.0, -1.0, 0.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn clips_ray_entering_from_far_outside() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(100.0, 30.0, 110.0, 40.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut grid, -1e9, 35.0, 1.0, 0.0, &mut out);
        assert_eq!(out, vec![1]);
    }
}

mod update_spatial_object_2d_test {
    use super::*;

    #[test]
    fn fast_path_refreshes_exact_bounds() {
        let mut grid = create_spatial_index_2d(10.0);
        insert_spatial_object_2d(&mut grid, 1, &create_spatial_aabb_2d(1.0, 1.0, 18.0, 18.0));
        let updated = create_spatial_aabb_2d(4.0, 4.0, 19.0, 19.0);
        assert!(update_spatial_object_2d(&mut grid, 1, &updated));

        let mut old_point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 2.0, 2.0, &mut old_point);
        assert!(old_point.is_empty());
        let mut new_point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut grid, 5.0, 5.0, &mut new_point);
        assert_eq!(new_point, vec![1]);
    }
}
