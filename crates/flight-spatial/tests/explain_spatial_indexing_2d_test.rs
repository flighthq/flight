use flight_spatial::*;

mod explain_spatial_indexing_2d {
    use super::*;

    #[test]
    fn reports_absent_for_an_id_that_was_never_inserted() {
        let index = create_spatial_index_2d(10.0);
        let explanation = explain_spatial_indexing_2d(&index, 42);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.id, 42);
        assert_eq!(explanation.mode, SpatialIndexingMode::Absent);
        assert_eq!(explanation.reason, None);
    }

    #[test]
    fn reports_the_bucket_count_of_an_ordinary_object() {
        let mut index = create_spatial_index_2d(10.0);
        let bounds = create_spatial_aabb_2d(0.0, 0.0, 25.0, 25.0);
        insert_spatial_object_2d(&mut index, 1, &bounds);
        let explanation = explain_spatial_indexing_2d(&index, 1);
        assert_eq!(explanation.bucket_count, 9.0);
        assert_eq!(explanation.id, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Cells);
        assert_eq!(explanation.reason, None);
    }

    #[test]
    fn reports_overflow_for_an_oversized_object() {
        let mut index = create_spatial_index_2d(1.0);
        let bounds = create_spatial_aabb_2d(0.0, 0.0, 1e6, 1e6);
        insert_spatial_object_2d(&mut index, 1, &bounds);
        let explanation = explain_spatial_indexing_2d(&index, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.id, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Overflow);
        assert_eq!(explanation.reason, None);
    }

    #[test]
    fn reports_declined_for_non_finite_bounds() {
        let mut index = create_spatial_index_2d(10.0);
        let bounds = create_spatial_aabb_2d(0.0, 0.0, f32::INFINITY, 10.0);
        insert_spatial_object_2d(&mut index, 1, &bounds);
        let explanation = explain_spatial_indexing_2d(&index, 1);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.id, 1);
        assert_eq!(explanation.mode, SpatialIndexingMode::Declined);
        assert_eq!(explanation.reason, Some(SpatialDeclineReason::NonFiniteBounds));
    }

    #[test]
    fn returns_to_absent_after_remove() {
        let mut index = create_spatial_index_2d(10.0);
        let bounds = create_spatial_aabb_2d(0.0, 0.0, 5.0, 5.0);
        insert_spatial_object_2d(&mut index, 1, &bounds);
        remove_spatial_object_2d(&mut index, 1);
        assert_eq!(explain_spatial_indexing_2d(&index, 1).mode, SpatialIndexingMode::Absent);
    }

    #[test]
    fn tracks_mode_across_updates() {
        let mut index = create_spatial_index_2d(1.0);
        let small = create_spatial_aabb_2d(0.0, 0.0, 2.0, 2.0);
        insert_spatial_object_2d(&mut index, 1, &small);
        assert_eq!(explain_spatial_indexing_2d(&index, 1).mode, SpatialIndexingMode::Cells);
        let huge = create_spatial_aabb_2d(0.0, 0.0, 1e9, 1e9);
        update_spatial_object_2d(&mut index, 1, &huge);
        assert_eq!(explain_spatial_indexing_2d(&index, 1).mode, SpatialIndexingMode::Overflow);
        let nan_bounds = create_spatial_aabb_2d(f32::NAN, 0.0, 2.0, 2.0);
        update_spatial_object_2d(&mut index, 1, &nan_bounds);
        assert_eq!(explain_spatial_indexing_2d(&index, 1).mode, SpatialIndexingMode::Declined);
    }

    #[test]
    fn never_exceeds_the_per_object_bucket_budget() {
        let mut index = create_spatial_index_2d(1.0);
        for i in 0..8u64 {
            let extent = 10.0_f32.powi(i as i32);
            let bounds = create_spatial_aabb_2d(0.0, 0.0, extent, extent);
            insert_spatial_object_2d(&mut index, i, &bounds);
        }
        for i in 0..8u64 {
            assert!(explain_spatial_indexing_2d(&index, i).bucket_count <= MAX_INDEXED_CELLS_PER_OBJECT as f64);
        }
    }

    #[test]
    fn mutates_nothing_repeated_calls_report_the_same_thing() {
        let mut index = create_spatial_index_2d(10.0);
        let bounds = create_spatial_aabb_2d(0.0, 0.0, 5.0, 5.0);
        insert_spatial_object_2d(&mut index, 1, &bounds);
        let first = explain_spatial_indexing_2d(&index, 1);
        assert_eq!(explain_spatial_indexing_2d(&index, 1), first);
        assert_eq!(explain_spatial_indexing_2d(&index, 99).mode, SpatialIndexingMode::Absent);
        assert_eq!(explain_spatial_indexing_2d(&index, 1), first);
    }
}
