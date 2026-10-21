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

mod format_spatial_indexing_notice {
    use super::*;

    #[test]
    fn names_the_sentinel_to_check_for_a_decline() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 10.0,
            id: 3,
            mode: SpatialIndexingMode::Declined,
            operation: SpatialIndexingOperation::Insert,
            reason: Some(SpatialIndexingReason::NonFiniteBounds),
            would_occupy_bucket_count: 0.0,
        });
        assert!(message.contains("insertSpatialObject(3)"));
        assert!(message.contains("not finite"));
        assert!(message.contains("returns false"));
    }

    #[test]
    fn names_the_span_and_cell_size_cause_for_overflow() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 1.0,
            id: 4,
            mode: SpatialIndexingMode::Overflow,
            operation: SpatialIndexingOperation::Insert,
            reason: None,
            would_occupy_bucket_count: 40000.0,
        });
        assert!(message.contains("insertSpatialObject(4)"));
        assert!(message.contains("40000 cells"));
        assert!(message.contains(&format!(
            "{} per-object budget",
            MAX_INDEXED_CELLS_PER_OBJECT
        )));
        assert!(message.contains("cellSize is too small"));
        assert!(message.contains("Results are unaffected"));
    }

    #[test]
    fn explains_invalid_cell_sizes() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 0.0,
            id: 1,
            mode: SpatialIndexingMode::Overflow,
            operation: SpatialIndexingOperation::Insert,
            reason: Some(SpatialIndexingReason::InvalidCellSize),
            would_occupy_bucket_count: 0.0,
        });
        assert!(
            message.contains("the uniform grid's cellSize (0) must be a positive finite number")
        );
    }

    #[test]
    fn explains_inverted_bounds() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 10.0,
            id: 2,
            mode: SpatialIndexingMode::Declined,
            operation: SpatialIndexingOperation::Update,
            reason: Some(SpatialIndexingReason::InvertedBounds),
            would_occupy_bucket_count: 0.0,
        });
        assert!(message.contains("no minimum may exceed its matching maximum"));
    }

    #[test]
    fn explains_missing_id_remove() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 10.0,
            id: 3,
            mode: SpatialIndexingMode::Absent,
            operation: SpatialIndexingOperation::Remove,
            reason: Some(SpatialIndexingReason::MissingId),
            would_occupy_bucket_count: 0.0,
        });
        assert!(message.contains("removal was a no-op"));
    }

    #[test]
    fn names_no_dimension() {
        let modes = [
            SpatialIndexingMode::Cells,
            SpatialIndexingMode::Overflow,
            SpatialIndexingMode::Declined,
            SpatialIndexingMode::Absent,
        ];
        let operations = [
            SpatialIndexingOperation::Insert,
            SpatialIndexingOperation::Update,
            SpatialIndexingOperation::Remove,
        ];
        let reasons: [Option<SpatialIndexingReason>; 5] = [
            None,
            Some(SpatialIndexingReason::InvalidCellSize),
            Some(SpatialIndexingReason::InvertedBounds),
            Some(SpatialIndexingReason::MissingId),
            Some(SpatialIndexingReason::NonFiniteBounds),
        ];
        for &mode in &modes {
            for &operation in &operations {
                for &reason in &reasons {
                    let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
                        cell_size: 1.0,
                        id: 7,
                        mode,
                        operation,
                        reason,
                        would_occupy_bucket_count: 2.0,
                    });
                    assert!(
                        !message.contains("2D"),
                        "message contained '2D': {}",
                        message
                    );
                    assert!(
                        !message.contains("3D"),
                        "message contained '3D': {}",
                        message
                    );
                }
            }
        }
    }

    #[test]
    fn says_plainly_that_an_uncovered_mode_carries_no_advice() {
        let message = format_spatial_indexing_notice(&SpatialIndexingNotice {
            cell_size: 10.0,
            id: 5,
            mode: SpatialIndexingMode::Cells,
            operation: SpatialIndexingOperation::Insert,
            reason: None,
            would_occupy_bucket_count: 4.0,
        });
        assert!(message.contains("no caller-facing advice"));
    }

    #[test]
    fn formats_what_the_grid_actually_hands_a_guard() {
        let _guard_scope = crate::lock_spatial_guard_tests();
        take_notices();
        let mut index = create_spatial_index_2d(Some(create_uniform_grid_spatial_backend_2d(1.0)));
        set_spatial_indexing_guard(Some(crate::spatial_guard_for_current_test(test_guard)));
        let overflow_bounds = SpatialAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 199.0,
            max_y: 199.0,
        };
        insert_spatial_object_2d(&mut index, 9, &overflow_bounds);
        let nan_bounds = SpatialAabb2D {
            min_x: f32::NAN,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        };
        insert_spatial_object_2d(&mut index, 10, &nan_bounds);
        let captured = take_notices();
        let messages: Vec<String> = captured
            .iter()
            .map(format_spatial_indexing_notice)
            .collect();
        assert_eq!(
            messages,
            vec![
                format_spatial_indexing_notice(&SpatialIndexingNotice {
                    cell_size: 1.0,
                    id: 9,
                    mode: SpatialIndexingMode::Overflow,
                    operation: SpatialIndexingOperation::Insert,
                    reason: None,
                    would_occupy_bucket_count: 40000.0,
                }),
                format_spatial_indexing_notice(&SpatialIndexingNotice {
                    cell_size: 1.0,
                    id: 10,
                    mode: SpatialIndexingMode::Declined,
                    operation: SpatialIndexingOperation::Insert,
                    reason: Some(SpatialIndexingReason::NonFiniteBounds),
                    would_occupy_bucket_count: 0.0,
                }),
            ]
        );
        assert!(messages[0].contains("40000 cells"));
    }
}
