use crate::Vector2;
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Rectangle {
    pub runtime: EntityRuntimeSlot,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

pub fn create_rectangle(x: f32, y: f32, width: f32, height: f32) -> Rectangle {
    let mut out: Rectangle = allocate_entity();
    initialize_rectangle(&mut out, x, y, width, height);
    return out;
}

pub fn initialize_rectangle(out: &mut Rectangle, x: f32, y: f32, width: f32, height: f32) {
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

pub fn clone_rectangle(source: &Rectangle) -> Rectangle {
    return create_rectangle(source.x, source.y, source.width, source.height);
}

pub fn compute_rectangle_intersection(out: &mut Rectangle, a: &Rectangle, b: &Rectangle) {
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

pub fn contains_rectangle_point(rect: &Rectangle, point: &Vector2) -> bool {
    return contains_rectangle_point_xy(rect, point.x, point.y);
}

pub fn contains_rectangle_point_xy(rect: &Rectangle, x: f32, y: f32) -> bool {
    return x >= get_rectangle_min_x(rect)
        && x < get_rectangle_max_x(rect)
        && y >= get_rectangle_min_y(rect)
        && y < get_rectangle_max_y(rect);
}

pub fn copy_rectangle(out: &mut Rectangle, source: &Rectangle) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
}

pub fn encloses_rectangle(rect: &Rectangle, other: &Rectangle) -> bool {
    return get_rectangle_min_x(other) >= get_rectangle_min_x(rect)
        && get_rectangle_min_y(other) >= get_rectangle_min_y(rect)
        && get_rectangle_max_x(other) <= get_rectangle_max_x(rect)
        && get_rectangle_max_y(other) <= get_rectangle_max_y(rect);
}

pub fn equals_rectangle(a: Option<&Rectangle>, b: Option<&Rectangle>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}

/// Expands the rectangle bounds to include the given point.
pub fn expand_rectangle_to_point(out: &mut Rectangle, source: &Rectangle, point: &Vector2) {
    let min_x = source.x.min(source.x + source.width).min(point.x);
    let max_x = source.x.max(source.x + source.width).max(point.x);
    let min_y = source.y.min(source.y + source.height).min(point.y);
    let max_y = source.y.max(source.y + source.height).max(point.y);
    out.x = min_x;
    out.y = min_y;
    out.width = max_x - min_x;
    out.height = max_y - min_y;
}

pub fn get_rectangle_bottom(rect: &Rectangle) -> f32 {
    return rect.y + rect.height;
}

pub fn get_rectangle_bottom_right(out: &mut Vector2, rect: &Rectangle) {
    out.x = get_rectangle_right(rect);
    out.y = get_rectangle_bottom(rect);
}

pub fn get_rectangle_left(rect: &Rectangle) -> f32 {
    return rect.x;
}

pub fn get_rectangle_max_x(rect: &Rectangle) -> f32 {
    return rect.x.max(rect.x + rect.width);
}

pub fn get_rectangle_max_y(rect: &Rectangle) -> f32 {
    return rect.y.max(rect.y + rect.height);
}

pub fn get_rectangle_min_x(rect: &Rectangle) -> f32 {
    return rect.x.min(rect.x + rect.width);
}

pub fn get_rectangle_min_y(rect: &Rectangle) -> f32 {
    return rect.y.min(rect.y + rect.height);
}

pub fn get_rectangle_normalized_bottom_right(out: &mut Vector2, rect: &Rectangle) {
    out.x = get_rectangle_max_x(rect);
    out.y = get_rectangle_max_y(rect);
}

pub fn get_rectangle_normalized_top_left(out: &mut Vector2, rect: &Rectangle) {
    out.x = get_rectangle_min_x(rect);
    out.y = get_rectangle_min_y(rect);
}

pub fn get_rectangle_right(rect: &Rectangle) -> f32 {
    return rect.x + rect.width;
}

pub fn get_rectangle_size(out: &mut Vector2, rect: &Rectangle) {
    out.x = rect.width;
    out.y = rect.height;
}

pub fn get_rectangle_top(rect: &Rectangle) -> f32 {
    return rect.y;
}

pub fn get_rectangle_top_left(out: &mut Vector2, rect: &Rectangle) {
    out.x = rect.x;
    out.y = rect.y;
}

/// Grows the rectangle by `dx` on each side horizontally and `dy` vertically.
pub fn inflate_rectangle(out: &mut Rectangle, source: &Rectangle, dx: f32, dy: f32) {
    out.x = source.x - dx;
    out.y = source.y - dy;
    out.width = source.width + dx * 2.0;
    out.height = source.height + dy * 2.0;
}

pub fn intersects_rectangle(a: &Rectangle, b: &Rectangle) -> bool {
    return !(get_rectangle_max_x(a) <= get_rectangle_min_x(b)
        || get_rectangle_min_x(a) >= get_rectangle_max_x(b)
        || get_rectangle_max_y(a) <= get_rectangle_min_y(b)
        || get_rectangle_min_y(a) >= get_rectangle_max_y(b));
}

/// Returns `true` if width or height is zero.
///
/// Negative width or height is considered valid, not empty.
pub fn is_empty_rectangle(rect: &Rectangle) -> bool {
    return rect.width == 0.0 || rect.height == 0.0;
}

pub fn is_flipped_x_rectangle(rect: &Rectangle) -> bool {
    return rect.width < 0.0;
}

pub fn is_flipped_y_rectangle(rect: &Rectangle) -> bool {
    return rect.height < 0.0;
}

/// Computes the union of two rectangles. If either is empty, returns the other.
pub fn merge_rectangle(out: &mut Rectangle, a: &Rectangle, b: &Rectangle) {
    let a_empty = is_empty_rectangle(a);
    let b_empty = is_empty_rectangle(b);

    if a_empty || b_empty {
        let src = if b_empty { a } else { b };
        copy_rectangle(out, src);
        return;
    }

    let x0 = get_rectangle_min_x(a).min(get_rectangle_min_x(b));
    let x1 = get_rectangle_max_x(a).max(get_rectangle_max_x(b));
    let y0 = get_rectangle_min_y(a).min(get_rectangle_min_y(b));
    let y1 = get_rectangle_max_y(a).max(get_rectangle_max_y(b));

    out.x = x0;
    out.y = y0;
    out.width = x1 - x0;
    out.height = y1 - y0;
}

/// Normalizes so that x/y is the min corner and width/height are positive.
pub fn normalize_rectangle(out: &mut Rectangle, source: &Rectangle) {
    let min_x = get_rectangle_min_x(source);
    let min_y = get_rectangle_min_y(source);
    out.x = min_x;
    out.y = min_y;
    out.width = get_rectangle_max_x(source) - min_x;
    out.height = get_rectangle_max_y(source) - min_y;
}

pub fn offset_rectangle(out: &mut Rectangle, source: &Rectangle, dx: f32, dy: f32) {
    out.x = source.x + dx;
    out.y = source.y + dy;
    out.width = source.width;
    out.height = source.height;
}

pub fn offset_rectangle_by_point(out: &mut Rectangle, source: &Rectangle, point: &Vector2) {
    offset_rectangle(out, source, point.x, point.y);
}

pub fn set_empty_rectangle(out: &mut Rectangle) {
    out.x = 0.0;
    out.y = 0.0;
    out.width = 0.0;
    out.height = 0.0;
}

pub fn set_rectangle(out: &mut Rectangle, x: f32, y: f32, width: f32, height: f32) {
    out.x = x;
    out.y = y;
    out.width = width;
    out.height = height;
}

pub fn set_rectangle_bottom(rect: &mut Rectangle, value: f32) {
    rect.height = value - rect.y;
}

pub fn set_rectangle_bottom_right(rect: &mut Rectangle, point: &Vector2) {
    rect.width = point.x - rect.x;
    rect.height = point.y - rect.y;
}

pub fn set_rectangle_left(rect: &mut Rectangle, value: f32) {
    rect.width -= value - rect.x;
    rect.x = value;
}

pub fn set_rectangle_right(rect: &mut Rectangle, value: f32) {
    rect.width = value - rect.x;
}

pub fn set_rectangle_size(rect: &mut Rectangle, size: &Vector2) {
    rect.width = size.x;
    rect.height = size.y;
}

pub fn set_rectangle_top(rect: &mut Rectangle, value: f32) {
    rect.height -= value - rect.y;
    rect.y = value;
}

pub fn set_rectangle_top_left(rect: &mut Rectangle, point: &Vector2) {
    rect.x = point.x;
    rect.y = point.y;
}

impl Rectangle {
    pub fn new(x: f32, y: f32, width: f32, height: f32) -> Self {
        return create_rectangle(x, y, width, height);
    }
    pub fn bottom(&self) -> f32 {
        return get_rectangle_bottom(self);
    }
    pub fn bottom_right(&self) -> Vector2 {
        let mut out = Vector2::default();
        get_rectangle_bottom_right(&mut out, self);
        return out;
    }
    pub fn contains_point(&self, point: &Vector2) -> bool {
        return contains_rectangle_point(self, point);
    }
    pub fn contains_point_xy(&self, x: f32, y: f32) -> bool {
        return contains_rectangle_point_xy(self, x, y);
    }
    pub fn encloses(&self, other: &Self) -> bool {
        return encloses_rectangle(self, other);
    }
    pub fn expanded_to_point(&self, point: &Vector2) -> Self {
        let mut out = Self::default();
        expand_rectangle_to_point(&mut out, self, point);
        return out;
    }
    pub fn inflated(&self, dx: f32, dy: f32) -> Self {
        let mut out = Self::default();
        inflate_rectangle(&mut out, self, dx, dy);
        return out;
    }
    pub fn intersection(&self, other: &Self) -> Self {
        let mut out = Self::default();
        compute_rectangle_intersection(&mut out, self, other);
        return out;
    }
    pub fn intersects(&self, other: &Self) -> bool {
        return intersects_rectangle(self, other);
    }
    pub fn is_empty(&self) -> bool {
        return is_empty_rectangle(self);
    }
    pub fn is_flipped_x(&self) -> bool {
        return is_flipped_x_rectangle(self);
    }
    pub fn is_flipped_y(&self) -> bool {
        return is_flipped_y_rectangle(self);
    }
    pub fn left(&self) -> f32 {
        return get_rectangle_left(self);
    }
    pub fn max_x(&self) -> f32 {
        return get_rectangle_max_x(self);
    }
    pub fn max_y(&self) -> f32 {
        return get_rectangle_max_y(self);
    }
    pub fn merged(&self, other: &Self) -> Self {
        let mut out = Self::default();
        merge_rectangle(&mut out, self, other);
        return out;
    }
    pub fn min_x(&self) -> f32 {
        return get_rectangle_min_x(self);
    }
    pub fn min_y(&self) -> f32 {
        return get_rectangle_min_y(self);
    }
    pub fn normalized(&self) -> Self {
        let mut out = Self::default();
        normalize_rectangle(&mut out, self);
        return out;
    }
    pub fn normalized_bottom_right(&self) -> Vector2 {
        let mut out = Vector2::default();
        get_rectangle_normalized_bottom_right(&mut out, self);
        return out;
    }
    pub fn normalized_top_left(&self) -> Vector2 {
        let mut out = Vector2::default();
        get_rectangle_normalized_top_left(&mut out, self);
        return out;
    }
    pub fn offset(&self, dx: f32, dy: f32) -> Self {
        let mut out = Self::default();
        offset_rectangle(&mut out, self, dx, dy);
        return out;
    }
    pub fn offset_by(&self, point: &Vector2) -> Self {
        let mut out = Self::default();
        offset_rectangle_by_point(&mut out, self, point);
        return out;
    }
    pub fn right(&self) -> f32 {
        return get_rectangle_right(self);
    }
    pub fn set_bottom(&mut self, value: f32) {
        set_rectangle_bottom(self, value);
    }
    pub fn set_bottom_right(&mut self, point: &Vector2) {
        set_rectangle_bottom_right(self, point);
    }
    pub fn set_left(&mut self, value: f32) {
        set_rectangle_left(self, value);
    }
    pub fn set_right(&mut self, value: f32) {
        set_rectangle_right(self, value);
    }
    pub fn set_size(&mut self, size: &Vector2) {
        set_rectangle_size(self, size);
    }
    pub fn set_top(&mut self, value: f32) {
        set_rectangle_top(self, value);
    }
    pub fn set_top_left(&mut self, point: &Vector2) {
        set_rectangle_top_left(self, point);
    }
    pub fn size(&self) -> Vector2 {
        let mut out = Vector2::default();
        get_rectangle_size(&mut out, self);
        return out;
    }
    pub fn top(&self) -> f32 {
        return get_rectangle_top(self);
    }
    pub fn top_left(&self) -> Vector2 {
        let mut out = Vector2::default();
        get_rectangle_top_left(&mut out, self);
        return out;
    }
}
