use std::sync::{Arc, RwLock};

use flight_entity::{Ref, allocate_entity};
use flight_geometry::{Rectangle, create_rectangle};
use flight_math::CIRCLE_KAPPA;
use flight_path::{
    Path, append_path_cubic_curve_to, append_path_line_to, append_path_move_to, create_path,
};

use crate::clip_path::flatten_clip_path;
use crate::clip_region::create_clip_region_from_rectangle;
use crate::types::{ClipRegion, PathWinding};

// flight-lint: allow(f64) circle geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_circle(
    x: f64,
    y: f64,
    radius: f64,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    let mut path = create_path(PathWinding::NonZero);
    append_circle_to_path(&mut path, x, y, radius);
    return create_clip_region_from_path(&path, tolerance);
}

// flight-lint: allow(f64) ellipse geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_ellipse(
    rectangle: &Rectangle,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    let mut path = create_path(PathWinding::NonZero);
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

// flight-lint: allow(f64) rounded rectangle geometry feeds the f64 Path.data lane without truncation
pub fn create_clip_region_from_rounded_rectangle(
    rectangle: &Rectangle,
    radius: f64,
    tolerance: Option<f64>,
) -> Ref<ClipRegion> {
    if radius <= 0.0 {
        return create_clip_region_from_rectangle(rectangle);
    }
    let mut path = create_path(PathWinding::NonZero);
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

// flight-lint: allow(f64) flatten tolerance belongs to the f64 Path.data geometry lane
pub fn initialize_clip_region_from_path(out: &mut ClipRegion, path: &Path, tolerance: Option<f64>) {
    let mut contours = Vec::new();
    flatten_clip_path(&mut contours, path, tolerance);
    out.rect = create_rectangle(0.0, 0.0, 0.0, 0.0);
    set_rectangle_to_contours_bounds(&mut out.rect, &contours);
    out.contours = Some(contours);
    out.version = 0;
    out.winding = path.winding;
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
