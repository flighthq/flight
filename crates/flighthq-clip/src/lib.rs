//! `flighthq-clip` — hard geometric clip built from rectangles or paths.
//!
//! A [`ClipRegion`] is one of two forms:
//!
//! - **Rectangle** (`contours == None`): axis-aligned scissor or stencil quad.
//! - **Path** (`contours == Some(_)`): arbitrary fill geometry realized by
//!   stencil-then-cover; the path is flattened to straight-line contours at
//!   construction time and cached on the region.
//!
//! Backends compare `version` to detect geometry changes; call
//! [`invalidate_clip_region`] after mutating `rect` or `contours` directly.

pub use flighthq_types::{
    ClipRegion, MatrixLike, Path, PathWinding, Rectangle, RectangleLike, path_command,
};

use flighthq_geometry::{
    clone_rectangle, contains_rectangle_point_xy, copy_rectangle, encloses_rectangle,
    intersects_rectangle, is_empty_rectangle, matrix_transform_rectangle, merge_rectangle,
};
// The path flattener is shared with the rest of the SDK — reuse
// `flighthq-path`'s `flatten_path` rather than carrying a duplicate (matches TS
// `clip`, which imports `flattenPath` from `@flighthq/path`).
use flighthq_path::{
    append_path_cubic_curve_to, append_path_line_to, append_path_move_to, create_path, flatten_path,
};
use std::cell::RefCell;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a `ClipRegion` from the pool (as an empty rectangular region at the origin).
///
/// Every `acquire_clip_region` must have a matching [`release_clip_region`] —
/// treat them as paired brackets. Callers should initialize the acquired region
/// immediately before use.
pub fn acquire_clip_region() -> ClipRegion {
    let pooled = CLIP_REGION_POOL.with(|pool| pool.borrow_mut().pop());
    match pooled {
        Some(mut region) => {
            region.rect.x = 0.0;
            region.rect.y = 0.0;
            region.rect.width = 0.0;
            region.rect.height = 0.0;
            region.contours = None;
            region.winding = PathWinding::NonZero;
            region.version = 0;
            region
        }
        None => make_empty_clip_region(),
    }
}

/// Returns true if a point `(x, y)` lies within the clip region (in clip-local space).
///
/// For the rectangle form uses the rectangle bounds; for the contour form applies
/// the exact winding rule (even-odd or non-zero point-in-polygon).
pub fn clip_region_contains_point(clip: &ClipRegion, x: f32, y: f32) -> bool {
    let rect_like = rectangle_like(&clip.rect);
    if !contains_rectangle_point_xy(&rect_like, x, y) {
        return false;
    }
    match &clip.contours {
        None => true,
        Some(contours) => point_in_contours(contours, clip.winding, x, y),
    }
}

/// Returns true when the clip region fully contains the given rectangle.
///
/// Rectangle form: exact containment; contour form: bounding-box approximation
/// (conservative).
pub fn clip_region_contains_rectangle(clip: &ClipRegion, rectangle: &RectangleLike) -> bool {
    let rect_like = rectangle_like(&clip.rect);
    encloses_rectangle(&rect_like, rectangle)
}

/// Returns true when the given rectangle overlaps the clip region.
///
/// Rectangle form uses exact rect-vs-rect check; contour form falls back to
/// bounding box (conservative).
pub fn clip_region_intersects_rectangle(clip: &ClipRegion, rectangle: &RectangleLike) -> bool {
    let rect_like = rectangle_like(&clip.rect);
    intersects_rectangle(&rect_like, rectangle)
}

/// Structural equality check. Does not use the version counter — compares
/// geometry directly. Useful for cache reuse independent of manual invalidation.
/// Contour comparison is exact (point-by-point).
pub fn clip_regions_equal(a: &ClipRegion, b: &ClipRegion) -> bool {
    if std::ptr::eq(a, b) {
        return true;
    }
    if a.winding != b.winding {
        return false;
    }
    let ar = &a.rect;
    let br = &b.rect;
    if ar.x != br.x || ar.y != br.y || ar.width != br.width || ar.height != br.height {
        return false;
    }
    match (&a.contours, &b.contours) {
        (None, None) => true,
        (None, Some(_)) | (Some(_), None) => false,
        (Some(ac), Some(bc)) => {
            if ac.len() != bc.len() {
                return false;
            }
            for (ai, bi) in ac.iter().zip(bc.iter()) {
                if ai.len() != bi.len() {
                    return false;
                }
                for (av, bv) in ai.iter().zip(bi.iter()) {
                    if av != bv {
                        return false;
                    }
                }
            }
            true
        }
    }
}

/// Deep copy of a clip region (rect, contours arrays, winding).
///
/// Version is preserved from the source so the caller can still detect change;
/// call [`invalidate_clip_region`] after mutation.
pub fn clone_clip_region(clip: &ClipRegion) -> ClipRegion {
    ClipRegion {
        contours: clip.contours.clone(),
        rect: clip.rect,
        version: clip.version,
        winding: clip.winding,
    }
}

/// Copies `source` into `out` in place; does nothing when `out` is `source`.
///
/// Bumps `out.version` (treats a retargeted region as changed so backends
/// re-derive state). Safe when `out` aliases `source`.
pub fn copy_clip_region(out: &mut ClipRegion, source: &ClipRegion) {
    if std::ptr::eq(out, source) {
        return;
    }
    copy_rectangle_into(&mut out.rect, &rectangle_like(&source.rect));
    out.contours = source.contours.clone();
    out.winding = source.winding;
    out.version = out.version.wrapping_add(1);
}

/// Builds a clip region from a circle.
///
/// Internally approximates via cubic Bézier curves and flattens.
pub fn create_clip_region_from_circle(x: f32, y: f32, radius: f32, tolerance: f32) -> ClipRegion {
    let mut path = create_path(PathWinding::NonZero);
    append_circle_to_path(&mut path, x, y, radius);
    create_clip_region_from_path(&path, tolerance)
}

/// Builds a clip region from raw flattened contours (x,y pairs per sub-path) and
/// a winding rule.
///
/// The caller is responsible for providing valid, closed contours. The bounding
/// rect is computed from the contour data; pass an empty list for an empty region.
pub fn create_clip_region_from_contours(
    contours: Vec<Vec<f32>>,
    winding: PathWinding,
) -> ClipRegion {
    let rect = compute_contours_bounds(&contours);
    ClipRegion {
        contours: Some(contours),
        rect,
        version: 0,
        winding,
    }
}

/// Builds a clip region from an axis-aligned ellipse bounded by the given rectangle.
///
/// Uses cubic Bézier approximation (kappa constant) and flattens via path.
pub fn create_clip_region_from_ellipse(rectangle: &RectangleLike, tolerance: f32) -> ClipRegion {
    let mut path = create_path(PathWinding::NonZero);
    append_ellipse_to_path(
        &mut path,
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
    );
    create_clip_region_from_path(&path, tolerance)
}

/// Builds a clip region from arbitrary path geometry.
///
/// The path is flattened to straight-line contours (flat x, y pairs) using
/// adaptive Bézier subdivision within `tolerance` path units. The region's
/// `rect` is set to the bounding box of all contours, for culling and the
/// stencil cover quad. The path's winding rule is carried onto the region.
///
/// Realized by stencil-then-cover, so it handles concavity, holes, and
/// self-intersection per the path's own winding rule.
pub fn create_clip_region_from_path(path: &Path, tolerance: f32) -> ClipRegion {
    let contours = flatten_path(path, tolerance);
    let rect = compute_contours_bounds(&contours);
    ClipRegion {
        contours: Some(contours),
        rect,
        version: 0,
        winding: path.winding,
    }
}

/// Builds a rectangular clip region — the allocation-light, scissor-eligible form.
///
/// The rectangle is copied so later edits to the caller's rectangle do not
/// mutate the region. Call [`invalidate_clip_region`] after changing `rect`
/// directly.
pub fn create_clip_region_from_rectangle(rectangle: &RectangleLike) -> ClipRegion {
    ClipRegion {
        contours: None,
        rect: clone_rectangle(rectangle),
        version: 0,
        winding: PathWinding::NonZero,
    }
}

/// Builds a clip region from a rounded rectangle with a uniform corner radius.
///
/// Falls back to a plain rect clip when `radius <= 0`.
pub fn create_clip_region_from_rounded_rectangle(
    rectangle: &RectangleLike,
    radius: f32,
    tolerance: f32,
) -> ClipRegion {
    if radius <= 0.0 {
        return create_clip_region_from_rectangle(rectangle);
    }
    let mut path = create_path(PathWinding::NonZero);
    append_rounded_rect_to_path(
        &mut path,
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
        radius,
    );
    create_clip_region_from_path(&path, tolerance)
}

/// Writes the bounding rect of a clip region into `out`.
pub fn get_clip_region_bounds(out: &mut RectangleLike, clip: &ClipRegion) {
    let r = &clip.rect;
    out.x = r.x;
    out.y = r.y;
    out.width = r.width;
    out.height = r.height;
}

/// Writes the intersection of two clip regions into `out` (alias-safe: `out` may
/// be `a` or `b`).
///
/// Rectangle ∩ Rectangle: exact scissor-eligible intersection. All mixed or
/// contour forms: bounding-box intersection (conservative — the renderer's
/// stencil covers any finer geometry). Bumps `out.version`.
pub fn intersect_clip_regions(out: &mut ClipRegion, a: &ClipRegion, b: &ClipRegion) {
    // Read all input values into locals first (alias-safe for out === a or out === b).
    let ax = a.rect.x;
    let ay = a.rect.y;
    let aw = a.rect.width;
    let ah = a.rect.height;
    let bx = b.rect.x;
    let by = b.rect.y;
    let bw = b.rect.width;
    let bh = b.rect.height;
    let a_contours = a.contours.clone();
    let b_contours = b.contours.clone();
    let a_winding = a.winding;
    let b_winding = b.winding;

    let x0 = ax.max(bx);
    let y0 = ay.max(by);
    let x1 = (ax + aw).min(bx + bw);
    let y1 = (ay + ah).min(by + bh);

    if x1 <= x0 || y1 <= y0 {
        // Disjoint: result is empty.
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

    match (a_contours, b_contours) {
        (None, None) => {
            // Both rectangular: result is scissor-eligible.
            out.contours = None;
            out.winding = PathWinding::NonZero;
        }
        (Some(ac), None) => {
            // Contours ∩ rect: keep contours, clipped bounds computed above.
            out.contours = Some(ac);
            out.winding = a_winding;
        }
        (None, Some(bc)) => {
            out.contours = Some(bc);
            out.winding = b_winding;
        }
        (Some(ac), Some(bc)) => {
            // Both contours: conservative — keep the finer of the two (larger
            // number of contours) and use its winding. The renderer's
            // stencil-then-cover handles the true intersection.
            let keep_a = ac.len() >= bc.len();
            if keep_a {
                out.contours = Some(ac);
                out.winding = a_winding;
            } else {
                out.contours = Some(bc);
                out.winding = b_winding;
            }
        }
    }

    out.version = out.version.wrapping_add(1);
}

/// Marks the region's geometry changed so backends re-derive cached state.
///
/// Call after mutating `rect` or `contours` directly. Mirrors
/// `invalidate_image_resource`.
pub fn invalidate_clip_region(clip: &mut ClipRegion) {
    clip.version = clip.version.wrapping_add(1);
}

/// Returns true if no area passes through the clip — either the bounding rect is
/// empty or the contour list exists but has no entries.
pub fn is_clip_region_empty(clip: &ClipRegion) -> bool {
    let rect_like = rectangle_like(&clip.rect);
    if is_empty_rectangle(&rect_like) {
        return true;
    }
    if let Some(contours) = &clip.contours
        && contours.is_empty()
    {
        return true;
    }
    false
}

/// Returns true when the clip is in the scissor-eligible rectangle form
/// (`contours == None`).
pub fn is_clip_region_rectangular(clip: &ClipRegion) -> bool {
    clip.contours.is_none()
}

/// Canonicalizes a contour region back to the scissor-eligible rect form when the
/// contour set is exactly (within `NORMALIZE_EPSILON`) an axis-aligned rectangle.
///
/// This lightweight check works only on single-contour, 4-point (8 coordinate)
/// contours — it does not require a full polygon-clipping kernel. When the contour
/// is detected as a rectangular axis-aligned quad, the rect form is restored so
/// downstream backends use the cheaper scissor path instead of stencil-then-cover.
/// Otherwise `out` receives a copy of `clip` unchanged. Bumps `out.version` in all
/// cases. Already-rectangular clips (`contours == None`) are copied through without
/// modification. Safe when `out` aliases `clip`.
pub fn normalize_clip_region(out: &mut ClipRegion, clip: &ClipRegion) {
    let in_contours = clip.contours.clone();
    let in_rect = clip.rect;
    let in_winding = clip.winding;

    let contours = match in_contours {
        None => {
            // Already rect form: copy straight through.
            copy_rectangle_into(&mut out.rect, &rectangle_like(&in_rect));
            out.contours = None;
            out.winding = in_winding;
            out.version = out.version.wrapping_add(1);
            return;
        }
        Some(c) => c,
    };

    // Only attempt rect detection for a single contour with exactly 4 points (8 xy values).
    if contours.len() == 1 && contours[0].len() == 8 {
        let c = &contours[0];
        let e = NORMALIZE_EPSILON;
        // Compute bounding box of the 4 points.
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut i = 0;
        while i < 8 {
            let cx = c[i];
            let cy = c[i + 1];
            if cx < min_x {
                min_x = cx;
            }
            if cx > max_x {
                max_x = cx;
            }
            if cy < min_y {
                min_y = cy;
            }
            if cy > max_y {
                max_y = cy;
            }
            i += 2;
        }
        // Each point must sit at a corner of the bounding box.
        let mut is_axis_aligned = true;
        let mut i = 0;
        while i < 8 {
            let cx = c[i];
            let cy = c[i + 1];
            if !((cx - min_x).abs() <= e || (cx - max_x).abs() <= e) {
                is_axis_aligned = false;
                break;
            }
            if !((cy - min_y).abs() <= e || (cy - max_y).abs() <= e) {
                is_axis_aligned = false;
                break;
            }
            i += 2;
        }
        if is_axis_aligned {
            out.rect.x = min_x;
            out.rect.y = min_y;
            out.rect.width = max_x - min_x;
            out.rect.height = max_y - min_y;
            out.contours = None;
            out.winding = PathWinding::NonZero;
            out.version = out.version.wrapping_add(1);
            return;
        }
    }

    // Contours are not a simple axis-aligned rectangle: copy through unchanged.
    copy_rectangle_into(&mut out.rect, &rectangle_like(&in_rect));
    out.contours = Some(contours);
    out.winding = in_winding;
    out.version = out.version.wrapping_add(1);
}

/// Returns a `ClipRegion` to the pool. After release the caller must not use the
/// region. Every [`acquire_clip_region`] must have a matching `release_clip_region`.
pub fn release_clip_region(clip: ClipRegion) {
    CLIP_REGION_POOL.with(|pool| pool.borrow_mut().push(clip));
}

/// Retargets an existing region to a rectangle form in place, avoiding per-frame
/// allocation in animated-clip scenarios. Bumps version.
pub fn set_clip_region_to_rectangle(out: &mut ClipRegion, rectangle: &RectangleLike) {
    copy_rectangle_into(&mut out.rect, rectangle);
    out.contours = None;
    out.winding = PathWinding::NonZero;
    out.version = out.version.wrapping_add(1);
}

/// Applies a 2D affine matrix to a clip region and writes the result into `out`
/// (alias-safe).
///
/// Rectangle form: when the matrix is axis-aligned (`b == 0 && c == 0`) the result
/// is scissor-eligible; otherwise, the rectangle is promoted to a 4-point contour
/// quad so the scissor-eligibility invariant is maintained (a rotated/skewed
/// rectangle is no longer axis-aligned). The bounding rect of the transformed
/// geometry is recomputed for culling. Bumps version.
pub fn transform_clip_region(out: &mut ClipRegion, clip: &ClipRegion, matrix: &MatrixLike) {
    let ma = matrix.a;
    let mb = matrix.b;
    let mc = matrix.c;
    let md = matrix.d;
    let mtx = matrix.tx;
    let mty = matrix.ty;

    let in_contours = clip.contours.clone();
    let in_rect = clip.rect;
    let in_winding = clip.winding;

    match in_contours {
        None => {
            let axis_aligned = mb == 0.0 && mc == 0.0;
            if axis_aligned {
                // Rectangle stays scissor-eligible: apply transform to the rect.
                let source_like = rectangle_like(&in_rect);
                let mut out_like = RectangleLike::default();
                matrix_transform_rectangle(&mut out_like, matrix, &source_like);
                out.rect.x = out_like.x;
                out.rect.y = out_like.y;
                out.rect.width = out_like.width;
                out.rect.height = out_like.height;
                out.contours = None;
                out.winding = PathWinding::NonZero;
            } else {
                // Rotation or skew: promote to 4-point quad contour.
                let rx = in_rect.x;
                let ry = in_rect.y;
                let rw = in_rect.width;
                let rh = in_rect.height;
                let tl_x = ma * rx + mc * ry + mtx;
                let tl_y = mb * rx + md * ry + mty;
                let tr_x = ma * (rx + rw) + mc * ry + mtx;
                let tr_y = mb * (rx + rw) + md * ry + mty;
                let br_x = ma * (rx + rw) + mc * (ry + rh) + mtx;
                let br_y = mb * (rx + rw) + md * (ry + rh) + mty;
                let bl_x = ma * rx + mc * (ry + rh) + mtx;
                let bl_y = mb * rx + md * (ry + rh) + mty;
                let quad = vec![tl_x, tl_y, tr_x, tr_y, br_x, br_y, bl_x, bl_y];
                let bounds = compute_contours_bounds(std::slice::from_ref(&quad));
                out.contours = Some(vec![quad]);
                out.winding = PathWinding::NonZero;
                out.rect = bounds;
            }
        }
        Some(contours) => {
            // Transform every contour point.
            let mut new_contours: Vec<Vec<f32>> = Vec::with_capacity(contours.len());
            for src in &contours {
                let mut dst: Vec<f32> = vec![0.0; src.len()];
                let mut i = 0;
                while i + 1 < src.len() {
                    let ox = src[i];
                    let oy = src[i + 1];
                    dst[i] = ma * ox + mc * oy + mtx;
                    dst[i + 1] = mb * ox + md * oy + mty;
                    i += 2;
                }
                new_contours.push(dst);
            }
            let bounds = compute_contours_bounds(&new_contours);
            out.contours = Some(new_contours);
            out.winding = in_winding;
            out.rect = bounds;
        }
    }

    out.version = out.version.wrapping_add(1);
}

/// Writes the bounding-box union of two clip regions into `out` (conservative for
/// contour forms).
///
/// Both rectangular: exact merge; any contour involved: union of their bounding
/// rects, contours from the input with more sub-paths (heuristic), same winding.
/// Bumps version. Safe when `out` aliases `a` or `b`.
pub fn union_clip_regions(out: &mut ClipRegion, a: &ClipRegion, b: &ClipRegion) {
    // Read inputs into locals (alias-safe).
    let a_rect = a.rect;
    let b_rect = b.rect;
    let a_contours = a.contours.clone();
    let b_contours = b.contours.clone();
    let a_winding = a.winding;
    let b_winding = b.winding;

    let a_like = rectangle_like(&a_rect);
    let b_like = rectangle_like(&b_rect);
    let mut merged = RectangleLike::default();
    merge_rectangle(&mut merged, &a_like, &b_like);
    out.rect.x = merged.x;
    out.rect.y = merged.y;
    out.rect.width = merged.width;
    out.rect.height = merged.height;

    match (a_contours, b_contours) {
        (None, None) => {
            out.contours = None;
            out.winding = PathWinding::NonZero;
        }
        (Some(ac), None) => {
            out.contours = Some(ac);
            out.winding = a_winding;
        }
        (None, Some(bc)) => {
            out.contours = Some(bc);
            out.winding = b_winding;
        }
        (Some(ac), Some(bc)) => {
            let keep_a = ac.len() >= bc.len();
            if keep_a {
                out.contours = Some(ac);
                out.winding = a_winding;
            } else {
                out.contours = Some(bc);
                out.winding = b_winding;
            }
        }
    }

    out.version = out.version.wrapping_add(1);
}

// ---------------------------------------------------------------------------
// Private helpers, constants, and pools
// ---------------------------------------------------------------------------

/// Tolerance used when comparing floats in [`normalize_clip_region`].
const NORMALIZE_EPSILON: f32 = 1e-6;

/// Kappa constant for circle/ellipse cubic Bézier approximation.
const KAPPA: f32 = 0.552_284_8;

thread_local! {
    static CLIP_REGION_POOL: RefCell<Vec<ClipRegion>> = const { RefCell::new(Vec::new()) };
}

fn make_empty_clip_region() -> ClipRegion {
    ClipRegion {
        contours: None,
        rect: Rectangle::default(),
        version: 0,
        winding: PathWinding::NonZero,
    }
}

/// Views a `Rectangle` as a `RectangleLike` so the geometry helpers (which operate
/// on `RectangleLike`) can read it without copying entity identity.
fn rectangle_like(rect: &Rectangle) -> RectangleLike {
    RectangleLike {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
    }
}

/// Copies a `RectangleLike` into a `Rectangle` in place.
fn copy_rectangle_into(out: &mut Rectangle, source: &RectangleLike) {
    let mut out_like = rectangle_like(out);
    copy_rectangle(&mut out_like, source);
    out.x = out_like.x;
    out.y = out_like.y;
    out.width = out_like.width;
    out.height = out_like.height;
}

/// Returns the bounding rectangle of all contour points.
///
/// Returns a zero rectangle when the contour list is empty.
fn compute_contours_bounds(contours: &[Vec<f32>]) -> Rectangle {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    for contour in contours {
        let mut i = 0;
        while i + 1 < contour.len() {
            let px = contour[i];
            let py = contour[i + 1];
            if px < min_x {
                min_x = px;
            }
            if px > max_x {
                max_x = px;
            }
            if py < min_y {
                min_y = py;
            }
            if py > max_y {
                max_y = py;
            }
            i += 2;
        }
    }

    if min_x > max_x {
        return Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
    }

    Rectangle {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

/// Returns true if `(px, py)` is inside the contours according to the winding rule.
///
/// Uses a horizontal ray-cast to count crossings. Handles both `NonZero` and
/// `EvenOdd`.
fn point_in_contours(contours: &[Vec<f32>], winding: PathWinding, px: f32, py: f32) -> bool {
    let mut winding_number: i32 = 0;
    for contour in contours {
        let n = contour.len();
        if n < 4 {
            continue;
        }
        let mut i = 0;
        while i < n {
            let x0 = contour[i];
            let y0 = contour[i + 1];
            let x1 = contour[(i + 2) % n];
            let y1 = contour[(i + 3) % n];
            if y0 <= py {
                if y1 > py {
                    // Upward crossing: is point to the left of the edge?
                    if (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0.0 {
                        winding_number += 1;
                    }
                }
            } else if y1 <= py {
                // Downward crossing: is point to the right of the edge?
                if (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0.0 {
                    winding_number -= 1;
                }
            }
            i += 2;
        }
    }
    if winding == PathWinding::EvenOdd {
        return (winding_number & 1) != 0;
    }
    winding_number != 0
}

fn append_circle_to_path(path: &mut Path, cx: f32, cy: f32, r: f32) {
    let k = r * KAPPA;
    append_path_move_to(path, cx, cy - r);
    append_path_cubic_curve_to(path, cx + k, cy - r, cx + r, cy - k, cx + r, cy);
    append_path_cubic_curve_to(path, cx + r, cy + k, cx + k, cy + r, cx, cy + r);
    append_path_cubic_curve_to(path, cx - k, cy + r, cx - r, cy + k, cx - r, cy);
    append_path_cubic_curve_to(path, cx - r, cy - k, cx - k, cy - r, cx, cy - r);
}

fn append_ellipse_to_path(path: &mut Path, x: f32, y: f32, w: f32, h: f32) {
    let cx = x + w / 2.0;
    let cy = y + h / 2.0;
    let rx = w / 2.0;
    let ry = h / 2.0;
    let kx = rx * KAPPA;
    let ky = ry * KAPPA;
    append_path_move_to(path, cx, cy - ry);
    append_path_cubic_curve_to(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
    append_path_cubic_curve_to(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    append_path_cubic_curve_to(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    append_path_cubic_curve_to(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
}

fn append_rounded_rect_to_path(path: &mut Path, x: f32, y: f32, w: f32, h: f32, r: f32) {
    let max_r = w.min(h) / 2.0;
    let cr = r.min(max_r);
    let k = cr * KAPPA;
    let x1 = x + cr;
    let x2 = x + w - cr;
    let y1 = y + cr;
    let y2 = y + h - cr;
    append_path_move_to(path, x1, y);
    append_path_line_to(path, x2, y);
    append_path_cubic_curve_to(path, x2 + k, y, x + w, y1 - k, x + w, y1);
    append_path_line_to(path, x + w, y2);
    append_path_cubic_curve_to(path, x + w, y2 + k, x2 + k, y + h, x2, y + h);
    append_path_line_to(path, x1, y + h);
    append_path_cubic_curve_to(path, x1 - k, y + h, x, y2 + k, x, y2);
    append_path_line_to(path, x, y1);
    append_path_cubic_curve_to(path, x, y1 - k, x1 - k, y, x1, y);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f32, y: f32, w: f32, h: f32) -> RectangleLike {
        RectangleLike {
            x,
            y,
            width: w,
            height: h,
        }
    }

    fn matrix(a: f32, b: f32, c: f32, d: f32, tx: f32, ty: f32) -> MatrixLike {
        MatrixLike { a, b, c, d, tx, ty }
    }

    // acquire_clip_region / release_clip_region

    #[test]
    fn acquire_clip_region_returns_empty_rectangular_region() {
        let clip = acquire_clip_region();
        assert!(clip.contours.is_none());
        assert_eq!(clip.rect.width, 0.0);
        assert_eq!(clip.rect.height, 0.0);
        assert_eq!(clip.winding, PathWinding::NonZero);
        assert_eq!(clip.version, 0);
        release_clip_region(clip);
    }

    #[test]
    fn acquire_clip_region_resets_state_on_reuse() {
        // Drain the pool first so this test is independent of other test ordering.
        while CLIP_REGION_POOL.with(|p| p.borrow_mut().pop()).is_some() {}

        let mut clip = acquire_clip_region();
        clip.rect.x = 99.0;
        clip.rect.width = 50.0;
        clip.contours = Some(vec![vec![1.0, 2.0, 3.0, 4.0]]);
        clip.version = 5;
        release_clip_region(clip);

        let reused = acquire_clip_region();
        assert_eq!(reused.rect.x, 0.0);
        assert_eq!(reused.rect.width, 0.0);
        assert!(reused.contours.is_none());
        assert_eq!(reused.version, 0);
        release_clip_region(reused);
    }

    // clip_region_contains_point

    #[test]
    fn clip_region_contains_point_inside_rect() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(clip_region_contains_point(&clip, 5.0, 5.0));
    }

    #[test]
    fn clip_region_contains_point_outside_rect() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(!clip_region_contains_point(&clip, 15.0, 5.0));
    }

    #[test]
    fn clip_region_contains_point_inside_triangle_contour() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 5.0, 10.0);
        let clip = create_clip_region_from_path(&path, 0.25);
        assert!(clip_region_contains_point(&clip, 5.0, 4.0));
    }

    #[test]
    fn clip_region_contains_point_outside_triangle_contour() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 5.0, 10.0);
        let clip = create_clip_region_from_path(&path, 0.25);
        assert!(!clip_region_contains_point(&clip, 0.0, 9.0));
    }

    // clip_region_contains_rectangle

    #[test]
    fn clip_region_contains_rectangle_fully_inside() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 100.0, 100.0));
        assert!(clip_region_contains_rectangle(
            &clip,
            &rect(10.0, 10.0, 20.0, 20.0)
        ));
    }

    #[test]
    fn clip_region_contains_rectangle_extends_outside() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(!clip_region_contains_rectangle(
            &clip,
            &rect(5.0, 5.0, 20.0, 20.0)
        ));
    }

    // clip_region_intersects_rectangle

    #[test]
    fn clip_region_intersects_rectangle_overlap() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(clip_region_intersects_rectangle(
            &clip,
            &rect(5.0, 5.0, 10.0, 10.0)
        ));
    }

    #[test]
    fn clip_region_intersects_rectangle_disjoint() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(!clip_region_intersects_rectangle(
            &clip,
            &rect(20.0, 20.0, 5.0, 5.0)
        ));
    }

    // clip_regions_equal

    #[test]
    fn clip_regions_equal_identical_rects() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(clip_regions_equal(&a, &b));
    }

    #[test]
    fn clip_regions_equal_differing_rects() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&rect(0.0, 0.0, 20.0, 10.0));
        assert!(!clip_regions_equal(&a, &b));
    }

    #[test]
    fn clip_regions_equal_identical_path_clips() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        let a = create_clip_region_from_path(&path, 1.0);
        let b = create_clip_region_from_path(&path, 1.0);
        assert!(clip_regions_equal(&a, &b));
    }

    #[test]
    fn clip_regions_equal_same_reference() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(clip_regions_equal(&a, &a));
    }

    #[test]
    fn clip_regions_equal_rect_vs_contours() {
        let rect_clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        let contour = create_clip_region_from_path(&path, 0.25);
        assert!(!clip_regions_equal(&rect_clip, &contour));
    }

    // clone_clip_region

    #[test]
    fn clone_clip_region_deep_copies_rect() {
        let original = create_clip_region_from_rectangle(&rect(5.0, 6.0, 20.0, 30.0));
        let clone = clone_clip_region(&original);
        assert_eq!(clone.rect.x, 5.0);
        assert_eq!(clone.rect.y, 6.0);
        assert_eq!(clone.rect.width, 20.0);
        assert_eq!(clone.rect.height, 30.0);
        assert!(clone.contours.is_none());
        assert_eq!(clone.winding, PathWinding::NonZero);
    }

    #[test]
    fn clone_clip_region_independent_contours_and_winding() {
        let mut path = create_path(PathWinding::EvenOdd);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        let original = create_clip_region_from_path(&path, 1.0);
        let mut clone = clone_clip_region(&original);
        assert_eq!(clone.winding, PathWinding::EvenOdd);
        // Mutating the clone's contours must not affect the original.
        if let Some(c) = clone.contours.as_mut() {
            c[0][0] = 999.0;
        }
        assert_ne!(original.contours.as_ref().unwrap()[0][0], 999.0);
    }

    // copy_clip_region

    #[test]
    fn copy_clip_region_overwrites_and_bumps_version() {
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        let src = create_clip_region_from_rectangle(&rect(5.0, 6.0, 20.0, 30.0));
        copy_clip_region(&mut out, &src);
        assert_eq!(out.rect.x, 5.0);
        assert_eq!(out.rect.y, 6.0);
        assert_eq!(out.rect.width, 20.0);
        assert_eq!(out.rect.height, 30.0);
        assert_eq!(out.version, 1);
    }

    #[test]
    fn copy_clip_region_no_op_when_aliased() {
        let mut clip = create_clip_region_from_rectangle(&rect(1.0, 2.0, 3.0, 4.0));
        let version_before = clip.version;
        // Alias-safe self copy: SAFETY-equivalent to TS copyClipRegion(clip, clip).
        let ptr: *const ClipRegion = &clip;
        copy_clip_region(&mut clip, unsafe { &*ptr });
        assert_eq!(clip.version, version_before);
        assert_eq!(clip.rect.x, 1.0);
    }

    // create_clip_region_from_circle

    #[test]
    fn create_clip_region_from_circle_bounds_approximate_circle() {
        let clip = create_clip_region_from_circle(50.0, 50.0, 20.0, 0.25);
        assert!(clip.contours.is_some());
        assert!((clip.rect.x - 30.0).abs() < 0.5);
        assert!((clip.rect.y - 30.0).abs() < 0.5);
        assert!((clip.rect.width - 40.0).abs() < 0.5);
        assert!((clip.rect.height - 40.0).abs() < 0.5);
    }

    // create_clip_region_from_contours

    #[test]
    fn create_clip_region_from_contours_stores_and_bounds() {
        let contours = vec![vec![0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
        let clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        assert!(clip.contours.is_some());
        assert_eq!(clip.rect.x, 0.0);
        assert_eq!(clip.rect.y, 0.0);
        assert_eq!(clip.rect.width, 10.0);
        assert_eq!(clip.rect.height, 10.0);
        assert_eq!(clip.winding, PathWinding::NonZero);
        assert_eq!(clip.version, 0);
    }

    #[test]
    fn create_clip_region_from_contours_empty_is_empty_region() {
        let clip = create_clip_region_from_contours(vec![], PathWinding::EvenOdd);
        assert!(is_clip_region_empty(&clip));
    }

    // create_clip_region_from_ellipse

    #[test]
    fn create_clip_region_from_ellipse_bounds_match_rectangle() {
        let clip = create_clip_region_from_ellipse(&rect(10.0, 20.0, 40.0, 30.0), 0.25);
        assert!(clip.contours.is_some());
        assert!((clip.rect.x - 10.0).abs() < 0.5);
        assert!((clip.rect.y - 20.0).abs() < 0.5);
        assert!((clip.rect.width - 40.0).abs() < 0.5);
        assert!((clip.rect.height - 30.0).abs() < 0.5);
    }

    // create_clip_region_from_path

    #[test]
    fn create_clip_region_from_path_bounds_by_extent() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        let clip = create_clip_region_from_path(&path, 0.25);
        assert!(clip.contours.is_some());
        assert_eq!(clip.rect.x, 0.0);
        assert_eq!(clip.rect.y, 0.0);
        assert_eq!(clip.rect.width, 10.0);
        assert_eq!(clip.rect.height, 10.0);
        assert_eq!(clip.version, 0);
    }

    #[test]
    fn create_clip_region_from_path_line_segment() {
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::LINE_TO],
            data: vec![0.0, 0.0, 4.0, 3.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        assert!(clip.contours.is_some());
        assert_eq!(clip.winding, PathWinding::NonZero);
        assert_eq!(clip.version, 0);
        assert_eq!(clip.rect.x, 0.0);
        assert_eq!(clip.rect.y, 0.0);
        assert_eq!(clip.rect.width, 4.0);
        assert_eq!(clip.rect.height, 3.0);
    }

    #[test]
    fn create_clip_region_from_path_even_odd_winding() {
        let path = Path {
            commands: vec![path_command::MOVE_TO],
            data: vec![1.0, 2.0],
            winding: PathWinding::EvenOdd,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        assert_eq!(clip.winding, PathWinding::EvenOdd);
    }

    #[test]
    fn create_clip_region_from_path_empty_path_zero_rect() {
        let path = Path {
            commands: vec![],
            data: vec![],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        assert_eq!(
            (clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height),
            (0.0, 0.0, 0.0, 0.0)
        );
        let contours = clip.contours.unwrap();
        assert!(contours.is_empty());
    }

    // create_clip_region_from_rectangle

    #[test]
    fn create_clip_region_from_rectangle_copies_rect() {
        let r = rect(5.0, 6.0, 20.0, 30.0);
        let clip = create_clip_region_from_rectangle(&r);
        assert!(clip.contours.is_none());
        assert_eq!(clip.rect.x, 5.0);
        assert_eq!(clip.rect.y, 6.0);
        assert_eq!(clip.rect.width, 20.0);
        assert_eq!(clip.rect.height, 30.0);
        assert_eq!(clip.version, 0);
    }

    #[test]
    fn create_clip_region_from_rectangle_independent_of_source() {
        let mut r = rect(1.0, 2.0, 3.0, 4.0);
        let clip = create_clip_region_from_rectangle(&r);
        r.x = 99.0;
        // The region's rect must not change when the caller mutates `r`.
        assert_eq!(r.x, 99.0);
        assert_eq!(clip.rect.x, 1.0);
    }

    // create_clip_region_from_rounded_rectangle

    #[test]
    fn create_clip_region_from_rounded_rectangle_positive_radius() {
        let clip =
            create_clip_region_from_rounded_rectangle(&rect(0.0, 0.0, 100.0, 60.0), 10.0, 0.25);
        assert!(clip.contours.is_some());
        assert!((clip.rect.x - 0.0).abs() < 0.5);
        assert!((clip.rect.y - 0.0).abs() < 0.5);
        assert!((clip.rect.width - 100.0).abs() < 0.5);
        assert!((clip.rect.height - 60.0).abs() < 0.5);
    }

    #[test]
    fn create_clip_region_from_rounded_rectangle_zero_radius_falls_back_to_rect() {
        let clip =
            create_clip_region_from_rounded_rectangle(&rect(0.0, 0.0, 50.0, 50.0), 0.0, 0.25);
        assert!(clip.contours.is_none());
    }

    // get_clip_region_bounds

    #[test]
    fn get_clip_region_bounds_copies_rect_into_out() {
        let clip = create_clip_region_from_rectangle(&rect(3.0, 4.0, 15.0, 25.0));
        let mut out = RectangleLike::default();
        get_clip_region_bounds(&mut out, &clip);
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
        assert_eq!(out.width, 15.0);
        assert_eq!(out.height, 25.0);
    }

    // intersect_clip_regions

    #[test]
    fn intersect_clip_regions_both_rect_overlap() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 20.0, 20.0));
        let b = create_clip_region_from_rectangle(&rect(10.0, 10.0, 20.0, 20.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        intersect_clip_regions(&mut out, &a, &b);
        assert!(out.contours.is_none());
        assert_eq!(out.rect.x, 10.0);
        assert_eq!(out.rect.y, 10.0);
        assert_eq!(out.rect.width, 10.0);
        assert_eq!(out.rect.height, 10.0);
        assert_eq!(out.version, 1);
    }

    #[test]
    fn intersect_clip_regions_disjoint_empty() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&rect(20.0, 20.0, 10.0, 10.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        intersect_clip_regions(&mut out, &a, &b);
        assert!(is_clip_region_empty(&out));
        assert!(out.contours.is_none());
    }

    #[test]
    fn intersect_clip_regions_alias_safe_out_equals_a() {
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 20.0, 20.0));
        let b = create_clip_region_from_rectangle(&rect(10.0, 10.0, 20.0, 20.0));
        let a_ptr: *const ClipRegion = &out;
        intersect_clip_regions(&mut out, unsafe { &*a_ptr }, &b);
        assert_eq!(out.rect.x, 10.0);
        assert_eq!(out.rect.y, 10.0);
        assert_eq!(out.rect.width, 10.0);
        assert_eq!(out.rect.height, 10.0);
    }

    #[test]
    fn intersect_clip_regions_alias_safe_out_equals_b() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 20.0, 20.0));
        let mut out = create_clip_region_from_rectangle(&rect(10.0, 10.0, 20.0, 20.0));
        let b_ptr: *const ClipRegion = &out;
        intersect_clip_regions(&mut out, &a, unsafe { &*b_ptr });
        assert_eq!(out.rect.x, 10.0);
        assert_eq!(out.rect.y, 10.0);
        assert_eq!(out.rect.width, 10.0);
        assert_eq!(out.rect.height, 10.0);
    }

    #[test]
    fn intersect_clip_regions_keeps_contours_when_one_is_contour() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 20.0, 0.0);
        append_path_line_to(&mut path, 20.0, 20.0);
        append_path_line_to(&mut path, 0.0, 20.0);
        let contour_clip = create_clip_region_from_path(&path, 0.25);
        let rect_clip = create_clip_region_from_rectangle(&rect(10.0, 10.0, 20.0, 20.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        intersect_clip_regions(&mut out, &contour_clip, &rect_clip);
        assert!(out.contours.is_some());
    }

    // invalidate_clip_region

    #[test]
    fn invalidate_clip_region_bumps_version() {
        let mut clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        assert_eq!(clip.version, 0);
        invalidate_clip_region(&mut clip);
        assert_eq!(clip.version, 1);
        clip.version = u32::MAX;
        invalidate_clip_region(&mut clip);
        assert_eq!(clip.version, 0);
    }

    // is_clip_region_empty

    #[test]
    fn is_clip_region_empty_zero_size_rect() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 0.0, 0.0));
        assert!(is_clip_region_empty(&clip));
    }

    #[test]
    fn is_clip_region_empty_non_empty_rect() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(!is_clip_region_empty(&clip));
    }

    #[test]
    fn is_clip_region_empty_contour_with_no_contours() {
        let clip = create_clip_region_from_contours(vec![], PathWinding::NonZero);
        assert!(is_clip_region_empty(&clip));
    }

    // is_clip_region_rectangular

    #[test]
    fn is_clip_region_rectangular_rect_form() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        assert!(is_clip_region_rectangular(&clip));
    }

    #[test]
    fn is_clip_region_rectangular_path_form() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        let clip = create_clip_region_from_path(&path, 0.25);
        assert!(!is_clip_region_rectangular(&clip));
    }

    // normalize_clip_region

    #[test]
    fn normalize_clip_region_copies_rect_unchanged_and_bumps_version() {
        let clip = create_clip_region_from_rectangle(&rect(5.0, 10.0, 20.0, 30.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        normalize_clip_region(&mut out, &clip);
        assert!(out.contours.is_none());
        assert_eq!(out.rect.x, 5.0);
        assert_eq!(out.rect.y, 10.0);
        assert_eq!(out.rect.width, 20.0);
        assert_eq!(out.rect.height, 30.0);
        assert_eq!(out.version, 1);
    }

    #[test]
    fn normalize_clip_region_promotes_axis_aligned_quad_to_rect() {
        let contours = vec![vec![0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
        let clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        assert!(clip.contours.is_some());
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        normalize_clip_region(&mut out, &clip);
        assert!(out.contours.is_none());
        assert!((out.rect.x - 0.0).abs() < 1e-3);
        assert!((out.rect.y - 0.0).abs() < 1e-3);
        assert!((out.rect.width - 10.0).abs() < 1e-3);
        assert!((out.rect.height - 10.0).abs() < 1e-3);
    }

    #[test]
    fn normalize_clip_region_preserves_non_rect_contours() {
        let contours = vec![vec![0.0_f32, 0.0, 10.0, 0.0, 5.0, 10.0]];
        let clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        normalize_clip_region(&mut out, &clip);
        assert!(out.contours.is_some());
    }

    #[test]
    fn normalize_clip_region_preserves_multi_contour() {
        let contours = vec![
            vec![0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
            vec![20.0_f32, 20.0, 30.0, 20.0, 30.0, 30.0, 20.0, 30.0],
        ];
        let clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        normalize_clip_region(&mut out, &clip);
        assert!(out.contours.is_some());
    }

    #[test]
    fn normalize_clip_region_normalizes_90_degree_rotated_quad() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let mut rotated = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        // 90-degree rotation.
        let m = matrix(0.0, 1.0, -1.0, 0.0, 10.0, 0.0);
        transform_clip_region(&mut rotated, &clip, &m);
        assert!(rotated.contours.is_some());
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        normalize_clip_region(&mut out, &rotated);
        assert!(out.contours.is_none());
    }

    #[test]
    fn normalize_clip_region_alias_safe() {
        let contours = vec![vec![0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
        let mut clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        let ptr: *const ClipRegion = &clip;
        normalize_clip_region(&mut clip, unsafe { &*ptr });
        assert!(clip.contours.is_none());
        assert!((clip.rect.width - 10.0).abs() < 1e-3);
    }

    // release_clip_region

    #[test]
    fn release_clip_region_returns_region_to_pool() {
        while CLIP_REGION_POOL.with(|p| p.borrow_mut().pop()).is_some() {}
        let mut clip = acquire_clip_region();
        clip.version = 7;
        release_clip_region(clip);
        // The pool now has exactly one region; acquire resets it.
        let reused = acquire_clip_region();
        assert_eq!(reused.version, 0);
        release_clip_region(reused);
    }

    // set_clip_region_to_rectangle

    #[test]
    fn set_clip_region_to_rectangle_retargets_and_bumps_version() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        let mut clip = create_clip_region_from_path(&path, 0.25);
        set_clip_region_to_rectangle(&mut clip, &rect(5.0, 5.0, 20.0, 30.0));
        assert!(clip.contours.is_none());
        assert_eq!(clip.rect.x, 5.0);
        assert_eq!(clip.rect.y, 5.0);
        assert_eq!(clip.rect.width, 20.0);
        assert_eq!(clip.rect.height, 30.0);
        assert_eq!(clip.version, 1);
    }

    // transform_clip_region

    #[test]
    fn transform_clip_region_axis_aligned_stays_rect() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        // Scale by 2, translate by 5, 5.
        let m = matrix(2.0, 0.0, 0.0, 2.0, 5.0, 5.0);
        transform_clip_region(&mut out, &clip, &m);
        assert!(out.contours.is_none());
        assert!((out.rect.x - 5.0).abs() < 1e-3);
        assert!((out.rect.y - 5.0).abs() < 1e-3);
        assert!((out.rect.width - 20.0).abs() < 1e-3);
        assert!((out.rect.height - 20.0).abs() < 1e-3);
        assert_eq!(out.version, 1);
    }

    #[test]
    fn transform_clip_region_rotation_promotes_to_quad() {
        let clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        let cos45 = (std::f32::consts::PI / 4.0).cos();
        let sin45 = (std::f32::consts::PI / 4.0).sin();
        let m = matrix(cos45, sin45, -sin45, cos45, 0.0, 0.0);
        transform_clip_region(&mut out, &clip, &m);
        assert!(out.contours.is_some());
        let contours = out.contours.unwrap();
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0].len(), 8);
    }

    #[test]
    fn transform_clip_region_transforms_contour_points() {
        let contours = vec![vec![0.0_f32, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]];
        let clip = create_clip_region_from_contours(contours, PathWinding::NonZero);
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        let m = matrix(1.0, 0.0, 0.0, 1.0, 5.0, 5.0);
        transform_clip_region(&mut out, &clip, &m);
        assert!(out.contours.is_some());
        assert!((out.rect.x - 5.0).abs() < 1e-3);
        assert!((out.rect.y - 5.0).abs() < 1e-3);
        assert!((out.rect.width - 10.0).abs() < 1e-3);
        assert!((out.rect.height - 10.0).abs() < 1e-3);
    }

    #[test]
    fn transform_clip_region_alias_safe_out_equals_clip() {
        let mut clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let m = matrix(1.0, 0.0, 0.0, 1.0, 5.0, 5.0);
        let ptr: *const ClipRegion = &clip;
        transform_clip_region(&mut clip, unsafe { &*ptr }, &m);
        assert!((clip.rect.x - 5.0).abs() < 1e-3);
        assert!((clip.rect.y - 5.0).abs() < 1e-3);
    }

    // union_clip_regions

    #[test]
    fn union_clip_regions_both_rect() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&rect(5.0, 5.0, 15.0, 15.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        union_clip_regions(&mut out, &a, &b);
        assert!(out.contours.is_none());
        assert_eq!(out.rect.x, 0.0);
        assert_eq!(out.rect.y, 0.0);
        assert_eq!(out.rect.width, 20.0);
        assert_eq!(out.rect.height, 20.0);
        assert_eq!(out.version, 1);
    }

    #[test]
    fn union_clip_regions_preserves_richer_contours() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        append_path_line_to(&mut path, 10.0, 10.0);
        append_path_line_to(&mut path, 0.0, 10.0);
        let contour_clip = create_clip_region_from_path(&path, 0.25);
        let rect_clip = create_clip_region_from_rectangle(&rect(5.0, 5.0, 20.0, 20.0));
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        union_clip_regions(&mut out, &contour_clip, &rect_clip);
        assert!(out.contours.is_some());
    }

    #[test]
    fn union_clip_regions_alias_safe() {
        let mut out = create_clip_region_from_rectangle(&rect(0.0, 0.0, 10.0, 10.0));
        let b = create_clip_region_from_rectangle(&rect(5.0, 5.0, 15.0, 15.0));
        let a_ptr: *const ClipRegion = &out;
        union_clip_regions(&mut out, unsafe { &*a_ptr }, &b);
        assert_eq!(out.rect.width, 20.0);
        assert_eq!(out.rect.height, 20.0);
    }

    // flatten_path (via create_clip_region_from_path)

    #[test]
    fn flatten_path_move_to_only_single_contour_single_point() {
        let path = Path {
            commands: vec![path_command::MOVE_TO],
            data: vec![3.0, 7.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0], vec![3.0_f32, 7.0]);
    }

    #[test]
    fn flatten_path_implicit_contour_when_no_move_to() {
        let path = Path {
            commands: vec![path_command::LINE_TO],
            data: vec![3.0, 4.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0][0], 0.0);
        assert_eq!(contours[0][1], 0.0);
        assert_eq!(contours[0][2], 3.0);
        assert_eq!(contours[0][3], 4.0);
    }
}
