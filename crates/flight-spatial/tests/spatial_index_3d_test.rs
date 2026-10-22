use flight_spatial::contract::{DEFAULT_SPATIAL_CELL_SIZE_3D, initialize_spatial_index_3d};
use flight_spatial::*;

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

fn view_frustum(near_half: f32, far_half: f32, far_z: f32) -> SpatialFrustum3D {
    return SpatialFrustum3D {
        corners: [
            -near_half, -near_half, 0.0, near_half, -near_half, 0.0, near_half, near_half, 0.0,
            -near_half, near_half, 0.0, -far_half, -far_half, far_z, far_half, -far_half, far_z,
            far_half, far_half, far_z, -far_half, far_half, far_z,
        ],
    };
}

mod clear_spatial_index_3d {
    use super::*;

    #[test]
    fn empties_the_index_while_keeping_it_reusable() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        clear_spatial_index_3d(&mut index);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert!(out.is_empty());
        insert_spatial_object_3d(&mut index, 2, &box3(0.0, 0.0, 0.0, 10.0));
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert_eq!(out, vec![2]);
    }
}

mod create_spatial_index_3d {
    use super::*;

    #[test]
    fn dispatches_through_a_custom_callback_backend() {
        let mut backend = create_uniform_grid_spatial_backend_3d(10.0);
        backend.query_spatial_point = std::sync::Arc::new(|out, x, y, z| {
            assert_eq!((x, y, z), (2.0, 3.0, 4.0));
            *out = vec![-9];
        });
        let mut index = create_spatial_index_3d(Some(backend));
        let mut out = vec![99];
        query_spatial_point_3d(&mut out, &mut index, 2.0, 3.0, 4.0);
        assert_eq!(out, vec![-9]);
    }

    #[test]
    fn defaults_to_a_uniform_grid() {
        let mut index = create_spatial_index_3d(None);
        assert!(insert_spatial_object_3d(
            &mut index,
            1,
            &box3(0.0, 0.0, 0.0, 10.0)
        ));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn dispatches_through_an_explicit_cell_size() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 0.5));
        insert_spatial_object_3d(&mut index, 2, &box3(10.0, 10.0, 10.0, 0.5));
        let pairs = query_spatial_pairs_3d(&mut index);
        assert!(pairs.is_empty());
    }

    #[test]
    fn two_indexes_are_independent() {
        let mut a = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let b = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut a, 1, &box3(0.0, 0.0, 0.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        // b was not mutated, but query requires &mut for scratch buffers
        let mut b_mut = b;
        query_spatial_point_3d(&mut out, &mut b_mut, 5.0, 5.0, 5.0);
        assert!(out.is_empty());
    }
}

mod initialize_spatial_index_3d {
    use super::*;

    #[test]
    fn is_the_construction_initializer() {
        let mut out = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        initialize_spatial_index_3d(&mut out, Some(create_uniform_grid_spatial_backend_3d(10.0)));
        insert_spatial_object_3d(&mut out, 1, &box3(0.0, 0.0, 0.0, 5.0));
        let mut point: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut point, &mut out, 2.5, 2.5, 2.5);
        assert_eq!(point, vec![1]);
    }
}

mod insert_spatial_object_3d {
    use super::*;

    #[test]
    fn returns_false_for_non_indexable_bounds() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let inf_bounds = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: f32::INFINITY,
        };
        assert!(!insert_spatial_object_3d(&mut index, 1, &inf_bounds));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        let region = SpatialAabb3D {
            min_x: -1e9,
            min_y: -1e9,
            min_z: -1e9,
            max_x: 1e9,
            max_y: 1e9,
            max_z: 1e9,
        };
        query_spatial_region_3d(&mut out, &mut index, &region);
        assert!(out.is_empty());
    }
}

mod query_spatial_frustum_3d {
    use super::*;

    #[test]
    fn finds_inside_and_excludes_far_outside() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(32.0)));
        insert_spatial_object_3d(&mut index, 1, &box3(-5.0, -5.0, 100.0, 10.0));
        insert_spatial_object_3d(&mut index, 2, &box3(900.0, 900.0, 100.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_frustum_3d(
            &mut out,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            None,
        );
        assert!(out.contains(&1));
        assert!(!out.contains(&2));
    }

    #[test]
    fn reports_each_object_once_even_across_slices() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(32.0)));
        let long_obj = SpatialAabb3D {
            min_x: -5.0,
            min_y: -5.0,
            min_z: 10.0,
            max_x: 5.0,
            max_y: 5.0,
            max_z: 380.0,
        };
        insert_spatial_object_3d(&mut index, 7, &long_obj);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_frustum_3d(
            &mut out,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            Some(8),
        );
        assert_eq!(out.iter().filter(|&&id| id == 7).count(), 1);
    }

    #[test]
    fn covers_strictly_less_as_slices_increase() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(32.0)));
        insert_spatial_object_3d(&mut index, 3, &box3(180.0, 180.0, 20.0, 8.0));
        let mut coarse: Vec<SpatialObjectId> = Vec::new();
        let mut fine: Vec<SpatialObjectId> = Vec::new();
        query_spatial_frustum_3d(
            &mut coarse,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            Some(1),
        );
        query_spatial_frustum_3d(
            &mut fine,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            Some(16),
        );
        assert!(coarse.contains(&3));
        assert!(!fine.contains(&3));
    }

    #[test]
    fn returns_nothing_for_zero_slices() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_frustum_3d(
            &mut out,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            Some(0),
        );
        assert!(out.is_empty());
    }

    #[test]
    fn clears_output_before_filling() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let mut out: Vec<SpatialObjectId> = vec![99];
        query_spatial_frustum_3d(
            &mut out,
            &mut index,
            &view_frustum(10.0, 200.0, 400.0),
            None,
        );
        assert!(!out.contains(&99));
    }
}

mod query_spatial_pairs_3d {
    use super::*;

    #[test]
    fn reports_a_co_located_pair_once() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        insert_spatial_object_3d(&mut index, 2, &box3(1.0, 1.0, 1.0, 10.0));
        let out = query_spatial_pairs_3d(&mut index);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].a, 1);
        assert_eq!(out[0].b, 2);
    }
}

mod query_spatial_point_3d {
    use super::*;

    #[test]
    fn respects_the_third_axis() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let bounds = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 0.0,
            max_x: 100.0,
            max_y: 100.0,
            max_z: 10.0,
        };
        insert_spatial_object_3d(&mut index, 1, &bounds);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 50.0, 50.0, 5.0);
        assert_eq!(out, vec![1]);
        query_spatial_point_3d(&mut out, &mut index, 50.0, 50.0, 50.0);
        assert!(out.is_empty());
    }
}

mod query_spatial_ray_3d {
    use super::*;

    #[test]
    fn finds_an_object_along_a_z_directed_ray() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 500.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_ray_3d(&mut out, &mut index, 5.0, 5.0, 0.0, 0.0, 0.0, 1.0);
        assert_eq!(out, vec![1]);
    }
}

mod query_spatial_region_3d {
    use super::*;

    #[test]
    fn returns_overlapping_and_excludes_disjoint() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        insert_spatial_object_3d(&mut index, 2, &box3(1000.0, 1000.0, 1000.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_region_3d(&mut out, &mut index, &box3(0.0, 0.0, 0.0, 20.0));
        assert_eq!(out, vec![1]);
    }
}

mod query_spatial_sphere_3d {
    use super::*;

    #[test]
    fn finds_objects_within_radius_and_excludes_beyond() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 4.0));
        insert_spatial_object_3d(&mut index, 2, &box3(500.0, 500.0, 500.0, 4.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_sphere_3d(&mut out, &mut index, 0.0, 0.0, 0.0, 20.0);
        assert!(out.contains(&1));
        assert!(!out.contains(&2));
    }

    #[test]
    fn is_a_bounding_cube_not_exact_sphere() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(16.0)));
        insert_spatial_object_3d(&mut index, 5, &box3(9.0, 9.0, 9.0, 0.5));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_sphere_3d(&mut out, &mut index, 0.0, 0.0, 0.0, 10.0);
        assert!((9.0_f32.powi(2) * 3.0).sqrt() > 10.0);
        assert!(out.contains(&5));
    }

    #[test]
    fn returns_nothing_for_non_finite_centre_or_negative_radius() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 4.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_sphere_3d(&mut out, &mut index, f32::NAN, 0.0, 0.0, 10.0);
        assert!(out.is_empty());
        query_spatial_sphere_3d(&mut out, &mut index, 0.0, 0.0, 0.0, -1.0);
        assert!(out.is_empty());
    }
}

mod remove_spatial_object_3d {
    use super::*;

    #[test]
    fn drops_object_and_is_no_op_for_unknown_id() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        remove_spatial_object_3d(&mut index, 1);
        remove_spatial_object_3d(&mut index, 99);
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert!(out.is_empty());
    }
}

mod update_spatial_object_3d {
    use super::*;

    #[test]
    fn behaves_as_insert_for_not_yet_present_id() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        assert!(update_spatial_object_3d(
            &mut index,
            1,
            &box3(0.0, 0.0, 0.0, 10.0)
        ));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert_eq!(out, vec![1]);
    }

    #[test]
    fn moves_an_object_so_old_position_stops_matching() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        update_spatial_object_3d(&mut index, 1, &box3(1000.0, 1000.0, 1000.0, 10.0));
        let mut out: Vec<SpatialObjectId> = Vec::new();
        query_spatial_point_3d(&mut out, &mut index, 5.0, 5.0, 5.0);
        assert!(out.is_empty());
        query_spatial_point_3d(&mut out, &mut index, 1005.0, 1005.0, 1005.0);
        assert_eq!(out, vec![1]);
    }
}
