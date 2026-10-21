use flight_spatial::*;
use flight_spatial::contract::{initialize_spatial_index_2d};

fn make_index(cell_size: f32) -> SpatialIndex2D {
    return create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(cell_size)));
}

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

mod clear_spatial_index_2d {
    use super::*;

    #[test]
    fn empties_every_query_after_clearing() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 2.0, min_y: 2.0, max_x: 6.0, max_y: 6.0 });
        clear_spatial_index_2d(&mut index);

        let pairs = query_spatial_pairs_2d(&mut index);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut index, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 });
        assert_eq!(region.len(), 0);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut index, 3.0, 3.0);
        assert_eq!(point.len(), 0);
    }
}

mod create_spatial_index_2d {
    use super::*;

    #[test]
    fn dispatches_through_a_custom_callback_backend() {
        let mut backend = create_uniform_grid_spatial_backend_2d(10.0);
        backend.query_spatial_point = std::sync::Arc::new(|out: &mut Vec<SpatialObjectId>, x: f32, y: f32| {
            assert_eq!((x, y), (2.0, 3.0));
            *out = vec![-7];
        });
        let mut index = create_spatial_index_2d(Some(backend));
        let mut out = vec![99];
        query_spatial_point_2d(&mut out, &mut index, 2.0, 3.0);
        assert_eq!(out, vec![-7]);
    }

    #[test]
    fn creates_a_working_uniform_grid() {
        let mut index = create_spatial_index_2d(None);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 1.0, min_y: 1.0, max_x: 5.0, max_y: 5.0 });
        let pairs = query_spatial_pairs_2d(&mut index);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn uses_an_explicitly_supplied_cell_size() {
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(64.0)));
        insert_spatial_object_2d(&mut index, 7, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut index, 2.0, 2.0);
        assert_eq!(point, vec![7]);
    }
}

mod initialize_spatial_index_2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut out = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        initialize_spatial_index_2d(&mut out, Some(create_uniform_grid_spatial_backend_2d(10.0)));
        insert_spatial_object_2d(&mut out, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 5.0, max_y: 5.0 });
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut out, 2.5, 2.5);
        assert_eq!(point, vec![1]);
    }
}

mod insert_spatial_object_2d {
    use super::*;

    #[test]
    fn preserves_signed_object_ids_at_both_integer_limits() {
        let mut index = make_index(10.0);
        let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 };
        assert!(insert_spatial_object_2d(&mut index, i32::MIN, &bounds));
        assert!(insert_spatial_object_2d(&mut index, i32::MAX, &bounds));
        let pairs = query_spatial_pairs_2d(&mut index);
        assert_eq!(pairs, vec![SpatialPair { a: i32::MIN, b: i32::MAX }]);
        remove_spatial_object_2d(&mut index, i32::MAX);
        let mut ids = Vec::new();
        query_spatial_point_2d(&mut ids, &mut index, 2.0, 2.0);
        assert_eq!(ids, vec![i32::MIN]);
    }

    #[test]
    fn yields_exactly_one_overlapping_pair() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 2.0, min_y: 2.0, max_x: 6.0, max_y: 6.0 });
        insert_spatial_object_2d(&mut index, 3, &SpatialAabb2D { min_x: 100.0, min_y: 100.0, max_x: 104.0, max_y: 104.0 });
        let pairs = query_spatial_pairs_2d(&mut index);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
        for pair in pairs {
            assert_ne!(pair.a, pair.b);
        }
    }
}

mod query_spatial_pairs_2d {
    use super::*;

    #[test]
    fn retains_pair_addresses_across_steady_topology_queries() {
        let mut index = create_spatial_index_2d(None);
        let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 };
        insert_spatial_object_2d(&mut index, 1, &bounds);
        insert_spatial_object_2d(&mut index, 2, &bounds);
        let first = query_spatial_pairs_2d(&mut index).as_ptr();
        let second = query_spatial_pairs_2d(&mut index);
        assert_eq!(second, &[SpatialPair { a: 1, b: 2 }]);
        assert!(std::ptr::eq(first, &second[0]));
    }

    #[test]
    fn reuses_and_clears_the_out_array_across_calls() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 2.0, min_y: 2.0, max_x: 6.0, max_y: 6.0 });
        let out = query_spatial_pairs_2d(&mut index);
        assert_eq!(out.len(), 1);
        remove_spatial_object_2d(&mut index, 2);
        let out = query_spatial_pairs_2d(&mut index);
        assert_eq!(out.len(), 0);
    }
}

mod query_spatial_point_2d {
    use super::*;

    #[test]
    fn returns_object_at_interior_point_and_nothing_at_empty_point() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 1.0, min_y: 1.0, max_x: 3.0, max_y: 3.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 8.0, min_y: 8.0, max_x: 9.0, max_y: 9.0 });
        let mut inside: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut inside, &mut index, 2.0, 2.0);
        assert_eq!(inside, vec![1]);
        let mut outside: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut outside, &mut index, 6.0, 6.0);
        assert_eq!(outside.len(), 0);
    }
}

mod query_spatial_ray_2d {
    use super::*;

    #[test]
    fn returns_object_the_ray_crosses_and_nothing_for_a_miss() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 20.0, min_y: 20.0, max_x: 24.0, max_y: 24.0 });
        let mut hit: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut hit, &mut index, 0.0, 22.0, 1.0, 0.0);
        assert_eq!(hit, vec![1]);
        let mut miss: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut miss, &mut index, 0.0, 0.0, 1.0, 0.0);
        assert_eq!(miss.len(), 0);
    }
}

mod query_spatial_region_2d {
    use super::*;

    #[test]
    fn includes_overlapping_and_excludes_cell_mate_whose_bounds_miss() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 1.0, min_y: 1.0, max_x: 3.0, max_y: 3.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 8.0, min_y: 8.0, max_x: 9.0, max_y: 9.0 });
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut out, &mut index, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        assert_eq!(out, vec![1]);
    }
}

mod remove_spatial_object_2d {
    use super::*;

    #[test]
    fn drops_object_from_pair_region_and_point_queries() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 2.0, min_y: 2.0, max_x: 6.0, max_y: 6.0 });
        remove_spatial_object_2d(&mut index, 2);

        let pairs = query_spatial_pairs_2d(&mut index);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut region, &mut index, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 6.0, max_y: 6.0 });
        assert_eq!(region, vec![1]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut point, &mut index, 5.0, 5.0);
        assert_eq!(point.len(), 0);
    }
}

mod update_spatial_object_2d {
    use super::*;

    #[test]
    fn removes_pair_once_moved_object_leaves_shared_region() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 4.0, max_y: 4.0 });
        insert_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 2.0, min_y: 2.0, max_x: 6.0, max_y: 6.0 });
        let before = query_spatial_pairs_2d(&mut index);
        assert_eq!(before.len(), 1);
        update_spatial_object_2d(&mut index, 2, &SpatialAabb2D { min_x: 200.0, min_y: 200.0, max_x: 204.0, max_y: 204.0 });
        let after = query_spatial_pairs_2d(&mut index);
        assert_eq!(after.len(), 0);
    }
}
