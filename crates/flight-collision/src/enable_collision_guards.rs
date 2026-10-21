use std::collections::HashMap;
use std::sync::Arc;

use flight_log::{LogData, LogLevel, LogStateRef, LogValue, log_once};

use crate::collision_shape_validation2d::get_collision_shape_validation_status2d;
use crate::collision_shape_validation3d::get_collision_shape_validation_status3d;
use crate::test_collision2d::set_collision_test_guard2d;
use crate::test_collision3d::set_collision_test_guard3d;
use crate::types::*;

const DEGENERATE_2D_MESSAGE: &str = "testCollision2D: a shape is degenerate and cannot produce a manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a finite positive-area collider.";
const NON_CONVEX_2D_MESSAGE: &str = "testCollision2D: a polygon is non-convex and cannot produce a supported manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a convex polygon.";
const UNSUPPORTED_2D_MESSAGE: &str = "testCollision2D: a shape kind has no manifold path and was reported as not overlapping — call explainCollisionTest2D(a, b) for the kind. Segments and points are area-less by design and answer the boolean testSegment*Collision and getCollisionShapeContainsPoint2D lanes instead.";
const DEGENERATE_3D_MESSAGE: &str = "testCollision3D: a shape is degenerate and cannot produce a manifold — call explainCollisionTest3D(a, b) and replace the reported shape with a finite collider of positive extent.";
const UNSUPPORTED_3D_MESSAGE: &str = "testCollision3D: a shape kind has no registered support function and was reported as not overlapping — call registerBuiltInCollisionSupports3D() once at startup, or registerCollisionSupport3D(kind, support) for a vendor kind. Call explainCollisionTest3D(a, b) for which shape it was.";

// flight-lint: allow(conform-params) D5: caller-owned registries replace the hidden module flag
pub fn are_collision_guards_enabled(
    registry2d: &CollisionRegistry2D,
    registry3d: &CollisionRegistry3D,
) -> bool {
    return registry2d.test_guard.is_some() && registry3d.test_guard.is_some();
}

// flight-lint: allow(conform-params) D5: caller-owned registries replace hidden guard slots and flag
pub fn disable_collision_guards(
    registry2d: &mut CollisionRegistry2D,
    registry3d: &mut CollisionRegistry3D,
) {
    set_collision_test_guard2d(registry2d, None);
    set_collision_test_guard3d(registry3d, None);
}

/// Installs the opt-in 2D and 3D diagnostics with caller-owned log state and a clock sampled only
/// when an operation reports a warnable shape.
// flight-lint: allow(f64) D1: the injected clock returns a millisecond operation timestamp
// flight-lint: allow(conform-params) D5: caller-owned registries, log state and live clock replace hidden process state
pub fn enable_collision_guards(
    registry2d: &mut CollisionRegistry2D,
    registry3d: &mut CollisionRegistry3D,
    log_state: &LogStateRef,
    clock: Arc<dyn Fn() -> f64 + Send + Sync>,
) {
    let log_state2d = log_state.clone();
    let clock2d = clock.clone();
    set_collision_test_guard2d(
        registry2d,
        Some(Arc::new(move |a, b| {
            warn_on_invalid_collision_shapes2d(&log_state2d, &clock2d, a, b);
        })),
    );

    let log_state3d = log_state.clone();
    set_collision_test_guard3d(
        registry3d,
        Some(Arc::new(move |a, b| {
            warn_on_invalid_collision_shapes3d(&log_state3d, &clock, a, b);
        })),
    );
}

fn get_guard_status2d(shape: &CollisionShape2D) -> Option<CollisionTestStatus> {
    return match shape {
        CollisionShape2D::Segment(segment) => {
            if !segment.x0.is_finite()
                || !segment.y0.is_finite()
                || !segment.x1.is_finite()
                || !segment.y1.is_finite()
                || (segment.x0 == segment.x1 && segment.y0 == segment.y1)
            {
                Some(CollisionTestStatus::DegenerateShape)
            } else {
                Some(CollisionTestStatus::UnsupportedShapeKind)
            }
        }
        CollisionShape2D::Point(point) => {
            if point.x.is_finite() && point.y.is_finite() {
                Some(CollisionTestStatus::UnsupportedShapeKind)
            } else {
                Some(CollisionTestStatus::DegenerateShape)
            }
        }
        CollisionShape2D::Polygon(polygon) => get_guard_status2d_polygon(&polygon.points),
        _ => get_collision_shape_validation_status2d(shape),
    };
}

// flight-lint: allow(f64) collision polygon validation preserves the source relative-area boundary
fn get_guard_status2d_polygon(points: &[f64]) -> Option<CollisionTestStatus> {
    if points.len() < 6 || points.len() % 2 != 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for point in points.chunks_exact(2) {
        let x = point[0];
        let y = point[1];
        if !x.is_finite() || !y.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
    }
    let extent = (max_x - min_x).max(max_y - min_y);
    if extent <= 0.0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let cross_epsilon = extent * extent * 1e-12;
    let x_origin = points[0];
    let y_origin = points[1];
    let count = points.len() / 2;
    let mut area_twice = 0.0;
    let mut turn_sign = 0;
    for index in 0..count {
        let previous = (index + count - 1) % count;
        let next = (index + 1) % count;
        let x = points[index * 2] - x_origin;
        let y = points[index * 2 + 1] - y_origin;
        let next_x = points[next * 2] - x_origin;
        let next_y = points[next * 2 + 1] - y_origin;
        area_twice += x * next_y - y * next_x;
        let axis_x = x - (points[previous * 2] - x_origin);
        let axis_y = y - (points[previous * 2 + 1] - y_origin);
        let edge_x = next_x - x;
        let edge_y = next_y - y;
        let cross = axis_x * edge_y - axis_y * edge_x;
        if cross.abs() <= cross_epsilon {
            continue;
        }
        let sign = if cross > 0.0 { 1 } else { -1 };
        if turn_sign != 0 && sign != turn_sign {
            return Some(CollisionTestStatus::NonConvexPolygon);
        }
        turn_sign = sign;
    }
    if area_twice.abs() <= cross_epsilon || turn_sign == 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    return None;
}

fn get_guard_status3d(shape: &CollisionShape3D) -> Option<CollisionTestStatus> {
    return match shape {
        CollisionShape3D::Capsule(capsule) => {
            if capsule.x0.is_finite()
                && capsule.y0.is_finite()
                && capsule.z0.is_finite()
                && capsule.x1.is_finite()
                && capsule.y1.is_finite()
                && capsule.z1.is_finite()
                && capsule.radius.is_finite()
                && capsule.radius > 0.0
            {
                None
            } else {
                Some(CollisionTestStatus::DegenerateShape)
            }
        }
        CollisionShape3D::Convex(convex) => get_guard_status3d_convex(&convex.points),
        _ => get_collision_shape_validation_status3d(shape),
    };
}

// flight-lint: allow(f64) collision convex validation measures the source positive-extent boundary
fn get_guard_status3d_convex(points: &[f64]) -> Option<CollisionTestStatus> {
    if points.len() < 9 || points.len() % 3 != 0 {
        return Some(CollisionTestStatus::DegenerateShape);
    }
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut min_z = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut max_z = f64::NEG_INFINITY;
    for point in points.chunks_exact(3) {
        let x = point[0];
        let y = point[1];
        let z = point[2];
        if !x.is_finite() || !y.is_finite() || !z.is_finite() {
            return Some(CollisionTestStatus::DegenerateShape);
        }
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        min_z = min_z.min(z);
        max_x = max_x.max(x);
        max_y = max_y.max(y);
        max_z = max_z.max(z);
    }
    if (max_x - min_x).max(max_y - min_y).max(max_z - min_z) > 0.0 {
        return None;
    }
    return Some(CollisionTestStatus::DegenerateShape);
}

fn get_status_string(status: CollisionTestStatus) -> &'static str {
    return match status {
        CollisionTestStatus::DegenerateShape => "degenerate-shape",
        CollisionTestStatus::NonConvexPolygon => "non-convex-polygon",
        CollisionTestStatus::UnsupportedShapeKind => "unsupported-shape-kind",
    };
}

// flight-lint: allow(f64) the injected live clock is sampled only for a warnable 2D operation
fn warn_on_invalid_collision_shapes2d(
    log_state: &LogStateRef,
    clock: &Arc<dyn Fn() -> f64 + Send + Sync>,
    a: &CollisionShape2D,
    b: &CollisionShape2D,
) {
    if let Some(status) = get_guard_status2d(a) {
        warn_on_invalid_collision_status(
            log_state,
            clock(),
            get_collision_shape2d_kind_key(a),
            0,
            status,
            "2D",
        );
        return;
    }
    if let Some(status) = get_guard_status2d(b) {
        warn_on_invalid_collision_status(
            log_state,
            clock(),
            get_collision_shape2d_kind_key(b),
            1,
            status,
            "2D",
        );
    }
}

// flight-lint: allow(f64) the injected live clock is sampled only for a warnable 3D operation
fn warn_on_invalid_collision_shapes3d(
    log_state: &LogStateRef,
    clock: &Arc<dyn Fn() -> f64 + Send + Sync>,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
) {
    if let Some(status) = get_guard_status3d(a) {
        warn_on_invalid_collision_status(
            log_state,
            clock(),
            get_collision_shape3d_kind_key(a),
            0,
            status,
            "3D",
        );
        return;
    }
    if let Some(status) = get_guard_status3d(b) {
        warn_on_invalid_collision_status(
            log_state,
            clock(),
            get_collision_shape3d_kind_key(b),
            1,
            status,
            "3D",
        );
    }
}

// flight-lint: allow(f64) D1: operation time is an injected millisecond timestamp
fn warn_on_invalid_collision_status(
    log_state: &LogStateRef,
    now_ms: f64,
    kind: &str,
    shape_index: usize,
    status: CollisionTestStatus,
    dimension: &str,
) {
    let status_string = get_status_string(status);
    let message = match (dimension, status) {
        ("2D", CollisionTestStatus::DegenerateShape) => DEGENERATE_2D_MESSAGE,
        ("2D", CollisionTestStatus::NonConvexPolygon) => NON_CONVEX_2D_MESSAGE,
        ("2D", CollisionTestStatus::UnsupportedShapeKind) => UNSUPPORTED_2D_MESSAGE,
        ("3D", CollisionTestStatus::DegenerateShape) => DEGENERATE_3D_MESSAGE,
        ("3D", CollisionTestStatus::UnsupportedShapeKind) => UNSUPPORTED_3D_MESSAGE,
        ("3D", CollisionTestStatus::NonConvexPolygon) => DEGENERATE_3D_MESSAGE,
        _ => DEGENERATE_2D_MESSAGE,
    };
    let key = format!("collision:{dimension}:{status_string}:{shape_index}:{kind}");
    let data = LogData::Record(HashMap::from([
        ("kind".to_string(), LogValue::Str(kind.to_string())),
        ("message".to_string(), LogValue::Str(message.to_string())),
        ("shapeIndex".to_string(), LogValue::Int(shape_index as i64)),
        (
            "status".to_string(),
            LogValue::Str(status_string.to_string()),
        ),
    ]));
    let _ = log_once(
        log_state,
        now_ms,
        &key,
        LogLevel::Warn,
        data.into(),
        Some("collision".to_string()),
    );
}
