use flight_spatial::contract::DEFAULT_SPATIAL_CELL_SIZE_3D;
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

mod explain_spatial_indexing_3d {
    use super::*;

    #[test]
    fn reports_absent_for_an_id_that_was_never_inserted() {
        let index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let explanation = explain_spatial_indexing_3d(&index, 42);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.id, 42);
        assert_eq!(explanation.mode, SpatialIndexingMode::Absent);
        assert_eq!(explanation.reason, None);
    }

    #[test]
    fn reports_absent_after_removal() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 10.0));
        remove_spatial_object_3d(&mut index, 1);
        assert_eq!(
            explain_spatial_indexing_3d(&index, 1).mode,
            SpatialIndexingMode::Absent
        );
    }

    #[test]
    fn reports_declined_with_the_reason() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(
            DEFAULT_SPATIAL_CELL_SIZE_3D,
        )));
        let nan_bounds = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: f32::NAN,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        };
        insert_spatial_object_3d(&mut index, 1, &nan_bounds);
        let inverted = SpatialAabb3D {
            min_x: 0.0,
            min_y: 0.0,
            min_z: 9.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 0.0,
        };
        insert_spatial_object_3d(&mut index, 2, &inverted);
        assert_eq!(
            explain_spatial_indexing_3d(&index, 1).reason,
            Some(SpatialDeclineReason::NonFiniteBounds)
        );
        assert_eq!(
            explain_spatial_indexing_3d(&index, 2).reason,
            Some(SpatialDeclineReason::InvertedBounds)
        );
    }

    #[test]
    fn reports_the_cell_count_an_ordinary_object_occupies() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 1.5));
        let explanation = explain_spatial_indexing_3d(&index, 1);
        assert_eq!(explanation.bucket_count, 8.0);
        assert_eq!(explanation.id, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);
        assert_eq!(explanation.reason, None);
    }

    #[test]
    fn oversized_object_overflows() {
        let mut index = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(1.0)));
        insert_spatial_object_3d(&mut index, 1, &box3(0.0, 0.0, 0.0, 5000.0));
        let explanation = explain_spatial_indexing_3d(&index, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        assert_eq!(explanation.bucket_count, 0.0);
        assert!(explanation.bucket_count <= MAX_INDEXED_CELLS_PER_OBJECT as f64);
    }
}
