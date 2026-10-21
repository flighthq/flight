use crate::{
    SpatialIndexingMode, SpatialIndexingNotice,
    uniform_grid::MAX_INDEXED_CELLS_PER_OBJECT,
};

fn format_mode(mode: SpatialIndexingMode) -> &'static str {
    match mode {
        SpatialIndexingMode::Absent => "absent",
        SpatialIndexingMode::Cells => "cells",
        SpatialIndexingMode::Declined => "declined",
        SpatialIndexingMode::Overflow => "overflow",
    }
}

fn format_operation(operation: crate::SpatialIndexingOperation) -> &'static str {
    match operation {
        crate::SpatialIndexingOperation::Insert => "insert",
        crate::SpatialIndexingOperation::Update => "update",
        crate::SpatialIndexingOperation::Remove => "remove",
    }
}

/// Renders an indexing notice as a caller-facing sentence.
pub fn format_spatial_indexing_notice(notice: &SpatialIndexingNotice) -> String {
    if notice.reason == Some(crate::SpatialIndexingReason::InvalidCellSize) {
        return format!(
            "the uniform grid's cellSize ({}) must be a positive finite number. {}SpatialObject({}) used the bounded overflow path instead, so results remain correct but queries scan this object.",
            notice.cell_size,
            format_operation(notice.operation),
            notice.id,
        );
    }
    if notice.reason == Some(crate::SpatialIndexingReason::InvertedBounds) {
        return format!(
            "{}SpatialObject({}): no minimum may exceed its matching maximum, so the object was not indexed and no query will return it. The operation returns false for this \u{2014} normalize or correct the bounds upstream.",
            format_operation(notice.operation),
            notice.id,
        );
    }
    if notice.reason == Some(crate::SpatialIndexingReason::MissingId) {
        if notice.operation == crate::SpatialIndexingOperation::Remove {
            return format!(
                "removeSpatialObject({}): the id was not indexed, so removal was a no-op. Check the object's indexing lifecycle if this was unexpected.",
                notice.id,
            );
        }
        return format!(
            "updateSpatialObject({}): the id was not indexed, so update used its documented insert behavior and left the object in '{}' mode. Use insertSpatialObject for a new id, or check the object's indexing lifecycle.",
            notice.id,
            format_mode(notice.mode),
        );
    }
    if notice.mode == SpatialIndexingMode::Declined {
        return format!(
            "{}SpatialObject({}): the bounds are not finite, so the object was not indexed and no query will return it. The operation returns false for this \u{2014} check the sentinel, and check what produced NaN/Infinity bounds upstream.",
            format_operation(notice.operation),
            notice.id,
        );
    }
    if notice.mode == SpatialIndexingMode::Overflow {
        return format!(
            "{}SpatialObject({}): the bounds span {} cells, over the {} per-object budget, so the object is held in the flat overflow list instead of the grid. Results are unaffected. If this is not a one-off outlier, the grid's cellSize is too small for the objects being indexed \u{2014} size it to a typical object.",
            format_operation(notice.operation),
            notice.id,
            notice.would_occupy_bucket_count,
            MAX_INDEXED_CELLS_PER_OBJECT,
        );
    }
    return format!(
        "{}SpatialObject({}): indexed as '{}', which carries no caller-facing advice.",
        format_operation(notice.operation),
        notice.id,
        format_mode(notice.mode),
    );
}
