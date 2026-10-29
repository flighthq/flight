//! flight-compiler: nullable-options

use std::sync::{Arc, RwLock};

use crate::clip_region_runtime::{
    acquire_clip_region_from_pool, get_clip_region_contours_guard, is_clip_region_released,
    release_clip_region_to_pool, set_clip_region_contours_guard_slot,
    set_clip_region_release_guard_slot, set_clip_region_use_guard_slot,
    snapshot_clip_region_release_guard, snapshot_clip_region_use_guard,
};
use crate::types::*;
use flight_entity::{EntityConstruction, Ref, allocate_entity};
use flight_geometry::{
    MatrixLike, Rectangle, RectangleLike, clone_rectangle, contains_rectangle_point_xy,
    copy_rectangle, create_rectangle, encloses_rectangle, intersects_rectangle, is_empty_rectangle,
    matrix_transform_rectangle, merge_rectangle,
};

// flight-lint: allow(f64) normalization compares f64 Path.data coordinates at the source epsilon
const NORMALIZE_EPSILON: f64 = 1e-6;

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
pub fn create_clip_region_from_contours(
    contours: &[Vec<f64>],
    winding: PathWinding,
) -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    initialize_clip_region_from_contours(&mut out, contours, winding);
    return Arc::new(RwLock::new(out));
}

pub fn create_clip_region_from_rectangle(rectangle: &RectangleLike) -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    initialize_clip_region_from_rectangle(&mut out, rectangle);
    return Arc::new(RwLock::new(out));
}

fn call_clip_region_contours_guard(
    explanation: Option<ClipRegionContoursExplanation>,
    guard: Option<ClipRegionContoursGuard>,
    contours: &[Vec<f64>],
) {
    let Some(issue) = explanation else {
        return;
    };
    let Some(installed_guard) = guard else {
        return;
    };
    installed_guard(&issue, contours);
}

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
pub fn initialize_clip_region_from_contours(
    out: &mut ClipRegion,
    contours: &[Vec<f64>],
    winding: PathWinding,
) {
    let explanation = explain_clip_region_contours(contours);
    let guard = get_clip_region_contours_guard();
    call_clip_region_contours_guard(explanation, guard, contours);
    out.rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
    set_rectangle_to_contours_bounds(&mut out.rect, contours);
    out.contours = Some(copy_clip_region_contours(contours));
    out.version = 0;
    out.winding = winding;
}

pub fn initialize_clip_region_from_rectangle(out: &mut ClipRegion, rectangle: &RectangleLike) {
    out.rect = clone_rectangle(rectangle);
    out.contours = None;
    out.version = 0;
    out.winding = PathWinding::NonZero;
}

pub fn acquire_clip_region() -> Ref<ClipRegion> {
    let region = acquire_clip_region_from_pool();
    if let Some(pooled_region) = region {
        reset_clip_region(&pooled_region);
        return pooled_region;
    }
    return create_empty_clip_region();
}

fn create_empty_clip_region() -> Ref<ClipRegion> {
    let mut out: ClipRegion = allocate_entity();
    out.rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
    out.contours = None;
    out.winding = PathWinding::NonZero;
    out.version = 0;
    return Arc::new(RwLock::new(out));
}

fn reset_clip_region(region: &Ref<ClipRegion>) {
    let mut region = region.write().unwrap();
    let mutable_region: &mut EntityConstruction<ClipRegion> = &mut region;
    mutable_region.rect.x = 0.0;
    mutable_region.rect.y = 0.0;
    mutable_region.rect.width = 0.0;
    mutable_region.rect.height = 0.0;
    mutable_region.contours = None;
    mutable_region.winding = PathWinding::NonZero;
    mutable_region.version = 0;
}

pub fn clip_region_contains_clip_region(a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(a);
    guard_clip_region_use(b);
    let a_rect = a.read().unwrap().rect.clone();
    let b_rect = b.read().unwrap().rect.clone();
    return encloses_rectangle(&a_rect, &b_rect);
}

// flight-lint: allow(f64) point queries compare against f64 contour coordinates from Path.data
pub fn clip_region_contains_point(clip: &Ref<ClipRegion>, x: f64, y: f64) -> bool {
    guard_clip_region_use(clip);
    let clip = clip.read().unwrap();
    if !contains_rectangle_point_xy(&clip.rect, x as f32, y as f32) {
        return false;
    }
    if let Some(contours) = clip.contours.as_ref() {
        return point_in_contours(contours, clip.winding, x, y);
    }
    return true;
}

pub fn clip_region_contains_rectangle(clip: &Ref<ClipRegion>, rectangle: &RectangleLike) -> bool {
    guard_clip_region_use(clip);
    return encloses_rectangle(&clip.read().unwrap().rect, rectangle);
}

pub fn clip_region_intersects_clip_region(a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(a);
    guard_clip_region_use(b);
    let a_rect = a.read().unwrap().rect.clone();
    let b_rect = b.read().unwrap().rect.clone();
    return intersects_rectangle(&a_rect, &b_rect);
}

pub fn clip_region_intersects_rectangle(clip: &Ref<ClipRegion>, rectangle: &RectangleLike) -> bool {
    guard_clip_region_use(clip);
    return intersects_rectangle(&clip.read().unwrap().rect, rectangle);
}

pub fn clone_clip_region(clip: &Ref<ClipRegion>) -> Ref<ClipRegion> {
    guard_clip_region_use(clip);
    let clip = clip.read().unwrap();
    let mut out: ClipRegion = allocate_entity();
    out.rect = clone_rectangle(&clip.rect);
    out.contours = clone_clip_region_contours(&clip.contours);
    out.winding = clip.winding;
    out.version = clip.version;
    return Arc::new(RwLock::new(out));
}

pub fn copy_clip_region(out: &Ref<ClipRegion>, source: &Ref<ClipRegion>) {
    guard_clip_region_use(out);
    guard_clip_region_use(source);
    if Arc::ptr_eq(out, source) {
        return;
    }
    let (rect, contours, winding) = snapshot_clip_region(source);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    copy_rectangle(&mut mutable_out.rect, &rect);
    mutable_out.contours = contours;
    mutable_out.winding = winding;
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

pub fn equals_clip_region(a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(a);
    guard_clip_region_use(b);
    if Arc::ptr_eq(a, b) {
        return true;
    }
    let a = a.read().unwrap();
    let b = b.read().unwrap();
    return a.winding == b.winding
        && equal_clip_region_rectangles(&a.rect, &b.rect)
        && equal_clip_region_contours(&a.contours, &b.contours);
}

// flight-lint: allow(f64) clip contours preserve exact Path.data coordinates
fn clone_clip_region_contours(contours: &Option<Vec<Vec<f64>>>) -> Option<Vec<Vec<f64>>> {
    if let Some(source_contours) = contours.as_ref() {
        return Some(copy_clip_region_contours(source_contours));
    }
    return None;
}

// flight-lint: allow(f64) clip contours preserve exact Path.data coordinates
fn copy_clip_region_contours(contours: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let mut out: Vec<Vec<f64>> = Vec::new();
    for contour in contours {
        out.push(contour.to_vec());
    }
    return out;
}

// flight-lint: allow(f64) clip contours compare exact Path.data coordinates
fn equal_clip_region_contours(a: &Option<Vec<Vec<f64>>>, b: &Option<Vec<Vec<f64>>>) -> bool {
    if let Some(a_values) = a.as_ref() {
        let Some(b_values) = b.as_ref() else {
            return false;
        };
        if a_values.len() != b_values.len() {
            return false;
        }
        for contour_index in 0..a_values.len() {
            let a_contour = &a_values[contour_index];
            let b_contour = &b_values[contour_index];
            if a_contour.len() != b_contour.len() {
                return false;
            }
            for coordinate_index in 0..a_contour.len() {
                if a_contour[coordinate_index] != b_contour[coordinate_index] {
                    return false;
                }
            }
        }
        return true;
    }
    return b.is_none();
}

fn equal_clip_region_rectangles(a: &Rectangle, b: &Rectangle) -> bool {
    return a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height;
}

pub fn explain_clip_region(clip: &Ref<ClipRegion>) -> ClipRegionExplanation {
    let conservative = clip.read().unwrap().contours.is_some();
    let released = is_clip_region_released(clip);
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
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
pub fn explain_clip_region_contours(
    contours: &[Vec<f64>],
) -> Option<ClipRegionContoursExplanation> {
    for contour_index in 0..contours.len() {
        let contour = &contours[contour_index];
        let coordinate_count = contour.len();
        if coordinate_count & 1 != 0 {
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

pub fn get_clip_region_bounds(out: &mut RectangleLike, clip: &Ref<ClipRegion>) {
    guard_clip_region_use(clip);
    copy_rectangle(out, &clip.read().unwrap().rect);
}

fn guard_clip_region_use(clip: &Ref<ClipRegion>) {
    let (guard, released) = snapshot_clip_region_use_guard(clip);
    let Some(installed_guard) = guard else {
        return;
    };
    if released {
        installed_guard(clip);
    }
}

pub fn intersect_clip_regions(out: &Ref<ClipRegion>, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
    guard_clip_region_use(out);
    guard_clip_region_use(a);
    guard_clip_region_use(b);
    let (a_rect, a_contours, a_winding) = snapshot_clip_region(a);
    let (b_rect, b_contours, b_winding) = snapshot_clip_region(b);
    let x0 = a_rect.x.max(b_rect.x);
    let y0 = a_rect.y.max(b_rect.y);
    let x1 = (a_rect.x + a_rect.width).min(b_rect.x + b_rect.width);
    let y1 = (a_rect.y + a_rect.height).min(b_rect.y + b_rect.height);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    if x1 <= x0 || y1 <= y0 {
        mutable_out.rect.x = 0.0;
        mutable_out.rect.y = 0.0;
        mutable_out.rect.width = 0.0;
        mutable_out.rect.height = 0.0;
        mutable_out.contours = None;
        mutable_out.winding = PathWinding::NonZero;
        mutable_out.version = mutable_out.version.wrapping_add(1);
        return;
    }
    mutable_out.rect.x = x0;
    mutable_out.rect.y = y0;
    mutable_out.rect.width = x1 - x0;
    mutable_out.rect.height = y1 - y0;
    let (contours, winding) = select_contours(a_contours, a_winding, b_contours, b_winding);
    mutable_out.contours = contours;
    mutable_out.winding = winding;
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

pub fn invalidate_clip_region(clip: &Ref<ClipRegion>) {
    guard_clip_region_use(clip);
    let mut clip = clip.write().unwrap();
    let mutable_clip: &mut EntityConstruction<ClipRegion> = &mut clip;
    mutable_clip.version = mutable_clip.version.wrapping_add(1);
}

pub fn is_clip_region_empty(clip: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(clip);
    let clip = clip.read().unwrap();
    if is_empty_rectangle(&clip.rect) {
        return true;
    }
    if let Some(contours) = clip.contours.as_ref() {
        return contours.is_empty();
    }
    return false;
}

pub fn is_clip_region_rectangular(clip: &Ref<ClipRegion>) -> bool {
    guard_clip_region_use(clip);
    return clip.read().unwrap().contours.is_none();
}

// flight-lint: allow(f64) normalization compares the original f64 Path.data contour coordinates
#[allow(clippy::question_mark)] // explicit Option control flow remains portable to generated TypeScript
fn normalized_clip_region_bounds(contours: &Option<Vec<Vec<f64>>>) -> Option<Vec<f64>> {
    let Some(source_contours) = contours.as_ref() else {
        return None;
    };
    if source_contours.len() != 1 || source_contours[0].len() != 8 {
        return None;
    }
    let contour = &source_contours[0];
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut index = 0;
    while index < contour.len() {
        min_x = min_x.min(contour[index]);
        min_y = min_y.min(contour[index + 1]);
        max_x = max_x.max(contour[index]);
        max_y = max_y.max(contour[index + 1]);
        index += 2;
    }
    let mut axis_aligned = true;
    index = 0;
    while index < contour.len() {
        let x = contour[index];
        let y = contour[index + 1];
        if !(((x - min_x).abs() <= NORMALIZE_EPSILON || (x - max_x).abs() <= NORMALIZE_EPSILON)
            && ((y - min_y).abs() <= NORMALIZE_EPSILON || (y - max_y).abs() <= NORMALIZE_EPSILON))
        {
            axis_aligned = false;
        }
        index += 2;
    }
    if axis_aligned {
        return Some(vec![min_x, min_y, max_x, max_y]);
    }
    return None;
}

// flight-lint: allow(f64) normalization compares the original f64 Path.data contour coordinates
pub fn normalize_clip_region(out: &Ref<ClipRegion>, clip: &Ref<ClipRegion>) {
    guard_clip_region_use(out);
    guard_clip_region_use(clip);
    let (rect, contours, winding) = snapshot_clip_region(clip);
    let normalized = normalized_clip_region_bounds(&contours);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    if let Some(bounds) = normalized {
        mutable_out.rect.x = bounds[0] as f32;
        mutable_out.rect.y = bounds[1] as f32;
        mutable_out.rect.width = (bounds[2] - bounds[0]) as f32;
        mutable_out.rect.height = (bounds[3] - bounds[1]) as f32;
        mutable_out.contours = None;
        mutable_out.winding = PathWinding::NonZero;
    } else {
        copy_rectangle(&mut mutable_out.rect, &rect);
        mutable_out.contours = contours;
        mutable_out.winding = winding;
    }
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

// flight-lint: allow(f64) winding ray casts operate on exact f64 Path.data contour coordinates
fn point_in_contours(contours: &[Vec<f64>], winding: PathWinding, px: f64, py: f64) -> bool {
    let mut winding_number = 0_i32;
    for contour in contours {
        let count = contour.len();
        if count < 6 || count % 2 != 0 {
            continue;
        }
        let mut index = 0;
        while index < count {
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
            index += 2;
        }
    }
    if winding == PathWinding::EvenOdd {
        return winding_number & 1 != 0;
    }
    return winding_number != 0;
}

pub fn release_clip_region(clip: &Ref<ClipRegion>) {
    let (guard, released) = snapshot_clip_region_release_guard(clip);
    if !released {
        release_clip_region_to_pool(clip);
        return;
    }
    if let Some(installed_guard) = guard {
        installed_guard(clip);
    }
    release_clip_region_to_pool(clip);
}

// flight-lint: allow(f64) selection preserves exact f64 Path.data contour arrays
fn select_contours(
    a_contours: Option<Vec<Vec<f64>>>,
    a_winding: PathWinding,
    b_contours: Option<Vec<Vec<f64>>>,
    b_winding: PathWinding,
) -> (Option<Vec<Vec<f64>>>, PathWinding) {
    if let Some(a_values) = a_contours {
        if let Some(b_values) = b_contours {
            if a_values.len() >= b_values.len() {
                return (Some(a_values), a_winding);
            }
            return (Some(b_values), b_winding);
        }
        return (Some(a_values), a_winding);
    }
    if let Some(b_values) = b_contours {
        return (Some(b_values), b_winding);
    }
    return (None, PathWinding::NonZero);
}

pub fn set_clip_region_contours_guard(guard: Option<ClipRegionContoursGuard>) {
    set_clip_region_contours_guard_slot(guard);
}

pub fn set_clip_region_release_guard(guard: Option<ClipRegionReleaseGuard>) {
    set_clip_region_release_guard_slot(guard);
}

// flight-lint: allow(f64) clip contours preserve the source Path.data coordinate precision
pub fn set_clip_region_to_contours(
    out: &Ref<ClipRegion>,
    contours: &[Vec<f64>],
    winding: PathWinding,
) {
    guard_clip_region_use(out);
    let explanation = explain_clip_region_contours(contours);
    let guard = get_clip_region_contours_guard();
    call_clip_region_contours_guard(explanation, guard, contours);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    set_rectangle_to_contours_bounds(&mut mutable_out.rect, contours);
    mutable_out.contours = Some(copy_clip_region_contours(contours));
    mutable_out.winding = winding;
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

pub fn set_clip_region_to_rectangle(out: &Ref<ClipRegion>, rectangle: &RectangleLike) {
    guard_clip_region_use(out);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    mutable_out.rect = clone_rectangle(rectangle);
    mutable_out.contours = None;
    mutable_out.winding = PathWinding::NonZero;
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

pub fn set_clip_region_use_guard(guard: Option<ClipRegionUseGuard>) {
    set_clip_region_use_guard_slot(guard);
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
        let mut index = 0;
        while index < contour.len() {
            min_x = min_x.min(contour[index]);
            min_y = min_y.min(contour[index + 1]);
            max_x = max_x.max(contour[index]);
            max_y = max_y.max(contour[index + 1]);
            index += 2;
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
    return (
        clone_rectangle(&clip.rect),
        clone_clip_region_contours(&clip.contours),
        clip.winding,
    );
}

// flight-lint: allow(f64) affine transforms operate on exact f64 Path.data contour coordinates
pub fn transform_clip_region(out: &Ref<ClipRegion>, clip: &Ref<ClipRegion>, matrix: &MatrixLike) {
    guard_clip_region_use(out);
    guard_clip_region_use(clip);
    let (rect, contours, winding) = snapshot_clip_region(clip);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    if let Some(source_contours) = contours {
        let a = matrix.a as f64;
        let b = matrix.b as f64;
        let c = matrix.c as f64;
        let d = matrix.d as f64;
        let tx = matrix.tx as f64;
        let ty = matrix.ty as f64;
        let mut transformed: Vec<Vec<f64>> = Vec::new();
        for contour in source_contours {
            let mut transformed_contour: Vec<f64> = Vec::new();
            let mut index = 0;
            while index < contour.len() {
                let x = contour[index];
                let y = contour[index + 1];
                transformed_contour.push(a * x + c * y + tx);
                transformed_contour.push(b * x + d * y + ty);
                index += 2;
            }
            transformed.push(transformed_contour);
        }
        set_rectangle_to_contours_bounds(&mut mutable_out.rect, &transformed);
        mutable_out.contours = Some(transformed);
        mutable_out.winding = winding;
    } else if matrix.b == 0.0 && matrix.c == 0.0 {
        matrix_transform_rectangle(&mut mutable_out.rect, matrix, &rect);
        mutable_out.contours = None;
        mutable_out.winding = PathWinding::NonZero;
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
        let contours = vec![quad];
        set_rectangle_to_contours_bounds(&mut mutable_out.rect, &contours);
        mutable_out.contours = Some(contours);
        mutable_out.winding = PathWinding::NonZero;
    }
    mutable_out.version = mutable_out.version.wrapping_add(1);
}

pub fn union_clip_regions(out: &Ref<ClipRegion>, a: &Ref<ClipRegion>, b: &Ref<ClipRegion>) {
    guard_clip_region_use(out);
    guard_clip_region_use(a);
    guard_clip_region_use(b);
    let (a_rect, a_contours, a_winding) = snapshot_clip_region(a);
    let (b_rect, b_contours, b_winding) = snapshot_clip_region(b);
    let mut out = out.write().unwrap();
    let mutable_out: &mut EntityConstruction<ClipRegion> = &mut out;
    merge_rectangle(&mut mutable_out.rect, &a_rect, &b_rect);
    let (contours, winding) = select_contours(a_contours, a_winding, b_contours, b_winding);
    mutable_out.contours = contours;
    mutable_out.winding = winding;
    mutable_out.version = mutable_out.version.wrapping_add(1);
}
