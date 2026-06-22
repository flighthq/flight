//! Free functions for [`Rectangle`] — axis-aligned 2D rectangle.

use flighthq_types::{Rectangle, RectangleLike, Vector2Like};

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Returns a new [`Rectangle`] that is a copy of `source`.
pub fn clone_rectangle(source: &RectangleLike) -> Rectangle {
    create_rectangle(source.x, source.y, source.width, source.height)
}

/// Writes the intersection of `a` and `b` into `out`. If there is no intersection,
/// sets `out` to an empty rectangle at the origin.
///
/// Safe when `out` aliases `a` or `b`.
pub fn compute_rectangle_intersection(
    out: &mut RectangleLike,
    a: &RectangleLike,
    b: &RectangleLike,
) {
    let x0 = get_rectangle_min_x(a).max(get_rectangle_min_x(b));
    let x1 = get_rectangle_max_x(a).min(get_rectangle_max_x(b));
    let y0 = get_rectangle_min_y(a).max(get_rectangle_min_y(b));
    let y1 = get_rectangle_max_y(a).min(get_rectangle_max_y(b));

    if x1 <= x0 || y1 <= y0 {
        set_empty_rectangle(out);
        return;
    }

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
}

/// Returns `true` if `vector` lies within `source` (inclusive left/top, exclusive right/bottom).
pub fn contains_rectangle_point(source: &RectangleLike, vector: &Vector2Like) -> bool {
    contains_rectangle_point_xy(source, vector.x, vector.y)
}

/// Returns `true` if `(x, y)` lies within `source` (inclusive left/top, exclusive right/bottom).
pub fn contains_rectangle_point_xy(source: &RectangleLike, x: f32, y: f32) -> bool {
    let x0 = source.x.min(source.x + source.width);
    let x1 = source.x.max(source.x + source.width);
    let y0 = source.y.min(source.y + source.height);
    let y1 = source.y.max(source.y + source.height);
    x >= x0 && x < x1 && y >= y0 && y < y1
}

/// Copies `source` into `out`.
pub fn copy_rectangle(out: &mut RectangleLike, source: &RectangleLike) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
}

/// Creates a new [`Rectangle`] with the given values.
pub fn create_rectangle(x: f32, y: f32, width: f32, height: f32) -> Rectangle {
    Rectangle {
        x,
        y,
        width,
        height,
    }
}

/// Returns `true` if `source` fully encloses `other` (inclusive on all edges).
pub fn encloses_rectangle(source: &RectangleLike, other: &RectangleLike) -> bool {
    let sx0 = source.x.min(source.x + source.width);
    let sx1 = source.x.max(source.x + source.width);
    let sy0 = source.y.min(source.y + source.height);
    let sy1 = source.y.max(source.y + source.height);

    let ox0 = other.x.min(other.x + other.width);
    let ox1 = other.x.max(other.x + other.width);
    let oy0 = other.y.min(other.y + other.height);
    let oy1 = other.y.max(other.y + other.height);

    ox0 >= sx0 && oy0 >= sy0 && ox1 <= sx1 && oy1 <= sy1
}

/// Returns `true` if `a` and `b` have equal components.
pub fn equals_rectangle(a: &RectangleLike, b: &RectangleLike) -> bool {
    a.x == b.x && a.y == b.y && a.width == b.width && a.height == b.height
}

/// Inflates `sourceRect` to include `sourceVec2` and writes into `out`.
pub fn expand_rectangle_to_point(
    out: &mut RectangleLike,
    source_rect: &RectangleLike,
    source_vec2: &Vector2Like,
) {
    inflate_rectangle(out, source_rect, source_vec2.x, source_vec2.y);
}

/// Returns the bottom edge (`y + height`).
pub fn get_rectangle_bottom(source: &RectangleLike) -> f32 {
    source.y + source.height
}

/// Sets `out` to the bottom-right corner.
pub fn get_rectangle_bottom_right(out: &mut Vector2Like, source: &RectangleLike) {
    out.x = source.x + source.width;
    out.y = source.y + source.height;
}

/// Returns the left edge (`x`).
pub fn get_rectangle_left(source: &RectangleLike) -> f32 {
    source.x
}

/// Returns the maximum X value (handles negative width).
pub fn get_rectangle_max_x(source: &RectangleLike) -> f32 {
    source.x.max(source.x + source.width)
}

/// Returns the maximum Y value (handles negative height).
pub fn get_rectangle_max_y(source: &RectangleLike) -> f32 {
    source.y.max(source.y + source.height)
}

/// Returns the minimum X value (handles negative width).
pub fn get_rectangle_min_x(source: &RectangleLike) -> f32 {
    source.x.min(source.x + source.width)
}

/// Returns the minimum Y value (handles negative height).
pub fn get_rectangle_min_y(source: &RectangleLike) -> f32 {
    source.y.min(source.y + source.height)
}

/// Sets `out` to the normalized bottom-right corner (`max_x, max_y`).
pub fn get_rectangle_normalized_bottom_right(out: &mut Vector2Like, source: &RectangleLike) {
    out.x = get_rectangle_max_x(source);
    out.y = get_rectangle_max_y(source);
}

/// Sets `out` to the normalized top-left corner (`min_x, min_y`).
pub fn get_rectangle_normalized_top_left(out: &mut Vector2Like, source: &RectangleLike) {
    out.x = get_rectangle_min_x(source);
    out.y = get_rectangle_min_y(source);
}

/// Returns the right edge (`x + width`).
pub fn get_rectangle_right(source: &RectangleLike) -> f32 {
    source.x + source.width
}

/// Sets `out` to `(width, height)`.
pub fn get_rectangle_size(out: &mut Vector2Like, source: &RectangleLike) {
    out.x = source.width;
    out.y = source.height;
}

/// Returns the top edge (`y`).
pub fn get_rectangle_top(source: &RectangleLike) -> f32 {
    source.y
}

/// Sets `out` to the top-left corner.
pub fn get_rectangle_top_left(out: &mut Vector2Like, source: &RectangleLike) {
    out.x = source.x;
    out.y = source.y;
}

/// Inflates `source` by `(dx, dy)` on each side and writes into `out`.
///
/// The x/y move left/up by `dx`/`dy` and the width/height grow by `dx*2`/`dy*2`.
pub fn inflate_rectangle(out: &mut RectangleLike, source: &RectangleLike, dx: f32, dy: f32) {
    out.x = source.x - dx;
    out.width = source.width + dx * 2.0;
    out.y = source.y - dy;
    out.height = source.height + dy * 2.0;
}

/// Returns `true` if the two rectangles overlap (using normalized min/max bounds).
pub fn intersects_rectangle(a: &RectangleLike, b: &RectangleLike) -> bool {
    !(get_rectangle_max_x(a) <= get_rectangle_min_x(b)
        || get_rectangle_min_x(a) >= get_rectangle_max_x(b)
        || get_rectangle_max_y(a) <= get_rectangle_min_y(b)
        || get_rectangle_min_y(a) >= get_rectangle_max_y(b))
}

/// Returns `true` if `width` or `height` is zero.
///
/// Negative dimensions are considered valid (not empty).
pub fn is_empty_rectangle(source: &RectangleLike) -> bool {
    source.width == 0.0 || source.height == 0.0
}

/// Returns `true` if `width < 0`.
pub fn is_flipped_x_rectangle(source: &RectangleLike) -> bool {
    source.width < 0.0
}

/// Returns `true` if `height < 0`.
pub fn is_flipped_y_rectangle(source: &RectangleLike) -> bool {
    source.height < 0.0
}

/// Computes the union of `source` and `other` and writes into `out`.
///
/// If either rectangle is empty (zero area), the result is the non-empty one.
/// Safe when `out` aliases `source`.
pub fn merge_rectangle(out: &mut RectangleLike, source: &RectangleLike, other: &RectangleLike) {
    let sx = source.x;
    let sy = source.y;
    let sw = source.width;
    let sh = source.height;
    let ox = other.x;
    let oy = other.y;
    let ow = other.width;
    let oh = other.height;

    let s_empty = sw == 0.0 || sh == 0.0;
    let o_empty = ow == 0.0 || oh == 0.0;

    if s_empty || o_empty {
        out.x = if o_empty { sx } else { ox };
        out.y = if o_empty { sy } else { oy };
        out.width = if o_empty { sw } else { ow };
        out.height = if o_empty { sh } else { oh };
    } else {
        let src_left = sx.min(sx + sw);
        let src_right = sx.max(sx + sw);
        let src_top = sy.min(sy + sh);
        let src_bottom = sy.max(sy + sh);
        let oth_left = ox.min(ox + ow);
        let oth_right = ox.max(ox + ow);
        let oth_top = oy.min(oy + oh);
        let oth_bottom = oy.max(oy + oh);

        let x0 = src_left.min(oth_left);
        let x1 = src_right.max(oth_right);
        let y0 = src_top.min(oth_top);
        let y1 = src_bottom.max(oth_bottom);

        out.x = x0;
        out.y = y0;
        out.width = x1 - x0;
        out.height = y1 - y0;
    }
}

/// Normalizes a rectangle so that `x`/`y` are the min corner and `width`/`height` are positive.
pub fn normalize_rectangle(out: &mut RectangleLike, source: &RectangleLike) {
    let max_x = get_rectangle_max_x(source);
    let max_y = get_rectangle_max_y(source);
    let min_x = get_rectangle_min_x(source);
    let min_y = get_rectangle_min_y(source);
    out.x = min_x;
    out.y = min_y;
    out.width = max_x - min_x;
    out.height = max_y - min_y;
}

/// Offsets `source` by `(dx, dy)` and writes into `out`.
///
/// Width and height are preserved. Safe when `out` aliases `source`.
pub fn offset_rectangle(out: &mut RectangleLike, source: &RectangleLike, dx: f32, dy: f32) {
    let x = source.x + dx;
    let y = source.y + dy;
    let w = source.width;
    let h = source.height;
    out.x = x;
    out.y = y;
    out.width = w;
    out.height = h;
}

/// Offsets `source` by `point` and writes into `out`.
pub fn offset_rectangle_by_point(
    out: &mut RectangleLike,
    source: &RectangleLike,
    point: &Vector2Like,
) {
    offset_rectangle(out, source, point.x, point.y);
}

/// Sets `out` to an empty rectangle `(0, 0, 0, 0)`.
pub fn set_empty_rectangle(out: &mut RectangleLike) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
}

/// Sets all four fields of `out`.
pub fn set_rectangle(out: &mut RectangleLike, x: f32, y: f32, width: f32, height: f32) {
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

/// Moves the bottom edge to `value`, adjusting `height`.
pub fn set_rectangle_bottom(target: &mut RectangleLike, value: f32) {
    target.height = value - target.y;
}

/// Moves the bottom-right corner to `point`, adjusting `width` and `height`.
pub fn set_rectangle_bottom_right(target: &mut RectangleLike, point: &Vector2Like) {
    target.width = point.x - target.x;
    target.height = point.y - target.y;
}

/// Moves the left edge to `value`, adjusting `x` and `width`.
pub fn set_rectangle_left(target: &mut RectangleLike, value: f32) {
    target.width -= value - target.x;
    target.x = value;
}

/// Moves the right edge to `value`, adjusting `width`.
pub fn set_rectangle_right(target: &mut RectangleLike, value: f32) {
    target.width = value - target.x;
}

/// Sets `width` and `height` from `size`.
pub fn set_rectangle_size(out: &mut RectangleLike, size: &Vector2Like) {
    out.width = size.x;
    out.height = size.y;
}

/// Moves the top edge to `value`, adjusting `y` and `height`.
pub fn set_rectangle_top(target: &mut RectangleLike, value: f32) {
    target.height -= value - target.y;
    target.y = value;
}

/// Sets `x` and `y` from `point`.
pub fn set_rectangle_top_left(out: &mut RectangleLike, point: &Vector2Like) {
    out.x = point.x;
    out.y = point.y;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn r(x: f32, y: f32, w: f32, h: f32) -> RectangleLike {
        RectangleLike {
            x,
            y,
            width: w,
            height: h,
        }
    }

    fn v(x: f32, y: f32) -> Vector2Like {
        Vector2Like { x, y }
    }

    // clone_rectangle
    #[test]
    fn clone_rectangle_copies() {
        let src = r(1.0, 2.0, 3.0, 4.0);
        let c = clone_rectangle(&src);
        assert_eq!((c.x, c.y, c.width, c.height), (1.0, 2.0, 3.0, 4.0));
    }

    // compute_rectangle_intersection
    #[test]
    fn compute_rectangle_intersection_overlap() {
        let a = r(0.0, 0.0, 4.0, 4.0);
        let b = r(2.0, 2.0, 4.0, 4.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        compute_rectangle_intersection(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.width, out.height), (2.0, 2.0, 2.0, 2.0));
    }

    #[test]
    fn compute_rectangle_intersection_no_overlap() {
        let a = r(0.0, 0.0, 1.0, 1.0);
        let b = r(5.0, 5.0, 1.0, 1.0);
        let mut out = r(1.0, 1.0, 1.0, 1.0);
        compute_rectangle_intersection(&mut out, &a, &b);
        assert!(is_empty_rectangle(&out));
    }

    // contains_rectangle_point_xy
    #[test]
    fn contains_rectangle_point_xy_inside() {
        assert!(contains_rectangle_point_xy(
            &r(0.0, 0.0, 4.0, 4.0),
            2.0,
            2.0
        ));
    }

    #[test]
    fn contains_rectangle_point_xy_on_right_edge_excluded() {
        assert!(!contains_rectangle_point_xy(
            &r(0.0, 0.0, 4.0, 4.0),
            4.0,
            2.0
        ));
    }

    // copy_rectangle
    #[test]
    fn copy_rectangle_copies_fields() {
        let src = r(1.0, 2.0, 3.0, 4.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        copy_rectangle(&mut out, &src);
        assert_eq!((out.x, out.y, out.width, out.height), (1.0, 2.0, 3.0, 4.0));
    }

    // create_rectangle
    #[test]
    fn create_rectangle_stores_values() {
        let rec = create_rectangle(1.0, 2.0, 3.0, 4.0);
        assert_eq!((rec.x, rec.y, rec.width, rec.height), (1.0, 2.0, 3.0, 4.0));
    }

    // encloses_rectangle
    #[test]
    fn encloses_rectangle_fully_contains() {
        let big = r(0.0, 0.0, 10.0, 10.0);
        let small = r(2.0, 2.0, 2.0, 2.0);
        assert!(encloses_rectangle(&big, &small));
    }

    #[test]
    fn encloses_rectangle_partial_does_not() {
        let a = r(0.0, 0.0, 4.0, 4.0);
        let b = r(3.0, 3.0, 4.0, 4.0);
        assert!(!encloses_rectangle(&a, &b));
    }

    // equals_rectangle
    #[test]
    fn equals_rectangle_same() {
        assert!(equals_rectangle(
            &r(1.0, 2.0, 3.0, 4.0),
            &r(1.0, 2.0, 3.0, 4.0)
        ));
    }

    #[test]
    fn equals_rectangle_different() {
        assert!(!equals_rectangle(
            &r(1.0, 2.0, 3.0, 4.0),
            &r(1.0, 2.0, 3.0, 5.0)
        ));
    }

    // get_rectangle_max_x / min_x
    #[test]
    fn get_rectangle_max_x_positive_width() {
        assert_eq!(get_rectangle_max_x(&r(1.0, 0.0, 3.0, 0.0)), 4.0);
    }

    #[test]
    fn get_rectangle_min_x_negative_width() {
        assert_eq!(get_rectangle_min_x(&r(4.0, 0.0, -3.0, 0.0)), 1.0);
    }

    // inflate_rectangle
    #[test]
    fn inflate_rectangle_expands() {
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        inflate_rectangle(&mut out, &r(1.0, 1.0, 4.0, 4.0), 1.0, 1.0);
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 6.0, 6.0));
    }

    // intersects_rectangle
    #[test]
    fn intersects_rectangle_overlapping() {
        assert!(intersects_rectangle(
            &r(0.0, 0.0, 4.0, 4.0),
            &r(2.0, 2.0, 4.0, 4.0)
        ));
    }

    #[test]
    fn intersects_rectangle_non_overlapping() {
        assert!(!intersects_rectangle(
            &r(0.0, 0.0, 1.0, 1.0),
            &r(2.0, 0.0, 1.0, 1.0)
        ));
    }

    // is_empty_rectangle
    #[test]
    fn is_empty_rectangle_zero_width() {
        assert!(is_empty_rectangle(&r(0.0, 0.0, 0.0, 1.0)));
    }

    #[test]
    fn is_empty_rectangle_nonzero_not_empty() {
        assert!(!is_empty_rectangle(&r(0.0, 0.0, 1.0, 1.0)));
    }

    // merge_rectangle
    #[test]
    fn merge_rectangle_two_non_empty() {
        let a = r(0.0, 0.0, 2.0, 2.0);
        let b = r(1.0, 1.0, 3.0, 3.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &a, &b);
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 4.0, 4.0));
    }

    #[test]
    fn merge_rectangle_source_empty_uses_other() {
        let empty = r(0.0, 0.0, 0.0, 0.0);
        let b = r(1.0, 2.0, 3.0, 4.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        merge_rectangle(&mut out, &empty, &b);
        assert_eq!((out.x, out.y, out.width, out.height), (1.0, 2.0, 3.0, 4.0));
    }

    #[test]
    fn merge_rectangle_aliased() {
        let a = r(0.0, 0.0, 2.0, 2.0);
        let b = r(1.0, 1.0, 3.0, 3.0);
        let mut out = a;
        merge_rectangle(&mut out, &a, &b);
        assert_eq!(out.width, 4.0);
    }

    // normalize_rectangle
    #[test]
    fn normalize_rectangle_negative_width() {
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        normalize_rectangle(&mut out, &r(4.0, 0.0, -3.0, 2.0));
        assert_eq!((out.x, out.width), (1.0, 3.0));
    }

    // offset_rectangle
    #[test]
    fn offset_rectangle_shifts_xy() {
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        offset_rectangle(&mut out, &r(1.0, 2.0, 3.0, 4.0), 10.0, 20.0);
        assert_eq!(
            (out.x, out.y, out.width, out.height),
            (11.0, 22.0, 3.0, 4.0)
        );
    }

    // set_empty_rectangle
    #[test]
    fn set_empty_rectangle_zeroes() {
        let mut out = r(1.0, 2.0, 3.0, 4.0);
        set_empty_rectangle(&mut out);
        assert_eq!((out.x, out.y, out.width, out.height), (0.0, 0.0, 0.0, 0.0));
    }

    // set_rectangle_bottom
    #[test]
    fn set_rectangle_bottom_adjusts_height() {
        let mut out = r(0.0, 2.0, 5.0, 3.0);
        set_rectangle_bottom(&mut out, 10.0);
        assert_eq!(out.height, 8.0);
    }

    // set_rectangle_left
    #[test]
    fn set_rectangle_left_adjusts_width() {
        let mut out = r(2.0, 0.0, 6.0, 0.0);
        set_rectangle_left(&mut out, 4.0);
        assert_eq!((out.x, out.width), (4.0, 4.0));
    }

    // set_rectangle_right
    #[test]
    fn set_rectangle_right_adjusts_width() {
        let mut out = r(2.0, 0.0, 3.0, 0.0);
        set_rectangle_right(&mut out, 8.0);
        assert_eq!(out.width, 6.0);
    }

    // set_rectangle_top
    #[test]
    fn set_rectangle_top_adjusts_height() {
        let mut out = r(0.0, 2.0, 0.0, 6.0);
        set_rectangle_top(&mut out, 4.0);
        assert_eq!((out.y, out.height), (4.0, 4.0));
    }

    // expand_rectangle_to_point
    #[test]
    fn expand_rectangle_to_point_inflates_by_vector() {
        let src = r(0.0, 0.0, 10.0, 20.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        expand_rectangle_to_point(&mut out, &src, &v(1.0, 2.0));
        assert_eq!(out.x, -1.0);
        assert_eq!(out.y, -2.0);
        assert_eq!(out.width, 12.0);
        assert_eq!(out.height, 24.0);
    }

    // get_rectangle_bottom
    #[test]
    fn get_rectangle_bottom_returns_y_plus_height() {
        assert_eq!(get_rectangle_bottom(&r(0.0, 0.0, 10.0, 20.0)), 20.0);
    }

    // get_rectangle_bottom_right
    #[test]
    fn get_rectangle_bottom_right_returns_corner() {
        let mut out = v(0.0, 0.0);
        get_rectangle_bottom_right(&mut out, &r(0.0, 0.0, 10.0, 20.0));
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
    }

    // get_rectangle_left
    #[test]
    fn get_rectangle_left_returns_x() {
        assert_eq!(get_rectangle_left(&r(0.0, 0.0, 10.0, 20.0)), 0.0);
    }

    // get_rectangle_max_y
    #[test]
    fn get_rectangle_max_y_positive_and_flipped() {
        assert_eq!(get_rectangle_max_y(&r(0.0, 0.0, 10.0, 20.0)), 20.0);
        assert_eq!(get_rectangle_max_y(&r(0.0, 0.0, 10.0, -10.0)), 0.0);
    }

    // get_rectangle_min_y
    #[test]
    fn get_rectangle_min_y_positive_and_flipped() {
        assert_eq!(get_rectangle_min_y(&r(0.0, 0.0, 10.0, 20.0)), 0.0);
        assert_eq!(get_rectangle_min_y(&r(0.0, 0.0, 10.0, -10.0)), -10.0);
    }

    // get_rectangle_normalized_bottom_right
    #[test]
    fn get_rectangle_normalized_bottom_right_handles_flipped() {
        let mut nbr = v(0.0, 0.0);
        get_rectangle_normalized_bottom_right(&mut nbr, &r(10.0, 20.0, -5.0, -15.0));
        assert_eq!(nbr.x, 10.0);
        assert_eq!(nbr.y, 20.0);
    }

    #[test]
    fn get_rectangle_normalized_bottom_right_matches_max_for_positive() {
        let rect = r(2.0, 3.0, 10.0, 15.0);
        let mut nbr = v(0.0, 0.0);
        get_rectangle_normalized_bottom_right(&mut nbr, &rect);
        assert_eq!(nbr.x, get_rectangle_max_x(&rect));
        assert_eq!(nbr.y, get_rectangle_max_y(&rect));
    }

    // get_rectangle_normalized_top_left
    #[test]
    fn get_rectangle_normalized_top_left_handles_flipped() {
        let mut ntl = v(0.0, 0.0);
        get_rectangle_normalized_top_left(&mut ntl, &r(10.0, 20.0, -5.0, -15.0));
        assert_eq!(ntl.x, 5.0);
        assert_eq!(ntl.y, 5.0);
    }

    #[test]
    fn get_rectangle_normalized_top_left_matches_min_for_positive() {
        let rect = r(2.0, 3.0, 10.0, 15.0);
        let mut ntl = v(0.0, 0.0);
        get_rectangle_normalized_top_left(&mut ntl, &rect);
        assert_eq!(ntl.x, get_rectangle_min_x(&rect));
        assert_eq!(ntl.y, get_rectangle_min_y(&rect));
    }

    // get_rectangle_right
    #[test]
    fn get_rectangle_right_returns_x_plus_width() {
        assert_eq!(get_rectangle_right(&r(0.0, 0.0, 10.0, 20.0)), 10.0);
        assert_eq!(get_rectangle_right(&r(5.0, 0.0, 5.0, 0.0)), 10.0);
    }

    // get_rectangle_size
    #[test]
    fn get_rectangle_size_returns_width_height() {
        let mut s = v(0.0, 0.0);
        get_rectangle_size(&mut s, &r(0.0, 0.0, 10.0, 20.0));
        assert_eq!(s.x, 10.0);
        assert_eq!(s.y, 20.0);
    }

    // get_rectangle_top
    #[test]
    fn get_rectangle_top_returns_y() {
        assert_eq!(get_rectangle_top(&r(0.0, 0.0, 10.0, 20.0)), 0.0);
    }

    // get_rectangle_top_left
    #[test]
    fn get_rectangle_top_left_returns_corner() {
        let mut tl = v(0.0, 0.0);
        get_rectangle_top_left(&mut tl, &r(0.0, 0.0, 10.0, 20.0));
        assert_eq!(tl.x, 0.0);
        assert_eq!(tl.y, 0.0);
    }

    // is_flipped_x_rectangle
    #[test]
    fn is_flipped_x_rectangle_detects_negative_width() {
        assert!(!is_flipped_x_rectangle(&r(0.0, 0.0, 10.0, 20.0)));
        assert!(is_flipped_x_rectangle(&r(0.0, 0.0, -10.0, 20.0)));
    }

    // is_flipped_y_rectangle
    #[test]
    fn is_flipped_y_rectangle_detects_negative_height() {
        assert!(!is_flipped_y_rectangle(&r(0.0, 0.0, 10.0, 20.0)));
        assert!(is_flipped_y_rectangle(&r(0.0, 0.0, 10.0, -20.0)));
    }

    // offset_rectangle_by_point
    #[test]
    fn offset_rectangle_by_point_moves_origin() {
        let src = r(0.0, 0.0, 10.0, 20.0);
        let mut out = r(0.0, 0.0, 0.0, 0.0);
        offset_rectangle_by_point(&mut out, &src, &v(3.0, 4.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }

    // set_rectangle_bottom_right
    #[test]
    fn set_rectangle_bottom_right_adjusts_size() {
        let mut rect = r(0.0, 0.0, 10.0, 20.0);
        set_rectangle_bottom_right(&mut rect, &v(15.0, 25.0));
        assert_eq!(rect.width, 15.0);
        assert_eq!(rect.height, 25.0);
    }

    // set_rectangle_size
    #[test]
    fn set_rectangle_size_adjusts_width_height() {
        let mut rect = r(0.0, 0.0, 10.0, 20.0);
        set_rectangle_size(&mut rect, &v(5.0, 6.0));
        assert_eq!(rect.width, 5.0);
        assert_eq!(rect.height, 6.0);
    }

    // set_rectangle_top_left
    #[test]
    fn set_rectangle_top_left_updates_origin() {
        let mut out = r(0.0, 0.0, 10.0, 20.0);
        set_rectangle_top_left(&mut out, &v(3.0, 4.0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 4.0);
    }
}
