use crate::Vector2;
use flight_entity::{EntityRuntimeSlot, allocate_entity};

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Rectangle {
    runtime: EntityRuntimeSlot,
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

pub fn contains_rectangle_point(source: &Rectangle, vector: &Vector2) -> bool {
    return contains_rectangle_point_xy(source, vector.x, vector.y);
}

pub fn contains_rectangle_point_xy(source: &Rectangle, x: f32, y: f32) -> bool {
    return x >= get_rectangle_min_x(source)
        && x < get_rectangle_max_x(source)
        && y >= get_rectangle_min_y(source)
        && y < get_rectangle_max_y(source);
}

pub fn copy_rectangle(out: &mut Rectangle, source: &Rectangle) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
}

pub fn encloses_rectangle(source: &Rectangle, other: &Rectangle) -> bool {
    return get_rectangle_min_x(other) >= get_rectangle_min_x(source)
        && get_rectangle_min_y(other) >= get_rectangle_min_y(source)
        && get_rectangle_max_x(other) <= get_rectangle_max_x(source)
        && get_rectangle_max_y(other) <= get_rectangle_max_y(source);
}

pub fn equals_rectangle(a: Option<&Rectangle>, b: Option<&Rectangle>) -> bool {
    return match (a, b) {
        (Some(a), Some(b)) => std::ptr::eq(a, b) || *a == *b,
        _ => false,
    };
}

/// Expands the rectangle bounds to include the given point.
pub fn expand_rectangle_to_point(
    out: &mut Rectangle,
    source_rect: &Rectangle,
    source_vec2: &Vector2,
) {
    let min_x = source_rect
        .x
        .min(source_rect.x + source_rect.width)
        .min(source_vec2.x);
    let max_x = source_rect
        .x
        .max(source_rect.x + source_rect.width)
        .max(source_vec2.x);
    let min_y = source_rect
        .y
        .min(source_rect.y + source_rect.height)
        .min(source_vec2.y);
    let max_y = source_rect
        .y
        .max(source_rect.y + source_rect.height)
        .max(source_vec2.y);
    out.x = min_x;
    out.y = min_y;
    out.width = max_x - min_x;
    out.height = max_y - min_y;
}

pub fn get_rectangle_bottom(source: &Rectangle) -> f32 {
    return source.y + source.height;
}

pub fn get_rectangle_bottom_right(out: &mut Vector2, source: &Rectangle) {
    out.x = get_rectangle_right(source);
    out.y = get_rectangle_bottom(source);
}

pub fn get_rectangle_left(source: &Rectangle) -> f32 {
    return source.x;
}

pub fn get_rectangle_max_x(source: &Rectangle) -> f32 {
    return source.x.max(source.x + source.width);
}

pub fn get_rectangle_max_y(source: &Rectangle) -> f32 {
    return source.y.max(source.y + source.height);
}

pub fn get_rectangle_min_x(source: &Rectangle) -> f32 {
    return source.x.min(source.x + source.width);
}

pub fn get_rectangle_min_y(source: &Rectangle) -> f32 {
    return source.y.min(source.y + source.height);
}

pub fn get_rectangle_normalized_bottom_right(out: &mut Vector2, source: &Rectangle) {
    out.x = get_rectangle_max_x(source);
    out.y = get_rectangle_max_y(source);
}

pub fn get_rectangle_normalized_top_left(out: &mut Vector2, source: &Rectangle) {
    out.x = get_rectangle_min_x(source);
    out.y = get_rectangle_min_y(source);
}

pub fn get_rectangle_right(source: &Rectangle) -> f32 {
    return source.x + source.width;
}

pub fn get_rectangle_size(out: &mut Vector2, source: &Rectangle) {
    out.x = source.width;
    out.y = source.height;
}

pub fn get_rectangle_top(source: &Rectangle) -> f32 {
    return source.y;
}

pub fn get_rectangle_top_left(out: &mut Vector2, source: &Rectangle) {
    out.x = source.x;
    out.y = source.y;
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
pub fn is_empty_rectangle(source: &Rectangle) -> bool {
    return source.width == 0.0 || source.height == 0.0;
}

pub fn is_flipped_x_rectangle(source: &Rectangle) -> bool {
    return source.width < 0.0;
}

pub fn is_flipped_y_rectangle(source: &Rectangle) -> bool {
    return source.height < 0.0;
}

/// Computes the union of two rectangles. If either is empty, returns the other.
pub fn merge_rectangle(out: &mut Rectangle, source: &Rectangle, other: &Rectangle) {
    let source_empty = is_empty_rectangle(source);
    let other_empty = is_empty_rectangle(other);

    if source_empty || other_empty {
        let src = if other_empty { source } else { other };
        copy_rectangle(out, src);
        return;
    }

    let x0 = get_rectangle_min_x(source).min(get_rectangle_min_x(other));
    let x1 = get_rectangle_max_x(source).max(get_rectangle_max_x(other));
    let y0 = get_rectangle_min_y(source).min(get_rectangle_min_y(other));
    let y1 = get_rectangle_max_y(source).max(get_rectangle_max_y(other));

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

pub fn set_rectangle_bottom(target: &mut Rectangle, value: f32) {
    target.height = value - target.y;
}

pub fn set_rectangle_bottom_right(target: &mut Rectangle, point: &Vector2) {
    target.width = point.x - target.x;
    target.height = point.y - target.y;
}

pub fn set_rectangle_left(target: &mut Rectangle, value: f32) {
    target.width -= value - target.x;
    target.x = value;
}

pub fn set_rectangle_right(target: &mut Rectangle, value: f32) {
    target.width = value - target.x;
}

pub fn set_rectangle_size(out: &mut Rectangle, size: &Vector2) {
    out.width = size.x;
    out.height = size.y;
}

pub fn set_rectangle_top(target: &mut Rectangle, value: f32) {
    target.height -= value - target.y;
    target.y = value;
}

pub fn set_rectangle_top_left(out: &mut Rectangle, point: &Vector2) {
    out.x = point.x;
    out.y = point.y;
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

flight_entity::impl_entity!(Rectangle);
