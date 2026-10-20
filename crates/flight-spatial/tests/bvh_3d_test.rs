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

fn box3(x: f32, y: f32, z: f32, size: f32) -> SpatialAabb3D {
    return create_spatial_aabb_3d(x, y, z, x + size, y + size, z + size);
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
    fn answers_every_query_as_the_uniform_grid_does() {
        let mut random = create_random(6112026);
        let mut bvh = create_spatial_index_3d_with_bvh(2.0);
        let mut grid = create_spatial_index_3d(16.0);

        for id in 0..120u64 {
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
            query_spatial_region_3d(&mut bvh, &region, &mut bvh_out);
            query_spatial_region_3d(&mut grid, &region, &mut grid_out);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));

            let px = (random() - 0.5) * 400.0;
            let py = (random() - 0.5) * 400.0;
            let pz = (random() - 0.5) * 400.0;
            query_spatial_point_3d(&mut bvh, px, py, pz, &mut bvh_out);
            query_spatial_point_3d(&mut grid, px, py, pz, &mut grid_out);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));

            let dx = random() - 0.5;
            let dy = random() - 0.5;
            let dz = random() - 0.5;
            query_spatial_ray_3d(&mut bvh, px, py, pz, dx, dy, dz, &mut bvh_out);
            query_spatial_ray_3d(&mut grid, px, py, pz, dx, dy, dz, &mut grid_out);
            assert_eq!(sorted(&bvh_out), sorted(&grid_out));
        }
    }

    #[test]
    fn keeps_answering_correctly_within_margin() {
        let mut bvh = create_spatial_index_3d_with_bvh(10.0);
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 1.0));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut bvh, 0.5, 0.5, 0.5, &mut out);
        assert_eq!(out, vec![1]);

        update_spatial_object_3d(&mut bvh, 1, &box3(4.0, 0.0, 0.0, 1.0));
        query_spatial_point_3d(&mut bvh, 0.5, 0.5, 0.5, &mut out);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut bvh, 4.5, 0.5, 0.5, &mut out);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn declines_non_finite_and_inverted_bounds() {
        let mut bvh = create_spatial_index_3d_with_bvh(DEFAULT_BVH_MARGIN_3D);
        let mut grid = create_spatial_index_3d(16.0);
        let non_finite = create_spatial_aabb_3d(f32::NAN, 0.0, 0.0, 1.0, 1.0, 1.0);
        let inverted = create_spatial_aabb_3d(0.0, 0.0, 0.0, -1.0, 1.0, 1.0);

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
        query_spatial_region_3d(&mut bvh, &box3(-100.0, -100.0, -100.0, 200.0), &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn removes_on_declined_update() {
        let mut bvh = create_spatial_index_3d_with_bvh(DEFAULT_BVH_MARGIN_3D);
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 4.0));
        let inf_bounds = create_spatial_aabb_3d(f32::INFINITY, 0.0, 0.0, 1.0, 1.0, 1.0);
        assert!(!update_spatial_object_3d(&mut bvh, 1, &inf_bounds));

        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut bvh, &box3(-10.0, -10.0, -10.0, 40.0), &mut out);
        assert!(out.is_empty());
        assert_eq!(explain_spatial_indexing_3d(&bvh, 1).mode, SpatialIndexingMode::Declined);
    }

    #[test]
    fn reports_absent_for_unknown_and_after_clear() {
        let mut bvh = create_spatial_index_3d_with_bvh(DEFAULT_BVH_MARGIN_3D);
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Absent);
        insert_spatial_object_3d(&mut bvh, 99, &box3(0.0, 0.0, 0.0, 1.0));
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Cells);
        clear_spatial_index_3d(&mut bvh);
        assert_eq!(explain_spatial_indexing_3d(&bvh, 99).mode, SpatialIndexingMode::Absent);
    }

    #[test]
    fn stays_balanced_under_sorted_insertion() {
        let mut bvh = create_spatial_index_3d_with_bvh(0.0);
        let mut grid = create_spatial_index_3d(8.0);
        for id in 0..400u64 {
            let bounds = box3(id as f32 * 3.0, 0.0, 0.0, 2.0);
            insert_spatial_object_3d(&mut bvh, id, &bounds);
            insert_spatial_object_3d(&mut grid, id, &bounds);
        }
        let mut bvh_out: Vec<SpatialObjectId> = Vec::new();
        let mut grid_out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut bvh, &box3(300.0, -5.0, -5.0, 60.0), &mut bvh_out);
        query_spatial_region_3d(&mut grid, &box3(300.0, -5.0, -5.0, 60.0), &mut grid_out);
        assert_eq!(sorted(&bvh_out), sorted(&grid_out));
        assert!(bvh_out.len() > 5);
    }

    #[test]
    fn reports_same_indexing_notices_as_grid() {
        take_notices();
        let mut bvh = create_spatial_index_3d_with_bvh(DEFAULT_BVH_MARGIN_3D);
        set_spatial_indexing_guard_3d(&mut bvh, Some(test_guard));
        insert_spatial_object_3d(&mut bvh, 1, &box3(0.0, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut bvh, 1, &box3(0.1, 0.0, 0.0, 1.0));
        update_spatial_object_3d(&mut bvh, 1, &box3(50.0, 0.0, 0.0, 1.0));
        remove_spatial_object_3d(&mut bvh, 1);
        remove_spatial_object_3d(&mut bvh, 404);
        update_spatial_object_3d(&mut bvh, 505, &box3(0.0, 0.0, 0.0, 1.0));
        let nan_bounds = create_spatial_aabb_3d(f32::NAN, 0.0, 0.0, 1.0, 1.0, 1.0);
        insert_spatial_object_3d(&mut bvh, 2, &nan_bounds);
        let inverted = create_spatial_aabb_3d(5.0, 0.0, 0.0, 1.0, 1.0, 1.0);
        insert_spatial_object_3d(&mut bvh, 3, &inverted);
        let bvh_notices = take_notices();

        let mut grid = create_spatial_index_3d(16.0);
        set_spatial_indexing_guard_3d(&mut grid, Some(test_guard));
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
        take_notices();
        let mut bvh = create_spatial_index_3d_with_bvh(DEFAULT_BVH_MARGIN_3D);
        set_spatial_indexing_guard_3d(&mut bvh, Some(test_guard));
        for id in 0..20u64 {
            insert_spatial_object_3d(&mut bvh, id, &box3(id as f32 * 4.0, 0.0, 0.0, 1.0));
        }
        for step in 0..100u32 {
            for id in 0..20u64 {
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
