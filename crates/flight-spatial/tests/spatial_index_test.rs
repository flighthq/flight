use flight_spatial::*;

fn make_index(cell_size: f32) -> SpatialIndex2D {
    return create_spatial_index_2d(cell_size);
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
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(2.0, 2.0, 6.0, 6.0));
        clear_spatial_index_2d(&mut index);

        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut pairs);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut index, &create_spatial_aabb_2d(0.0, 0.0, 10.0, 10.0), &mut region);
        assert_eq!(region.len(), 0);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut index, 3.0, 3.0, &mut point);
        assert_eq!(point.len(), 0);
    }
}

mod create_spatial_index_2d_test {
    use super::*;

    #[test]
    fn creates_a_working_uniform_grid() {
        let mut index = create_spatial_index_2d(DEFAULT_SPATIAL_CELL_SIZE);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(1.0, 1.0, 5.0, 5.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut pairs);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
    }

    #[test]
    fn uses_an_explicitly_supplied_cell_size() {
        let mut index = create_spatial_index_2d(64.0);
        insert_spatial_object_2d(&mut index, 7, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut index, 2.0, 2.0, &mut point);
        assert_eq!(point, vec![7]);
    }
}

mod insert_spatial_object_2d_test {
    use super::*;

    #[test]
    fn yields_exactly_one_overlapping_pair() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(2.0, 2.0, 6.0, 6.0));
        insert_spatial_object_2d(&mut index, 3, &create_spatial_aabb_2d(100.0, 100.0, 104.0, 104.0));
        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut pairs);
        assert_eq!(pairs.len(), 1);
        assert_eq!(pair_keys(&pairs), vec!["1-2"]);
        for pair in &pairs {
            assert_ne!(pair.a, pair.b);
        }
    }
}

mod query_spatial_pairs_2d_test {
    use super::*;

    #[test]
    fn reuses_and_clears_the_out_array_across_calls() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(2.0, 2.0, 6.0, 6.0));
        let mut out: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut out);
        assert_eq!(out.len(), 1);
        remove_spatial_object_2d(&mut index, 2);
        query_spatial_pairs_2d(&mut index, &mut out);
        assert_eq!(out.len(), 0);
    }
}

mod query_spatial_point_2d_test {
    use super::*;

    #[test]
    fn returns_object_at_interior_point_and_nothing_at_empty_point() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(1.0, 1.0, 3.0, 3.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(8.0, 8.0, 9.0, 9.0));
        let mut inside: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut index, 2.0, 2.0, &mut inside);
        assert_eq!(inside, vec![1]);
        let mut outside: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut index, 6.0, 6.0, &mut outside);
        assert_eq!(outside.len(), 0);
    }
}

mod query_spatial_ray_2d_test {
    use super::*;

    #[test]
    fn returns_object_the_ray_crosses_and_nothing_for_a_miss() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(20.0, 20.0, 24.0, 24.0));
        let mut hit: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut index, 0.0, 22.0, 1.0, 0.0, &mut hit);
        assert_eq!(hit, vec![1]);
        let mut miss: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_2d(&mut index, 0.0, 0.0, 1.0, 0.0, &mut miss);
        assert_eq!(miss.len(), 0);
    }
}

mod query_spatial_region_2d_test {
    use super::*;

    #[test]
    fn includes_overlapping_and_excludes_cell_mate_whose_bounds_miss() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(1.0, 1.0, 3.0, 3.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(8.0, 8.0, 9.0, 9.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut index, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0), &mut out);
        assert_eq!(out, vec![1]);
    }
}

mod remove_spatial_object_2d_test {
    use super::*;

    #[test]
    fn drops_object_from_pair_region_and_point_queries() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(2.0, 2.0, 6.0, 6.0));
        remove_spatial_object_2d(&mut index, 2);

        let mut pairs: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut pairs);
        assert_eq!(pairs.len(), 0);

        let mut region: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_2d(&mut index, &create_spatial_aabb_2d(0.0, 0.0, 6.0, 6.0), &mut region);
        assert_eq!(region, vec![1]);

        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut index, 5.0, 5.0, &mut point);
        assert_eq!(point.len(), 0);
    }
}

mod update_spatial_object_2d_test {
    use super::*;

    #[test]
    fn removes_pair_once_moved_object_leaves_shared_region() {
        let mut index = make_index(10.0);
        insert_spatial_object_2d(&mut index, 1, &create_spatial_aabb_2d(0.0, 0.0, 4.0, 4.0));
        insert_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(2.0, 2.0, 6.0, 6.0));
        let mut before: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut before);
        assert_eq!(before.len(), 1);
        update_spatial_object_2d(&mut index, 2, &create_spatial_aabb_2d(200.0, 200.0, 204.0, 204.0));
        let mut after: Vec<SpatialPair> = Vec::new();
        query_spatial_pairs_2d(&mut index, &mut after);
        assert_eq!(after.len(), 0);
    }
}

mod initialize_spatial_index_2d_test {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut out = create_spatial_index_2d(1.0);
        initialize_spatial_index_2d(&mut out, 10.0);
        insert_spatial_object_2d(&mut out, 1, &create_spatial_aabb_2d(0.0, 0.0, 5.0, 5.0));
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_2d(&mut out, 2.5, 2.5, &mut point);
        assert_eq!(point, vec![1]);
    }
}
