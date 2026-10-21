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

mod report_spatial_indexing {
    use super::*;

    #[test]
    fn hands_the_notice_to_the_installed_guard_unchanged() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        let notice = SpatialIndexingNotice {
            cell_size: 4.0,
            id: 3,
            mode: SpatialIndexingMode::Overflow,
            operation: SpatialIndexingOperation::Insert,
            reason: Some(SpatialIndexingReason::InvalidCellSize),
            would_occupy_bucket_count: 9.0,
        };
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        report_spatial_indexing(&notice);
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0], notice);
    }

    #[test]
    fn is_a_no_op_with_no_guard_installed() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        let notice = SpatialIndexingNotice {
            cell_size: 1.0,
            id: 0,
            mode: SpatialIndexingMode::Absent,
            operation: SpatialIndexingOperation::Remove,
            reason: Some(SpatialIndexingReason::MissingId),
            would_occupy_bucket_count: 0.0,
        };
        set_spatial_indexing_guard(None);
        report_spatial_indexing(&notice);
        let captured = take_notices();
        assert_eq!(captured.len(), 0);
    }

    #[test]
    fn serves_both_dimensions_from_one_guard() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index_2d = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let nan_bounds_2d = SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 1.0, max_y: 1.0 };
        insert_spatial_object_2d(&mut index_2d, 1, &nan_bounds_2d);

        let mut index_3d = create_spatial_index_3d(Some(create_uniform_grid_spatial_backend_3d(10.0)));
        let nan_bounds_3d = SpatialAabb3D { min_x: 0.0, min_y: f32::NAN, min_z: 0.0, max_x: 1.0, max_y: 1.0, max_z: 1.0 };
        insert_spatial_object_3d(&mut index_3d, 2, &nan_bounds_3d);

        let captured = take_notices();
        assert_eq!(captured.len(), 2);
        let ids: Vec<SpatialObjectId> = captured.iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![1, 2]);
        assert!(captured.iter().all(|n| n.reason == Some(SpatialIndexingReason::NonFiniteBounds)));
    }
}

mod set_spatial_indexing_guard {
    use super::*;

    #[test]
    fn reports_a_decline_with_its_reason_and_no_span() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let bounds = SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        insert_spatial_object_2d(&mut index, 7, &bounds);
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].cell_size, 10.0);
        assert_eq!(captured[0].id, 7);
        assert_eq!(captured[0].mode, SpatialIndexingMode::Declined);
        assert_eq!(captured[0].operation, SpatialIndexingOperation::Insert);
        assert_eq!(captured[0].reason, Some(SpatialIndexingReason::NonFiniteBounds));
        assert_eq!(captured[0].would_occupy_bucket_count, 0.0);
    }

    #[test]
    fn reports_an_overflow_with_the_span() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 199.0, max_y: 199.0 };
        insert_spatial_object_2d(&mut index, 7, &bounds);
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].cell_size, 1.0);
        assert_eq!(captured[0].id, 7);
        assert_eq!(captured[0].mode, SpatialIndexingMode::Overflow);
        assert_eq!(captured[0].operation, SpatialIndexingOperation::Insert);
        assert_eq!(captured[0].reason, None);
        assert_eq!(captured[0].would_occupy_bucket_count, 40000.0);
    }

    #[test]
    fn reports_invalid_cell_size_and_keeps_results_correct() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        for &cell_size in &[0.0_f32, -1.0] {
            let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(cell_size)));
            set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
            let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
            assert!(insert_spatial_object_2d(&mut index, 7, &bounds));
            let mut point: Vec<SpatialObjectId> = Vec::new();
            query_spatial_point_2d(&mut point, &mut index, 5.0, 5.0);
            assert_eq!(point, vec![7]);
        }
        let captured = take_notices();
        assert_eq!(captured.len(), 2);
        for notice in &captured {
            assert_eq!(notice.id, 7);
            assert_eq!(notice.mode, SpatialIndexingMode::Overflow);
            assert_eq!(notice.reason, Some(SpatialIndexingReason::InvalidCellSize));
        }
    }

    #[test]
    fn declines_and_reports_inverted_bounds() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let bounds = SpatialAabb2D { min_x: 10.0, min_y: 0.0, max_x: 0.0, max_y: 10.0 };
        assert!(!insert_spatial_object_2d(&mut index, 7, &bounds));
        let explanation = explain_spatial_indexing_2d(&index, 7);
        assert_eq!(explanation.bucket_count, 0.0);
        assert_eq!(explanation.id, 7);
        assert_eq!(explanation.mode, SpatialIndexingMode::Declined);
        assert_eq!(explanation.reason, Some(SpatialDeclineReason::InvertedBounds));
        let captured = take_notices();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0].reason, Some(SpatialIndexingReason::InvertedBounds));
    }

    #[test]
    fn reports_update_and_remove_for_missing_id() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 5.0, max_y: 5.0 };
        assert!(update_spatial_object_2d(&mut index, 7, &bounds));
        remove_spatial_object_2d(&mut index, 8);
        let captured = take_notices();
        assert_eq!(captured.len(), 2);
        assert_eq!(captured[0].id, 7);
        assert_eq!(captured[0].mode, SpatialIndexingMode::Cells);
        assert_eq!(captured[0].operation, SpatialIndexingOperation::Update);
        assert_eq!(captured[0].reason, Some(SpatialIndexingReason::MissingId));
        assert_eq!(captured[1].id, 8);
        assert_eq!(captured[1].mode, SpatialIndexingMode::Absent);
        assert_eq!(captured[1].operation, SpatialIndexingOperation::Remove);
        assert_eq!(captured[1].reason, Some(SpatialIndexingReason::MissingId));
    }

    #[test]
    fn stays_silent_on_the_ordinary_path() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        insert_spatial_object_2d(&mut index, 1, &bounds);
        remove_spatial_object_2d(&mut index, 1);
        let captured = take_notices();
        assert_eq!(captured.len(), 0);
    }

    #[test]
    fn none_uninstalls_the_guard() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        set_spatial_indexing_guard(None);
        let bounds = SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        insert_spatial_object_2d(&mut index, 1, &bounds);
        let captured = take_notices();
        assert_eq!(captured.len(), 0);
    }

    #[test]
    fn does_not_change_what_insert_returns() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(10.0)));
        set_spatial_indexing_guard(Some(std::sync::Arc::new(test_guard)));
        let nan_bounds = SpatialAabb2D { min_x: f32::NAN, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(!insert_spatial_object_2d(&mut index, 1, &nan_bounds));
        let ok_bounds = SpatialAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(insert_spatial_object_2d(&mut index, 2, &ok_bounds));
        take_notices();
    }
}
