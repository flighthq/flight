use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{
    Matrix, Rectangle, contains_rectangle_point_xy, copy_rectangle, encloses_rectangle,
    intersects_rectangle, is_empty_rectangle, matrix_transform_rectangle, merge_rectangle,
};
use flight_math::CIRCLE_KAPPA;
use flight_path::{
    Path, PathWinding, append_path_cubic_curve_to, append_path_line_to, append_path_move_to,
    create_path, flatten_path,
};

use crate::types::*;

// flight-lint: allow(f64) normalization compares f64 Path.data coordinates at the source epsilon
const NORMALIZE_EPSILON: f64 = 1e-6;

// flight-lint: allow(f64) circle geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_circle(
    x: f64,
    y: f64,
    radius: f64,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    let mut path = create_path();
    append_circle_to_path(&mut path, x, y, radius);
    return create_clip_region_from_path(&path, tolerance);
}

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden contour guard slot
pub fn create_clip_region_from_contours(
    state: &ClipRegionState,
    contours: &[Vec<f64>],
    winding: PathWinding,
) -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    initialize_clip_region_from_contours(&mut out, state, contours, winding);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(f64) ellipse geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_ellipse(
    rectangle: &Rectangle,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    let mut path = create_path();
    append_ellipse_to_path(
        &mut path,
        rectangle.x as f64,
        rectangle.y as f64,
        rectangle.width as f64,
        rectangle.height as f64,
    );
    return create_clip_region_from_path(&path, tolerance);
}

// flight-lint: allow(f64) flatten tolerance belongs to the f64 Path.data geometry lane
pub fn create_clip_region_from_path(path: &Path, tolerance: Option<f64>) -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    initialize_clip_region_from_path(&mut out, path, tolerance);
    return Arc::new(RwLock::new(out));
}

pub fn create_clip_region_from_rectangle(rectangle: &Rectangle) -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    initialize_clip_region_from_rectangle(&mut out, rectangle);
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(f64) rounded rectangle geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_rounded_rectangle(
    rectangle: &Rectangle,
    radius: f64,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    if radius <= 0.0 {
        return create_clip_region_from_rectangle(rectangle);
    }
    let mut path = create_path();
    append_rounded_rect_to_path(
        &mut path,
        rectangle.x as f64,
        rectangle.y as f64,
        rectangle.width as f64,
        rectangle.height as f64,
        radius,
    );
    return create_clip_region_from_path(&path, tolerance);
}

// flight-lint: allow(conform-extra) D5: explicit caller-owned pool and guard state constructor
pub fn create_clip_region_state() -> ClipRegionState {
    return ClipRegionState::default();
}

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
// flight-lint: allow(conform-params) D5/D24: caller-owned output precedes explicit guard state
pub fn initialize_clip_region_from_contours(
    out: &mut ClipRegion,
    state: &ClipRegionState,
    contours: &[Vec<f64>],
    winding: PathWinding,
) {
    let explanation = explain_clip_region_contours(contours);
    if let (Some(explanation), Some(guard)) = (explanation.as_ref(), state.contours_guard.as_ref())
    {
        guard(explanation, contours);
    }
    set_rectangle_to_contours_bounds(&mut out.rect, contours);
    out.contours = Some(contours.to_vec());
    out.version = 0;
    out.winding = winding;
}

// flight-lint: allow(f64) flatten tolerance belongs to the f64 Path.data geometry lane
pub fn initialize_clip_region_from_path(out: &mut ClipRegion, path: &Path, tolerance: Option<f64>) {
    let contours = flatten_path(path, tolerance);
    set_rectangle_to_contours_bounds(&mut out.rect, &contours);
    out.contours = Some(contours);
    out.version = 0;
    out.winding = path.winding;
}

pub fn initialize_clip_region_from_rectangle(out: &mut ClipRegion, rectangle: &Rectangle) {
    copy_rectangle(&mut out.rect, rectangle);
    out.contours = None;
    out.version = 0;
    out.winding = PathWinding::NonZero;
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden pool
pub fn acquire_clip_region(state: &mut ClipRegionState) -> Ref<ClipRegion> {
    if let Some(region) = state.pool.pop() {
        {
            let mut region = region.write().unwrap();
            region.rect.x = 0.0;
            region.rect.y = 0.0;
            region.rect.width = 0.0;
            region.rect.height = 0.0;
            region.contours = None;
            region.winding = PathWinding::NonZero;
            region.version = 0;
        }
        return region;
    }
    return Arc::new(RwLock::new(allocate_entity()));
}

// flight-lint: allow(f64) cubic circle construction writes exact f64 Path.data coordinates
fn append_circle_to_path(path: &mut Path, cx: f64, cy: f64, radius: f64) {
    let k = radius * CIRCLE_KAPPA as f64;
    append_path_move_to(path, cx, cy - radius);
    append_path_cubic_curve_to(
        path,
        cx + k,
        cy - radius,
        cx + radius,
        cy - k,
        cx + radius,
        cy,
    );
    append_path_cubic_curve_to(
        path,
        cx + radius,
        cy + k,
        cx + k,
        cy + radius,
        cx,
        cy + radius,
    );
    append_path_cubic_curve_to(
        path,
        cx - k,
        cy + radius,
        cx - radius,
        cy + k,
        cx - radius,
        cy,
    );
    append_path_cubic_curve_to(
        path,
        cx - radius,
        cy - k,
        cx - k,
        cy - radius,
        cx,
        cy - radius,
    );
}

// flight-lint: allow(f64) cubic ellipse construction writes exact f64 Path.data coordinates
fn append_ellipse_to_path(path: &mut Path, x: f64, y: f64, width: f64, height: f64) {
    let cx = x + width / 2.0;
    let cy = y + height / 2.0;
    let rx = width / 2.0;
    let ry = height / 2.0;
    let kx = rx * CIRCLE_KAPPA as f64;
    let ky = ry * CIRCLE_KAPPA as f64;
    append_path_move_to(path, cx, cy - ry);
    append_path_cubic_curve_to(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    append_path_cubic_curve_to(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    append_path_cubic_curve_to(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    append_path_cubic_curve_to(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
}

// flight-lint: allow(f64) rounded rectangle construction writes exact f64 Path.data coordinates
fn append_rounded_rect_to_path(
    path: &mut Path,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    radius: f64,
) {
    let corner = radius.min(width.min(height) / 2.0);
    let k = corner * CIRCLE_KAPPA as f64;
    let x1 = x + corner;
    let x2 = x + width - corner;
    let y1 = y + corner;
    let y2 = y + height - corner;
    append_path_move_to(path, x1, y);
    append_path_line_to(path, x2, y);
    append_path_cubic_curve_to(path, x2 + k, y, x + width, y1 - k, x + width, y1);
    append_path_line_to(path, x + width, y2);
    append_path_cubic_curve_to(path, x + width, y2 + k, x2 + k, y + height, x2, y + height);
    append_path_line_to(path, x1, y + height);
    append_path_cubic_curve_to(path, x1 - k, y + height, x, y2 + k, x, y2);
    append_path_line_to(path, x, y1);
    append_path_cubic_curve_to(path, x, y1 - k, x1 - k, y, x1, y);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clip_region_contains_clip_region(
    state: &ClipRegionState,
    a: &Ref<ClipRegion>,
    b: &Ref<ClipRegion>,
) -> bool {
    guard_clip_region_use(state, a);
    guard_clip_region_use(state, b);
    let a_rect = a.read().unwrap().rect.clone();
    let b_rect = b.read().unwrap().rect.clone();
    return encloses_rectangle(&a_rect, &b_rect);
}

// flight-lint: allow(f64) point queries compare against f64 contour coordinates from Path.data
// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clip_region_contains_point(
    state: &ClipRegionState,
    clip: &Ref<ClipRegion>,
    x: f64,
    y: f64,
) -> bool {
    guard_clip_region_use(state, clip);
    let clip = clip.read().unwrap();
    if !contains_rectangle_point_xy(&clip.rect, x as f32, y as f32) {
        return false;
    }
    return match clip.contours.as_ref() {
        Some(contours) => point_in_contours(contours, clip.winding, x, y),
        None => true,
    };
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clip_region_contains_rectangle(
    state: &ClipRegionState,
    clip: &Ref<ClipRegion>,
    rectangle: &Rectangle,
) -> bool {
    guard_clip_region_use(state, clip);
    return encloses_rectangle(&clip.read().unwrap().rect, rectangle);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clip_region_intersects_clip_region(
    state: &ClipRegionState,
    a: &Ref<ClipRegion>,
    b: &Ref<ClipRegion>,
) -> bool {
    guard_clip_region_use(state, a);
    guard_clip_region_use(state, b);
    let a_rect = a.read().unwrap().rect.clone();
    let b_rect = b.read().unwrap().rect.clone();
    return intersects_rectangle(&a_rect, &b_rect);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clip_region_intersects_rectangle(
    state: &ClipRegionState,
    clip: &Ref<ClipRegion>,
    rectangle: &Rectangle,
) -> bool {
    guard_clip_region_use(state, clip);
    return intersects_rectangle(&clip.read().unwrap().rect, rectangle);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn clone_clip_region(state: &ClipRegionState, clip: &Ref<ClipRegion>) -> Ref<ClipRegion> {
    guard_clip_region_use(state, clip);
    let clip = clip.read().unwrap();
    let mut out: ClipRegion = allocate_entity();
    copy_rectangle(&mut out.rect, &clip.rect);
    out.contours = clip.contours.clone();
    out.winding = clip.winding;
    out.version = clip.version;
    return Arc::new(RwLock::new(out));
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn copy_clip_region(state: &ClipRegionState, out: &Ref<ClipRegion>, source: &Ref<ClipRegion>) {
    guard_clip_region_use(state, out);
    guard_clip_region_use(state, source);
    if Arc::ptr_eq(out, source) {
        return;
    }
    let (rect, contours, winding) = {
        let source = source.read().unwrap();
        (source.rect.clone(), source.contours.clone(), source.winding)
    };
    let mut out = out.write().unwrap();
    copy_rectangle(&mut out.rect, &rect);
    out.contours = contours;
    out.winding = winding;
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn equals_clip_region(
    state: &ClipRegionState,
    a: &Ref<ClipRegion>,
    b: &Ref<ClipRegion>,
) -> bool {
    guard_clip_region_use(state, a);
    guard_clip_region_use(state, b);
    if Arc::ptr_eq(a, b) {
        return true;
    }
    let a = a.read().unwrap();
    let b = b.read().unwrap();
    return a.winding == b.winding && a.rect == b.rect && a.contours == b.contours;
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden pool
pub fn explain_clip_region(
    state: &ClipRegionState,
    clip: &Ref<ClipRegion>,
) -> ClipRegionExplanation {
    let conservative = clip.read().unwrap().contours.is_some();
    let released = state.pool.iter().any(|pooled| Arc::ptr_eq(pooled, clip));
    return ClipRegionExplanation {
        conservative,
        status: if released {
            ClipRegionStatus::Released
        } else {
            ClipRegionStatus::Active
        },
    };
}

// flight-lint: allow(f64) contour validation accepts the exact f64 Path.data coordinate arrays
pub fn explain_clip_region_contours(
    contours: &[Vec<f64>],
) -> Option<ClipRegionContoursExplanation> {
    for (contour_index, contour) in contours.iter().enumerate() {
        let coordinate_count = contour.len();
        if coordinate_count % 2 != 0 {
            return Some(ClipRegionContoursExplanation {
                contour_index,
                coordinate_count,
                reason: ClipRegionContoursReason::OddCoordinateCount,
            });
        }
        if coordinate_count < 6 {
            return Some(ClipRegionContoursExplanation {
                contour_index,
                coordinate_count,
                reason: ClipRegionContoursReason::TooFewPoints,
            });
        }
    }
    return None;
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn get_clip_region_bounds(
    state: &ClipRegionState,
    out: &mut Rectangle,
    clip: &Ref<ClipRegion>,
) {
    guard_clip_region_use(state, clip);
    copy_rectangle(out, &clip.read().unwrap().rect);
}

fn guard_clip_region_use(state: &ClipRegionState, clip: &Ref<ClipRegion>) {
    let Some(guard) = state.use_guard.as_ref() else {
        return;
    };
    if state.pool.iter().any(|pooled| Arc::ptr_eq(pooled, clip)) {
        guard(clip);
    }
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn intersect_clip_regions(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    a: &Ref<ClipRegion>,
    b: &Ref<ClipRegion>,
) {
    guard_clip_region_use(state, out);
    guard_clip_region_use(state, a);
    guard_clip_region_use(state, b);
    let (a_rect, a_contours, a_winding) = snapshot_clip_region(a);
    let (b_rect, b_contours, b_winding) = snapshot_clip_region(b);
    let x0 = a_rect.x.max(b_rect.x);
    let y0 = a_rect.y.max(b_rect.y);
    let x1 = (a_rect.x + a_rect.width).min(b_rect.x + b_rect.width);
    let y1 = (a_rect.y + a_rect.height).min(b_rect.y + b_rect.height);
    let mut out = out.write().unwrap();
    if x1 <= x0 || y1 <= y0 {
        out.rect.x = 0.0;
        out.rect.y = 0.0;
        out.rect.width = 0.0;
        out.rect.height = 0.0;
        out.contours = None;
        out.winding = PathWinding::NonZero;
        out.version = out.version.wrapping_add(1);
        return;
    }
    out.rect.x = x0;
    out.rect.y = y0;
    out.rect.width = x1 - x0;
    out.rect.height = y1 - y0;
    let (contours, winding) = select_contours(a_contours, a_winding, b_contours, b_winding);
    out.contours = contours;
    out.winding = winding;
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn invalidate_clip_region(state: &ClipRegionState, clip: &Ref<ClipRegion>) {
    guard_clip_region_use(state, clip);
    let mut clip = clip.write().unwrap();
    clip.version = clip.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn is_clip_region_empty(state: &ClipRegionState, clip: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(state, clip);
    let clip = clip.read().unwrap();
    return is_empty_rectangle(&clip.rect)
        || clip
            .contours
            .as_ref()
            .is_some_and(|contours| contours.is_empty());
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn is_clip_region_rectangular(state: &ClipRegionState, clip: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(state, clip);
    return clip.read().unwrap().contours.is_none();
}

// flight-lint: allow(f64) normalization compares the original f64 Path.data contour coordinates
// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn normalize_clip_region(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    clip: &Ref<ClipRegion>,
) {
    guard_clip_region_use(state, out);
    guard_clip_region_use(state, clip);
    let (rect, contours, winding) = snapshot_clip_region(clip);
    let normalized = contours.as_ref().and_then(|contours| {
        if contours.len() != 1 || contours[0].len() != 8 {
            return None;
        }
        let contour = &contours[0];
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for point in contour.chunks_exact(2) {
            min_x = min_x.min(point[0]);
            min_y = min_y.min(point[1]);
            max_x = max_x.max(point[0]);
            max_y = max_y.max(point[1]);
        }
        let axis_aligned = contour.chunks_exact(2).all(|point| {
            ((point[0] - min_x).abs() <= NORMALIZE_EPSILON
                || (point[0] - max_x).abs() <= NORMALIZE_EPSILON)
                && ((point[1] - min_y).abs() <= NORMALIZE_EPSILON
                    || (point[1] - max_y).abs() <= NORMALIZE_EPSILON)
        });
        if axis_aligned {
            return Some((min_x, min_y, max_x, max_y));
        }
        return None;
    });
    let mut out = out.write().unwrap();
    if let Some((min_x, min_y, max_x, max_y)) = normalized {
        out.rect.x = min_x as f32;
        out.rect.y = min_y as f32;
        out.rect.width = (max_x - min_x) as f32;
        out.rect.height = (max_y - min_y) as f32;
        out.contours = None;
        out.winding = PathWinding::NonZero;
    } else {
        copy_rectangle(&mut out.rect, &rect);
        out.contours = contours;
        out.winding = winding;
    }
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(f64) winding ray casts operate on exact f64 Path.data contour coordinates
fn point_in_contours(contours: &[Vec<f64>], winding: PathWinding, px: f64, py: f64) -> bool {
    let mut winding_number = 0_i32;
    for contour in contours {
        let count = contour.len();
        if count < 6 || count % 2 != 0 {
            continue;
        }
        for index in (0..count).step_by(2) {
            let x0 = contour[index];
            let y0 = contour[index + 1];
            let x1 = contour[(index + 2) % count];
            let y1 = contour[(index + 3) % count];
            let side = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
            if y0 <= py && y1 > py && side > 0.0 {
                winding_number += 1;
            } else if y0 > py && y1 <= py && side < 0.0 {
                winding_number -= 1;
            }
        }
    }
    return match winding {
        PathWinding::EvenOdd => winding_number & 1 != 0,
        PathWinding::NonZero => winding_number != 0,
    };
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden release guard and pool
pub fn release_clip_region(state: &mut ClipRegionState, clip: &Ref<ClipRegion>) {
    if let Some(guard) = state.release_guard.as_ref() {
        if state.pool.iter().any(|pooled| Arc::ptr_eq(pooled, clip)) {
            guard(clip);
        }
    }
    state.pool.push(clip.clone());
}

// flight-lint: allow(f64) selection preserves exact f64 Path.data contour arrays
fn select_contours(
    a_contours: Option<Vec<Vec<f64>>>,
    a_winding: PathWinding,
    b_contours: Option<Vec<Vec<f64>>>,
    b_winding: PathWinding,
) -> (Option<Vec<Vec<f64>>>, PathWinding) {
    return match (a_contours, b_contours) {
        (None, None) => (None, PathWinding::NonZero),
        (Some(contours), None) => (Some(contours), a_winding),
        (None, Some(contours)) => (Some(contours), b_winding),
        (Some(a), Some(b)) => {
            if a.len() >= b.len() {
                (Some(a), a_winding)
            } else {
                (Some(b), b_winding)
            }
        }
    };
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden contour guard slot
pub fn set_clip_region_contours_guard(
    state: &mut ClipRegionState,
    guard: Option<ClipRegionContoursGuard>,
) {
    state.contours_guard = guard;
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden release guard slot
pub fn set_clip_region_release_guard(
    state: &mut ClipRegionState,
    guard: Option<ClipRegionReleaseGuard>,
) {
    state.release_guard = guard;
}

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
// flight-lint: allow(conform-params) D5: caller-owned state replaces hidden contour and use guard slots
pub fn set_clip_region_to_contours(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    contours: &[Vec<f64>],
    winding: PathWinding,
) {
    guard_clip_region_use(state, out);
    let explanation = explain_clip_region_contours(contours);
    if let (Some(explanation), Some(guard)) = (explanation.as_ref(), state.contours_guard.as_ref())
    {
        guard(explanation, contours);
    }
    let mut out = out.write().unwrap();
    set_rectangle_to_contours_bounds(&mut out.rect, contours);
    out.contours = Some(contours.to_vec());
    out.winding = winding;
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn set_clip_region_to_rectangle(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    rectangle: &Rectangle,
) {
    guard_clip_region_use(state, out);
    let mut out = out.write().unwrap();
    copy_rectangle(&mut out.rect, rectangle);
    out.contours = None;
    out.winding = PathWinding::NonZero;
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard slot
pub fn set_clip_region_use_guard(state: &mut ClipRegionState, guard: Option<ClipRegionUseGuard>) {
    state.use_guard = guard;
}

// flight-lint: allow(f64) contour bounds retain f64 comparison before writing the f32 Rectangle contract
fn set_rectangle_to_contours_bounds(out: &mut Rectangle, contours: &[Vec<f64>]) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for contour in contours {
        if contour.len() < 6 || contour.len() % 2 != 0 {
            continue;
        }
        for point in contour.chunks_exact(2) {
            min_x = min_x.min(point[0]);
            min_y = min_y.min(point[1]);
            max_x = max_x.max(point[0]);
            max_y = max_y.max(point[1]);
        }
    }
    if min_x > max_x {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }
    out.x = min_x as f32;
    out.y = min_y as f32;
    out.width = (max_x - min_x) as f32;
    out.height = (max_y - min_y) as f32;
}

// flight-lint: allow(f64) snapshots preserve the exact f64 Path.data contour coordinates
fn snapshot_clip_region(clip: &Ref<ClipRegion>) -> (Rectangle, Option<Vec<Vec<f64>>>, PathWinding) {
    let clip = clip.read().unwrap();
    return (clip.rect.clone(), clip.contours.clone(), clip.winding);
}

// flight-lint: allow(f64) affine transforms operate on exact f64 Path.data contour coordinates
// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn transform_clip_region(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    clip: &Ref<ClipRegion>,
    matrix: &Matrix,
) {
    guard_clip_region_use(state, out);
    guard_clip_region_use(state, clip);
    let (rect, contours, winding) = snapshot_clip_region(clip);
    let mut out = out.write().unwrap();
    if let Some(contours) = contours {
        let a = matrix.a as f64;
        let b = matrix.b as f64;
        let c = matrix.c as f64;
        let d = matrix.d as f64;
        let tx = matrix.tx as f64;
        let ty = matrix.ty as f64;
        let transformed: Vec<Vec<f64>> = contours
            .iter()
            .map(|contour| {
                contour
                    .chunks_exact(2)
                    .flat_map(|point| {
                        let x = point[0];
                        let y = point[1];
                        [a * x + c * y + tx, b * x + d * y + ty]
                    })
                    .collect()
            })
            .collect();
        set_rectangle_to_contours_bounds(&mut out.rect, &transformed);
        out.contours = Some(transformed);
        out.winding = winding;
    } else if matrix.b == 0.0 && matrix.c == 0.0 {
        matrix_transform_rectangle(&mut out.rect, matrix, &rect);
        out.contours = None;
        out.winding = PathWinding::NonZero;
    } else {
        let a = matrix.a as f64;
        let b = matrix.b as f64;
        let c = matrix.c as f64;
        let d = matrix.d as f64;
        let tx = matrix.tx as f64;
        let ty = matrix.ty as f64;
        let x = rect.x as f64;
        let y = rect.y as f64;
        let width = rect.width as f64;
        let height = rect.height as f64;
        let quad = vec![
            a * x + c * y + tx,
            b * x + d * y + ty,
            a * (x + width) + c * y + tx,
            b * (x + width) + d * y + ty,
            a * (x + width) + c * (y + height) + tx,
            b * (x + width) + d * (y + height) + ty,
            a * x + c * (y + height) + tx,
            b * x + d * (y + height) + ty,
        ];
        set_rectangle_to_contours_bounds(&mut out.rect, &[quad.clone()]);
        out.contours = Some(vec![quad]);
        out.winding = PathWinding::NonZero;
    }
    out.version = out.version.wrapping_add(1);
}

// flight-lint: allow(conform-params) D5: caller-owned state replaces the hidden use guard and pool
pub fn union_clip_regions(
    state: &ClipRegionState,
    out: &Ref<ClipRegion>,
    a: &Ref<ClipRegion>,
    b: &Ref<ClipRegion>,
) {
    guard_clip_region_use(state, out);
    guard_clip_region_use(state, a);
    guard_clip_region_use(state, b);
    let (a_rect, a_contours, a_winding) = snapshot_clip_region(a);
    let (b_rect, b_contours, b_winding) = snapshot_clip_region(b);
    let mut out = out.write().unwrap();
    merge_rectangle(&mut out.rect, &a_rect, &b_rect);
    let (contours, winding) = select_contours(a_contours, a_winding, b_contours, b_winding);
    out.contours = contours;
    out.winding = winding;
    out.version = out.version.wrapping_add(1);
}
