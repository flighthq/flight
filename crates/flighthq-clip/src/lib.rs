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

pub use flighthq_types::{ClipRegion, Path, PathWinding, Rectangle, path_command};

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

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
pub fn create_clip_region_from_rectangle(rectangle: &Rectangle) -> ClipRegion {
    ClipRegion {
        contours: None,
        rect: *rectangle,
        version: 0,
        winding: PathWinding::NonZero,
    }
}

/// Writes the geometric intersection of two clip regions into `out`.
///
/// - If both regions are rectangle-form, `out` becomes the rectangle
///   intersection of their rects (or an empty rect if they do not overlap).
/// - If either region has path contours, `out` inherits `a`'s contours and
///   rect is clipped to the intersection of the two bounding rectangles. This
///   is a conservative approximation: the bounding-box clip is sufficient for
///   culling and the cover quad; the exact stencil intersection is handled at
///   draw time by the backend.
///
/// Safe when `out` aliases `a` or `b`.
pub fn intersect_clip_regions(a: &ClipRegion, b: &ClipRegion, out: &mut ClipRegion) {
    // Read all inputs into locals before writing out (alias safety).
    let a_rect = a.rect.clone();
    let b_rect = b.rect.clone();
    let a_contours = a.contours.clone();
    let b_contours = b.contours.clone();
    let a_winding = a.winding;
    let b_winding = b.winding;
    let a_version = a.version;

    let intersected = rectangle_intersection(&a_rect, &b_rect);
    let prefer_a = a_contours.is_some();

    if a_contours.is_none() && b_contours.is_none() {
        // Both rectangular: result is the rectangle intersection.
        out.rect = intersected;
        out.contours = None;
        out.winding = PathWinding::NonZero;
        out.version = a_version.wrapping_add(1);
    } else {
        // At least one side has path contours. Keep `a`'s contours (if
        // any) and clip the bounding rect to the overlap region.
        out.rect = intersected;
        out.contours = if prefer_a { a_contours } else { b_contours };
        out.winding = if prefer_a { a_winding } else { b_winding };
        out.version = a_version.wrapping_add(1);
    }
}

/// Marks the region's geometry changed so backends re-derive cached state.
///
/// Call after mutating `rect` or `contours` directly. Mirrors
/// `invalidate_image_resource`.
pub fn invalidate_clip_region(clip: &mut ClipRegion) {
    clip.version = clip.version.wrapping_add(1);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Computes the axis-aligned intersection of two rectangles.
///
/// Returns an empty rectangle at the origin if the two rectangles do not
/// overlap. Handles negative dimensions by normalizing to min/max before
/// computing the intersection.
fn rectangle_intersection(a: &Rectangle, b: &Rectangle) -> Rectangle {
    let ax0 = a.x.min(a.x + a.width);
    let ax1 = a.x.max(a.x + a.width);
    let ay0 = a.y.min(a.y + a.height);
    let ay1 = a.y.max(a.y + a.height);
    let bx0 = b.x.min(b.x + b.width);
    let bx1 = b.x.max(b.x + b.width);
    let by0 = b.y.min(b.y + b.height);
    let by1 = b.y.max(b.y + b.height);

    let x0 = ax0.max(bx0);
    let x1 = ax1.min(bx1);
    let y0 = ay0.max(by0);
    let y1 = ay1.min(by1);

    if x1 <= x0 || y1 <= y0 {
        return Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
    }

    Rectangle {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
    }
}

/// Flattens a `Path`'s curves to straight-line contours.
///
/// Each contour is a `Vec<f32>` of interleaved x, y pairs. Quadratic and
/// cubic Bézier segments are adaptively subdivided until deviation from the
/// chord is within `tolerance` (squared comparison avoids `sqrt`).
fn flatten_path(path: &Path, tolerance: f32) -> Vec<Vec<f32>> {
    let tolerance_sq = tolerance * tolerance;
    let mut contours: Vec<Vec<f32>> = Vec::new();
    let mut current: Option<usize> = None; // index of active contour in `contours`
    let mut x = 0.0_f32;
    let mut y = 0.0_f32;
    let mut di = 0usize;

    for &cmd in &path.commands {
        match cmd {
            path_command::MOVE_TO => {
                x = path.data[di];
                y = path.data[di + 1];
                di += 2;
                contours.push(vec![x, y]);
                current = Some(contours.len() - 1);
            }
            path_command::WIDE_MOVE_TO => {
                // Consumes 4 data values; the first pair is a dummy.
                x = path.data[di + 2];
                y = path.data[di + 3];
                di += 4;
                contours.push(vec![x, y]);
                current = Some(contours.len() - 1);
            }
            path_command::LINE_TO => {
                let contour = ensure_contour(&mut contours, &mut current);
                x = path.data[di];
                y = path.data[di + 1];
                di += 2;
                contour.push(x);
                contour.push(y);
            }
            path_command::WIDE_LINE_TO => {
                let contour = ensure_contour(&mut contours, &mut current);
                x = path.data[di + 2];
                y = path.data[di + 3];
                di += 4;
                contour.push(x);
                contour.push(y);
            }
            path_command::CURVE_TO => {
                let cx = path.data[di];
                let cy = path.data[di + 1];
                let x1 = path.data[di + 2];
                let y1 = path.data[di + 3];
                di += 4;
                let x0 = x;
                let y0 = y;
                let contour = ensure_contour(&mut contours, &mut current);
                flatten_quadratic(contour, x0, y0, cx, cy, x1, y1, tolerance_sq, 0);
                x = x1;
                y = y1;
            }
            path_command::CUBIC_CURVE_TO => {
                let c1x = path.data[di];
                let c1y = path.data[di + 1];
                let c2x = path.data[di + 2];
                let c2y = path.data[di + 3];
                let x1 = path.data[di + 4];
                let y1 = path.data[di + 5];
                di += 6;
                let x0 = x;
                let y0 = y;
                let contour = ensure_contour(&mut contours, &mut current);
                flatten_cubic(contour, x0, y0, c1x, c1y, c2x, c2y, x1, y1, tolerance_sq, 0);
                x = x1;
                y = y1;
            }
            // NO_OP and unrecognized verbs consume no data and are skipped.
            _ => {}
        }
    }

    contours
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

/// Starts an implicit contour at the origin when a draw verb precedes any
/// MOVE_TO, mirroring the canvas reader's implicit `moveTo(0, 0)` fallback.
/// Returns a mutable reference to the active contour.
fn ensure_contour<'a>(
    contours: &'a mut Vec<Vec<f32>>,
    current: &mut Option<usize>,
) -> &'a mut Vec<f32> {
    if current.is_none() {
        contours.push(vec![0.0, 0.0]);
        *current = Some(contours.len() - 1);
    }
    let idx = current.unwrap();
    &mut contours[idx]
}

/// Squared perpendicular distance from `(px, py)` to the segment
/// `(x0, y0)-(x1, y1)`. Used as the flatness test to avoid `sqrt`.
fn distance_to_chord_sq(px: f32, py: f32, x0: f32, y0: f32, x1: f32, y1: f32) -> f32 {
    let dx = x1 - x0;
    let dy = y1 - y0;
    let length_sq = dx * dx + dy * dy;
    if length_sq == 0.0 {
        let ax = px - x0;
        let ay = py - y0;
        return ax * ax + ay * ay;
    }
    let cross = dx * (y0 - py) - dy * (x0 - px);
    (cross * cross) / length_sq
}

const MAX_SUBDIVISION_DEPTH: u32 = 16;

/// Appends the flattened points of a quadratic Bézier (excluding start,
/// including end) via recursive de Casteljau subdivision.
fn flatten_quadratic(
    out: &mut Vec<f32>,
    x0: f32,
    y0: f32,
    cx: f32,
    cy: f32,
    x1: f32,
    y1: f32,
    tolerance_sq: f32,
    depth: u32,
) {
    if depth >= MAX_SUBDIVISION_DEPTH
        || distance_to_chord_sq(cx, cy, x0, y0, x1, y1) <= tolerance_sq
    {
        out.push(x1);
        out.push(y1);
        return;
    }
    let x01 = (x0 + cx) / 2.0;
    let y01 = (y0 + cy) / 2.0;
    let x12 = (cx + x1) / 2.0;
    let y12 = (cy + y1) / 2.0;
    let xm = (x01 + x12) / 2.0;
    let ym = (y01 + y12) / 2.0;
    flatten_quadratic(out, x0, y0, x01, y01, xm, ym, tolerance_sq, depth + 1);
    flatten_quadratic(out, xm, ym, x12, y12, x1, y1, tolerance_sq, depth + 1);
}

/// Appends the flattened points of a cubic Bézier (excluding start, including
/// end) via recursive de Casteljau subdivision at the midpoint.
fn flatten_cubic(
    out: &mut Vec<f32>,
    x0: f32,
    y0: f32,
    c1x: f32,
    c1y: f32,
    c2x: f32,
    c2y: f32,
    x1: f32,
    y1: f32,
    tolerance_sq: f32,
    depth: u32,
) {
    let d1 = distance_to_chord_sq(c1x, c1y, x0, y0, x1, y1);
    let d2 = distance_to_chord_sq(c2x, c2y, x0, y0, x1, y1);
    if depth >= MAX_SUBDIVISION_DEPTH || (d1 <= tolerance_sq && d2 <= tolerance_sq) {
        out.push(x1);
        out.push(y1);
        return;
    }
    let x01 = (x0 + c1x) / 2.0;
    let y01 = (y0 + c1y) / 2.0;
    let x12 = (c1x + c2x) / 2.0;
    let y12 = (c1y + c2y) / 2.0;
    let x23 = (c2x + x1) / 2.0;
    let y23 = (c2y + y1) / 2.0;
    let x012 = (x01 + x12) / 2.0;
    let y012 = (y01 + y12) / 2.0;
    let x123 = (x12 + x23) / 2.0;
    let y123 = (y12 + y23) / 2.0;
    let xm = (x012 + x123) / 2.0;
    let ym = (y012 + y123) / 2.0;
    flatten_cubic(
        out,
        x0,
        y0,
        x01,
        y01,
        x012,
        y012,
        xm,
        ym,
        tolerance_sq,
        depth + 1,
    );
    flatten_cubic(
        out,
        xm,
        ym,
        x123,
        y123,
        x23,
        y23,
        x1,
        y1,
        tolerance_sq,
        depth + 1,
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f32, y: f32, w: f32, h: f32) -> Rectangle {
        Rectangle {
            x,
            y,
            width: w,
            height: h,
        }
    }

    fn empty_rect() -> Rectangle {
        Rectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }

    // compute_contours_bounds

    #[test]
    fn compute_contours_bounds_empty_contours_returns_zero_rect() {
        let r = compute_contours_bounds(&[]);
        assert_eq!((r.x, r.y, r.width, r.height), (0.0, 0.0, 0.0, 0.0));
    }

    #[test]
    fn compute_contours_bounds_single_contour() {
        let contours = vec![vec![1.0_f32, 2.0, 5.0, 6.0, 3.0, 1.0]];
        let r = compute_contours_bounds(&contours);
        assert_eq!(r.x, 1.0);
        assert_eq!(r.y, 1.0);
        assert_eq!(r.width, 4.0);
        assert_eq!(r.height, 5.0);
    }

    #[test]
    fn compute_contours_bounds_multiple_contours() {
        let contours = vec![vec![0.0_f32, 0.0, 2.0, 0.0], vec![1.0_f32, -1.0, 3.0, 4.0]];
        let r = compute_contours_bounds(&contours);
        assert_eq!(r.x, 0.0);
        assert_eq!(r.y, -1.0);
        assert_eq!(r.width, 3.0);
        assert_eq!(r.height, 5.0);
    }

    // create_clip_region_from_path

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
        // Bounding rect of (0,0)→(4,3)
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
        let r = rect(1.0, 2.0, 3.0, 4.0);
        let clip = create_clip_region_from_rectangle(&r);
        assert_eq!(
            (clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height),
            (1.0, 2.0, 3.0, 4.0)
        );
        assert!(clip.contours.is_none());
        assert_eq!(clip.winding, PathWinding::NonZero);
        assert_eq!(clip.version, 0);
    }

    #[test]
    fn create_clip_region_from_rectangle_independent_of_source() {
        let mut r = rect(1.0, 2.0, 3.0, 4.0);
        let clip = create_clip_region_from_rectangle(&r);
        r.x = 99.0;
        // The region's rect must not change.
        assert_eq!(clip.rect.x, 1.0);
    }

    // intersect_clip_regions

    #[test]
    fn intersect_clip_regions_both_rect_overlap() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 4.0, 4.0));
        let b = create_clip_region_from_rectangle(&rect(2.0, 2.0, 4.0, 4.0));
        let mut out = create_clip_region_from_rectangle(&empty_rect());
        intersect_clip_regions(&a, &b, &mut out);
        assert!(out.contours.is_none());
        assert_eq!(
            (out.rect.x, out.rect.y, out.rect.width, out.rect.height),
            (2.0, 2.0, 2.0, 2.0)
        );
    }

    #[test]
    fn intersect_clip_regions_both_rect_no_overlap() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        let b = create_clip_region_from_rectangle(&rect(5.0, 5.0, 1.0, 1.0));
        let mut out = create_clip_region_from_rectangle(&empty_rect());
        intersect_clip_regions(&a, &b, &mut out);
        assert!(out.contours.is_none());
        assert_eq!(out.rect.width, 0.0);
    }

    #[test]
    fn intersect_clip_regions_path_and_rect_clips_bounding_box() {
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::LINE_TO],
            data: vec![0.0, 0.0, 10.0, 10.0],
            winding: PathWinding::NonZero,
        };
        let a = create_clip_region_from_path(&path, 0.25);
        let b = create_clip_region_from_rectangle(&rect(2.0, 2.0, 4.0, 4.0));
        let mut out = create_clip_region_from_rectangle(&empty_rect());
        intersect_clip_regions(&a, &b, &mut out);
        assert!(out.contours.is_some());
        // rect is intersection of (0,0,10,10) and (2,2,4,4) = (2,2,4,4)
        assert_eq!(
            (out.rect.x, out.rect.y, out.rect.width, out.rect.height),
            (2.0, 2.0, 4.0, 4.0)
        );
        assert_eq!(out.winding, PathWinding::NonZero);
    }

    #[test]
    fn intersect_clip_regions_aliased_out_equals_a() {
        let a = create_clip_region_from_rectangle(&rect(0.0, 0.0, 4.0, 4.0));
        let b = create_clip_region_from_rectangle(&rect(1.0, 1.0, 6.0, 6.0));
        let mut out = a.clone();
        intersect_clip_regions(&out.clone(), &b, &mut out);
        assert_eq!(
            (out.rect.x, out.rect.y, out.rect.width, out.rect.height),
            (1.0, 1.0, 3.0, 3.0)
        );
    }

    // invalidate_clip_region

    #[test]
    fn invalidate_clip_region_bumps_version() {
        let mut clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        assert_eq!(clip.version, 0);
        invalidate_clip_region(&mut clip);
        assert_eq!(clip.version, 1);
        invalidate_clip_region(&mut clip);
        assert_eq!(clip.version, 2);
    }

    #[test]
    fn invalidate_clip_region_wraps_on_overflow() {
        let mut clip = create_clip_region_from_rectangle(&rect(0.0, 0.0, 1.0, 1.0));
        clip.version = u32::MAX;
        invalidate_clip_region(&mut clip);
        assert_eq!(clip.version, 0);
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
    fn flatten_path_wide_move_to_skips_dummy_pair() {
        let path = Path {
            commands: vec![path_command::WIDE_MOVE_TO],
            data: vec![0.0, 0.0, 5.0, 9.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours[0][0], 5.0);
        assert_eq!(contours[0][1], 9.0);
    }

    #[test]
    fn flatten_path_wide_line_to_skips_dummy_pair() {
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::WIDE_LINE_TO],
            data: vec![0.0, 0.0, 0.0, 0.0, 4.0, 4.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        let last_x = contours[0][contours[0].len() - 2];
        let last_y = contours[0][contours[0].len() - 1];
        assert_eq!(last_x, 4.0);
        assert_eq!(last_y, 4.0);
    }

    #[test]
    fn flatten_path_multiple_move_to_creates_multiple_contours() {
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::MOVE_TO],
            data: vec![1.0, 1.0, 2.0, 2.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours.len(), 2);
    }

    #[test]
    fn flatten_path_quadratic_curve_endpoints_correct() {
        // A flat quadratic (ctrl on the chord) should produce the end point.
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::CURVE_TO],
            data: vec![0.0, 0.0, 2.0, 0.0, 4.0, 0.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        let last_x = contours[0][contours[0].len() - 2];
        let last_y = contours[0][contours[0].len() - 1];
        assert_eq!(last_x, 4.0);
        assert_eq!(last_y, 0.0);
    }

    #[test]
    fn flatten_path_cubic_curve_endpoints_correct() {
        // A flat cubic with all points collinear should end at (6, 0).
        let path = Path {
            commands: vec![path_command::MOVE_TO, path_command::CUBIC_CURVE_TO],
            data: vec![0.0, 0.0, 2.0, 0.0, 4.0, 0.0, 6.0, 0.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        let last_x = contours[0][contours[0].len() - 2];
        let last_y = contours[0][contours[0].len() - 1];
        assert_eq!(last_x, 6.0);
        assert_eq!(last_y, 0.0);
    }

    #[test]
    fn flatten_path_implicit_contour_when_no_move_to() {
        // A LINE_TO without prior MOVE_TO should start an implicit contour at (0, 0).
        let path = Path {
            commands: vec![path_command::LINE_TO],
            data: vec![3.0, 4.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0][0], 0.0); // implicit start x
        assert_eq!(contours[0][1], 0.0); // implicit start y
        assert_eq!(contours[0][2], 3.0);
        assert_eq!(contours[0][3], 4.0);
    }

    #[test]
    fn flatten_path_no_op_skipped() {
        let path = Path {
            commands: vec![
                path_command::NO_OP,
                path_command::MOVE_TO,
                path_command::NO_OP,
            ],
            data: vec![1.0, 2.0],
            winding: PathWinding::NonZero,
        };
        let clip = create_clip_region_from_path(&path, 0.25);
        let contours = clip.contours.unwrap();
        assert_eq!(contours.len(), 1);
        assert_eq!(contours[0], vec![1.0_f32, 2.0]);
    }
}
