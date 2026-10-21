use std::cell::RefCell;

use flight_spatial::*;
use flight_spatial::contract::{DEFAULT_BVH_MARGIN_3D, initialize_bvh_spatial_backend_3d};

thread_local! {
    static NOTICES: RefCell<Vec<SpatialIndexingNotice>> = RefCell::new(Vec::new());
}

fn test_guard(notice: &SpatialIndexingNotice) {
    NOTICES.with(|n| n.borrow_mut().push(notice.clone()));
}

fn take_notices() -> Vec<SpatialIndexingNotice> {
    NOTICES.with(|n| n.borrow_mut().drain(..).collect())
}

fn box3(x: f32, y: f32, z: f32, size: f32) -> SpatialAabb3D {
    return SpatialAabb3D { min_x: x, min_y: y, min_z: z, max_x: x + size, max_y: y + size, max_z: z + size };
}

fn sorted(ids: &[SpatialObjectId]) -> Vec<SpatialObjectId> {
    let mut v: Vec<SpatialObjectId> = ids.to_vec();
    v.sort();
    return v;
}

fn sorted_pairs(pairs: &[SpatialPair]) -> Vec<String> {
    let mut v: Vec<String> = pairs
        .iter()
        .map(|p| {
            let a = p.a.min(p.b);
            let b = p.a.max(p.b);
            format!("{}-{}", a, b)
        })
        .collect();
    v.sort();
    return v;
}

fn create_random(seed: i32) -> impl FnMut() -> f32 {
    let mut state = if seed == 0 { 1i32 } else { seed };
    move || {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return ((state as u32) % 100000) as f32 / 100000.0;
    }
}

mod create_bvh_spatial_backend_3d {
    use super::*;

    #[test]
    fn preserves_signed_object_ids_at_both_integer_limits() {
        for mut index in [create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0))), create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(1.0))))] {
            let bounds = box3(0.0, 0.0, 0.0, 4.0);
            assert!(insert_spatial_object_3d(&mut index, i32::MIN, &bounds));
            assert!(insert_spatial_object_3d(&mut index, i32::MAX, &bounds));
            let pairs = query_spatial_pairs_3d(&mut index);
            assert_eq!(pairs, vec![SpatialPair { a: i32::MIN, b: i32::MAX }]);
            remove_spatial_object_3d(&mut index, i32::MAX);
            let mut ids = Vec::new();
            query_spatial_point_3d(&mut ids, &mut index, 2.0, 2.0, 2.0);
            assert_eq!(ids, vec![i32::MIN]);
        }
    }

    #[test]
    fn retains_pair_objects_across_steady_topology_query() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(1.0))));
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 2.0));
        insert_spatial_object_3d(&mut bvh, 2, &box3(1.0, 1.0, 1.0, 2.0));
        let out = query_spatial_pairs_3d(&mut bvh);
        let pair = out[0];
        let pair_address = &out[0] as *const SpatialPair;

        let out = query_spatial_pairs_3d(&mut bvh);

        assert_eq!(out[0], pair);
        assert!(std::ptr::eq(pair_address, &out[0]));
    }

    #[test]
    fn answers_every_query_as_the_uniform_grid_does() {
        let mut random = create_random(6112026);
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(2.0))));
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));

        for id in 0..120i32 {
            let size = if id % 12 == 0 { 40.0 + random() * 30.0 } else { 0.5 + random() * 4.0 };
            let bounds = box3(
                (random() - 0.5) * 400.0,
                (random() - 0.5) * 400.0,
                (random() - 0.5) * 400.0,
                size,
            );
            assert_eq!(
                insert_spatial_object_3d(&mut bvh, id, &bounds),
                insert_spatial_object_3d(&mut grid, id, &bounds),
            );
        }

        let mut bvh_out: Vec<SpatialObjectId> = Vec::new();
        let mut grid_out: Vec<SpatialObjectId> = Vec::new();

        for _probe in 0..60 {
            let region = box3(
                (random() - 0.5) * 400.0,
                (random() - 0.5) * 400.0,
                (random() - 0.5) * 400.0,
                10.0 + random() * 60.0,
            );
            query_spatial_region_3d(&mut bvh_out, &mut bvh, &region);
            query_spatial_region_3d(&mut grid_out, &mut grid, &region);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));

            let px = (random() - 0.5) * 400.0;
            let py = (random() - 0.5) * 400.0;
            let pz = (random() - 0.5) * 400.0;
            query_spatial_point_3d(&mut bvh_out, &mut bvh, px, py, pz);
            query_spatial_point_3d(&mut grid_out, &mut grid, px, py, pz);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));

            let dx = random() - 0.5;
            let dy = random() - 0.5;
            let dz = random() - 0.5;
            query_spatial_ray_3d(&mut bvh_out, &mut bvh, px, py, pz, dx, dy, dz);
            query_spatial_ray_3d(&mut grid_out, &mut grid, px, py, pz, dx, dy, dz);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));
        }
    }

    #[test]
    fn reports_every_truly_overlapping_pair_after_inserts_moves_and_removals() {
        let mut random = create_random(778291);
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(1.5))));
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(12.0)));

        let mut live: std::collections::HashMap<SpatialObjectId, SpatialAabb3D> = std::collections::HashMap::new();
        for id in 0..60i32 {
            let bounds = box3(
                (random() - 0.5) * 40.0,
                (random() - 0.5) * 40.0,
                (random() - 0.5) * 40.0,
                2.0 + random() * 8.0,
            );
            insert_spatial_object_3d(&mut bvh, id, &bounds);
            insert_spatial_object_3d(&mut grid, id, &bounds);
            live.insert(id, bounds);
        }
        for id in (0..60i32).step_by(3) {
            let bounds = box3(
                (random() - 0.5) * 40.0,
                (random() - 0.5) * 40.0,
                (random() - 0.5) * 40.0,
                2.0 + random() * 8.0,
            );
            update_spatial_object_3d(&mut bvh, id, &bounds);
            update_spatial_object_3d(&mut grid, id, &bounds);
            live.insert(id, bounds);
        }
        for id in (1..60i32).step_by(7) {
            remove_spatial_object_3d(&mut bvh, id);
            remove_spatial_object_3d(&mut grid, id);
            live.remove(&id);
        }

        let bvh_pairs = query_spatial_pairs_3d(&mut bvh);
        let grid_pairs = query_spatial_pairs_3d(&mut grid);

        let mut truth: std::collections::HashSet<String> = std::collections::HashSet::new();
        for a in 0..60i32 {
            for b in (a + 1)..60i32 {
                let bounds_a = match live.get(&a) {
                    Some(b) => b,
                    None => continue,
                };
                let bounds_b = match live.get(&b) {
                    Some(b) => b,
                    None => continue,
                };
                if bounds_a.min_x < bounds_b.max_x
                    && bounds_a.max_x > bounds_b.min_x
                    && bounds_a.min_y < bounds_b.max_y
                    && bounds_a.max_y > bounds_b.min_y
                    && bounds_a.min_z < bounds_b.max_z
                    && bounds_a.max_z > bounds_b.min_z
                {
                    truth.insert(format!("{}-{}", a, b));
                }
            }
        }

        let bvh_set: std::collections::HashSet<String> = sorted_pairs(&bvh_pairs).into_iter().collect();
        let grid_set: std::collections::HashSet<String> = sorted_pairs(&grid_pairs).into_iter().collect();
        assert!(truth.len() > 0);
        for pair in &truth {
            assert!(bvh_set.contains(pair), "bvh missed {}", pair);
            assert!(grid_set.contains(pair), "grid missed {}", pair);
        }
        assert_eq!(sorted_pairs(&bvh_pairs), {
            let mut v: Vec<String> = bvh_set.into_iter().collect();
            v.sort();
            v
        });
        assert!(bvh_pairs.iter().all(|p| p.a != p.b));
    }

    #[test]
    fn keeps_answering_correctly_within_margin() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(10.0))));
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 1.0));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut bvh, 0.5, 0.5, 0.5);
        assert_eq!(out, vec![1]);

        update_spatial_object_3d(&mut bvh, 1, &box3(4.0, 0.0, 0.0, 1.0));
        query_spatial_point_3d(&mut out, &mut bvh, 0.5, 0.5, 0.5);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut out, &mut bvh, 4.5, 0.5, 0.5);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn declines_non_finite_and_inverted_bounds() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));
        let non_finite = SpatialAabb3D { min_x: f32::NAN, min_y: 0.0, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 };
        let inverted = SpatialAabb3D { min_x: 0.0, min_y: 0.0, min_z: 0.0, max_x: -1.0, max_y: 1.0, max_z: 1.0 };

        assert_eq!(
            insert_spatial_object_3d(&mut bvh, 1, &non_finite),
            insert_spatial_object_3d(&mut grid, 1, &non_finite),
        );
        assert_eq!(
            insert_spatial_object_3d(&mut bvh, 2, &inverted),
            insert_spatial_object_3d(&mut grid, 2, &inverted),
        );
        assert_eq!(explain_spatial_indexing_3d(&bvh, 1).mode, SpatialIndexingMode::Declined);
        assert_eq!(explain_spatial_indexing_3d(&bvh, 1).reason, Some(SpatialDeclineReason::NonFiniteBounds));
        assert_eq!(explain_spatial_indexing_3d(&bvh, 2).reason, Some(SpatialDeclineReason::InvertedBounds));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut out, &mut bvh, &box3(-100.0, -100.0, -100.0, 200.0));
        assert!(out.is_empty());
    }

    #[test]
    fn removes_on_declined_update() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 4.0));
        let inf_bounds = SpatialAabb3D { min_x: f32::INFINITY, min_y: 0.0, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 };
        assert!(!update_spatial_object_3d(&mut bvh, 1, &inf_bounds));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut out, &mut bvh, &box3(-10.0, -10.0, -10.0, 40.0));
        assert!(out.is_empty());
        assert_eq!(explain_spatial_indexing_3d(&bvh, 1).mode, SpatialIndexingMode::Declined);
    }

    #[test]
    fn reports_absent_for_unknown_and_after_clear() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Absent);
        insert_spatial_object_3d(&mut bvh, 99, &box3(0.0, 0.0, 0.0, 1.0));
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Cells);
        clear_spatial_index_3d(&mut bvh);
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Absent);
    }

    #[test]
    fn stays_balanced_under_sorted_insertion() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(0.0))));
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(8.0)));
        for id in 0..400i32 {
            let bounds = box3(id as f32 * 3.0, 0.0, 0.0, 2.0);
            insert_spatial_object_3d(&mut bvh, id, &bounds);
            insert_spatial_object_3d(&mut grid, id, &bounds);
        }
        let mut bvh_out: Vec<SpatialObjectId> = Vec::new();
        let mut grid_out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut bvh_out, &mut bvh, &box3(300.0, -5.0, -5.0, 60.0));
        query_spatial_region_3d(&mut grid_out, &mut grid, &box3(300.0, -5.0, -5.0, 60.0));
        assert_eq!(sorted(&bvh_out), sorted(&grid_out));
        assert!(bvh_out.len() > 5);
    }

    #[test]
    fn is_interchangeable_with_the_grid() {
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));

        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut bvh, 2, &box3(100.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 5.0));
        insert_spatial_object_3d(&mut grid, 2, &box3(100.0, 0.0, 0.0, 5.0));

        let mut bvh_out: Vec<SpatialObjectId> = Vec::new();
        let mut grid_out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut bvh_out, &mut bvh, &box3(-1.0, -1.0, -1.0, 10.0));
        query_spatial_region_3d(&mut grid_out, &mut grid, &box3(-1.0, -1.0, -1.0, 10.0));
        assert_eq!(sorted(&bvh_out), sorted(&grid_out));
    }

    #[test]
    fn reports_same_indexing_notices_as_grid() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut bvh, 1, &box3(0.1, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut bvh, 1, &box3(50.0, 0.0, 0.0, 1.0));
        remove_spatial_object_3d(&mut bvh, 1);
        remove_spatial_object_3d(&mut bvh, 404);
        update_spatial_object_3d(&mut bvh, 505, &box3(0.0, 0.0, 0.0, 1.0));
        let nan_bounds = SpatialAabb3D { min_x: f32::NAN, min_y: 0.0, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 };
        insert_spatial_object_3d(&mut bvh, 2, &nan_bounds);
        let inverted = SpatialAabb3D { min_x: 5.0, min_y: 0.0, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 };
        insert_spatial_object_3d(&mut bvh, 3, &inverted);
        let bvh_notices = take_notices();

        let mut grid = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        insert_spatial_object_3d(&mut grid, 1, &box3(0.0, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut grid, 1, &box3(0.1, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut grid, 1, &box3(50.0, 0.0, 0.0, 1.0));
        remove_spatial_object_3d(&mut grid, 1);
        remove_spatial_object_3d(&mut grid, 404);
        update_spatial_object_3d(&mut grid, 505, &box3(0.0, 0.0, 0.0, 1.0));
        insert_spatial_object_3d(&mut grid, 2, &nan_bounds);
        insert_spatial_object_3d(&mut grid, 3, &inverted);
        let grid_notices = take_notices();

        let bvh_keys: Vec<String> = bvh_notices
            .iter()
            .map(|n| format!("{:?}:{}:{:?}", n.operation, n.id, n.reason))
            .collect();
        let grid_keys: Vec<String> = grid_notices
            .iter()
            .map(|n| format!("{:?}:{}:{:?}", n.operation, n.id, n.reason))
            .collect();
        assert_eq!(bvh_keys, grid_keys);
        assert_eq!(
            bvh_keys,
            vec![
                "Remove:404:Some(MissingId)",
                "Update:505:Some(MissingId)",
                "Insert:2:Some(NonFiniteBounds)",
                "Insert:3:Some(InvertedBounds)",
            ]
        );
    }



    #[test]
    fn says_nothing_while_healthy_objects_move() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut bvh = create_spatial_index_3d(Some(create_bvh_spatial_backend_3d(Some(DEFAULT_BVH_MARGIN_3D))));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        for id in 0..20i32 {
            insert_spatial_object_3d(&mut bvh, id, &box3(id as f32 * 4.0, 0.0, 0.0, 1.0));
        }
        for step in 0..100u32 {
            for id in 0..20i32 {
                update_spatial_object_3d(
                    &mut bvh,
                    id,
                    &box3(id as f32 * 4.0 + step as f32 * 0.5, 0.0, 0.0, 1.0),
                );
            }
        }
        let captured = take_notices();
        assert!(captured.is_empty());
    }
}

mod initialize_bvh_spatial_backend_3d {
    use super::*;

    #[test]
    fn initialize_is_the_construction_initializer() {
        let mut backend = create_bvh_spatial_backend_3d(None);
        initialize_bvh_spatial_backend_3d(&mut backend, Some(5.0));
        let mut out = create_spatial_index_3d(Some(backend));
        insert_spatial_object_3d(&mut out, 1, &box3(0.0, 0.0, 0.0, 2.0));
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut point, &mut out, 1.0, 1.0, 1.0);
        assert_eq!(point, vec![1]);
    }
}
