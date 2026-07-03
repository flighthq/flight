//! Host-neutral Rust implementation of the `drawingshapes` example.

use flighthq_displayobject::{DisplayObjectArena, get_display_object_local_content_revision};
use flighthq_shape::{
    append_shape_begin_fill, append_shape_circle, append_shape_ellipse, append_shape_end_fill,
    append_shape_line_to, append_shape_move_to, append_shape_rectangle,
    append_shape_round_rectangle, create_shape, get_shape_fill_regions,
};
use flighthq_types::ShapeFillRegion;

pub const ID: &str = "drawingshapes";
pub const TITLE: &str = "Drawing shapes";
pub const WIDTH: u32 = 800;
pub const HEIGHT: u32 = 400;
pub const BACKGROUND: u32 = 0xff_ff_ff_ff;

#[derive(Clone, Debug, PartialEq)]
pub enum DrawingPrimitive {
    Rectangle {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    Circle {
        x: f32,
        y: f32,
        radius: f32,
    },
    Ellipse {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
    },
    RoundRectangle {
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        radius: f32,
    },
    Polygon {
        points: Vec<(f32, f32)>,
    },
}

/// Backend-neutral geometry consumed by native now and a browser/Wasm host later.
pub struct DrawingShapes {
    pub regions: Vec<ShapeFillRegion>,
    pub content_revision: u32,
}

pub fn create_drawing_shapes() -> DrawingShapes {
    let mut arena = DisplayObjectArena::default();
    let shape = create_shape(&mut arena);
    append_shape_begin_fill(&mut arena, shape, 0x24_af_c4_ff, 1.0);

    for primitive in drawing_primitives() {
        append_primitive(&mut arena, shape, &primitive);
    }

    append_shape_end_fill(&mut arena, shape);

    DrawingShapes {
        regions: get_shape_fill_regions(&arena, shape).unwrap_or_default(),
        content_revision: get_display_object_local_content_revision(&arena, shape),
    }
}

pub fn drawing_primitives() -> Vec<DrawingPrimitive> {
    vec![
        DrawingPrimitive::Rectangle {
            x: 20.0,
            y: 20.0,
            width: 100.0,
            height: 100.0,
        },
        DrawingPrimitive::Rectangle {
            x: 140.0,
            y: 20.0,
            width: 120.0,
            height: 100.0,
        },
        DrawingPrimitive::Circle {
            x: 330.0,
            y: 70.0,
            radius: 50.0,
        },
        DrawingPrimitive::Ellipse {
            x: 400.0,
            y: 20.0,
            width: 120.0,
            height: 100.0,
        },
        DrawingPrimitive::RoundRectangle {
            x: 540.0,
            y: 20.0,
            width: 100.0,
            height: 100.0,
            radius: 20.0,
        },
        DrawingPrimitive::RoundRectangle {
            x: 660.0,
            y: 20.0,
            width: 120.0,
            height: 100.0,
            radius: 20.0,
        },
        polygon(70.0, 200.0, 50.0, 3),
        polygon(195.0, 200.0, 50.0, 5),
        polygon(320.0, 200.0, 50.0, 6),
        polygon(445.0, 200.0, 50.0, 7),
        polygon(570.0, 200.0, 50.0, 8),
        polygon(700.0, 200.0, 50.0, 10),
        DrawingPrimitive::Rectangle {
            x: 20.0,
            y: 275.0,
            width: 755.0,
            height: 10.0,
        },
        quadratic_stroke((20.0, 340.0), (347.5, 290.0), (775.0, 340.0), 10.0, 32),
    ]
}

fn quadratic_stroke(
    start: (f32, f32),
    control: (f32, f32),
    end: (f32, f32),
    width: f32,
    segments: u32,
) -> DrawingPrimitive {
    let half_width = width / 2.0;
    let mut left = Vec::with_capacity((segments + 1) as usize);
    let mut right = Vec::with_capacity((segments + 1) as usize);
    for index in 0..=segments {
        let t = index as f32 / segments as f32;
        let inverse = 1.0 - t;
        let x = inverse * inverse * start.0 + 2.0 * inverse * t * control.0 + t * t * end.0;
        let y = inverse * inverse * start.1 + 2.0 * inverse * t * control.1 + t * t * end.1;
        let dx = 2.0 * inverse * (control.0 - start.0) + 2.0 * t * (end.0 - control.0);
        let dy = 2.0 * inverse * (control.1 - start.1) + 2.0 * t * (end.1 - control.1);
        let length = (dx * dx + dy * dy).sqrt().max(f32::EPSILON);
        let normal = (-dy / length * half_width, dx / length * half_width);
        left.push((x + normal.0, y + normal.1));
        right.push((x - normal.0, y - normal.1));
    }
    right.reverse();
    left.extend(right);
    DrawingPrimitive::Polygon { points: left }
}

fn polygon(x: f32, y: f32, radius: f32, sides: u32) -> DrawingPrimitive {
    let step = std::f32::consts::TAU / sides as f32;
    let start = std::f32::consts::FRAC_PI_2;
    let points = (0..sides)
        .map(|index| {
            let angle = start + step * index as f32;
            (angle.cos() * radius + x, -angle.sin() * radius + y)
        })
        .collect();
    DrawingPrimitive::Polygon { points }
}

fn append_primitive(
    arena: &mut DisplayObjectArena,
    shape: flighthq_node::NodeId,
    primitive: &DrawingPrimitive,
) {
    match primitive {
        DrawingPrimitive::Rectangle {
            x,
            y,
            width,
            height,
        } => append_shape_rectangle(arena, shape, *x, *y, *width, *height),
        DrawingPrimitive::Circle { x, y, radius } => {
            append_shape_circle(arena, shape, *x, *y, *radius)
        }
        DrawingPrimitive::Ellipse {
            x,
            y,
            width,
            height,
        } => append_shape_ellipse(arena, shape, *x, *y, *width, *height),
        DrawingPrimitive::RoundRectangle {
            x,
            y,
            width,
            height,
            radius,
        } => append_shape_round_rectangle(
            arena,
            shape,
            *x,
            *y,
            *width,
            *height,
            radius * 2.0,
            radius * 2.0,
        ),
        DrawingPrimitive::Polygon { points } => {
            let Some(&(start_x, start_y)) = points.first() else {
                return;
            };
            append_shape_move_to(arena, shape, start_x, start_y);
            for &(x, y) in &points[1..] {
                append_shape_line_to(arena, shape, x, y);
            }
            append_shape_line_to(arena, shape, start_x, start_y);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_renderable_fill_geometry() {
        let scene = create_drawing_shapes();
        assert!(!scene.regions.is_empty());
        assert!(scene.content_revision > 0);
    }
}
