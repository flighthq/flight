//! Pure 9-slice coordinate mapping (TS `wgpuScale9Mapper.ts`): maps unscaled shape coordinates into
//! the scaled field, leaving the grid corners fixed and stretching the center. An exact copy of the
//! GL mapper, duplicated per backend to keep each render package self-contained.

use std::sync::Arc;

use flight_geometry::Rectangle;
use flight_shape::ShapeScale9Mapper;

/// Builds the mapper for `bounds` and `scale9_grid` at the given scale (TS `buildWgpuScale9Mapper`);
/// `None` for a non-positive scale or empty bounds.
pub fn build_wgpu_scale9_mapper(
    bounds: &Rectangle,
    scale9_grid: &Rectangle,
    scale_x: f32,
    scale_y: f32,
) -> Option<ShapeScale9Mapper> {
    if scale_x <= 0.0 || scale_y <= 0.0 || bounds.width <= 0.0 || bounds.height <= 0.0 {
        return None;
    }

    let gx = scale9_grid.x;
    let gy = scale9_grid.y;
    let gw = scale9_grid.width;
    let gh = scale9_grid.height;
    let bw = bounds.width;
    let bh = bounds.height;

    return Some(ShapeScale9Mapper {
        map_x: Arc::new(move |x: f32| to_scale9_position(x, gx, gw, bw, scale_x)),
        map_y: Arc::new(move |y: f32| to_scale9_position(y, gy, gh, bh, scale_y)),
    });
}

fn to_scale9_position(
    pos: f32,
    scale9_start: f32,
    scale9_center: f32,
    unscaled_size: f32,
    scale: f32,
) -> f32 {
    let scale9_end = unscaled_size - scale9_center - scale9_start;
    let size = unscaled_size * scale;
    let center = size - scale9_start - scale9_end;

    if pos <= scale9_start {
        if center < 0.0 {
            return (pos * (scale9_start + scale9_end + center)) / (scale9_start + scale9_end);
        }
        return pos;
    }

    if pos >= scale9_start + scale9_center {
        if center < 0.0 {
            return ((scale9_start + (pos - scale9_start - scale9_center))
                * (scale9_start + scale9_end + center))
                / (scale9_start + scale9_end);
        }
        return scale9_start + center + (pos - scale9_start - scale9_center);
    }

    if center < 0.0 {
        return (scale9_start * (scale9_start + scale9_end + center)) / (scale9_start + scale9_end);
    }
    return scale9_start + (center * (pos - scale9_start)) / scale9_center;
}
